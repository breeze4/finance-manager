from datetime import date, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Category, Transaction
from app.services.ingestion import build_ingestion
from app.services.subscription_service import detect_subscriptions, list_subscriptions


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
    account = get_or_create_account(db, "Chase CC", type="credit_card", institution="Chase")
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


def _create_monthly_subscription(
    db: Session,
    vendor: str,
    amount: float,
    start: date,
    months: int,
    *,
    category_id: int | None = None,
) -> list[Transaction]:
    """Create monthly charges for a vendor."""
    txns = []
    for i in range(months):
        d = date(
            start.year + (start.month + i - 1) // 12,
            (start.month + i - 1) % 12 + 1,
            start.day,
        )
        txns.append(
            _make_txn(
                db,
                vendor=vendor,
                amount=amount,
                txn_date=d,
                category_id=category_id,
                import_hash=f"{vendor}_{amount}_{d}_{i}",
            )
        )
    return txns


def _create_weekly_charges(
    db: Session,
    vendor: str,
    amount: float,
    start: date,
    count: int,
    *,
    category_id: int | None = None,
) -> list[Transaction]:
    """Create weekly charges for a vendor."""
    txns = []
    for i in range(count):
        d = start + timedelta(weeks=i)
        txns.append(
            _make_txn(
                db,
                vendor=vendor,
                amount=amount,
                txn_date=d,
                category_id=category_id,
                import_hash=f"{vendor}_{amount}_{d}_{i}",
            )
        )
    return txns


