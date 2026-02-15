from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Budget, BudgetMonthlyOverride, Category, Transaction
from app.services.budget_service import (
    delete_monthly_override,
    get_actual_vs_budget,
    list_budgets,
    set_budget,
    set_monthly_override,
)


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
    is_transfer: bool = False,
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
        is_transfer=is_transfer,
        import_hash=import_hash,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


class TestBudgetCRUD:
    def test_set_budget_creates(self, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        budget = set_budget(db, category_id=gid, year=2026, monthly_amount=500.0)
        assert budget.category_id == gid
        assert budget.year == 2026
        assert budget.monthly_amount == 500.0
        assert budget.rollover_mode is False

    def test_set_budget_updates(self, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        b1 = set_budget(db, category_id=gid, year=2026, monthly_amount=500.0)
        b2 = set_budget(db, category_id=gid, year=2026, monthly_amount=600.0)
        assert b1.id == b2.id
        assert b2.monthly_amount == 600.0

    def test_set_budget_with_rollover(self, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        budget = set_budget(db, category_id=gid, year=2026, monthly_amount=500.0,
                            rollover_mode=True)
        assert budget.rollover_mode is True

    def test_list_budgets(self, db: Session):
        cats = _seed_categories(db)

        set_budget(db, category_id=cats["Groceries"], year=2026, monthly_amount=500.0)
        set_budget(db, category_id=cats["Dining"], year=2026, monthly_amount=300.0)
        set_budget(db, category_id=cats["Groceries"], year=2025, monthly_amount=400.0)

        budgets_2026 = list_budgets(db, year=2026)
        assert len(budgets_2026) == 2

        budgets_2025 = list_budgets(db, year=2025)
        assert len(budgets_2025) == 1

    def test_set_monthly_override(self, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        set_budget(db, category_id=gid, year=2026, monthly_amount=500.0)
        override = set_monthly_override(db, category_id=gid, year=2026, month=12,
                                        amount=800.0)
        assert override.month == 12
        assert override.amount == 800.0

    def test_override_updates_existing(self, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        set_budget(db, category_id=gid, year=2026, monthly_amount=500.0)
        set_monthly_override(db, category_id=gid, year=2026, month=12, amount=800.0)
        o2 = set_monthly_override(db, category_id=gid, year=2026, month=12, amount=900.0)
        assert o2.amount == 900.0

        # Should only be one override, not two.
        budget = db.query(Budget).filter(
            Budget.category_id == gid, Budget.year == 2026
        ).first()
        overrides = db.query(BudgetMonthlyOverride).filter(
            BudgetMonthlyOverride.budget_id == budget.id
        ).all()
        assert len(overrides) == 1

    def test_override_no_budget_returns_none(self, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        result = set_monthly_override(db, category_id=gid, year=2026, month=12,
                                      amount=800.0)
        assert result is None

    def test_delete_override(self, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        set_budget(db, category_id=gid, year=2026, monthly_amount=500.0)
        set_monthly_override(db, category_id=gid, year=2026, month=12, amount=800.0)

        deleted = delete_monthly_override(db, category_id=gid, year=2026, month=12)
        assert deleted is True

        # Verify it's gone.
        deleted_again = delete_monthly_override(db, category_id=gid, year=2026, month=12)
        assert deleted_again is False

    def test_delete_override_no_budget(self, db: Session):
        cats = _seed_categories(db)
        result = delete_monthly_override(db, category_id=cats["Groceries"],
                                         year=2026, month=12)
        assert result is False


class TestActualVsBudget:
    def test_basic_actual_vs_budget(self, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        set_budget(db, category_id=gid, year=2026, monthly_amount=500.0)

        # January: $450 in groceries
        _make_txn(db, vendor="Store A", amount=-250, txn_date=date(2026, 1, 5),
                  category_id=gid, import_hash="avb_1")
        _make_txn(db, vendor="Store B", amount=-200, txn_date=date(2026, 1, 20),
                  category_id=gid, import_hash="avb_2")

        result = get_actual_vs_budget(db, year=2026)

        # Find January Groceries.
        jan_groceries = [
            e for e in result.entries
            if e.category_name == "Groceries" and e.month == 1
        ]
        assert len(jan_groceries) == 1
        entry = jan_groceries[0]
        assert entry.budget_target == 500.0
        assert entry.actual_spend == 450.0
        assert entry.difference == 50.0  # under budget
        assert entry.percentage == 90.0

    def test_override_affects_target(self, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        set_budget(db, category_id=gid, year=2026, monthly_amount=500.0)
        set_monthly_override(db, category_id=gid, year=2026, month=1, amount=600.0)

        _make_txn(db, vendor="Store", amount=-450, txn_date=date(2026, 1, 15),
                  category_id=gid, import_hash="ovr_1")

        result = get_actual_vs_budget(db, year=2026)
        jan = [e for e in result.entries if e.month == 1][0]
        assert jan.budget_target == 600.0  # override, not baseline
        assert jan.actual_spend == 450.0
        assert jan.difference == 150.0

    def test_override_only_affects_its_month(self, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        set_budget(db, category_id=gid, year=2026, monthly_amount=500.0)
        set_monthly_override(db, category_id=gid, year=2026, month=1, amount=600.0)

        result = get_actual_vs_budget(db, year=2026)

        jan = [e for e in result.entries if e.month == 1][0]
        feb = [e for e in result.entries if e.month == 2][0]
        assert jan.budget_target == 600.0
        assert feb.budget_target == 500.0  # baseline

    def test_transfers_excluded(self, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        set_budget(db, category_id=gid, year=2026, monthly_amount=500.0)

        _make_txn(db, vendor="Store", amount=-300, txn_date=date(2026, 1, 15),
                  category_id=gid, import_hash="te_1")
        _make_txn(db, vendor="Transfer", amount=-200, txn_date=date(2026, 1, 15),
                  category_id=gid, is_transfer=True, import_hash="te_2")

        result = get_actual_vs_budget(db, year=2026)
        jan = [e for e in result.entries if e.month == 1][0]
        assert jan.actual_spend == 300.0  # transfer excluded

    def test_no_transactions_zero_actual(self, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        set_budget(db, category_id=gid, year=2026, monthly_amount=500.0)

        result = get_actual_vs_budget(db, year=2026)
        jan = [e for e in result.entries if e.month == 1][0]
        assert jan.actual_spend == 0.0
        assert jan.difference == 500.0

    def test_monthly_rollup(self, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]
        did = cats["Dining"]

        set_budget(db, category_id=gid, year=2026, monthly_amount=500.0)
        set_budget(db, category_id=did, year=2026, monthly_amount=300.0)

        _make_txn(db, vendor="Store", amount=-400, txn_date=date(2026, 1, 15),
                  category_id=gid, import_hash="ru_1")
        _make_txn(db, vendor="Restaurant", amount=-250, txn_date=date(2026, 1, 15),
                  category_id=did, import_hash="ru_2")

        result = get_actual_vs_budget(db, year=2026)
        jan_rollup = [r for r in result.monthly_rollups if r.month == 1][0]
        assert jan_rollup.total_budgeted == 800.0
        assert jan_rollup.total_actual == 650.0
        assert jan_rollup.difference == 150.0

    def test_all_twelve_months_present(self, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        set_budget(db, category_id=gid, year=2026, monthly_amount=500.0)

        result = get_actual_vs_budget(db, year=2026)
        months = {e.month for e in result.entries}
        assert months == set(range(1, 13))

        rollup_months = {r.month for r in result.monthly_rollups}
        assert rollup_months == set(range(1, 13))

    def test_over_budget(self, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        set_budget(db, category_id=gid, year=2026, monthly_amount=300.0)
        _make_txn(db, vendor="Store", amount=-450, txn_date=date(2026, 1, 15),
                  category_id=gid, import_hash="over_1")

        result = get_actual_vs_budget(db, year=2026)
        jan = [e for e in result.entries if e.month == 1][0]
        assert jan.difference == -150.0  # over budget
        assert jan.percentage == 150.0


class TestBudgetAPI:
    def test_set_and_list_budget(self, client: TestClient, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        resp = client.put(
            f"/api/budget/{gid}/2026",
            json={"monthly_amount": 500.0},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["category_id"] == gid
        assert data["monthly_amount"] == 500.0
        assert data["category_name"] == "Groceries"

        resp = client.get("/api/budget?year=2026")
        assert resp.status_code == 200
        budgets = resp.json()
        assert len(budgets) == 1
        assert budgets[0]["monthly_amount"] == 500.0

    def test_set_override_endpoint(self, client: TestClient, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        client.put(f"/api/budget/{gid}/2026", json={"monthly_amount": 500.0})

        resp = client.put(
            f"/api/budget/{gid}/2026/12",
            json={"amount": 800.0},
        )
        assert resp.status_code == 200
        assert resp.json()["month"] == 12
        assert resp.json()["amount"] == 800.0

    def test_delete_override_endpoint(self, client: TestClient, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        client.put(f"/api/budget/{gid}/2026", json={"monthly_amount": 500.0})
        client.put(f"/api/budget/{gid}/2026/12", json={"amount": 800.0})

        resp = client.delete(f"/api/budget/{gid}/2026/12")
        assert resp.status_code == 204

        # Verify override removed.
        budgets = client.get("/api/budget?year=2026").json()
        assert len(budgets[0]["monthly_overrides"]) == 0

    def test_delete_override_not_found(self, client: TestClient, db: Session):
        cats = _seed_categories(db)
        resp = client.delete(f"/api/budget/{cats['Groceries']}/2026/12")
        assert resp.status_code == 404

    def test_actual_vs_budget_endpoint(self, client: TestClient, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        client.put(f"/api/budget/{gid}/2026", json={"monthly_amount": 500.0})

        _make_txn(db, vendor="Store", amount=-400, txn_date=date(2026, 1, 15),
                  category_id=gid, import_hash="api_avb_1")

        resp = client.get("/api/budget/actual/2026")
        assert resp.status_code == 200
        data = resp.json()

        assert "entries" in data
        assert "monthly_rollups" in data
        assert len(data["entries"]) == 12
        assert len(data["monthly_rollups"]) == 12

        jan = [e for e in data["entries"] if e["month"] == 1][0]
        assert jan["budget_target"] == 500.0
        assert jan["actual_spend"] == 400.0

    def test_set_override_no_budget_404(self, client: TestClient, db: Session):
        cats = _seed_categories(db)
        resp = client.put(
            f"/api/budget/{cats['Groceries']}/2026/12",
            json={"amount": 800.0},
        )
        assert resp.status_code == 404
