from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Transaction


def _make_txn(db: Session, **overrides) -> Transaction:
    from tests.conftest import get_or_create_account

    defaults = {
        "source_file": "test.csv",
        "date": date(2025, 6, 15),
        "raw_description": "TEST",
        "vendor": "Test Vendor",
        "amount": -50.0,
        "import_hash": None,
        "is_transfer": False,
    }
    # Resolve account string -> account_id (fixtures may already exist)
    account_name = overrides.pop("account", None) or "Chase CC"
    account = get_or_create_account(db, account_name, type="credit_card", institution="Chase")
    defaults["account_id"] = account.id
    defaults.update(overrides)
    if defaults["import_hash"] is None:
        defaults["import_hash"] = f"hash_{id(defaults)}_{defaults['amount']}"
    txn = Transaction(**defaults)
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


class TestSummaryTransferExclusion:
    """Stats must exclude transactions where is_transfer=true."""

    def test_transfers_excluded_from_spending(
        self, client: TestClient, db: Session, seed_categories
    ):
        gid = seed_categories["Groceries"]
        # Regular spending
        _make_txn(db, amount=-100.0, category_id=gid, import_hash="te1")
        _make_txn(db, amount=-200.0, category_id=gid, import_hash="te2")
        # Transfer — should be excluded
        _make_txn(
            db,
            amount=-500.0,
            is_transfer=True,
            category_id=seed_categories["Transfers"],
            import_hash="te3",
        )

        resp = client.get("/api/stats/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_spending"] == 300.0  # Not 800

    def test_transfers_excluded_from_income(self, client: TestClient, db: Session, seed_categories):
        # Regular income
        _make_txn(
            db,
            amount=3000.0,
            category_id=seed_categories["Income"],
            import_hash="ti1",
        )
        # Transfer credit (CC payment) — should be excluded
        _make_txn(
            db,
            amount=500.0,
            is_transfer=True,
            category_id=seed_categories["Transfers"],
            import_hash="ti2",
        )

        resp = client.get("/api/stats/summary")
        data = resp.json()
        assert data["total_income"] == 3000.0  # Not 3500

    def test_transfers_excluded_from_transaction_count(self, client: TestClient, db: Session):
        _make_txn(db, amount=-50.0, import_hash="tc1")
        _make_txn(db, amount=-50.0, import_hash="tc2")
        _make_txn(db, amount=-50.0, is_transfer=True, import_hash="tc3")

        resp = client.get("/api/stats/summary")
        data = resp.json()
        assert data["transaction_count"] == 2

    def test_transfers_excluded_from_monthly(
        self, client: TestClient, db: Session, seed_categories
    ):
        gid = seed_categories["Groceries"]
        _make_txn(db, amount=-100.0, date=date(2025, 3, 10), category_id=gid, import_hash="tm1")
        # Transfer in the same month — excluded
        _make_txn(
            db,
            amount=-500.0,
            date=date(2025, 3, 15),
            is_transfer=True,
            category_id=seed_categories["Transfers"],
            import_hash="tm2",
        )

        resp = client.get("/api/stats/monthly", params={"year": 2025})
        data = resp.json()
        assert data["year"] == 2025
        # Only the Groceries entry should appear
        march_entries = [m for m in data["months"] if m["month"] == 3]
        assert len(march_entries) == 1
        assert march_entries[0]["category_name"] == "Groceries"
        assert march_entries[0]["total"] == 100.0


