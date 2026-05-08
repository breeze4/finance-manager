from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Category, PaymentMatch, Transaction
from app.services.ingestion import build_ingestion
from app.services.payment_service import detect_payments, list_matches, unmatch


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


def _make_becu_txn(db: Session, *, amount: float, txn_date: date, **overrides) -> Transaction:
    from tests.conftest import get_or_create_account

    becu = get_or_create_account(db, "BECU Checking", type="checking", institution="BECU")
    defaults = {
        "source_file": "becu.csv",
        "account_id": becu.id,
        "date": txn_date,
        "raw_description": "External Withdrawal - CHASE CREDIT CRD  - EPAY",
        "vendor": "Chase Credit Crd",
        "amount": amount,
        "import_hash": None,
        "is_transfer": False,
    }
    defaults.update(overrides)
    if defaults["import_hash"] is None:
        defaults["import_hash"] = f"becu_{amount}_{txn_date}_{id(defaults)}"
    txn = Transaction(**defaults)
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


def _make_chase_payment(db: Session, *, amount: float, txn_date: date, **overrides) -> Transaction:
    from tests.conftest import get_or_create_account

    chase = get_or_create_account(db, "Chase CC", type="credit_card", institution="Chase")
    defaults = {
        "source_file": "chase.csv",
        "account_id": chase.id,
        "date": txn_date,
        "raw_description": "Payment Thank You-Mobile",
        "vendor": "Payment Thank You-Mobile",
        "amount": amount,
        "type": "Payment",
        "import_hash": None,
        "is_transfer": False,
    }
    defaults.update(overrides)
    if defaults["import_hash"] is None:
        defaults["import_hash"] = f"chase_{amount}_{txn_date}_{id(defaults)}"
    txn = Transaction(**defaults)
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


