from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Category, Transaction
from app.services.budget_service import get_historical_analysis
from app.services.import_service import import_all


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


class TestHistoricalStats:
    def test_basic_average(self, db: Session):
        """Monthly average should be correct for known data."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        # 3 months of groceries: $400, $500, $600
        _make_txn(
            db,
            vendor="Store",
            amount=-400,
            txn_date=date(2025, 1, 15),
            category_id=gid,
            import_hash="g1",
        )
        _make_txn(
            db,
            vendor="Store",
            amount=-500,
            txn_date=date(2025, 2, 15),
            category_id=gid,
            import_hash="g2",
        )
        _make_txn(
            db,
            vendor="Store",
            amount=-600,
            txn_date=date(2025, 3, 15),
            category_id=gid,
            import_hash="g3",
        )

        results = get_historical_analysis(db)
        groceries = [r for r in results if r.category_name == "Groceries"]
        assert len(groceries) == 1
        assert groceries[0].monthly_average == 500.0
        assert groceries[0].monthly_median == 500.0
        assert groceries[0].monthly_min == 400.0
        assert groceries[0].monthly_max == 600.0
        assert groceries[0].months_of_data == 3

    def test_multiple_txns_per_month_sum(self, db: Session):
        """Multiple transactions in the same month should be summed."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        _make_txn(
            db,
            vendor="Store A",
            amount=-200,
            txn_date=date(2025, 1, 5),
            category_id=gid,
            import_hash="ga1",
        )
        _make_txn(
            db,
            vendor="Store B",
            amount=-300,
            txn_date=date(2025, 1, 20),
            category_id=gid,
            import_hash="ga2",
        )

        results = get_historical_analysis(db)
        groceries = [r for r in results if r.category_name == "Groceries"]
        assert len(groceries) == 1
        assert groceries[0].monthly_average == 500.0
        assert groceries[0].months_of_data == 1

    def test_std_dev_calculation(self, db: Session):
        """Standard deviation should match known values."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        amounts = [400, 500, 600]
        for i, amt in enumerate(amounts):
            _make_txn(
                db,
                vendor="Store",
                amount=-amt,
                txn_date=date(2025, i + 1, 15),
                category_id=gid,
                import_hash=f"sd_{i}",
            )

        results = get_historical_analysis(db)
        groceries = [r for r in results if r.category_name == "Groceries"][0]
        # stdev of [400, 500, 600] = 100.0
        assert groceries.std_dev == 100.0
        assert groceries.coefficient_of_variation == round(100.0 / 500.0, 4)

    def test_confidence_interval(self, db: Session):
        """80% CI should be mean ± 1.28 * std_dev, clamped to observed range."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        amounts = [400, 500, 600]
        for i, amt in enumerate(amounts):
            _make_txn(
                db,
                vendor="Store",
                amount=-amt,
                txn_date=date(2025, i + 1, 15),
                category_id=gid,
                import_hash=f"ci_{i}",
            )

        results = get_historical_analysis(db)
        groceries = [r for r in results if r.category_name == "Groceries"][0]
        # mean=500, std=100, CI: 500 ± 128 = [372, 628], clamped to [400, 600]
        assert groceries.confidence_interval_low == 400.0
        assert groceries.confidence_interval_high == 600.0

    def test_confidence_interval_unclamped(self, db: Session):
        """CI should not be clamped when range is wide."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        amounts = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
        for i, amt in enumerate(amounts):
            _make_txn(
                db,
                vendor="Store",
                amount=-amt,
                txn_date=date(2025, (i % 12) + 1, 15),
                category_id=gid,
                import_hash=f"wide_{i}",
            )

        results = get_historical_analysis(db)
        groceries = [r for r in results if r.category_name == "Groceries"][0]
        # CI should be between min and max, but not necessarily equal to them.
        assert groceries.confidence_interval_low >= groceries.monthly_min
        assert groceries.confidence_interval_high <= groceries.monthly_max

    def test_transfers_excluded(self, db: Session):
        """Transfers should not appear in historical analysis."""
        cats = _seed_categories(db)
        tid = cats["Transfers"]

        for i in range(6):
            _make_txn(
                db,
                vendor="Transfer",
                amount=-500,
                txn_date=date(2025, i + 1, 15),
                category_id=tid,
                is_transfer=True,
                import_hash=f"t_{i}",
            )

        results = get_historical_analysis(db)
        transfers = [r for r in results if r.category_name == "Transfers"]
        assert len(transfers) == 0

    def test_positive_amounts_excluded(self, db: Session):
        """Income (positive amounts) should not appear in historical analysis."""
        cats = _seed_categories(db)
        iid = cats["Income"]

        for i in range(6):
            _make_txn(
                db,
                vendor="Employer",
                amount=5000,
                txn_date=date(2025, i + 1, 1),
                category_id=iid,
                import_hash=f"inc_{i}",
            )

        results = get_historical_analysis(db)
        income = [r for r in results if r.category_name == "Income"]
        assert len(income) == 0

    def test_year_filter(self, db: Session):
        """Year filter should only include data from that year."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        _make_txn(
            db,
            vendor="Store",
            amount=-400,
            txn_date=date(2025, 6, 15),
            category_id=gid,
            import_hash="y25",
        )
        _make_txn(
            db,
            vendor="Store",
            amount=-600,
            txn_date=date(2026, 1, 15),
            category_id=gid,
            import_hash="y26",
        )

        results_2025 = get_historical_analysis(db, year=2025)
        groceries_25 = [r for r in results_2025 if r.category_name == "Groceries"]
        assert len(groceries_25) == 1
        assert groceries_25[0].monthly_average == 400.0

        results_all = get_historical_analysis(db)
        groceries_all = [r for r in results_all if r.category_name == "Groceries"]
        assert groceries_all[0].monthly_average == 500.0

    def test_sorted_by_average_descending(self, db: Session):
        """Results should be sorted by monthly_average descending."""
        cats = _seed_categories(db)

        for i in range(3):
            _make_txn(
                db,
                vendor="Big",
                amount=-1000,
                txn_date=date(2025, i + 1, 15),
                category_id=cats["Shopping"],
                import_hash=f"big_{i}",
            )
            _make_txn(
                db,
                vendor="Small",
                amount=-100,
                txn_date=date(2025, i + 1, 15),
                category_id=cats["Dining"],
                import_hash=f"small_{i}",
            )

        results = get_historical_analysis(db)
        assert len(results) == 2
        assert results[0].monthly_average >= results[1].monthly_average