class TestSummaryAccuracy:
    """Cross-check stats math."""

    def test_spending_sums_correctly(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        did = seed_categories["Dining"]
        amounts = [-45.67, -89.00, -120.50, -33.25]
        for i, amt in enumerate(amounts):
            cat = gid if i % 2 == 0 else did
            _make_txn(db, amount=amt, category_id=cat, import_hash=f"sa{i}")

        resp = client.get("/api/stats/summary")
        data = resp.json()
        expected = sum(abs(a) for a in amounts)
        assert abs(data["total_spending"] - expected) < 0.01

    def test_savings_rate_calculation(self, client: TestClient, db: Session, seed_categories):
        _make_txn(
            db,
            amount=5000.0,
            category_id=seed_categories["Income"],
            import_hash="sr1",
        )
        _make_txn(
            db,
            amount=-3000.0,
            category_id=seed_categories["Groceries"],
            import_hash="sr2",
        )

        resp = client.get("/api/stats/summary")
        data = resp.json()
        assert data["total_income"] == 5000.0
        assert data["total_spending"] == 3000.0
        # savings_rate = (5000 - 3000) / 5000 = 0.4
        assert abs(data["savings_rate"] - 0.4) < 0.001

    def test_top_categories_sorted_by_spending(
        self, client: TestClient, db: Session, seed_categories
    ):
        _make_txn(
            db,
            amount=-500.0,
            category_id=seed_categories["Groceries"],
            import_hash="top1",
        )
        _make_txn(
            db,
            amount=-100.0,
            category_id=seed_categories["Dining"],
            import_hash="top2",
        )
        _make_txn(
            db,
            amount=-300.0,
            category_id=seed_categories["Entertainment"],
            import_hash="top3",
        )

        resp = client.get("/api/stats/summary")
        cats = resp.json()["top_categories"]
        assert len(cats) == 3
        # Sorted by spending descending
        assert cats[0]["category_name"] == "Groceries"
        assert cats[0]["total"] == 500.0
        assert cats[1]["category_name"] == "Entertainment"
        assert cats[2]["category_name"] == "Dining"

    def test_top_categories_percentages(self, client: TestClient, db: Session, seed_categories):
        _make_txn(
            db,
            amount=-750.0,
            category_id=seed_categories["Groceries"],
            import_hash="pct1",
        )
        _make_txn(
            db,
            amount=-250.0,
            category_id=seed_categories["Dining"],
            import_hash="pct2",
        )

        resp = client.get("/api/stats/summary")
        cats = resp.json()["top_categories"]
        # Groceries = 75%, Dining = 25%
        assert cats[0]["percentage"] == 75.0
        assert cats[1]["percentage"] == 25.0

    def test_date_range_filter(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        _make_txn(db, amount=-100.0, date=date(2025, 1, 15), category_id=gid, import_hash="dr1")
        _make_txn(db, amount=-200.0, date=date(2025, 6, 15), category_id=gid, import_hash="dr2")
        _make_txn(db, amount=-300.0, date=date(2025, 12, 1), category_id=gid, import_hash="dr3")

        resp = client.get(
            "/api/stats/summary",
            params={"date_from": "2025-03-01", "date_to": "2025-09-01"},
        )
        data = resp.json()
        assert data["total_spending"] == 200.0

    def test_no_income_savings_rate_zero(self, client: TestClient, db: Session, seed_categories):
        _make_txn(
            db,
            amount=-100.0,
            category_id=seed_categories["Groceries"],
            import_hash="noi1",
        )
        resp = client.get("/api/stats/summary")
        assert resp.json()["savings_rate"] == 0.0


class TestMonthlyStatsAccuracy:
    def test_monthly_breakdown(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        did = seed_categories["Dining"]

        _make_txn(db, amount=-100.0, date=date(2025, 1, 10), category_id=gid, import_hash="mb1")
        _make_txn(db, amount=-50.0, date=date(2025, 1, 20), category_id=gid, import_hash="mb2")
        _make_txn(db, amount=-80.0, date=date(2025, 1, 15), category_id=did, import_hash="mb3")
        _make_txn(db, amount=-200.0, date=date(2025, 3, 10), category_id=gid, import_hash="mb4")

        resp = client.get("/api/stats/monthly", params={"year": 2025})
        data = resp.json()
        months = data["months"]

        # January should have Groceries (150) and Dining (80)
        jan_grocery = next(
            m for m in months if m["month"] == 1 and m["category_name"] == "Groceries"
        )
        assert jan_grocery["total"] == 150.0

        jan_dining = next(m for m in months if m["month"] == 1 and m["category_name"] == "Dining")
        assert jan_dining["total"] == 80.0

        # March should have Groceries (200)
        mar_grocery = next(
            m for m in months if m["month"] == 3 and m["category_name"] == "Groceries"
        )
        assert mar_grocery["total"] == 200.0

    def test_monthly_category_filter(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        did = seed_categories["Dining"]

        _make_txn(db, amount=-100.0, date=date(2025, 1, 10), category_id=gid, import_hash="mcf1")
        _make_txn(db, amount=-80.0, date=date(2025, 1, 15), category_id=did, import_hash="mcf2")

        resp = client.get("/api/stats/monthly", params={"year": 2025, "category_id": gid})
        months = resp.json()["months"]
        assert len(months) == 1
        assert months[0]["category_name"] == "Groceries"
        assert months[0]["total"] == 100.0

    def test_monthly_wrong_year_empty(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        _make_txn(db, amount=-100.0, date=date(2025, 1, 10), category_id=gid, import_hash="wy1")

        resp = client.get("/api/stats/monthly", params={"year": 2024})
        assert resp.json()["months"] == []