class TestDetectPayments:
    def test_basic_match(self, db: Session):
        """BECU debit and Chase payment with same amount and close dates should match."""
        becu = _make_becu_txn(db, amount=-500.00, txn_date=date(2025, 1, 15))
        chase = _make_chase_payment(db, amount=500.00, txn_date=date(2025, 1, 15))

        result = detect_payments(db)
        assert result.matches_found == 1
        assert result.total_matches == 1

        db.refresh(becu)
        db.refresh(chase)
        assert becu.is_transfer is True
        assert chase.is_transfer is True

        matches = db.query(PaymentMatch).all()
        assert len(matches) == 1
        assert matches[0].checking_transaction_id == becu.id
        assert matches[0].cc_transaction_id == chase.id

    def test_amount_mismatch_no_match(self, db: Session):
        """Different amounts should not match."""
        becu = _make_becu_txn(db, amount=-500.00, txn_date=date(2025, 1, 15))
        chase = _make_chase_payment(db, amount=499.99, txn_date=date(2025, 1, 15))

        result = detect_payments(db)
        assert result.matches_found == 0

        db.refresh(becu)
        db.refresh(chase)
        assert becu.is_transfer is False
        assert chase.is_transfer is False

    def test_date_outside_window_no_match(self, db: Session):
        """Dates more than 5 days apart should not match."""
        becu = _make_becu_txn(db, amount=-500.00, txn_date=date(2025, 1, 15))
        chase = _make_chase_payment(db, amount=500.00, txn_date=date(2025, 1, 21))

        result = detect_payments(db)
        assert result.matches_found == 0

        db.refresh(becu)
        db.refresh(chase)
        assert becu.is_transfer is False
        assert chase.is_transfer is False

    def test_date_at_boundary_matches(self, db: Session):
        """Dates exactly 5 days apart should match."""
        _make_becu_txn(db, amount=-500.00, txn_date=date(2025, 1, 15))
        _make_chase_payment(db, amount=500.00, txn_date=date(2025, 1, 20))

        result = detect_payments(db)
        assert result.matches_found == 1

    def test_idempotent_redetection(self, db: Session):
        """Running detection twice should not create duplicate matches."""
        _make_becu_txn(db, amount=-500.00, txn_date=date(2025, 1, 15))
        _make_chase_payment(db, amount=500.00, txn_date=date(2025, 1, 15))

        r1 = detect_payments(db)
        assert r1.matches_found == 1
        assert r1.total_matches == 1

        r2 = detect_payments(db)
        assert r2.matches_found == 0
        assert r2.total_matches == 1

    def test_multiple_matches(self, db: Session):
        """Multiple payments should each match independently."""
        _make_becu_txn(db, amount=-500.00, txn_date=date(2025, 1, 15), import_hash="becu_500_jan")
        _make_chase_payment(
            db, amount=500.00, txn_date=date(2025, 1, 15), import_hash="chase_500_jan"
        )

        _make_becu_txn(db, amount=-1000.00, txn_date=date(2025, 2, 15), import_hash="becu_1000_feb")
        _make_chase_payment(
            db, amount=1000.00, txn_date=date(2025, 2, 15), import_hash="chase_1000_feb"
        )

        result = detect_payments(db)
        assert result.matches_found == 2
        assert result.total_matches == 2

    def test_non_payment_chase_txn_not_matched(self, db: Session):
        """Chase transactions with type != 'Payment' should not be candidates."""
        from tests.conftest import get_or_create_account

        _make_becu_txn(db, amount=-50.00, txn_date=date(2025, 1, 15))
        chase = get_or_create_account(db, "Chase CC", type="credit_card", institution="Chase")
        # A sale, not a payment
        txn = Transaction(
            source_file="chase.csv",
            account_id=chase.id,
            date=date(2025, 1, 15),
            raw_description="Some Store",
            vendor="Some Store",
            amount=50.00,
            type="Sale",
            import_hash="chase_sale_50",
            is_transfer=False,
        )
        db.add(txn)
        db.commit()

        result = detect_payments(db)
        assert result.matches_found == 0

    def test_non_chase_becu_txn_not_matched(self, db: Session):
        """BECU transactions without 'CHASE CREDIT CRD' should not be candidates."""
        from tests.conftest import get_or_create_account

        becu = get_or_create_account(db, "BECU Checking", type="checking", institution="BECU")
        txn = Transaction(
            source_file="becu.csv",
            account_id=becu.id,
            date=date(2025, 1, 15),
            raw_description="External Withdrawal - SOME OTHER - EPAY",
            vendor="Some Other",
            amount=-500.00,
            import_hash="becu_other_500",
            is_transfer=False,
        )
        db.add(txn)
        db.commit()

        _make_chase_payment(db, amount=500.00, txn_date=date(2025, 1, 15))

        result = detect_payments(db)
        assert result.matches_found == 0


class TestUnmatch:
    def test_unmatch_resets_flags(self, db: Session):
        """Unmatching should reset is_transfer and delete the match record."""
        becu = _make_becu_txn(db, amount=-500.00, txn_date=date(2025, 1, 15))
        chase = _make_chase_payment(db, amount=500.00, txn_date=date(2025, 1, 15))

        detect_payments(db)
        match = db.query(PaymentMatch).first()
        assert match is not None

        result = unmatch(db, match.id)
        assert result is not None

        db.refresh(becu)
        db.refresh(chase)
        assert becu.is_transfer is False
        assert chase.is_transfer is False
        assert db.query(PaymentMatch).count() == 0

    def test_unmatch_nonexistent_returns_none(self, db: Session):
        result = unmatch(db, 99999)
        assert result is None

    def test_unmatch_allows_redetection(self, db: Session):
        """After unmatching, re-detection should find the match again."""
        _make_becu_txn(db, amount=-500.00, txn_date=date(2025, 1, 15))
        _make_chase_payment(db, amount=500.00, txn_date=date(2025, 1, 15))

        detect_payments(db)
        match = db.query(PaymentMatch).first()
        unmatch(db, match.id)

        result = detect_payments(db)
        assert result.matches_found == 1
        assert result.total_matches == 1


