"""CSP rollup service — planning and actuals mode tests.

Covers the four-bucket math, pre-tax inflation of the denominator, the
NULL-bucket warning surface, the "intentionally NULL" exclusion list,
and the Ramit range classifier (under / in-range boundary / over).
The actuals scenarios at the bottom cover the per-month summed actuals,
pre-tax double-counting prevention, override + rollover flow-through,
and the ±2 pt tracking-status tolerance band. Also smoke-tests the
router so the wire format stays stable.
"""

from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Budget, Category, Transaction
from app.models.category import CspBucket
from app.services import budget_service, csp_rollup_service, net_income_service

# ---- helpers ---------------------------------------------------------------


def _seed_csp_categories(db: Session) -> dict[str, Category]:
    """Seed the canonical category set with their approved CSP buckets.

    Mirrors the data migration ``4810a336d8d4_seed_csp_buckets.py`` but
    against an in-memory test DB (which doesn't run alembic).
    """
    rows = [
        # spending categories with non-NULL buckets
        ("Bills & Utilities", CspBucket.FIXED.value, False),
        ("Groceries", CspBucket.FIXED.value, False),
        ("Gas", CspBucket.FIXED.value, False),
        ("Health & Wellness", CspBucket.FIXED.value, False),
        ("Home", CspBucket.FIXED.value, False),
        ("Education", CspBucket.FIXED.value, False),
        ("Investments", CspBucket.INVESTMENTS.value, False),
        ("Gifts & Donations", CspBucket.SAVINGS.value, False),
        ("Dining", CspBucket.GUILT_FREE.value, False),
        ("Entertainment", CspBucket.GUILT_FREE.value, False),
        ("Shopping", CspBucket.GUILT_FREE.value, False),
        ("Travel", CspBucket.GUILT_FREE.value, False),
        ("Personal", CspBucket.GUILT_FREE.value, False),
        # intentionally NULL — must NOT trigger the warning
        ("Income", None, False),
        ("Transfers", None, False),
        ("Uncategorized", None, False),
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


def _set_budget(db: Session, *, category_id: int, year: int, monthly: float) -> Budget:
    b = Budget(category_id=category_id, year=year, monthly_amount=monthly)
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


# ---- basic shape -----------------------------------------------------------


def test_empty_db_returns_four_buckets_all_zero(db: Session):
    rollup = csp_rollup_service.get_planning_rollup(db, 202605)
    assert rollup.month_yyyymm == 202605
    assert rollup.has_net_income is False
    assert rollup.take_home is None
    assert rollup.pre_tax_total == Decimal("0")
    assert len(rollup.buckets) == 4
    assert [b.bucket for b in rollup.buckets] == [
        "fixed",
        "investments",
        "savings",
        "guilt_free",
    ]
    for b in rollup.buckets:
        assert b.numerator == Decimal("0")
        assert b.percentage == Decimal("0")
        assert b.status == "under"


def test_basic_rollup_math(db: Session):
    cats = _seed_csp_categories(db)
    net_income_service.set_from_month(db, 202605, Decimal("10000.00"))
    # Fixed: $5000 → 50% (in-range, lower boundary).
    _set_budget(db, category_id=cats["Bills & Utilities"].id, year=2026, monthly=5000.0)
    # Investments: $1000 → 10%, in-range exactly at floor.
    _set_budget(db, category_id=cats["Investments"].id, year=2026, monthly=1000.0)
    # Savings: $700 → 7%, in-range middle.
    _set_budget(db, category_id=cats["Gifts & Donations"].id, year=2026, monthly=700.0)
    # Guilt-Free: $2500 → 25%, in-range middle.
    _set_budget(db, category_id=cats["Dining"].id, year=2026, monthly=2500.0)

    rollup = csp_rollup_service.get_planning_rollup(db, 202605)
    assert rollup.has_net_income is True
    assert rollup.take_home == Decimal("10000.00")
    assert rollup.pre_tax_total == Decimal("0")
    assert rollup.denominator == Decimal("10000.00")

    by_bucket = {b.bucket: b for b in rollup.buckets}
    assert by_bucket["fixed"].numerator == Decimal("5000")
    assert by_bucket["fixed"].percentage == Decimal("50.0")
    assert by_bucket["fixed"].status == "in-range"
    assert by_bucket["investments"].percentage == Decimal("10.0")
    assert by_bucket["investments"].status == "in-range"
    assert by_bucket["investments"].is_open_ended_over is False
    assert by_bucket["savings"].percentage == Decimal("7.0")
    assert by_bucket["savings"].status == "in-range"
    assert by_bucket["guilt_free"].percentage == Decimal("25.0")
    assert by_bucket["guilt_free"].status == "in-range"


def test_pre_tax_inflates_denominator_and_bucket(db: Session):
    cats = _seed_csp_categories(db)
    # Mark Investments as pre-tax with a 401k-style baseline.
    cats["Investments"].is_pre_tax = True
    db.commit()

    net_income_service.set_from_month(db, 202605, Decimal("8000.00"))
    _set_budget(db, category_id=cats["Investments"].id, year=2026, monthly=2000.0)
    _set_budget(db, category_id=cats["Bills & Utilities"].id, year=2026, monthly=4000.0)

    rollup = csp_rollup_service.get_planning_rollup(db, 202605)
    # Denominator = 8000 take-home + 2000 pre-tax = 10000.
    assert rollup.pre_tax_total == Decimal("2000")
    assert rollup.denominator == Decimal("10000")

    by_bucket = {b.bucket: b for b in rollup.buckets}
    # Investments numerator includes its pre-tax baseline.
    assert by_bucket["investments"].numerator == Decimal("2000")
    assert by_bucket["investments"].percentage == Decimal("20.0")
    # 20% is over the 10% floor — open-ended-over applies for Investments.
    assert by_bucket["investments"].status == "over"
    assert by_bucket["investments"].is_open_ended_over is True

    # Fixed numerator unchanged by the pre-tax flag on a different category.
    assert by_bucket["fixed"].numerator == Decimal("4000")
    assert by_bucket["fixed"].percentage == Decimal("40.0")


def test_excluded_categories_invisible(db: Session):
    cats = _seed_csp_categories(db)
    # Mark Travel as excluded — its budget must not appear anywhere.
    cats["Travel"].exclude_from_budget = True
    db.commit()

    net_income_service.set_from_month(db, 202605, Decimal("10000"))
    _set_budget(db, category_id=cats["Travel"].id, year=2026, monthly=999.0)
    _set_budget(db, category_id=cats["Dining"].id, year=2026, monthly=2000.0)

    rollup = csp_rollup_service.get_planning_rollup(db, 202605)
    by_bucket = {b.bucket: b for b in rollup.buckets}
    # Guilt-Free numerator is just Dining, not Travel.
    assert by_bucket["guilt_free"].numerator == Decimal("2000")
    # And the excluded category does not appear in the warning surface
    # (it's intentionally hidden, not misconfigured).
    assert all(u["name"] != "Travel" for u in rollup.unbucketed_categories)


def test_unbucketed_user_category_appears_in_warning(db: Session):
    _seed_csp_categories(db)
    # A custom user category — non-system, non-excluded, NULL bucket.
    custom = Category(
        name="Mystery Box Subscription",
        is_system=False,
        csp_bucket=None,
        is_pre_tax=False,
    )
    db.add(custom)
    db.commit()
    db.refresh(custom)
    _set_budget(db, category_id=custom.id, year=2026, monthly=50.0)

    net_income_service.set_from_month(db, 202605, Decimal("10000"))
    rollup = csp_rollup_service.get_planning_rollup(db, 202605)

    names = [u["name"] for u in rollup.unbucketed_categories]
    assert "Mystery Box Subscription" in names
    # Its $50 should not have inflated any bucket.
    for b in rollup.buckets:
        assert b.numerator == Decimal("0")


def test_intentionally_null_categories_do_not_warn(db: Session):
    _seed_csp_categories(db)
    rollup = csp_rollup_service.get_planning_rollup(db, 202605)
    names = [u["name"] for u in rollup.unbucketed_categories]
    assert "Income" not in names
    assert "Transfers" not in names
    assert "Uncategorized" not in names
    # In fact, with no custom categories, the warning list should be empty.
    assert rollup.unbucketed_categories == []


# ---- range classifier ------------------------------------------------------


@pytest.mark.parametrize(
    "pct_amount, expected_status, expected_open",
    [
        # Fixed bucket: 50–60.
        (4900, "under", False),  # 49% < 50
        (5000, "in-range", False),  # 50% boundary
        (5500, "in-range", False),  # mid
        (6000, "in-range", False),  # 60% boundary
        (6100, "over", False),  # 61% > 60
    ],
)
def test_fixed_range_classifier(
    db: Session,
    pct_amount: float,
    expected_status: str,
    expected_open: bool,
):
    cats = _seed_csp_categories(db)
    net_income_service.set_from_month(db, 202605, Decimal("10000"))
    _set_budget(db, category_id=cats["Bills & Utilities"].id, year=2026, monthly=pct_amount)

    rollup = csp_rollup_service.get_planning_rollup(db, 202605)
    fixed = next(b for b in rollup.buckets if b.bucket == "fixed")
    assert fixed.status == expected_status
    assert fixed.is_open_ended_over is expected_open


@pytest.mark.parametrize(
    "amount, expected_status, expected_open",
    [
        (900, "under", False),  # 9% < 10
        (1000, "in-range", False),  # 10% boundary
        (1500, "over", True),  # 15% > 10 — open-ended-over
        (5000, "over", True),  # 50% > 10 — still open-ended-over
    ],
)
def test_investments_open_ended_over(
    db: Session,
    amount: float,
    expected_status: str,
    expected_open: bool,
):
    cats = _seed_csp_categories(db)
    net_income_service.set_from_month(db, 202605, Decimal("10000"))
    _set_budget(db, category_id=cats["Investments"].id, year=2026, monthly=amount)

    rollup = csp_rollup_service.get_planning_rollup(db, 202605)
    inv = next(b for b in rollup.buckets if b.bucket == "investments")
    assert inv.status == expected_status
    assert inv.is_open_ended_over is expected_open


@pytest.mark.parametrize(
    "amount, expected_status",
    [
        (400, "under"),  # 4% < 5
        (500, "in-range"),  # 5% boundary
        (1000, "in-range"),  # 10% boundary
        (1100, "over"),  # 11% > 10
    ],
)
def test_savings_range(db: Session, amount: float, expected_status: str):
    cats = _seed_csp_categories(db)
    net_income_service.set_from_month(db, 202605, Decimal("10000"))
    _set_budget(db, category_id=cats["Gifts & Donations"].id, year=2026, monthly=amount)

    rollup = csp_rollup_service.get_planning_rollup(db, 202605)
    sav = next(b for b in rollup.buckets if b.bucket == "savings")
    assert sav.status == expected_status
    # Open-ended-over only applies to Investments.
    assert sav.is_open_ended_over is False


@pytest.mark.parametrize(
    "amount, expected_status",
    [
        (1900, "under"),  # 19% < 20
        (2000, "in-range"),  # 20% boundary
        (3500, "in-range"),  # 35% boundary
        (3600, "over"),  # 36% > 35
    ],
)
def test_guilt_free_range(db: Session, amount: float, expected_status: str):
    cats = _seed_csp_categories(db)
    net_income_service.set_from_month(db, 202605, Decimal("10000"))
    _set_budget(db, category_id=cats["Dining"].id, year=2026, monthly=amount)

    rollup = csp_rollup_service.get_planning_rollup(db, 202605)
    gf = next(b for b in rollup.buckets if b.bucket == "guilt_free")
    assert gf.status == expected_status


# ---- denominator edge cases ------------------------------------------------


def test_missing_net_income_yields_zero_percentages(db: Session):
    cats = _seed_csp_categories(db)
    # Budget exists but no net-income period → percentages collapse to 0.
    _set_budget(db, category_id=cats["Dining"].id, year=2026, monthly=1000.0)

    rollup = csp_rollup_service.get_planning_rollup(db, 202605)
    assert rollup.has_net_income is False
    assert rollup.take_home is None
    for b in rollup.buckets:
        assert b.percentage == Decimal("0")
        assert b.status == "under"


def test_empty_bucket_reports_under_at_zero(db: Session):
    cats = _seed_csp_categories(db)
    net_income_service.set_from_month(db, 202605, Decimal("10000"))
    # Only Fixed has any budget; the other three should report 0% under.
    _set_budget(db, category_id=cats["Bills & Utilities"].id, year=2026, monthly=5500.0)

    rollup = csp_rollup_service.get_planning_rollup(db, 202605)
    by_bucket = {b.bucket: b for b in rollup.buckets}
    for empty in ("investments", "savings", "guilt_free"):
        assert by_bucket[empty].numerator == Decimal("0")
        assert by_bucket[empty].percentage == Decimal("0")
        assert by_bucket[empty].status == "under"


# ---- router smoke ----------------------------------------------------------


def test_router_planning_returns_buckets(client: TestClient, db: Session):
    cats = _seed_csp_categories(db)
    net_income_service.set_from_month(db, 202605, Decimal("10000"))
    _set_budget(db, category_id=cats["Bills & Utilities"].id, year=2026, monthly=5000.0)

    resp = client.get("/api/csp/rollup", params={"month": "2026-05"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["mode"] == "planning"
    assert body["month"] == "2026-05"
    assert body["take_home"] == 10000.0
    assert body["denominator"] == 10000.0
    assert body["has_net_income"] is True
    assert len(body["buckets"]) == 4
    fixed = next(b for b in body["buckets"] if b["bucket"] == "fixed")
    assert fixed["percentage"] == 50.0
    assert fixed["status"] == "in-range"
    assert fixed["ramit_min"] == 50.0
    assert fixed["ramit_max"] == 60.0
    inv = next(b for b in body["buckets"] if b["bucket"] == "investments")
    assert inv["ramit_max"] is None


def test_router_actuals_returns_200_with_tracking_fields(client: TestClient, db: Session):
    """Slice 4: mode=actuals is now wired up; 501 is gone."""
    cats = _seed_csp_categories(db)
    net_income_service.set_from_month(db, 202605, Decimal("10000"))
    _set_budget(db, category_id=cats["Bills & Utilities"].id, year=2026, monthly=5000.0)

    resp = client.get("/api/csp/rollup", params={"month": "2026-05", "mode": "actuals"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["mode"] == "actuals"
    assert len(body["buckets"]) == 4
    # Every bucket carries the actuals-only fields.
    for b in body["buckets"]:
        assert "planned_percentage" in b
        assert "tracking_status" in b
        assert b["tracking_status"] in {"on-track", "over-plan", "under-plan"}


def test_router_unknown_mode_returns_400(client: TestClient):
    resp = client.get("/api/csp/rollup", params={"month": "2026-05", "mode": "bogus"})
    assert resp.status_code == 400


def test_router_rejects_malformed_month(client: TestClient):
    resp = client.get("/api/csp/rollup", params={"month": "May 2026"})
    assert resp.status_code == 400


# ---- actuals rollup --------------------------------------------------------


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


def test_actuals_basic_sums_per_bucket(db: Session):
    """Actuals numerators sum the per-category transaction totals."""
    cats = _seed_csp_categories(db)
    net_income_service.set_from_month(db, 202605, Decimal("10000.00"))
    _set_budget(db, category_id=cats["Bills & Utilities"].id, year=2026, monthly=5000.0)
    _set_budget(db, category_id=cats["Dining"].id, year=2026, monthly=2500.0)

    # Spent $4500 on Bills, $1800 on Dining in May.
    _make_txn(
        db,
        vendor="Power Co",
        amount=-4500,
        txn_date=date(2026, 5, 3),
        category_id=cats["Bills & Utilities"].id,
        import_hash="a_b_1",
    )
    _make_txn(
        db,
        vendor="Restaurant",
        amount=-1800,
        txn_date=date(2026, 5, 7),
        category_id=cats["Dining"].id,
        import_hash="a_d_1",
    )

    rollup = csp_rollup_service.get_actuals_rollup(db, 202605)
    assert rollup.has_net_income is True
    assert rollup.denominator == Decimal("10000.00")
    by_bucket = {b.bucket: b for b in rollup.buckets}
    assert by_bucket["fixed"].numerator == Decimal("4500")
    assert by_bucket["fixed"].percentage == Decimal("45.0")
    assert by_bucket["guilt_free"].numerator == Decimal("1800")
    assert by_bucket["guilt_free"].percentage == Decimal("18.0")


def test_actuals_pretax_contributes_no_double_count(db: Session):
    """Pre-tax categories contribute via budget_service's synthetic actual.
    The rollup must NOT add baselines on top of that — that would double.
    """
    cats = _seed_csp_categories(db)
    cats["Investments"].is_pre_tax = True
    db.commit()

    net_income_service.set_from_month(db, 202605, Decimal("8000.00"))
    _set_budget(db, category_id=cats["Investments"].id, year=2026, monthly=2000.0)

    rollup = csp_rollup_service.get_actuals_rollup(db, 202605)
    by_bucket = {b.bucket: b for b in rollup.buckets}
    # Pre-tax baseline = 2000. Numerator must be 2000 (NOT 4000).
    assert by_bucket["investments"].numerator == Decimal("2000")
    # Denominator: take_home(8000) + pre_tax(2000) = 10000.
    assert rollup.denominator == Decimal("10000")
    # 2000 / 10000 = 20% — far from the doubled 4000/10000=40%.
    assert by_bucket["investments"].percentage == Decimal("20.0")


def test_actuals_respects_per_month_override(db: Session):
    """An override only changes the budget for that month; pre-tax actual
    follows the override so the bucket numerator reflects it."""
    cats = _seed_csp_categories(db)
    cats["Investments"].is_pre_tax = True
    db.commit()

    net_income_service.set_from_month(db, 202605, Decimal("10000"))
    _set_budget(db, category_id=cats["Investments"].id, year=2026, monthly=1000.0)
    budget_service.set_monthly_override(
        db, category_id=cats["Investments"].id, year=2026, month=5, amount=2500.0
    )

    rollup_may = csp_rollup_service.get_actuals_rollup(db, 202605)
    inv_may = next(b for b in rollup_may.buckets if b.bucket == "investments")
    assert inv_may.numerator == Decimal("2500")

    # April uses the baseline (1000), not the May override.
    rollup_apr = csp_rollup_service.get_actuals_rollup(db, 202604)
    inv_apr = next(b for b in rollup_apr.buckets if b.bucket == "investments")
    assert inv_apr.numerator == Decimal("1000")


def test_actuals_respects_rollover_carry(db: Session):
    """rollover_mode causes the *effective* budget to grow with prior-month
    surplus. For the bucket numerator, that means a Groceries category with
    a $100 January surplus contributes $600 of effective budget in
    February — the actuals rollup must match."""
    cats = _seed_csp_categories(db)
    budget_service.set_budget(
        db,
        category_id=cats["Groceries"].id,
        year=2026,
        monthly_amount=500.0,
        rollover_mode=True,
    )
    # January spent $400 → $100 surplus carries into February.
    _make_txn(
        db,
        vendor="Store",
        amount=-400,
        txn_date=date(2026, 1, 12),
        category_id=cats["Groceries"].id,
        import_hash="ro_1",
    )
    # February spent $500 (against an effective $600 budget).
    _make_txn(
        db,
        vendor="Store",
        amount=-500,
        txn_date=date(2026, 2, 14),
        category_id=cats["Groceries"].id,
        import_hash="ro_2",
    )

    net_income_service.set_from_month(db, 202602, Decimal("10000"))
    rollup = csp_rollup_service.get_actuals_rollup(db, 202602)
    # February actuals numerator for Fixed = $500 (the actual transaction
    # sum, not the effective budget — actuals reflect real spending).
    fixed = next(b for b in rollup.buckets if b.bucket == "fixed")
    assert fixed.numerator == Decimal("500")


def test_actuals_excluded_categories_invisible(db: Session):
    """exclude_from_budget categories don't contribute to numerators,
    even when they have a budget and transactions."""
    cats = _seed_csp_categories(db)
    cats["Travel"].exclude_from_budget = True
    db.commit()

    net_income_service.set_from_month(db, 202605, Decimal("10000"))
    _set_budget(db, category_id=cats["Travel"].id, year=2026, monthly=1000.0)
    _make_txn(
        db,
        vendor="Hotel",
        amount=-500,
        txn_date=date(2026, 5, 1),
        category_id=cats["Travel"].id,
        import_hash="ex_1",
    )

    rollup = csp_rollup_service.get_actuals_rollup(db, 202605)
    by_bucket = {b.bucket: b for b in rollup.buckets}
    assert by_bucket["guilt_free"].numerator == Decimal("0")


def test_actuals_tracking_status_on_track(db: Session):
    """Actual within ±2 pts of plan → on-track."""
    cats = _seed_csp_categories(db)
    net_income_service.set_from_month(db, 202605, Decimal("10000"))
    # Plan: 50% of 10000 = $5000 fixed budget.
    _set_budget(db, category_id=cats["Bills & Utilities"].id, year=2026, monthly=5000.0)
    # Actual: $4900 → 49% (1 pt under plan → on-track).
    _make_txn(
        db,
        vendor="Power Co",
        amount=-4900,
        txn_date=date(2026, 5, 1),
        category_id=cats["Bills & Utilities"].id,
        import_hash="ot_1",
    )

    rollup = csp_rollup_service.get_actuals_rollup(db, 202605)
    fixed = next(b for b in rollup.buckets if b.bucket == "fixed")
    assert fixed.percentage == Decimal("49.0")
    assert fixed.planned_percentage == Decimal("50.0")
    assert fixed.tracking_status == "on-track"


def test_actuals_tracking_status_over_plan(db: Session):
    """Actual > plan + 2 pts → over-plan."""
    cats = _seed_csp_categories(db)
    net_income_service.set_from_month(db, 202605, Decimal("10000"))
    # Plan: 50%; Actual: 55% → over by 5 pts → over-plan.
    _set_budget(db, category_id=cats["Bills & Utilities"].id, year=2026, monthly=5000.0)
    _make_txn(
        db,
        vendor="Power Co",
        amount=-5500,
        txn_date=date(2026, 5, 1),
        category_id=cats["Bills & Utilities"].id,
        import_hash="op_1",
    )

    rollup = csp_rollup_service.get_actuals_rollup(db, 202605)
    fixed = next(b for b in rollup.buckets if b.bucket == "fixed")
    assert fixed.percentage == Decimal("55.0")
    assert fixed.planned_percentage == Decimal("50.0")
    assert fixed.tracking_status == "over-plan"


def test_actuals_tracking_status_under_plan(db: Session):
    """Actual < plan - 2 pts → under-plan."""
    cats = _seed_csp_categories(db)
    net_income_service.set_from_month(db, 202605, Decimal("10000"))
    # Plan: 50%; Actual: 45% → under by 5 pts → under-plan.
    _set_budget(db, category_id=cats["Bills & Utilities"].id, year=2026, monthly=5000.0)
    _make_txn(
        db,
        vendor="Power Co",
        amount=-4500,
        txn_date=date(2026, 5, 1),
        category_id=cats["Bills & Utilities"].id,
        import_hash="up_1",
    )

    rollup = csp_rollup_service.get_actuals_rollup(db, 202605)
    fixed = next(b for b in rollup.buckets if b.bucket == "fixed")
    assert fixed.percentage == Decimal("45.0")
    assert fixed.planned_percentage == Decimal("50.0")
    assert fixed.tracking_status == "under-plan"


def test_actuals_unbucketed_warning_matches_planning(db: Session):
    """The actuals rollup must surface the same NULL-bucket warning list
    as planning (consistent UX across modes)."""
    _seed_csp_categories(db)
    custom = Category(
        name="Mystery Box",
        is_system=False,
        csp_bucket=None,
        is_pre_tax=False,
    )
    db.add(custom)
    db.commit()

    rollup = csp_rollup_service.get_actuals_rollup(db, 202605)
    names = [u["name"] for u in rollup.unbucketed_categories]
    assert "Mystery Box" in names
    # Intentionally-NULL categories must NOT appear.
    assert "Income" not in names
    assert "Transfers" not in names
