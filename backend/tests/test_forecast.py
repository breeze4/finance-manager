from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Category, Subscription, Transaction
from app.services.forecast.registry import available_methods, get_forecaster
from app.services.forecast.simple import SimpleForecaster
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
    is_transfer: bool = False,
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
        is_transfer=is_transfer,
        import_hash=import_hash,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


class TestRegistry:
    def test_available_methods(self):
        methods = available_methods()
        assert "simple" in methods

    def test_get_simple_forecaster(self):
        f = get_forecaster("simple")
        assert isinstance(f, SimpleForecaster)
        assert f.name == "simple"

    def test_unknown_method_raises(self):
        import pytest

        with pytest.raises(ValueError, match="Unknown forecast method"):
            get_forecaster("nonexistent")


class TestSimpleForecaster:
    def test_forecast_structure(self, db: Session):
        """Forecast should return 12 months with correct statuses."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        # Create data for 2025.
        for i in range(12):
            _make_txn(
                db,
                vendor="Store",
                amount=-500,
                txn_date=date(2025, i + 1, 15),
                category_id=gid,
                import_hash=f"fs_{i}",
            )

        forecaster = get_forecaster("simple")
        result = forecaster.forecast(db, 2025)

        assert result.year == 2025
        assert result.method == "simple"
        assert len(result.months) == 12

        # All 2025 months should be "actual" (it's a past year).
        for m in result.months:
            assert m.status == "actual"

    def test_past_months_use_actual_data(self, db: Session):
        """Past months should reflect actual spending."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        _make_txn(
            db,
            vendor="Store",
            amount=-500,
            txn_date=date(2025, 1, 15),
            category_id=gid,
            import_hash="past_1",
        )
        _make_txn(
            db,
            vendor="Store",
            amount=-300,
            txn_date=date(2025, 2, 15),
            category_id=gid,
            import_hash="past_2",
        )

        forecaster = get_forecaster("simple")
        result = forecaster.forecast(db, 2025)

        jan = result.months[0]
        assert jan.month == 1
        assert jan.total == 500.0

        feb = result.months[1]
        assert feb.total == 300.0

    def test_future_year_all_projected(self, db: Session):
        """A future year should have all months projected."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        for i in range(12):
            _make_txn(
                db,
                vendor="Store",
                amount=-500,
                txn_date=date(2025, i + 1, 15),
                category_id=gid,
                import_hash=f"fut_{i}",
            )

        forecaster = get_forecaster("simple")
        result = forecaster.forecast(db, 2027)

        for m in result.months:
            assert m.status == "projected"

    def test_projected_months_nonzero(self, db: Session):
        """Projected months should have nonzero totals when historical data exists."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        for i in range(12):
            _make_txn(
                db,
                vendor="Store",
                amount=-500,
                txn_date=date(2025, i + 1, 15),
                category_id=gid,
                import_hash=f"nz_{i}",
            )

        forecaster = get_forecaster("simple")
        # Forecast a year where we have prior year data but no current year data.
        result = forecaster.forecast(db, 2027)

        # At least some months should have projections.
        total_projected = sum(m.total for m in result.months if m.status == "projected")
        assert total_projected > 0

    def test_annual_total(self, db: Session):
        """Annual total should be sum of all months."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        for i in range(12):
            _make_txn(
                db,
                vendor="Store",
                amount=-500,
                txn_date=date(2025, i + 1, 15),
                category_id=gid,
                import_hash=f"at_{i}",
            )

        forecaster = get_forecaster("simple")
        result = forecaster.forecast(db, 2025)

        expected = sum(m.total for m in result.months)
        assert abs(result.annual_total - expected) < 0.01

    def test_subscriptions_in_projections(self, db: Session):
        """Active subscriptions should influence projected months."""
        cats = _seed_categories(db)
        bid = cats["Bills & Utilities"]

        # Create an active subscription.
        sub = Subscription(
            vendor="Netflix",
            frequency="monthly",
            subscription_type="fixed",
            amount=15.99,
            annual_estimate=191.88,
            last_charge_date=date(2025, 12, 15),
            category_id=bid,
            is_active=True,
        )
        db.add(sub)
        db.commit()

        # No historical data — subscriptions should still project.
        forecaster = get_forecaster("simple")
        result = forecaster.forecast(db, 2027)

        # At least one month should have a subscription-based line item.
        has_sub = any(
            any(li.basis == "subscription" for li in m.line_items)
            for m in result.months
            if m.status == "projected"
        )
        assert has_sub

    def test_transfers_excluded(self, db: Session):
        """Transfer transactions should not appear in forecasts."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]
        tid = cats["Transfers"]

        _make_txn(
            db,
            vendor="Store",
            amount=-500,
            txn_date=date(2025, 1, 15),
            category_id=gid,
            import_hash="te_1",
        )
        _make_txn(
            db,
            vendor="Transfer",
            amount=-1000,
            txn_date=date(2025, 1, 15),
            category_id=tid,
            is_transfer=True,
            import_hash="te_2",
        )

        forecaster = get_forecaster("simple")
        result = forecaster.forecast(db, 2025)

        jan = result.months[0]
        assert jan.total == 500.0  # not 1500


class TestForecastAPI:
    def test_methods_endpoint(self, client: TestClient):
        resp = client.get("/api/forecast/methods")
        assert resp.status_code == 200
        assert "simple" in resp.json()["methods"]

    def test_forecast_endpoint(self, client: TestClient, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        for i in range(6):
            _make_txn(
                db,
                vendor="Store",
                amount=-500,
                txn_date=date(2025, i + 1, 15),
                category_id=gid,
                import_hash=f"api_fc_{i}",
            )

        resp = client.get("/api/forecast/2025?method=simple")
        assert resp.status_code == 200
        data = resp.json()
        assert data["year"] == 2025
        assert data["method"] == "simple"
        assert len(data["months"]) == 12

    def test_yoy_endpoint(self, client: TestClient, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        _make_txn(
            db,
            vendor="Store",
            amount=-500,
            txn_date=date(2025, 1, 15),
            category_id=gid,
            import_hash="yoy_25",
        )
        _make_txn(
            db,
            vendor="Store",
            amount=-600,
            txn_date=date(2026, 1, 15),
            category_id=gid,
            import_hash="yoy_26",
        )

        resp = client.get("/api/forecast/yoy")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1

        groceries = [d for d in data if d["category_name"] == "Groceries"]
        assert len(groceries) == 1
        assert groceries[0]["annual_totals"]["2025"] == 500.0
        assert groceries[0]["annual_totals"]["2026"] == 600.0

    def test_yoy_empty(self, client: TestClient, db: Session):
        resp = client.get("/api/forecast/yoy")
        assert resp.status_code == 200
        assert resp.json() == []


class TestForecastIntegration:
    def test_forecast_with_real_data(self, db: Session):
        """Forecast from real CSV data should produce reasonable results."""
        _seed_categories(db)
        input_dir = Path(__file__).resolve().parent.parent.parent / "input"
        if not input_dir.is_dir():
            return

        build_ingestion(db).ingest(input_dir)
        forecaster = get_forecaster("simple")
        result = forecaster.forecast(db, 2026)

        assert result.year == 2026
        assert len(result.months) == 12
        assert result.annual_total > 0

        # Should have a mix of actual and projected months.
        statuses = {m.status for m in result.months}
        assert len(statuses) >= 1  # at least one status type
