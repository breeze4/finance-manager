"""Unit tests for the four ``spending.*`` outflow query functions.

Cases per the plan:
  - Structural filter: a transfer transaction never appears; an
    ``exclude_from_budget=true`` category transaction never appears.
  - Sign convention: outflows return positive magnitudes; income transactions
    in the date range do not appear in outflow functions; uncategorized rows
    surface under key ``None``.
  - ``exclude_pre_tax=True`` drops pre-tax categories; uncategorized rows
    still appear.
  - Period boundaries: a transaction on ``period.start`` is included; on
    ``period.end`` is included; one day outside is excluded.
  - Group-by: a ``Period.range`` crossing a year boundary correctly splits
    months in ``by_year_month`` and ``by_category_and_month``.

Mirrors the fixture style of ``test_stats_service.py``.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import Category, Transaction
from app.models.category import CspBucket
from app.services import spending
from app.services.spending import Period

# ---------------------------------------------------------------------------
# Helpers (mirror test_stats_service.py)
# ---------------------------------------------------------------------------


def _seed_categories(db: Session) -> dict[str, Category]:
    rows = [
        ("Groceries", CspBucket.FIXED.value, False, False),
        ("Dining", CspBucket.GUILT_FREE.value, False, False),
        ("401k", CspBucket.INVESTMENTS.value, True, False),  # pre-tax
        ("CC Payments", None, False, True),  # exclude_from_budget
        ("Income", None, False, False),
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
# Structural filter — every function drops transfers + exclude_from_budget rows
# ---------------------------------------------------------------------------


class TestStructuralFilter:
    def test_transfer_never_appears(self, db: Session):
        cats = _seed_categories(db)
        _make_txn(
            db,
            amount=-100.0,
            txn_date=date(2025, 6, 5),
            category_id=cats["Groceries"].id,
            is_transfer=True,
            import_hash="xfr",
        )
        _make_txn(
            db,
            amount=-50.0,
            txn_date=date(2025, 6, 5),
            category_id=cats["Groceries"].id,
            import_hash="real",
        )
        period = Period.month(2025, 6)

        assert spending.range_total(db, period) == Decimal("50")
        assert spending.by_category(db, period) == {cats["Groceries"].id: Decimal("50")}
        assert spending.by_year_month(db, period) == {(2025, 6): Decimal("50")}
        assert spending.by_category_and_month(db, period) == {
            (cats["Groceries"].id, 2025, 6): Decimal("50")
        }

    def test_exclude_from_budget_category_never_appears(self, db: Session):
        cats = _seed_categories(db)
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
        period = Period.month(2025, 6)

        assert spending.range_total(db, period) == Decimal("100")
        assert spending.by_category(db, period) == {cats["Groceries"].id: Decimal("100")}


# ---------------------------------------------------------------------------
# Sign convention — outflows positive; inflows skipped; uncategorized = None
# ---------------------------------------------------------------------------


class TestSignConvention:
    def test_outflows_are_positive_magnitudes(self, db: Session):
        cats = _seed_categories(db)
        _make_txn(
            db,
            amount=-150.0,
            txn_date=date(2025, 6, 5),
            category_id=cats["Groceries"].id,
            import_hash="t1",
        )
        period = Period.month(2025, 6)

        assert spending.range_total(db, period) == Decimal("150")
        assert spending.by_category(db, period)[cats["Groceries"].id] == Decimal("150")

    def test_inflows_excluded_from_outflow_functions(self, db: Session):
        cats = _seed_categories(db)
        _make_txn(
            db,
            amount=2500.0,  # inflow / income
            txn_date=date(2025, 6, 1),
            category_id=cats["Income"].id,
            import_hash="paycheck",
        )
        _make_txn(
            db,
            amount=-100.0,
            txn_date=date(2025, 6, 5),
            category_id=cats["Groceries"].id,
            import_hash="grocery",
        )
        period = Period.month(2025, 6)

        # The inflow does NOT show up — outflow functions only see amount < 0.
        assert spending.range_total(db, period) == Decimal("100")
        assert spending.by_category(db, period) == {cats["Groceries"].id: Decimal("100")}

    def test_uncategorized_under_none_key(self, db: Session):
        _seed_categories(db)
        _make_txn(
            db,
            amount=-30.0,
            txn_date=date(2025, 6, 7),
            category_id=None,
            import_hash="orphan",
        )
        period = Period.month(2025, 6)

        assert spending.by_category(db, period) == {None: Decimal("30")}
        assert spending.by_category_and_month(db, period) == {(None, 2025, 6): Decimal("30")}


# ---------------------------------------------------------------------------
# exclude_pre_tax axis
# ---------------------------------------------------------------------------


class TestExcludePreTax:
    def test_pre_tax_dropped_when_flag_set(self, db: Session):
        cats = _seed_categories(db)
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
        period = Period.month(2025, 6)

        # Default flag: pre-tax IS included.
        assert spending.range_total(db, period) == Decimal("2100")
        # With exclude_pre_tax=True: only Groceries.
        assert spending.range_total(db, period, exclude_pre_tax=True) == Decimal("100")
        assert spending.by_category(db, period, exclude_pre_tax=True) == {
            cats["Groceries"].id: Decimal("100")
        }

    def test_uncategorized_kept_when_pre_tax_excluded(self, db: Session):
        cats = _seed_categories(db)
        _make_txn(
            db,
            amount=-30.0,
            txn_date=date(2025, 6, 7),
            category_id=None,
            import_hash="orphan",
        )
        _make_txn(
            db,
            amount=-2000.0,
            txn_date=date(2025, 6, 1),
            category_id=cats["401k"].id,
            import_hash="pretax",
        )
        period = Period.month(2025, 6)

        # Pre-tax dropped, uncategorized kept.
        assert spending.range_total(db, period, exclude_pre_tax=True) == Decimal("30")
        assert spending.by_category(db, period, exclude_pre_tax=True) == {None: Decimal("30")}
        assert spending.by_year_month(db, period, exclude_pre_tax=True) == {
            (2025, 6): Decimal("30")
        }
        assert spending.by_category_and_month(db, period, exclude_pre_tax=True) == {
            (None, 2025, 6): Decimal("30")
        }


# ---------------------------------------------------------------------------
# Period boundaries
# ---------------------------------------------------------------------------


class TestPeriodBoundaries:
    def test_start_and_end_dates_are_inclusive(self, db: Session):
        cats = _seed_categories(db)
        _make_txn(
            db,
            amount=-10.0,
            txn_date=date(2025, 6, 1),  # period.start
            category_id=cats["Groceries"].id,
            import_hash="start",
        )
        _make_txn(
            db,
            amount=-20.0,
            txn_date=date(2025, 6, 30),  # period.end
            category_id=cats["Groceries"].id,
            import_hash="end",
        )
        period = Period.month(2025, 6)

        assert spending.range_total(db, period) == Decimal("30")

    def test_one_day_outside_excluded(self, db: Session):
        cats = _seed_categories(db)
        _make_txn(
            db,
            amount=-99.0,
            txn_date=date(2025, 5, 31),  # day before period.start
            category_id=cats["Groceries"].id,
            import_hash="before",
        )
        _make_txn(
            db,
            amount=-99.0,
            txn_date=date(2025, 7, 1),  # day after period.end
            category_id=cats["Groceries"].id,
            import_hash="after",
        )
        _make_txn(
            db,
            amount=-50.0,
            txn_date=date(2025, 6, 15),
            category_id=cats["Groceries"].id,
            import_hash="inside",
        )
        period = Period.month(2025, 6)

        assert spending.range_total(db, period) == Decimal("50")


# ---------------------------------------------------------------------------
# Group-by — year boundary splits months in by_year_month / by_category_and_month
# ---------------------------------------------------------------------------


class TestIncomeTotal:
    """Cases for ``spending.income_total`` — inflow-side mirror of range_total."""

    def test_structural_filter_drops_transfers(self, db: Session):
        cats = _seed_categories(db)
        _make_txn(
            db,
            amount=2500.0,
            txn_date=date(2025, 6, 1),
            category_id=cats["Income"].id,
            is_transfer=True,
            import_hash="xfr_in",
        )
        _make_txn(
            db,
            amount=1000.0,
            txn_date=date(2025, 6, 5),
            category_id=cats["Income"].id,
            import_hash="real_in",
        )
        period = Period.month(2025, 6)

        # Transfer dropped; only the real inflow counts.
        assert spending.income_total(db, period) == Decimal("1000")

    def test_only_positive_amounts_counted(self, db: Session):
        cats = _seed_categories(db)
        _make_txn(
            db,
            amount=2500.0,
            txn_date=date(2025, 6, 1),
            category_id=cats["Income"].id,
            import_hash="paycheck",
        )
        _make_txn(
            db,
            amount=-500.0,
            txn_date=date(2025, 6, 5),
            category_id=cats["Groceries"].id,
            import_hash="grocery",
        )
        period = Period.month(2025, 6)

        # Outflow does NOT show up; only the inflow contributes.
        assert spending.income_total(db, period) == Decimal("2500")

    def test_period_boundaries_inclusive(self, db: Session):
        cats = _seed_categories(db)
        _make_txn(
            db,
            amount=100.0,
            txn_date=date(2025, 6, 1),  # period.start
            category_id=cats["Income"].id,
            import_hash="start_in",
        )
        _make_txn(
            db,
            amount=200.0,
            txn_date=date(2025, 6, 30),  # period.end
            category_id=cats["Income"].id,
            import_hash="end_in",
        )
        _make_txn(
            db,
            amount=999.0,
            txn_date=date(2025, 7, 1),  # day after period.end
            category_id=cats["Income"].id,
            import_hash="after_in",
        )
        period = Period.month(2025, 6)

        assert spending.income_total(db, period) == Decimal("300")

    def test_uncategorized_inflows_counted(self, db: Session):
        _seed_categories(db)
        _make_txn(
            db,
            amount=400.0,
            txn_date=date(2025, 6, 7),
            category_id=None,
            import_hash="orphan_in",
        )
        period = Period.month(2025, 6)

        # Uncategorized inflows are still counted toward income_total.
        assert spending.income_total(db, period) == Decimal("400")


class TestYearBoundaryGroupBy:
    def test_by_year_month_splits_across_year_boundary(self, db: Session):
        cats = _seed_categories(db)
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
            category_id=cats["Dining"].id,
            import_hash="feb",
        )
        period = Period.range(date(2024, 12, 1), date(2025, 2, 28))

        result = spending.by_year_month(db, period)
        assert result == {
            (2024, 12): Decimal("50"),
            (2025, 1): Decimal("75"),
            (2025, 2): Decimal("25"),
        }

    def test_by_category_and_month_splits_across_year_boundary(self, db: Session):
        cats = _seed_categories(db)
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
            category_id=cats["Dining"].id,
            import_hash="feb",
        )
        period = Period.range(date(2024, 12, 1), date(2025, 2, 28))

        result = spending.by_category_and_month(db, period)
        assert result == {
            (cats["Groceries"].id, 2024, 12): Decimal("50"),
            (cats["Groceries"].id, 2025, 1): Decimal("75"),
            (cats["Dining"].id, 2025, 2): Decimal("25"),
        }