class TestTrendDetection:
    def test_increasing_trend(self, db: Session):
        """Steadily increasing amounts should produce 'increasing' trend."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        amounts = [300, 350, 400, 450, 500, 550]
        for i, amt in enumerate(amounts):
            _make_txn(
                db,
                vendor="Store",
                amount=-amt,
                txn_date=date(2025, i + 1, 15),
                category_id=gid,
                import_hash=f"inc_{i}",
            )

        results = get_historical_analysis(db)
        groceries = [r for r in results if r.category_name == "Groceries"][0]
        assert groceries.trend == "increasing"

    def test_decreasing_trend(self, db: Session):
        """Steadily decreasing amounts should produce 'decreasing' trend."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        amounts = [550, 500, 450, 400, 350, 300]
        for i, amt in enumerate(amounts):
            _make_txn(
                db,
                vendor="Store",
                amount=-amt,
                txn_date=date(2025, i + 1, 15),
                category_id=gid,
                import_hash=f"dec_{i}",
            )

        results = get_historical_analysis(db)
        groceries = [r for r in results if r.category_name == "Groceries"][0]
        assert groceries.trend == "decreasing"

    def test_stable_trend(self, db: Session):
        """Flat amounts should produce 'stable' trend."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        for i in range(6):
            _make_txn(
                db,
                vendor="Store",
                amount=-500,
                txn_date=date(2025, i + 1, 15),
                category_id=gid,
                import_hash=f"flat_{i}",
            )

        results = get_historical_analysis(db)
        groceries = [r for r in results if r.category_name == "Groceries"][0]
        assert groceries.trend == "stable"

    def test_few_months_stable(self, db: Session):
        """Less than 3 months of data should return 'stable' (insufficient for trend)."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        _make_txn(
            db,
            vendor="Store",
            amount=-400,
            txn_date=date(2025, 1, 15),
            category_id=gid,
            import_hash="few1",
        )
        _make_txn(
            db,
            vendor="Store",
            amount=-600,
            txn_date=date(2025, 2, 15),
            category_id=gid,
            import_hash="few2",
        )

        results = get_historical_analysis(db)
        groceries = [r for r in results if r.category_name == "Groceries"][0]
        assert groceries.trend == "stable"