class TestDetectionAlgorithm:
    def test_fixed_monthly_subscription(self, db: Session):
        """A vendor charging the same amount every month should be detected as fixed monthly."""
        _create_monthly_subscription(db, "Netflix", -15.99, date(2025, 1, 15), 12)

        result = detect_subscriptions(db)
        assert result.subscriptions_found >= 1

        subs = list_subscriptions(db)
        netflix = [s for s in subs if s.vendor == "Netflix"]
        assert len(netflix) == 1
        assert netflix[0].frequency == "monthly"
        assert netflix[0].subscription_type == "fixed"
        assert netflix[0].amount == 15.99

    def test_variable_monthly_recurring(self, db: Session):
        """A vendor with varying amounts at monthly intervals should be variable."""
        amounts = [
            -45.00,
            -52.00,
            -48.50,
            -55.20,
            -47.30,
            -50.10,
            -46.80,
            -53.40,
            -49.90,
            -51.60,
            -48.00,
            -54.30,
        ]
        for i, amt in enumerate(amounts):
            d = date(2025, i + 1, 10)
            _make_txn(db, vendor="Utility Co", amount=amt, txn_date=d, import_hash=f"utility_{i}")

        detect_subscriptions(db)
        subs = list_subscriptions(db)
        utility = [s for s in subs if s.vendor == "Utility Co"]
        assert len(utility) == 1
        assert utility[0].frequency == "monthly"
        assert utility[0].subscription_type == "variable"
        assert utility[0].amount is None
        assert utility[0].amount_min is not None
        assert utility[0].amount_max is not None

    def test_weekly_subscription(self, db: Session):
        """Weekly charges should be detected with weekly frequency."""
        _create_weekly_charges(db, "Gym", -10.00, date(2025, 1, 6), 20)

        detect_subscriptions(db)
        subs = list_subscriptions(db)
        gym = [s for s in subs if s.vendor == "Gym"]
        assert len(gym) == 1
        assert gym[0].frequency == "weekly"
        assert gym[0].subscription_type == "fixed"
        assert gym[0].amount == 10.00

    def test_annual_estimate_monthly(self, db: Session):
        """Annual estimate for monthly $15.99 should be ~$191.88."""
        _create_monthly_subscription(db, "Netflix", -15.99, date(2025, 1, 15), 6)

        detect_subscriptions(db)
        subs = list_subscriptions(db)
        netflix = [s for s in subs if s.vendor == "Netflix"]
        assert len(netflix) == 1
        assert abs(netflix[0].annual_estimate - 191.88) < 1.00

    def test_annual_estimate_weekly(self, db: Session):
        """Annual estimate for weekly $10.00 should be ~$520.00."""
        _create_weekly_charges(db, "Gym", -10.00, date(2025, 1, 6), 10)

        detect_subscriptions(db)
        subs = list_subscriptions(db)
        gym = [s for s in subs if s.vendor == "Gym"]
        assert len(gym) == 1
        assert abs(gym[0].annual_estimate - 520.00) < 1.00

    def test_too_few_transactions_not_detected(self, db: Session):
        """Vendors with fewer than 3 transactions should not be detected."""
        _make_txn(
            db, vendor="OneOff", amount=-99.99, txn_date=date(2025, 1, 15), import_hash="oneoff_1"
        )
        _make_txn(
            db, vendor="OneOff", amount=-99.99, txn_date=date(2025, 2, 15), import_hash="oneoff_2"
        )

        detect_subscriptions(db)
        subs = list_subscriptions(db)
        assert len([s for s in subs if s.vendor == "OneOff"]) == 0

    def test_irregular_intervals_not_detected(self, db: Session):
        """Transactions with irregular spacing should not match any frequency."""
        dates = [
            date(2025, 1, 1),
            date(2025, 1, 20),
            date(2025, 3, 5),
            date(2025, 3, 8),
            date(2025, 7, 15),
        ]
        for i, d in enumerate(dates):
            _make_txn(
                db, vendor="Random Store", amount=-25.00, txn_date=d, import_hash=f"random_{i}"
            )

        detect_subscriptions(db)
        subs = list_subscriptions(db)
        assert len([s for s in subs if s.vendor == "Random Store"]) == 0

    def test_transfers_excluded(self, db: Session):
        """Transactions marked as transfers should not be considered."""
        from tests.conftest import get_or_create_account

        becu = get_or_create_account(db, "BECU Checking", type="checking", institution="BECU")
        for i in range(6):
            d = date(2025, i + 1, 15)
            txn = Transaction(
                source_file="test.csv",
                account_id=becu.id,
                date=d,
                raw_description="Transfer",
                vendor="Internal Transfer",
                amount=-500.00,
                import_hash=f"transfer_{i}",
                is_transfer=True,
            )
            db.add(txn)
        db.commit()

        detect_subscriptions(db)
        subs = list_subscriptions(db)
        assert len([s for s in subs if s.vendor == "Internal Transfer"]) == 0

    def test_positive_amounts_excluded(self, db: Session):
        """Inflow transactions (positive amounts) should not be detected as subscriptions."""
        for i in range(6):
            d = date(2025, i + 1, 1)
            _make_txn(db, vendor="Employer", amount=5000.00, txn_date=d, import_hash=f"income_{i}")

        detect_subscriptions(db)
        subs = list_subscriptions(db)
        assert len([s for s in subs if s.vendor == "Employer"]) == 0

    def test_redetection_replaces_active(self, db: Session):
        """Running detection twice should replace active subscriptions, not duplicate."""
        _create_monthly_subscription(db, "Netflix", -15.99, date(2025, 1, 15), 6)

        detect_subscriptions(db)
        subs1 = list_subscriptions(db)
        assert len([s for s in subs1 if s.vendor == "Netflix"]) == 1

        detect_subscriptions(db)
        subs2 = list_subscriptions(db)
        assert len([s for s in subs2 if s.vendor == "Netflix"]) == 1

    def test_last_charge_date(self, db: Session):
        """last_charge_date should be the most recent transaction date."""
        _create_monthly_subscription(db, "Netflix", -15.99, date(2025, 1, 15), 6)

        detect_subscriptions(db)
        subs = list_subscriptions(db)
        netflix = [s for s in subs if s.vendor == "Netflix"][0]
        assert netflix.last_charge_date == date(2025, 6, 15)

    def test_category_from_most_common(self, db: Session):
        """Subscription category should be the most common category among its transactions."""
        cats = _seed_categories(db)
        bills_id = cats["Bills & Utilities"]

        _create_monthly_subscription(
            db, "Netflix", -15.99, date(2025, 1, 15), 6, category_id=bills_id
        )

        detect_subscriptions(db)
        subs = list_subscriptions(db)
        netflix = [s for s in subs if s.vendor == "Netflix"][0]
        assert netflix.category_id == bills_id


