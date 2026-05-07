"""Tests for the snapshot batch endpoint and the latest-balances endpoint."""

from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Account, BalanceSnapshot


class TestPostSnapshotBatch:
    def test_happy_path_creates_rows(
        self,
        client: TestClient,
        db: Session,
        chase_cc_account: Account,
        becu_account: Account,
    ):
        resp = client.post(
            "/api/snapshots/batch",
            json={
                "as_of_date": "2025-06-01",
                "entries": [
                    {"account_id": chase_cc_account.id, "balance": 1234.56},
                    {"account_id": becu_account.id, "balance": 7890.12},
                ],
            },
        )
        assert resp.status_code == 200
        assert resp.json() == {"written": 2}

        rows = db.query(BalanceSnapshot).order_by(BalanceSnapshot.account_id).all()
        assert len(rows) == 2
        balances = {r.account_id: r.balance for r in rows}
        assert balances[chase_cc_account.id] == 1234.56
        assert balances[becu_account.id] == 7890.12
        for r in rows:
            assert r.as_of_date == date(2025, 6, 1)
            assert r.source == "manual"

    def test_replay_overwrites_same_day(
        self,
        client: TestClient,
        db: Session,
        chase_cc_account: Account,
        becu_account: Account,
    ):
        # First write
        client.post(
            "/api/snapshots/batch",
            json={
                "as_of_date": "2025-06-01",
                "entries": [
                    {"account_id": chase_cc_account.id, "balance": 100.0},
                    {"account_id": becu_account.id, "balance": 200.0},
                ],
            },
        )
        # Replay with new values
        resp = client.post(
            "/api/snapshots/batch",
            json={
                "as_of_date": "2025-06-01",
                "entries": [
                    {"account_id": chase_cc_account.id, "balance": 555.0},
                    {"account_id": becu_account.id, "balance": 999.0},
                ],
            },
        )
        assert resp.status_code == 200
        assert resp.json() == {"written": 2}

        rows = db.query(BalanceSnapshot).all()
        assert len(rows) == 2  # No new rows — upserted
        balances = {r.account_id: r.balance for r in rows}
        assert balances[chase_cc_account.id] == 555.0
        assert balances[becu_account.id] == 999.0

    def test_blank_entries_are_skipped(
        self,
        client: TestClient,
        db: Session,
        chase_cc_account: Account,
        becu_account: Account,
    ):
        resp = client.post(
            "/api/snapshots/batch",
            json={
                "as_of_date": "2025-06-01",
                "entries": [
                    {"account_id": chase_cc_account.id, "balance": 100.0},
                    {"account_id": becu_account.id, "balance": None},
                ],
            },
        )
        assert resp.status_code == 200
        assert resp.json() == {"written": 1}
        rows = db.query(BalanceSnapshot).all()
        assert len(rows) == 1
        assert rows[0].account_id == chase_cc_account.id

    def test_invalid_account_id_returns_400(self, client: TestClient):
        resp = client.post(
            "/api/snapshots/batch",
            json={
                "as_of_date": "2025-06-01",
                "entries": [{"account_id": 9999, "balance": 50.0}],
            },
        )
        assert resp.status_code == 400
        assert "9999" in resp.json()["detail"]

    def test_archived_account_returns_400(self, client: TestClient, db: Session):
        a = Account(name="Closed", type="checking", is_archived=True)
        db.add(a)
        db.commit()
        db.refresh(a)

        resp = client.post(
            "/api/snapshots/batch",
            json={
                "as_of_date": "2025-06-01",
                "entries": [{"account_id": a.id, "balance": 50.0}],
            },
        )
        assert resp.status_code == 400
        assert "archived" in resp.json()["detail"].lower()

    def test_negative_balance_returns_400(self, client: TestClient, chase_cc_account: Account):
        resp = client.post(
            "/api/snapshots/batch",
            json={
                "as_of_date": "2025-06-01",
                "entries": [{"account_id": chase_cc_account.id, "balance": -1.0}],
            },
        )
        assert resp.status_code == 400
        assert ">= 0" in resp.json()["detail"]


class TestGetLatestBalances:
    def test_includes_accounts_with_no_snapshots(
        self, client: TestClient, chase_cc_account: Account, becu_account: Account
    ):
        resp = client.get("/api/net-worth/latest")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 2
        # Sorted by name: BECU Checking, Chase CC
        assert [r["account_name"] for r in body] == ["BECU Checking", "Chase CC"]
        for row in body:
            assert row["balance"] is None
            assert row["as_of_date"] is None

    def test_returns_latest_per_account(
        self,
        client: TestClient,
        db: Session,
        chase_cc_account: Account,
        becu_account: Account,
    ):
        # Two snapshots for Chase CC, one for BECU. Latest should win.
        client.post(
            "/api/snapshots/batch",
            json={
                "as_of_date": "2025-06-01",
                "entries": [
                    {"account_id": chase_cc_account.id, "balance": 100.0},
                    {"account_id": becu_account.id, "balance": 200.0},
                ],
            },
        )
        client.post(
            "/api/snapshots/batch",
            json={
                "as_of_date": "2025-06-15",
                "entries": [
                    {"account_id": chase_cc_account.id, "balance": 333.0},
                ],
            },
        )

        resp = client.get("/api/net-worth/latest")
        assert resp.status_code == 200
        body = resp.json()
        by_name = {r["account_name"]: r for r in body}

        assert by_name["Chase CC"]["balance"] == 333.0
        assert by_name["Chase CC"]["as_of_date"] == "2025-06-15"
        assert by_name["Chase CC"]["account_type"] == "credit_card"

        assert by_name["BECU Checking"]["balance"] == 200.0
        assert by_name["BECU Checking"]["as_of_date"] == "2025-06-01"
        assert by_name["BECU Checking"]["account_type"] == "checking"

    def test_excludes_archived_accounts(self, client: TestClient, db: Session):
        active = Account(name="Active", type="checking", is_archived=False)
        archived = Account(name="Archived", type="savings", is_archived=True)
        db.add_all([active, archived])
        db.commit()

        resp = client.get("/api/net-worth/latest")
        names = [r["account_name"] for r in resp.json()]
        assert names == ["Active"]
