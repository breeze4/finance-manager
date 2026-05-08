"""Unit tests for stats_service.get_spending_trend.

Covers the spec-acceptance list for the spending-trend chart:
  - range starting mid-month — still emits the whole calendar month, actual
    sums everything in the range
  - range ending mid-month — emits the partial month with FULL-month
    expected and PARTIAL actual (range truncates the actual)
  - range crossing year boundary
  - override taking precedence over baseline for "expected"
  - pre-tax exclusion (a pre-tax category contributes zero to both sides)
  - transfer + exclude_from_budget exclusion
  - empty range / no data returns empty months[]

Mirrors the fixture style of test_pace_service.py and test_csp_rollup_service.py.
"""

from datetime import date

from sqlalchemy.orm import Session

from app.models import Budget, Category, Transaction
from app.models.budget import BudgetMonthlyOverride
from app.models.category import CspBucket
from app.services import stats_service

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_categories(db: Session) -> dict[str, Category]:
    rows = [
        ("Bills & Utilities", CspBucket.FIXED.value, False, False),
        ("Groceries", CspBucket.FIXED.value, False, False),
        ("Dining", CspBucket.GUILT_FREE.value, False, False),
        ("Travel", CspBucket.GUILT_FREE.value, False, False),
        # Pre-tax — must be skipped on both sides
        ("401k", CspBucket.INVESTMENTS.value, True, False),
        # Excluded from budget — must be skipped on both sides
        ("CC Payments", None, False, True),
        # Intentionally NULL bucket
        ("Income", None, False, False),
        ("Transfers", None, False, False),
    ]
    out: dict[str, Category] = {}
    for name, bucket, pre_tax, excluded in rows:
        cat = Category(
            name=name,
            is_system=True,
            csp_bucket=bucket,
            is_pre_tax=pre_tax,
            exclude_from_budget=excluded,
        )
        db.add(cat)
        out[name] = cat
    db.commit()
    for cat in out.values():
        db.refresh(cat)
    return out


def _set_budget(
    db: Session,
    *,
    category_id: int,
    year: int,
    monthly: float,
    overrides: dict[int, float] | None = None,
) -> Budget:
    b = Budget(category_id=category_id, year=year, monthly_amount=monthly)
    db.add(b)
    db.commit()
    db.refresh(b)
    for month, amount in (overrides or {}).items():
        db.add(BudgetMonthlyOverride(budget_id=b.id, month=month, amount=amount))
    db.commit()
    db.refresh(b)
    return b