class TestSubscriptionAPI:
    def test_detect_endpoint(self, client: TestClient, db: Session):
        _create_monthly_subscription(db, "Spotify", -9.99, date(2025, 1, 5), 6)

        resp = client.post("/api/subscriptions/detect")
        assert resp.status_code == 200
        data = resp.json()
        assert data["subscriptions_found"] >= 1
        assert data["total_active"] >= 1

    def test_list_endpoint(self, client: TestClient, db: Session):
        _create_monthly_subscription(db, "Spotify", -9.99, date(2025, 1, 5), 6)
        client.post("/api/subscriptions/detect")

        resp = client.get("/api/subscriptions")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        spotify = [s for s in data if s["vendor"] == "Spotify"]
        assert len(spotify) == 1
        assert spotify[0]["frequency"] == "monthly"
        assert spotify[0]["subscription_type"] == "fixed"
        assert spotify[0]["is_active"] is True

    def test_patch_deactivate(self, client: TestClient, db: Session):
        _create_monthly_subscription(db, "Spotify", -9.99, date(2025, 1, 5), 6)
        client.post("/api/subscriptions/detect")

        subs = client.get("/api/subscriptions").json()
        sub_id = subs[0]["id"]

        resp = client.patch(f"/api/subscriptions/{sub_id}", json={"is_active": False})
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    def test_patch_category(self, client: TestClient, db: Session):
        cats = _seed_categories(db)
        _create_monthly_subscription(db, "Spotify", -9.99, date(2025, 1, 5), 6)
        client.post("/api/subscriptions/detect")

        subs = client.get("/api/subscriptions").json()
        sub_id = subs[0]["id"]

        resp = client.patch(
            f"/api/subscriptions/{sub_id}",
            json={"category_id": cats["Entertainment"]},
        )
        assert resp.status_code == 200
        assert resp.json()["category_id"] == cats["Entertainment"]
        assert resp.json()["category_name"] == "Entertainment"

    def test_patch_not_found(self, client: TestClient):
        resp = client.patch("/api/subscriptions/99999", json={"is_active": False})
        assert resp.status_code == 404


class TestSubscriptionIntegration:
    def test_detect_from_real_csvs(self, db: Session):
        """Import real CSVs and verify the subscription pipeline runs end-to-end."""
        _seed_categories(db)
        input_dir = Path(__file__).resolve().parent.parent.parent / "input"
        if not input_dir.is_dir():
            return

        build_ingestion(db).ingest(input_dir)
        result = detect_subscriptions(db)
        assert result.subscriptions_found > 0

        subs = list_subscriptions(db)
        assert subs, "expected at least one detected subscription"
        # Frequencies should be drawn from the known set.
        for s in subs:
            assert s.frequency in {"weekly", "bi-weekly", "monthly", "quarterly", "annual"}

    def test_annual_estimates_reasonable(self, db: Session):
        """Annual estimates for known fixed subscriptions should be within 20% of actuals."""
        _seed_categories(db)
        input_dir = Path(__file__).resolve().parent.parent.parent / "input"
        if not input_dir.is_dir():
            return

        build_ingestion(db).ingest(input_dir)
        detect_subscriptions(db)
        subs = list_subscriptions(db)

        # Only check known fixed-amount subscriptions where we can verify.
        known_vendors = {"youtubepremium", "crunchyroll", "youtube tv"}

        for sub in subs:
            vendor_lower = sub.vendor.lower().replace(" ", "").replace("*", "")
            matched = any(k.replace(" ", "") in vendor_lower for k in known_vendors)
            if not matched:
                continue

            actual_txns = (
                db.query(Transaction)
                .filter(
                    Transaction.vendor == sub.vendor,
                    Transaction.is_transfer.is_(False),
                    Transaction.amount < 0,
                )
                .all()
            )
            if not actual_txns:
                continue

            dates = sorted(t.date for t in actual_txns)
            span_days = (dates[-1] - dates[0]).days
            # Need at least 6 months of data for annualization to be meaningful.
            if span_days < 180:
                continue

            total_spent = sum(abs(t.amount) for t in actual_txns)
            annualized_actual = total_spent / span_days * 365

            ratio = sub.annual_estimate / annualized_actual if annualized_actual > 0 else 0
            assert 0.8 <= ratio <= 1.2, (
                f"{sub.vendor}: annual_estimate={sub.annual_estimate:.2f}, "
                f"annualized_actual={annualized_actual:.2f}, ratio={ratio:.2f}"
            )
