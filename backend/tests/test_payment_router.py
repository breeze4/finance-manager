"""Boundary tests for ``GET /api/payments``.

The endpoint returns positive-amount transactions on credit-card
accounts, sorted by ``date DESC, id DESC``. Optional filters:
``account_id``, ``start_date``, ``end_date``.
"""

from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Account, Transaction


def _add_account(db: Session, name: str, *, type: str = "credit_card") -> Account:
    account = Account(name=name, type=type, institution=None, is_archived=False)
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def _add_txn(
    db: Session,
    *,
    account_id: int,
    amount: float,
    txn_date: date,
    vendor: str = "Vendor",
    is_transfer: bool = False,
    import_hash: str | None = None,
) -> Transaction:
    txn = Transaction(
        source_file="seed.csv",
        account_id=account_id,
        date=txn_date,
        raw_description=f"{vendor} desc",
        vendor=vendor,
        amount=amount,
        is_transfer=is_transfer,
        import_hash=import_hash or f"h_{account_id}_{amount}_{txn_date}",
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


class TestListPayments:
    def test_single_cc_account_returns_positive_only(self, client: TestClient, db: Session):
        cc = _add_account(db, "Chase CC")
        _add_txn(
            db,
            account_id=cc.id,
            amount=500.0,
            txn_date=date(2025, 1, 15),
            vendor="Payment",
            import_hash="cc_pay_jan",
        )
        # Negative amount (a charge) must not appear.
        _add_txn(
            db,
            account_id=cc.id,
            amount=-25.50,
            txn_date=date(2025, 1, 16),
            vendor="Coffee",
            import_hash="cc_charge_jan",
        )
        # Zero is also excluded by amount > 0.
        _add_txn(
            db,
            account_id=cc.id,
            amount=0.0,
            txn_date=date(2025, 1, 17),
            vendor="Adjustment",
            import_hash="cc_zero_jan",
        )

        resp = client.get("/api/payments")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        row = data[0]
        assert row["account_name"] == "Chase CC"
        assert row["amount"] == 500.0
        assert row["vendor"] == "Payment"
        assert row["date"] == "2025-01-15"
        assert set(row.keys()) == {
            "id",
            "date",
            "account_id",
            "account_name",
            "vendor",
            "amount",
        }

    def test_multiple_cc_accounts_aggregated_when_no_filter(self, client: TestClient, db: Session):
        cc1 = _add_account(db, "Chase CC")
        cc2 = _add_account(db, "Amex Gold")
        _add_txn(
            db, account_id=cc1.id, amount=100.0, txn_date=date(2025, 2, 1), import_hash="cc1_pay"
        )
        _add_txn(
            db, account_id=cc2.id, amount=200.0, txn_date=date(2025, 2, 2), import_hash="cc2_pay"
        )

        resp = client.get("/api/payments")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        # Sorted date desc.
        assert data[0]["account_name"] == "Amex Gold"
        assert data[1]["account_name"] == "Chase CC"

    def test_account_id_filter_narrows_to_one_card(self, client: TestClient, db: Session):
        cc1 = _add_account(db, "Chase CC")
        cc2 = _add_account(db, "Amex Gold")
        _add_txn(
            db, account_id=cc1.id, amount=100.0, txn_date=date(2025, 2, 1), import_hash="cc1_pay"
        )
        _add_txn(
            db, account_id=cc2.id, amount=200.0, txn_date=date(2025, 2, 2), import_hash="cc2_pay"
        )

        resp = client.get(f"/api/payments?account_id={cc2.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["account_id"] == cc2.id

    def test_non_credit_card_accounts_excluded(self, client: TestClient, db: Session):
        cc = _add_account(db, "Chase CC")
        checking = _add_account(db, "BECU Checking", type="checking")
        savings = _add_account(db, "BECU Savings", type="savings")
        _add_txn(
            db, account_id=cc.id, amount=100.0, txn_date=date(2025, 3, 1), import_hash="cc_pay"
        )
        # Positive on a non-CC account must not appear.
        _add_txn(
            db,
            account_id=checking.id,
            amount=2000.0,
            txn_date=date(2025, 3, 1),
            import_hash="check_credit",
        )
        _add_txn(
            db,
            account_id=savings.id,
            amount=50.0,
            txn_date=date(2025, 3, 1),
            import_hash="savings_credit",
        )

        resp = client.get("/api/payments")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["account_id"] == cc.id

    def test_date_range_inclusive_at_both_edges(self, client: TestClient, db: Session):
        cc = _add_account(db, "Chase CC")
        _add_txn(db, account_id=cc.id, amount=10.0, txn_date=date(2025, 1, 1), import_hash="jan1")
        _add_txn(db, account_id=cc.id, amount=20.0, txn_date=date(2025, 1, 15), import_hash="jan15")
        _add_txn(db, account_id=cc.id, amount=30.0, txn_date=date(2025, 1, 31), import_hash="jan31")
        _add_txn(db, account_id=cc.id, amount=40.0, txn_date=date(2025, 2, 1), import_hash="feb1")

        resp = client.get("/api/payments?start_date=2025-01-01&end_date=2025-01-31")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 3
        amounts = [r["amount"] for r in data]
        assert amounts == [30.0, 20.0, 10.0]  # sorted desc

    def test_start_date_only(self, client: TestClient, db: Session):
        cc = _add_account(db, "Chase CC")
        _add_txn(db, account_id=cc.id, amount=10.0, txn_date=date(2025, 1, 1), import_hash="jan1")
        _add_txn(db, account_id=cc.id, amount=20.0, txn_date=date(2025, 2, 1), import_hash="feb1")

        resp = client.get("/api/payments?start_date=2025-02-01")
        data = resp.json()
        assert len(data) == 1
        assert data[0]["amount"] == 20.0

    def test_end_date_only(self, client: TestClient, db: Session):
        cc = _add_account(db, "Chase CC")
        _add_txn(db, account_id=cc.id, amount=10.0, txn_date=date(2025, 1, 1), import_hash="jan1")
        _add_txn(db, account_id=cc.id, amount=20.0, txn_date=date(2025, 2, 1), import_hash="feb1")

        resp = client.get("/api/payments?end_date=2025-01-31")
        data = resp.json()
        assert len(data) == 1
        assert data[0]["amount"] == 10.0

    def test_empty_when_no_cc_accounts(self, client: TestClient, db: Session):
        checking = _add_account(db, "BECU Checking", type="checking")
        _add_txn(
            db,
            account_id=checking.id,
            amount=2000.0,
            txn_date=date(2025, 1, 1),
            import_hash="check",
        )

        resp = client.get("/api/payments")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_is_transfer_flag_preserved_in_underlying_data(self, client: TestClient, db: Session):
        """Smoke check: a CC payment row pre-flagged as ``is_transfer = true``
        still appears in the list (the endpoint does not filter on the flag),
        and its underlying flag value is unchanged after the request."""
        cc = _add_account(db, "Chase CC")
        flagged = _add_txn(
            db,
            account_id=cc.id,
            amount=500.0,
            txn_date=date(2025, 1, 15),
            is_transfer=True,
            import_hash="flagged_pay",
        )

        resp = client.get("/api/payments")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["id"] == flagged.id

        db.refresh(flagged)
        assert flagged.is_transfer is True

    def test_sort_stable_by_id_desc_within_same_date(self, client: TestClient, db: Session):
        cc = _add_account(db, "Chase CC")
        first = _add_txn(
            db, account_id=cc.id, amount=10.0, txn_date=date(2025, 1, 1), import_hash="a"
        )
        second = _add_txn(
            db, account_id=cc.id, amount=20.0, txn_date=date(2025, 1, 1), import_hash="b"
        )

        resp = client.get("/api/payments")
        data = resp.json()
        assert [r["id"] for r in data] == [second.id, first.id]