class TestListMatches:
    def test_list_with_transactions(self, db: Session):
        becu = _make_becu_txn(db, amount=-500.00, txn_date=date(2025, 1, 15))
        chase = _make_chase_payment(db, amount=500.00, txn_date=date(2025, 1, 15))

        detect_payments(db)
        matches = list_matches(db)
        assert len(matches) == 1
        assert matches[0].checking_transaction.id == becu.id
        assert matches[0].cc_transaction.id == chase.id

    def test_list_empty(self, db: Session):
        matches = list_matches(db)
        assert matches == []


class TestPaymentAPI:
    def test_detect_endpoint(self, client: TestClient, db: Session):
        _make_becu_txn(db, amount=-500.00, txn_date=date(2025, 1, 15))
        _make_chase_payment(db, amount=500.00, txn_date=date(2025, 1, 15))

        resp = client.post("/api/payments/detect")
        assert resp.status_code == 200
        data = resp.json()
        assert data["matches_found"] == 1
        assert data["total_matches"] == 1

    def test_list_endpoint(self, client: TestClient, db: Session):
        _make_becu_txn(db, amount=-500.00, txn_date=date(2025, 1, 15))
        _make_chase_payment(db, amount=500.00, txn_date=date(2025, 1, 15))

        client.post("/api/payments/detect")

        resp = client.get("/api/payments")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["checking_transaction"]["account_name"] == "BECU Checking"
        assert data[0]["cc_transaction"]["account_name"] == "Chase CC"
        assert data[0]["checking_transaction"]["amount"] == -500.00
        assert data[0]["cc_transaction"]["amount"] == 500.00

    def test_delete_endpoint(self, client: TestClient, db: Session):
        _make_becu_txn(db, amount=-500.00, txn_date=date(2025, 1, 15))
        _make_chase_payment(db, amount=500.00, txn_date=date(2025, 1, 15))

        client.post("/api/payments/detect")
        matches = client.get("/api/payments").json()
        match_id = matches[0]["id"]

        resp = client.delete(f"/api/payments/{match_id}")
        assert resp.status_code == 204

        resp = client.get("/api/payments")
        assert resp.json() == []

    def test_delete_not_found(self, client: TestClient):
        resp = client.delete("/api/payments/99999")
        assert resp.status_code == 404


class TestPaymentMatchingIntegration:
    def test_import_real_csvs_and_detect(self, db: Session):
        """Import real CSVs and verify payment matching runs end-to-end."""
        _seed_categories(db)
        input_dir = Path(__file__).resolve().parent.parent.parent / "input"
        if not input_dir.is_dir():
            return

        report = build_ingestion(db).ingest(input_dir)
        assert report.matches_found > 0
        assert report.total_matches > 0

        # Verify is_transfer is set on both sides for every detected match.
        matches = list_matches(db)
        for m in matches:
            assert m.checking_transaction.is_transfer is True
            assert m.cc_transaction.is_transfer is True

    def test_stats_exclude_transfers_after_detection(self, db: Session):
        """After detection (which now happens inside ingest), spending totals
        excluding transfers should be smaller in magnitude than totals
        including all negative transactions."""
        _seed_categories(db)
        input_dir = Path(__file__).resolve().parent.parent.parent / "input"
        if not input_dir.is_dir():
            return

        build_ingestion(db).ingest(input_dir)

        from sqlalchemy import func

        # All negative-amount rows, including matched transfers.
        spending_including_transfers = (
            db.query(func.sum(Transaction.amount)).filter(Transaction.amount < 0).scalar()
        ) or 0

        # Negative-amount rows excluding matched transfers.
        spending_excluding_transfers = (
            db.query(func.sum(Transaction.amount))
            .filter(Transaction.amount < 0, Transaction.is_transfer == False)  # noqa: E712
            .scalar()
        ) or 0

        # At least one transfer must have been matched, so excluding transfers
        # produces a less-negative (i.e. larger) sum.
        assert spending_excluding_transfers > spending_including_transfers
