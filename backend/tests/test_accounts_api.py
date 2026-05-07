from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Account, Transaction


class TestListAccounts:
    def test_empty(self, client: TestClient):
        resp = client.get("/api/accounts")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_default_excludes_archived(self, client: TestClient, db: Session):
        db.add_all(
            [
                Account(
                    name="Active",
                    type="checking",
                    institution="Bank",
                    is_archived=False,
                ),
                Account(
                    name="Old",
                    type="credit_card",
                    institution="Bank",
                    is_archived=True,
                ),
            ]
        )
        db.commit()

        resp = client.get("/api/accounts")
        names = [a["name"] for a in resp.json()]
        assert names == ["Active"]

    def test_include_archived_returns_all(self, client: TestClient, db: Session):
        db.add_all(
            [
                Account(name="Active", type="checking", is_archived=False),
                Account(name="Old", type="credit_card", is_archived=True),
            ]
        )
        db.commit()

        resp = client.get("/api/accounts", params={"include_archived": True})
        names = sorted(a["name"] for a in resp.json())
        assert names == ["Active", "Old"]


class TestCreateAccount:
    def test_create_minimal(self, client: TestClient):
        resp = client.post(
            "/api/accounts",
            json={"name": "BECU Savings", "type": "savings"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "BECU Savings"
        assert body["type"] == "savings"
        assert body["institution"] is None
        assert body["is_archived"] is False
        assert "id" in body

    def test_create_with_institution(self, client: TestClient):
        resp = client.post(
            "/api/accounts",
            json={
                "name": "Vanguard Brokerage",
                "type": "brokerage",
                "institution": "Vanguard",
            },
        )
        assert resp.status_code == 201
        assert resp.json()["institution"] == "Vanguard"

    def test_create_duplicate_name(self, client: TestClient, db: Session):
        db.add(Account(name="Existing", type="checking", is_archived=False))
        db.commit()

        resp = client.post("/api/accounts", json={"name": "Existing", "type": "savings"})
        assert resp.status_code == 409

    def test_create_invalid_type(self, client: TestClient):
        resp = client.post("/api/accounts", json={"name": "Bad", "type": "not_a_real_type"})
        assert resp.status_code == 422


class TestUpdateAccount:
    def test_rename(self, client: TestClient, db: Session):
        a = Account(name="Old", type="checking", is_archived=False)
        db.add(a)
        db.commit()
        db.refresh(a)

        resp = client.patch(f"/api/accounts/{a.id}", json={"name": "New"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "New"

    def test_change_type(self, client: TestClient, db: Session):
        a = Account(name="Acct", type="checking", is_archived=False)
        db.add(a)
        db.commit()
        db.refresh(a)

        resp = client.patch(f"/api/accounts/{a.id}", json={"type": "savings"})
        assert resp.status_code == 200
        assert resp.json()["type"] == "savings"

    def test_rename_conflict(self, client: TestClient, db: Session):
        db.add_all(
            [
                Account(name="A", type="checking", is_archived=False),
                Account(name="B", type="checking", is_archived=False),
            ]
        )
        db.commit()
        target = db.query(Account).filter(Account.name == "A").first()

        resp = client.patch(f"/api/accounts/{target.id}", json={"name": "B"})
        assert resp.status_code == 409

    def test_not_found(self, client: TestClient):
        resp = client.patch("/api/accounts/9999", json={"name": "Whatever"})
        assert resp.status_code == 404


class TestArchiveAccount:
    def test_archive(self, client: TestClient, db: Session):
        a = Account(name="ToArchive", type="checking", is_archived=False)
        db.add(a)
        db.commit()
        db.refresh(a)

        resp = client.post(f"/api/accounts/{a.id}/archive")
        assert resp.status_code == 204

        db.expire_all()
        refreshed = db.query(Account).filter(Account.id == a.id).first()
        assert refreshed.is_archived is True

    def test_archive_not_found(self, client: TestClient):
        resp = client.post("/api/accounts/9999/archive")
        assert resp.status_code == 404


class TestDeleteAccount:
    def test_delete_unused(self, client: TestClient, db: Session):
        a = Account(name="Solo", type="checking", is_archived=False)
        db.add(a)
        db.commit()
        db.refresh(a)

        resp = client.delete(f"/api/accounts/{a.id}")
        assert resp.status_code == 204
        assert db.query(Account).filter(Account.id == a.id).first() is None

    def test_delete_with_transactions_returns_409(self, client: TestClient, db: Session):
        a = Account(name="HasTxn", type="checking", is_archived=False)
        db.add(a)
        db.commit()
        db.refresh(a)
        db.add(
            Transaction(
                source_file="x.csv",
                account_id=a.id,
                date=date(2025, 1, 1),
                raw_description="r",
                vendor="v",
                amount=-1.0,
                import_hash="del-409",
            )
        )
        db.commit()

        resp = client.delete(f"/api/accounts/{a.id}")
        assert resp.status_code == 409
        # Still present
        assert db.query(Account).filter(Account.id == a.id).first() is not None

    def test_delete_not_found(self, client: TestClient):
        resp = client.delete("/api/accounts/9999")
        assert resp.status_code == 404