class TestSeasonalDetection:
    def test_december_spike(self, db: Session):
        """A December spending spike should flag month 12 as seasonal."""
        cats = _seed_categories(db)
        sid = cats["Shopping"]

        # 11 months at $200, December at $800 (4x average)
        for i in range(11):
            _make_txn(
                db,
                vendor="Store",
                amount=-200,
                txn_date=date(2025, i + 1, 15),
                category_id=sid,
                import_hash=f"norm_{i}",
            )
        _make_txn(
            db,
            vendor="Store",
            amount=-800,
            txn_date=date(2025, 12, 15),
            category_id=sid,
            import_hash="dec_spike",
        )

        results = get_historical_analysis(db)
        shopping = [r for r in results if r.category_name == "Shopping"][0]
        assert 12 in shopping.seasonal_months

    def test_no_seasonal_when_flat(self, db: Session):
        """Flat spending should have no seasonal months."""
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        for i in range(12):
            _make_txn(
                db,
                vendor="Store",
                amount=-500,
                txn_date=date(2025, i + 1, 15),
                category_id=gid,
                import_hash=f"flat_{i}",
            )

        results = get_historical_analysis(db)
        groceries = [r for r in results if r.category_name == "Groceries"][0]
        assert groceries.seasonal_months == []


class TestHistoricalAPI:
    def test_historical_endpoint(self, client: TestClient, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        for i in range(6):
            _make_txn(
                db,
                vendor="Store",
                amount=-500,
                txn_date=date(2025, i + 1, 15),
                category_id=gid,
                import_hash=f"api_{i}",
            )

        resp = client.get("/api/budget/historical")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1

        groceries = [d for d in data if d["category_name"] == "Groceries"]
        assert len(groceries) == 1
        assert groceries[0]["monthly_average"] == 500.0
        assert groceries[0]["months_of_data"] == 6

    def test_historical_with_year_filter(self, client: TestClient, db: Session):
        cats = _seed_categories(db)
        gid = cats["Groceries"]

        _make_txn(
            db,
            vendor="Store",
            amount=-400,
            txn_date=date(2025, 6, 15),
            category_id=gid,
            import_hash="yf_25",
        )
        _make_txn(
            db,
            vendor="Store",
            amount=-600,
            txn_date=date(2026, 1, 15),
            category_id=gid,
            import_hash="yf_26",
        )

        resp = client.get("/api/budget/historical?year=2025")
        assert resp.status_code == 200
        data = resp.json()
        groceries = [d for d in data if d["category_name"] == "Groceries"]
        assert groceries[0]["monthly_average"] == 400.0

    def test_empty_database(self, client: TestClient, db: Session):
        resp = client.get("/api/budget/historical")
        assert resp.status_code == 200
        assert resp.json() == []


class TestHistoricalIntegration:
    def test_real_data_analysis(self, db: Session):
        """Import real CSVs and verify historical analysis produces reasonable results."""
        _seed_categories(db)
        input_dir = Path(__file__).resolve().parent.parent.parent / "input"
        if not input_dir.is_dir():
            return

        import_all(db, input_dir)
        results = get_historical_analysis(db)

        assert len(results) > 0

        # Check that we have data for common categories.
        category_names = {r.category_name for r in results}
        # At least some of these should have spending data.
        expected_categories = {"Groceries", "Dining", "Shopping", "Bills & Utilities"}
        assert len(category_names & expected_categories) > 0

        for r in results:
            # Sanity checks.
            assert r.monthly_average >= 0
            assert r.monthly_min <= r.monthly_average <= r.monthly_max
            assert r.confidence_interval_low <= r.confidence_interval_high
            assert r.confidence_interval_low >= r.monthly_min
            assert r.confidence_interval_high <= r.monthly_max
            assert r.trend in ("increasing", "decreasing", "stable")
            assert r.months_of_data > 0
