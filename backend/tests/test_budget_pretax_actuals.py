"""Regression tests for pre-tax handling in
``budget_service.get_actual_vs_budget``.

A pre-tax category (like a 401k contribution) never produces an outflow
transaction in the user's tracked accounts because the money is withheld
before it lands in any account. For tracking purposes the budget service
synthesises ``actual = effective_budget`` for those categories so they
contribute the right amount to the CSP actuals rollup. This file
exercises that branch and confirms the non-pre-tax paths are unchanged.

Also smoke-tests the new ``csp_bucket`` and ``is_pre_tax`` fields that
flow into ``ActualVsBudgetEntry`` for the frontend's bucket grouping.
"""

from datetime import date

from sqlalchemy.orm import Session

from app.models import Category, Transaction
from app.models.category import CspBucket
from app.services.budget_service import (
    get_actual_vs_budget,
    set_budget,
    set_monthly_override,
)


def _seed_categories(db: Session) -> dict[str, Category]:
    """Seed enough categories to exercise both pre-tax and regular paths."""
    rows = [
        ("Investments", CspBucket.INVESTMENTS.value, True),  # pre-tax 401k-style
        ("Bills & Utilities", CspBucket.FIXED.value, False),
        ("Groceries", CspBucket.FIXED.value, False),
        ("Dining", CspBucket.GUILT_FREE.value, False),
    ]
    out: dict[str, Category] = {}
    for name, bucket, pre_tax in rows:
        cat = Category(
            name=name,
            is_system=True,
            csp_bucket=bucket,
            is_pre_tax=pre_tax,
        )
        db.add(cat)
        out[name] = cat
    db.commit()
    for cat in out.values():
        db.refresh(cat)
    return out


def _make_txn(
    db: Session,
    *,
    vendor: str,
    amount: float,
    txn_date: date,
    category_id: int,
    import_hash: str,
) -> Transaction:
    from tests.conftest import get_or_create_account

    account = get_or_create_account(db, "Test")
    txn = Transaction(
        source_file="test.csv",
        account_id=account.id,
        date=txn_date,
        raw_description=vendor,
        vendor=vendor,
        amount=amount,
        category_id=category_id,
        import_hash=import_hash,
        is_transfer=False,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


def test_pretax_actual_equals_budget_with_no_transactions(db: Session):
    """The headline case: pre-tax category, baseline budget, zero spend."""
    cats = _seed_categories(db)
    set_budget(db, category_id=cats["Investments"].id, year=2026, monthly_amount=1500.0)

    result = get_actual_vs_budget(db, year=2026)
    inv_entries = [e for e in result.entries if e.category_name == "Investments"]
    # Every month of the year should report actual = budget.
    assert len(inv_entries) == 12
    for e in inv_entries:
        assert e.budget_target == 1500.0
        assert e.actual_spend == 1500.0
        assert e.difference == 0.0
        assert e.percentage == 100.0


def test_pretax_actual_tracks_monthly_override(db: Session):
    """When a per-month override raises the budget, actual rises with it."""
    cats = _seed_categories(db)
    set_budget(db, category_id=cats["Investments"].id, year=2026, monthly_amount=1500.0)
    set_monthly_override(db, category_id=cats["Investments"].id, year=2026, month=5, amount=2000.0)

    result = get_actual_vs_budget(db, year=2026)
    may = [e for e in result.entries if e.category_name == "Investments" and e.month == 5][0]
    apr = [e for e in result.entries if e.category_name == "Investments" and e.month == 4][0]

    assert may.budget_target == 2000.0
    assert may.actual_spend == 2000.0
    assert apr.budget_target == 1500.0
    assert apr.actual_spend == 1500.0


def test_pretax_with_rollover_mode_carries_zero_surplus(db: Session):
    """rollover_mode + pre-tax: actual matches target each month, so the
    surplus is always zero — the carry never accumulates."""
    cats = _seed_categories(db)
    set_budget(
        db,
        category_id=cats["Investments"].id,
        year=2026,
        monthly_amount=1000.0,
        rollover_mode=True,
    )

    result = get_actual_vs_budget(db, year=2026)
    inv_entries = sorted(
        [e for e in result.entries if e.category_name == "Investments"],
        key=lambda e: e.month,
    )
    for e in inv_entries:
        # Target stays at the baseline because the carry is always zero.
        assert e.budget_target == 1000.0
        assert e.actual_spend == 1000.0
        assert e.difference == 0.0


def test_pretax_with_no_budget_does_not_appear(db: Session):
    """A pre-tax category without a Budget row is invisible — consistent
    with how unbudgeted non-pre-tax categories behave."""
    _seed_categories(db)
    # No set_budget call for Investments.

    result = get_actual_vs_budget(db, year=2026)
    inv_entries = [e for e in result.entries if e.category_name == "Investments"]
    assert inv_entries == []


def test_non_pretax_unaffected_by_change(db: Session):
    """Non-pre-tax categories continue to sum transactions for actual."""
    cats = _seed_categories(db)
    set_budget(db, category_id=cats["Groceries"].id, year=2026, monthly_amount=500.0)
    _make_txn(
        db,
        vendor="Store",
        amount=-300.0,
        txn_date=date(2026, 5, 10),
        category_id=cats["Groceries"].id,
        import_hash="g_1",
    )

    result = get_actual_vs_budget(db, year=2026)
    may = [e for e in result.entries if e.category_name == "Groceries" and e.month == 5][0]
    apr = [e for e in result.entries if e.category_name == "Groceries" and e.month == 4][0]

    # May has the transaction — actual is the transaction sum.
    assert may.budget_target == 500.0
    assert may.actual_spend == 300.0
    # April has no transactions — actual is zero (NOT equal to the budget).
    assert apr.budget_target == 500.0
    assert apr.actual_spend == 0.0


def test_csp_bucket_and_is_pretax_pass_through(db: Session):
    """The two new fields are populated from category metadata."""
    cats = _seed_categories(db)
    set_budget(db, category_id=cats["Investments"].id, year=2026, monthly_amount=1000.0)
    set_budget(db, category_id=cats["Dining"].id, year=2026, monthly_amount=400.0)

    result = get_actual_vs_budget(db, year=2026)

    inv = next(e for e in result.entries if e.category_name == "Investments")
    assert inv.csp_bucket == "investments"
    assert inv.is_pre_tax is True

    dining = next(e for e in result.entries if e.category_name == "Dining")
    assert dining.csp_bucket == "guilt_free"
    assert dining.is_pre_tax is False


def test_monthly_rollup_includes_pretax_synthetic_actual(db: Session):
    """Per-month rollups must include pre-tax categories' synthetic actuals
    so the ``Total: $X of $Y`` summary in the UI is consistent."""
    cats = _seed_categories(db)
    set_budget(db, category_id=cats["Investments"].id, year=2026, monthly_amount=1000.0)
    set_budget(db, category_id=cats["Groceries"].id, year=2026, monthly_amount=500.0)
    _make_txn(
        db,
        vendor="Store",
        amount=-200.0,
        txn_date=date(2026, 1, 15),
        category_id=cats["Groceries"].id,
        import_hash="r_1",
    )

    result = get_actual_vs_budget(db, year=2026)
    jan = next(r for r in result.monthly_rollups if r.month == 1)

    # Budgeted: 1000 (Investments) + 500 (Groceries) = 1500
    assert jan.total_budgeted == 1500.0
    # Actual: 1000 (Investments synthetic) + 200 (Groceries real) = 1200
    assert jan.total_actual == 1200.0
