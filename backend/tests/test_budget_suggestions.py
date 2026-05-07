from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Category, Transaction
from app.services.budget_service import get_budget_suggestions
from app.services.ingestion import build_ingestion


def _seed_categories(db: Session) -> dict[str, int]:
    names = [
        "Shopping",
        "Groceries",
        "Dining",
        "Health & Wellness",
        "Entertainment",
        "Bills & Utilities",
        "Travel",
        "Gas",
        "Education",
        "Personal",
        "Home",
        "Gifts & Donations",
        "Income",
        "Investments",
        "Transfers",
        "Uncategorized",
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
    from tests.conftest import get_or_create_account

    if import_hash is None:
        import_hash = f"{vendor}_{amount}_{txn_date}"
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


class TestBudgetSuggestions:
    def test_baseline_from_average(self, db: Session):
        """Baseline should be the historical monthly average."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        amounts = [400, 500, 600, 450, 550, 500]
        for i, amt in enumerate(amounts):
            _make_txn(
                db,
                vendor="Store",
                amount=-amt,
                txn_date=date(2025, i + 1, 15),
                category_id=gid,
                import_hash=f"sg_{i}",
            )

        suggestions = get_budget_suggestions(db, year=2026)
        groceries = [s for s in suggestions if s.category_name == "Groceries"]
        assert len(groceries) == 1
        assert groceries[0].baseline_monthly == 500.0  # mean of amounts

    def test_seasonal_month_higher(self, db: Session):
        """Seasonal months should get a higher suggestion than the baseline."""
        cats = _seed_categories(db)
        sid = cats["Shopping"]

        # 11 months at $200, December at $800
        for i in range(11):
            _make_txn(
                db,
                vendor="Store",
                amount=-200,
                txn_date=date(2025, i + 1, 15),
                category_id=sid,
                import_hash=f"sea_{i}",
            )
        _make_txn(
            db,
            vendor="Store",
            amount=-800,
            txn_date=date(2025, 12, 15),
            category_id=sid,
            import_hash="sea_dec",
        )

        suggestions = get_budget_suggestions(db, year=2026)
        shopping = [s for s in suggestions if s.category_name == "Shopping"][0]

        # December should get a higher suggestion than baseline.
        assert shopping.monthly_suggestions[12] > shopping.baseline_monthly
        # Non-seasonal months should get the baseline.
        assert shopping.monthly_suggestions[1] == shopping.baseline_monthly

    def test_no_suggestions_for_few_months(self, db: Session):
        """Categories with < 3 months of data should not get suggestions."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        _make_txn(
            db,
            vendor="Store",
            amount=-400,
            txn_date=date(2025, 1, 15),
            category_id=gid,
            import_hash="few_1",
        )
        _make_txn(
            db,
            vendor="Store",
            amount=-500,
            txn_date=date(2025, 2, 15),
            category_id=gid,
            import_hash="few_2",
        )

        suggestions = get_budget_suggestions(db, year=2026)
        groceries = [s for s in suggestions if s.category_name == "Groceries"]
        assert len(groceries) == 0

    def test_suggestions_within_confidence_interval(self, db: Session):
        """All suggestions should be within the confidence interval."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        amounts = [400, 450, 500, 550, 600, 650]
        for i, amt in enumerate(amounts):
            _make_txn(
                db,
                vendor="Store",
                amount=-amt,
                txn_date=date(2025, i + 1, 15),
                category_id=gid,
                import_hash=f"ci_{i}",
            )

        from app.services.budget_service import get_historical_analysis

        stats = get_historical_analysis(db)
        groceries_stats = [s for s in stats if s.category_name == "Groceries"][0]

        suggestions = get_budget_suggestions(db, year=2026)
        groceries = [s for s in suggestions if s.category_name == "Groceries"][0]

        for month, amount in groceries.monthly_suggestions.items():
            assert amount >= groceries_stats.confidence_interval_low, (
                f"Month {month}: {amount} < CI low {groceries_stats.confidence_interval_low}"
            )
            assert amount <= groceries_stats.confidence_interval_high, (
                f"Month {month}: {amount} > CI high {groceries_stats.confidence_interval_high}"
            )

    def test_all_twelve_months(self, db: Session):
        """Suggestions should cover all 12 months."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        for i in range(6):
            _make_txn(
                db,
                vendor="Store",
                amount=-500,
                txn_date=date(2025, i + 1, 15),
                category_id=gid,
                import_hash=f"12m_{i}",
            )

        suggestions = get_budget_suggestions(db, year=2026)
        groceries = [s for s in suggestions if s.category_name == "Groceries"][0]
        assert set(groceries.monthly_suggestions.keys()) == set(range(1, 13))

    def test_basis_text(self, db: Session):
        """Basis text should include average and range."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        for i in range(6):
            _make_txn(
                db,
                vendor="Store",
                amount=-500,
                txn_date=date(2025, i + 1, 15),
                category_id=gid,
                import_hash=f"basis_{i}",
            )

        suggestions = get_budget_suggestions(db, year=2026)
        groceries = [s for s in suggestions if s.category_name == "Groceries"][0]
        assert "Based on" in groceries.basis
        assert "$500" in groceries.basis


class TestBudgetSuggestionsAPI:
    def test_suggestions_endpoint(self, client: TestClient, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        for i in range(6):
            _make_txn(
                db,
                vendor="Store",
                amount=-500,
                txn_date=date(2025, i + 1, 15),
                category_id=gid,
                import_hash=f"api_sug_{i}",
            )

        resp = client.get("/api/budget/suggestions/2026")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1

        groceries = [d for d in data if d["category_name"] == "Groceries"]
        assert len(groceries) == 1
        assert groceries[0]["baseline_monthly"] == 500.0
        assert len(groceries[0]["monthly_suggestions"]) == 12

    def test_suggestions_empty_data(self, client: TestClient, db: Session):
        resp = client.get("/api/budget/suggestions/2026")
        assert resp.status_code == 200
        assert resp.json() == []


class TestBudgetSuggestionsIntegration:
    def test_suggestions_from_real_data(self, db: Session):
        """Suggestions from real data should exist for common categories."""
        _seed_categories(db)
        input_dir = Path(__file__).resolve().parent.parent.parent / "input"
        if not input_dir.is_dir():
            return

        build_ingestion(db).ingest(input_dir)
        suggestions = get_budget_suggestions(db, year=2026)

        assert len(suggestions) > 0

        for s in suggestions:
            assert s.baseline_monthly > 0
            assert len(s.monthly_suggestions) == 12
            assert s.basis != ""