def _make_txn(
    db: Session,
    *,
    amount: float,
    txn_date: date,
    category_id: int | None,
    import_hash: str,
    is_transfer: bool = False,
) -> Transaction:
    from tests.conftest import get_or_create_account

    account = get_or_create_account(db, "Test")
    txn = Transaction(
        source_file="test.csv",
        account_id=account.id,
        date=txn_date,
        raw_description="vendor",
        vendor="vendor",
        amount=amount,
        category_id=category_id,
        import_hash=import_hash,
        is_transfer=is_transfer,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestSpendingTrendMonths:
    """Calendar-month enumeration."""

    def test_empty_db_emits_months_with_zero_totals(self, db: Session):
        # No categories, no transactions, no budgets — just calendar months.
        result = stats_service.get_spending_trend(
            db, date_from=date(2025, 3, 1), date_to=date(2025, 5, 31)
        )
        assert [m["month"] for m in result] == ["2025-03", "2025-04", "2025-05"]
        for m in result:
            assert m["actual"] == 0.0
            assert m["expected"] == 0.0

    def test_range_starting_mid_month_emits_whole_calendar_month(self, db: Session):
        cats = _seed_categories(db)
        # Two transactions in March 2025 — one before date_from, one after.
        # The "before" one should NOT be summed into actual (range is the
        # filter), but March is still listed as a calendar month.
        _make_txn(
            db,
            amount=-100.0,
            txn_date=date(2025, 3, 5),
            category_id=cats["Groceries"].id,
            import_hash="t1",
        )
        _make_txn(
            db,
            amount=-200.0,
            txn_date=date(2025, 3, 20),
            category_id=cats["Groceries"].id,
            import_hash="t2",
        )

        result = stats_service.get_spending_trend(
            db, date_from=date(2025, 3, 15), date_to=date(2025, 3, 31)
        )
        assert [m["month"] for m in result] == ["2025-03"]
        # Only the txn on the 20th falls inside the range.
        assert result[0]["actual"] == 200.0

    def test_range_ending_mid_month_emits_partial_actual_full_expected(self, db: Session):
        cats = _seed_categories(db)
        _set_budget(
            db,
            category_id=cats["Groceries"].id,
            year=2025,
            monthly=600.0,
        )
        # Two txns in March: one inside range, one after date_to.
        _make_txn(
            db,
            amount=-100.0,
            txn_date=date(2025, 3, 5),
            category_id=cats["Groceries"].id,
            import_hash="t1",
        )
        _make_txn(
            db,
            amount=-300.0,
            txn_date=date(2025, 3, 25),
            category_id=cats["Groceries"].id,
            import_hash="t2",
        )

        result = stats_service.get_spending_trend(
            db, date_from=date(2025, 3, 1), date_to=date(2025, 3, 15)
        )
        assert [m["month"] for m in result] == ["2025-03"]
        # Only the 5th txn falls inside the range.
        assert result[0]["actual"] == 100.0
        # Expected stays the FULL monthly budget regardless of partial range.
        assert result[0]["expected"] == 600.0

    def test_range_crossing_year_boundary(self, db: Session):
        cats = _seed_categories(db)
        _set_budget(db, category_id=cats["Groceries"].id, year=2024, monthly=500.0)
        _set_budget(db, category_id=cats["Groceries"].id, year=2025, monthly=600.0)

        _make_txn(
            db,
            amount=-50.0,
            txn_date=date(2024, 12, 15),
            category_id=cats["Groceries"].id,
            import_hash="dec",
        )
        _make_txn(
            db,
            amount=-75.0,
            txn_date=date(2025, 1, 10),
            category_id=cats["Groceries"].id,
            import_hash="jan",
        )
        _make_txn(
            db,
            amount=-25.0,
            txn_date=date(2025, 2, 5),
            category_id=cats["Groceries"].id,
            import_hash="feb",
        )

        result = stats_service.get_spending_trend(
            db, date_from=date(2024, 12, 1), date_to=date(2025, 2, 28)
        )
        assert [m["month"] for m in result] == ["2024-12", "2025-01", "2025-02"]
        by_month = {m["month"]: m for m in result}
        assert by_month["2024-12"]["actual"] == 50.0
        assert by_month["2024-12"]["expected"] == 500.0
        assert by_month["2025-01"]["actual"] == 75.0
        assert by_month["2025-01"]["expected"] == 600.0
        assert by_month["2025-02"]["actual"] == 25.0
        assert by_month["2025-02"]["expected"] == 600.0


class TestSpendingTrendExclusions:
    """Transfer / exclude_from_budget / pre-tax exclusions."""

    def test_pre_tax_excluded_from_both_sides(self, db: Session):
        cats = _seed_categories(db)
        # 401k is pre-tax — its budget and any transactions must NOT
        # contribute. Also seed a non-pre-tax category for sanity.
        _set_budget(db, category_id=cats["401k"].id, year=2025, monthly=2000.0)
        _set_budget(db, category_id=cats["Groceries"].id, year=2025, monthly=400.0)

        _make_txn(
            db,
            amount=-2000.0,
            txn_date=date(2025, 6, 1),
            category_id=cats["401k"].id,
            import_hash="pretax",
        )
        _make_txn(
            db,
            amount=-100.0,
            txn_date=date(2025, 6, 5),
            category_id=cats["Groceries"].id,
            import_hash="grocery",
        )

        result = stats_service.get_spending_trend(
            db, date_from=date(2025, 6, 1), date_to=date(2025, 6, 30)
        )
        assert len(result) == 1
        # Only Groceries' $100 actual and $400 expected should appear.
        assert result[0]["actual"] == 100.0
        assert result[0]["expected"] == 400.0

    def test_transfer_and_exclude_from_budget_excluded(self, db: Session):
        cats = _seed_categories(db)
        _set_budget(db, category_id=cats["Groceries"].id, year=2025, monthly=400.0)
        # Transfer txn — must be excluded from actual.
        _make_txn(
            db,
            amount=-1000.0,
            txn_date=date(2025, 6, 5),
            category_id=cats["Groceries"].id,
            is_transfer=True,
            import_hash="xfr",
        )
        # exclude_from_budget category — must be excluded from actual AND
        # from the expected sum.
        _make_txn(
            db,
            amount=-500.0,
            txn_date=date(2025, 6, 10),
            category_id=cats["CC Payments"].id,
            import_hash="ccpay",
        )
        _make_txn(
            db,
            amount=-100.0,
            txn_date=date(2025, 6, 15),
            category_id=cats["Groceries"].id,
            import_hash="real",
        )

        result = stats_service.get_spending_trend(
            db, date_from=date(2025, 6, 1), date_to=date(2025, 6, 30)
        )
        assert result[0]["actual"] == 100.0
        assert result[0]["expected"] == 400.0


class TestSpendingTrendOverrides:
    """Effective-budget resolution: override > baseline."""

    def test_override_takes_precedence_over_baseline(self, db: Session):
        cats = _seed_categories(db)
        # Baseline $400, override Feb=$700 only.
        _set_budget(
            db,
            category_id=cats["Groceries"].id,
            year=2025,
            monthly=400.0,
            overrides={2: 700.0},
        )
        result = stats_service.get_spending_trend(
            db, date_from=date(2025, 1, 1), date_to=date(2025, 3, 31)
        )
        by_month = {m["month"]: m for m in result}
        assert by_month["2025-01"]["expected"] == 400.0
        assert by_month["2025-02"]["expected"] == 700.0  # override
        assert by_month["2025-03"]["expected"] == 400.0


class TestSpendingTrendEmpty:
    """Empty range / no data."""

    def test_inverted_range_returns_empty(self, db: Session):
        result = stats_service.get_spending_trend(
            db, date_from=date(2025, 6, 1), date_to=date(2025, 5, 1)
        )
        assert result == []
