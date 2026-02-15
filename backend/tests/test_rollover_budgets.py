from datetime import date

from sqlalchemy.orm import Session

from app.models import Category, Transaction
from app.services.budget_service import get_actual_vs_budget, set_budget


def _seed_categories(db: Session) -> dict[str, int]:
    names = [
        "Shopping", "Groceries", "Dining", "Health & Wellness", "Entertainment",
        "Bills & Utilities", "Travel", "Gas", "Education", "Personal", "Home",
        "Gifts & Donations", "Income", "Investments", "Transfers", "Uncategorized",
    ]
    for n in names:
        db.add(Category(name=n, is_system=True))
    db.commit()
    return {cat.name: cat.id for cat in db.query(Category).all()}


def _make_txn(
    db: Session,
    *,
    vendor: str,
    amount: float,
    txn_date: date,
    category_id: int | None = None,
    import_hash: str | None = None,
) -> Transaction:
    if import_hash is None:
        import_hash = f"{vendor}_{amount}_{txn_date}"
    txn = Transaction(
        source_file="test.csv",
        account="Test",
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


class TestRolloverBudgets:
    def test_surplus_carries_forward(self, db: Session):
        """Underspending in month 1 should increase month 2's effective budget."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        set_budget(db, category_id=gid, year=2026, monthly_amount=500.0,
                   rollover_mode=True)

        # January: spend $400 (under by $100)
        _make_txn(db, vendor="Store", amount=-400, txn_date=date(2026, 1, 15),
                  category_id=gid, import_hash="rs_1")
        # February: spend $500
        _make_txn(db, vendor="Store", amount=-500, txn_date=date(2026, 2, 15),
                  category_id=gid, import_hash="rs_2")

        result = get_actual_vs_budget(db, year=2026)

        jan = [e for e in result.entries if e.month == 1][0]
        feb = [e for e in result.entries if e.month == 2][0]

        # January: $500 baseline, $400 actual, $100 surplus
        assert jan.budget_target == 500.0
        assert jan.actual_spend == 400.0
        assert jan.difference == 100.0

        # February: $500 baseline + $100 carry = $600 effective
        assert feb.budget_target == 600.0
        assert feb.actual_spend == 500.0
        assert feb.difference == 100.0

    def test_deficit_carries_forward(self, db: Session):
        """Overspending in month 1 should decrease month 2's effective budget."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        set_budget(db, category_id=gid, year=2026, monthly_amount=500.0,
                   rollover_mode=True)

        # January: spend $600 (over by $100)
        _make_txn(db, vendor="Store", amount=-600, txn_date=date(2026, 1, 15),
                  category_id=gid, import_hash="rd_1")

        result = get_actual_vs_budget(db, year=2026)

        jan = [e for e in result.entries if e.month == 1][0]
        feb = [e for e in result.entries if e.month == 2][0]

        # January: $500 target, $600 actual, -$100 deficit
        assert jan.budget_target == 500.0
        assert jan.difference == -100.0

        # February: $500 baseline - $100 deficit = $400 effective
        assert feb.budget_target == 400.0

    def test_multi_month_accumulation(self, db: Session):
        """Surplus/deficit should accumulate across multiple months."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        set_budget(db, category_id=gid, year=2026, monthly_amount=500.0,
                   rollover_mode=True)

        # Jan: $400 (surplus $100), Feb: $400 (surplus $200 from Feb's $600 effective)
        _make_txn(db, vendor="Store", amount=-400, txn_date=date(2026, 1, 15),
                  category_id=gid, import_hash="ma_1")
        _make_txn(db, vendor="Store", amount=-400, txn_date=date(2026, 2, 15),
                  category_id=gid, import_hash="ma_2")

        result = get_actual_vs_budget(db, year=2026)

        jan = [e for e in result.entries if e.month == 1][0]
        feb = [e for e in result.entries if e.month == 2][0]
        mar = [e for e in result.entries if e.month == 3][0]

        # Jan: 500, actual 400, surplus 100
        assert jan.budget_target == 500.0

        # Feb: 500 + 100 carry = 600, actual 400, surplus 200
        assert feb.budget_target == 600.0

        # Mar: 500 + 200 carry = 700
        assert mar.budget_target == 700.0

    def test_non_rollover_unaffected(self, db: Session):
        """Non-rollover budgets should have fixed targets regardless of prior months."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        set_budget(db, category_id=gid, year=2026, monthly_amount=500.0,
                   rollover_mode=False)

        _make_txn(db, vendor="Store", amount=-400, txn_date=date(2026, 1, 15),
                  category_id=gid, import_hash="nr_1")

        result = get_actual_vs_budget(db, year=2026)

        jan = [e for e in result.entries if e.month == 1][0]
        feb = [e for e in result.entries if e.month == 2][0]

        assert jan.budget_target == 500.0
        assert feb.budget_target == 500.0  # no carry

    def test_mixed_rollover_and_fixed(self, db: Session):
        """Both budget types should work correctly in the same year."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]
        did = cats["Dining"]

        set_budget(db, category_id=gid, year=2026, monthly_amount=500.0,
                   rollover_mode=True)
        set_budget(db, category_id=did, year=2026, monthly_amount=300.0,
                   rollover_mode=False)

        _make_txn(db, vendor="Store", amount=-400, txn_date=date(2026, 1, 15),
                  category_id=gid, import_hash="mx_1")
        _make_txn(db, vendor="Rest", amount=-200, txn_date=date(2026, 1, 15),
                  category_id=did, import_hash="mx_2")

        result = get_actual_vs_budget(db, year=2026)

        # Groceries: rollover, Feb = 500 + 100 = 600
        groceries_feb = [
            e for e in result.entries
            if e.category_name == "Groceries" and e.month == 2
        ][0]
        assert groceries_feb.budget_target == 600.0

        # Dining: fixed, Feb = 300
        dining_feb = [
            e for e in result.entries
            if e.category_name == "Dining" and e.month == 2
        ][0]
        assert dining_feb.budget_target == 300.0

    def test_rollover_with_zero_spend(self, db: Session):
        """No spending should carry the full budget amount forward."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        set_budget(db, category_id=gid, year=2026, monthly_amount=500.0,
                   rollover_mode=True)

        result = get_actual_vs_budget(db, year=2026)

        # Jan: 500, actual 0, carry 500
        # Feb: 500 + 500 = 1000, actual 0, carry 1000
        # Mar: 500 + 1000 = 1500
        jan = [e for e in result.entries if e.month == 1][0]
        feb = [e for e in result.entries if e.month == 2][0]
        mar = [e for e in result.entries if e.month == 3][0]

        assert jan.budget_target == 500.0
        assert feb.budget_target == 1000.0
        assert mar.budget_target == 1500.0
