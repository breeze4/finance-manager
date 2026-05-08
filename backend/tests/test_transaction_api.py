from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Category, ClassificationRule, Transaction


def _make_txn(db: Session, **overrides) -> Transaction:
    """Create a transaction with sensible defaults."""
    from tests.conftest import get_or_create_account

    defaults = {
        "source_file": "test.csv",
        "date": date(2025, 6, 15),
        "raw_description": "TEST VENDOR",
        "vendor": "Test Vendor",
        "amount": -50.0,
        "import_hash": None,  # must be provided via overrides or auto-gen
        "is_transfer": False,
    }
    account_name = overrides.pop("account", None) or "Chase CC"
    account_id_override = overrides.pop("account_id", None)
    if account_id_override is None:
        account = get_or_create_account(db, account_name, type="credit_card", institution="Chase")
        defaults["account_id"] = account.id
    else:
        defaults["account_id"] = account_id_override
    defaults.update(overrides)
    if defaults["import_hash"] is None:
        defaults["import_hash"] = f"hash_{id(defaults)}_{defaults['vendor']}_{defaults['amount']}"
    txn = Transaction(**defaults)
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


class TestListTransactions:
    def test_empty_list(self, client: TestClient):
        resp = client.get("/api/transactions")
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0
        assert data["page"] == 1
        assert data["page_size"] == 50

    def test_basic_list(self, client: TestClient, db: Session):
        _make_txn(db, vendor="Vendor A", import_hash="a1")
        _make_txn(db, vendor="Vendor B", import_hash="b1")
        resp = client.get("/api/transactions")
        assert resp.status_code == 200
        assert resp.json()["total"] == 2

    def test_filter_by_account(self, client: TestClient, db: Session):
        from tests.conftest import get_or_create_account

        chase = get_or_create_account(db, "Chase CC", type="credit_card", institution="Chase")
        becu = get_or_create_account(db, "BECU Checking", type="checking", institution="BECU")
        _make_txn(db, account_id=chase.id, import_hash="c1")
        _make_txn(db, account_id=becu.id, import_hash="c2")
        resp = client.get("/api/transactions", params={"account_id": chase.id})
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["account_name"] == "Chase CC"
        assert data["items"][0]["account_id"] == chase.id

    def test_filter_by_category(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        did = seed_categories["Dining"]
        _make_txn(db, category_id=gid, import_hash="cat1")
        _make_txn(db, category_id=did, import_hash="cat2")
        resp = client.get("/api/transactions", params={"category_id": gid})
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["category_name"] == "Groceries"

    def test_filter_by_vendor_partial(self, client: TestClient, db: Session):
        _make_txn(db, vendor="Fred Meyer", import_hash="v1")
        _make_txn(db, vendor="Safeway", import_hash="v2")
        resp = client.get("/api/transactions", params={"vendor": "fred"})
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["vendor"] == "Fred Meyer"

    def test_filter_by_date_range(self, client: TestClient, db: Session):
        _make_txn(db, date=date(2025, 1, 15), import_hash="d1")
        _make_txn(db, date=date(2025, 6, 15), import_hash="d2")
        _make_txn(db, date=date(2025, 12, 1), import_hash="d3")
        resp = client.get(
            "/api/transactions",
            params={"date_from": "2025-03-01", "date_to": "2025-09-01"},
        )
        data = resp.json()
        assert data["total"] == 1

    def test_filter_by_amount_range(self, client: TestClient, db: Session):
        _make_txn(db, amount=-10.0, import_hash="am1")
        _make_txn(db, amount=-100.0, import_hash="am2")
        _make_txn(db, amount=-500.0, import_hash="am3")
        resp = client.get(
            "/api/transactions",
            params={"amount_min": -200, "amount_max": -5},
        )
        data = resp.json()
        assert data["total"] == 2

    def test_filter_by_is_transfer(self, client: TestClient, db: Session):
        _make_txn(db, is_transfer=False, import_hash="t1")
        _make_txn(db, is_transfer=True, import_hash="t2")
        resp = client.get("/api/transactions", params={"is_transfer": False})
        assert resp.json()["total"] == 1

    def test_search(self, client: TestClient, db: Session):
        _make_txn(db, vendor="Amazon", raw_description="AMZN MKTP US", import_hash="s1")
        _make_txn(db, vendor="Fred Meyer", raw_description="FRED-MEYER #0013", import_hash="s2")
        resp = client.get("/api/transactions", params={"search": "amzn"})
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["vendor"] == "Amazon"

    def test_sort_by_amount_asc(self, client: TestClient, db: Session):
        _make_txn(db, amount=-100.0, vendor="Big", import_hash="so1")
        _make_txn(db, amount=-10.0, vendor="Small", import_hash="so2")
        resp = client.get("/api/transactions", params={"sort_by": "amount", "sort_dir": "asc"})
        items = resp.json()["items"]
        assert items[0]["amount"] == -100.0
        assert items[1]["amount"] == -10.0

    def test_sort_by_vendor(self, client: TestClient, db: Session):
        _make_txn(db, vendor="Zebra", import_hash="sv1")
        _make_txn(db, vendor="Apple", import_hash="sv2")
        resp = client.get("/api/transactions", params={"sort_by": "vendor", "sort_dir": "asc"})
        items = resp.json()["items"]
        assert items[0]["vendor"] == "Apple"
        assert items[1]["vendor"] == "Zebra"

    def test_pagination(self, client: TestClient, db: Session):
        for i in range(15):
            _make_txn(db, import_hash=f"p{i}", vendor=f"Vendor {i:02d}")
        resp = client.get("/api/transactions", params={"page": 1, "page_size": 5})
        data = resp.json()
        assert data["total"] == 15
        assert len(data["items"]) == 5
        assert data["page"] == 1
        assert data["page_size"] == 5

        resp2 = client.get("/api/transactions", params={"page": 3, "page_size": 5})
        data2 = resp2.json()
        assert len(data2["items"]) == 5

        resp3 = client.get("/api/transactions", params={"page": 4, "page_size": 5})
        assert len(resp3.json()["items"]) == 0


class TestGetTransaction:
    def test_get_existing(self, client: TestClient, db: Session):
        txn = _make_txn(db, import_hash="get1")
        resp = client.get(f"/api/transactions/{txn.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == txn.id

    def test_get_not_found(self, client: TestClient):
        resp = client.get("/api/transactions/99999")
        assert resp.status_code == 404


class TestUpdateTransaction:
    def test_patch_category(self, client: TestClient, db: Session, seed_categories):
        txn = _make_txn(db, import_hash="up1")
        gid = seed_categories["Groceries"]
        resp = client.patch(f"/api/transactions/{txn.id}", json={"category_id": gid})
        assert resp.status_code == 200
        assert resp.json()["category_id"] == gid
        assert resp.json()["category_name"] == "Groceries"

    def test_patch_verified(self, client: TestClient, db: Session):
        txn = _make_txn(db, import_hash="up2")
        resp = client.patch(f"/api/transactions/{txn.id}", json={"is_verified": True})
        assert resp.status_code == 200
        assert resp.json()["is_verified"] is True

    def test_patch_not_found(self, client: TestClient):
        resp = client.patch("/api/transactions/99999", json={"is_verified": True})
        assert resp.status_code == 404

    def test_patch_empty_body(self, client: TestClient, db: Session):
        txn = _make_txn(db, import_hash="up3")
        resp = client.patch(f"/api/transactions/{txn.id}", json={})
        assert resp.status_code == 400

    def test_patch_creates_classification_rule(
        self, client: TestClient, db: Session, seed_categories
    ):
        txn = _make_txn(db, vendor="Acme", import_hash="rule1")
        gid = seed_categories["Groceries"]
        resp = client.patch(f"/api/transactions/{txn.id}", json={"category_id": gid})
        assert resp.status_code == 200

        rules = (
            db.query(ClassificationRule).filter(ClassificationRule.vendor_pattern == "Acme").all()
        )
        assert len(rules) == 1
        assert rules[0].match_type == "exact"
        assert rules[0].category_id == gid

    def test_patch_propagates_to_unverified_siblings(
        self, client: TestClient, db: Session, seed_categories
    ):
        gid = seed_categories["Groceries"]
        t1 = _make_txn(db, vendor="Acme", is_verified=False, import_hash="prop1")
        t2 = _make_txn(db, vendor="Acme", is_verified=False, import_hash="prop2")

        resp = client.patch(f"/api/transactions/{t1.id}", json={"category_id": gid})
        assert resp.status_code == 200

        db.refresh(t2)
        assert t2.category_id == gid

    def test_patch_does_not_touch_verified_siblings(
        self, client: TestClient, db: Session, seed_categories
    ):
        gid = seed_categories["Groceries"]
        did = seed_categories["Dining"]
        t1 = _make_txn(db, vendor="Acme", is_verified=False, import_hash="vk1")
        t2 = _make_txn(
            db,
            vendor="Acme",
            category_id=did,
            is_verified=True,
            import_hash="vk2",
        )

        resp = client.patch(f"/api/transactions/{t1.id}", json={"category_id": gid})
        assert resp.status_code == 200

        db.refresh(t2)
        assert t2.category_id == did

    def test_patch_updates_existing_rule_instead_of_duplicating(
        self, client: TestClient, db: Session, seed_categories
    ):
        gid = seed_categories["Groceries"]
        did = seed_categories["Dining"]
        txn = _make_txn(db, vendor="Acme", import_hash="dup1")

        r1 = client.patch(f"/api/transactions/{txn.id}", json={"category_id": gid})
        assert r1.status_code == 200
        r2 = client.patch(f"/api/transactions/{txn.id}", json={"category_id": did})
        assert r2.status_code == 200

        rules = (
            db.query(ClassificationRule)
            .filter(ClassificationRule.vendor_pattern.ilike("Acme"))
            .all()
        )
        assert len(rules) == 1
        assert rules[0].category_id == did


class TestBulkUpdate:
    def test_bulk_update_category(self, client: TestClient, db: Session, seed_categories):
        t1 = _make_txn(db, import_hash="bu1")
        t2 = _make_txn(db, import_hash="bu2")
        gid = seed_categories["Groceries"]
        resp = client.post(
            "/api/transactions/bulk-update",
            json={"ids": [t1.id, t2.id], "category_id": gid},
        )
        assert resp.status_code == 200
        assert resp.json()["updated"] == 2

        # Verify both updated
        for tid in [t1.id, t2.id]:
            r = client.get(f"/api/transactions/{tid}")
            assert r.json()["category_id"] == gid

    def test_bulk_update_empty_ids(self, client: TestClient):
        resp = client.post(
            "/api/transactions/bulk-update",
            json={"ids": [], "category_id": 1},
        )
        assert resp.status_code == 400

    def test_bulk_update_creates_one_rule_per_unique_vendor(
        self, client: TestClient, db: Session, seed_categories
    ):
        gid = seed_categories["Groceries"]
        a1 = _make_txn(db, vendor="Acme", import_hash="ba1")
        a2 = _make_txn(db, vendor="Acme", import_hash="ba2")
        a3 = _make_txn(db, vendor="ACME", import_hash="ba3")  # case variant
        b1 = _make_txn(db, vendor="Beta", import_hash="bb1")
        b2 = _make_txn(db, vendor="Beta", import_hash="bb2")

        ids = [a1.id, a2.id, a3.id, b1.id, b2.id]
        resp = client.post(
            "/api/transactions/bulk-update",
            json={"ids": ids, "category_id": gid},
        )
        assert resp.status_code == 200
        assert resp.json()["updated"] == 5

        # Exactly two rules — one per unique vendor (case-insensitively)
        rules = db.query(ClassificationRule).all()
        assert len(rules) == 2
        patterns = {r.vendor_pattern.lower() for r in rules}
        assert patterns == {"acme", "beta"}
        for r in rules:
            assert r.match_type == "exact"
            assert r.category_id == gid

        # All five marked verified
        for tid in ids:
            db_txn = db.query(Transaction).filter(Transaction.id == tid).one()
            db.refresh(db_txn)
            assert db_txn.is_verified is True
            assert db_txn.category_id == gid


class TestCategoryAPI:
    def test_list_categories_with_counts(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        _make_txn(db, category_id=gid, import_hash="cc1")
        _make_txn(db, category_id=gid, import_hash="cc2")

        resp = client.get("/api/categories")
        assert resp.status_code == 200
        cats = resp.json()
        grocery_cat = next(c for c in cats if c["name"] == "Groceries")
        assert grocery_cat["transaction_count"] == 2
        uncategorized = next(c for c in cats if c["name"] == "Uncategorized")
        assert uncategorized["transaction_count"] == 0

    def test_create_category(self, client: TestClient):
        resp = client.post("/api/categories", json={"name": "Pets"})
        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "Pets"
        assert body["is_system"] is False
        assert body["exclude_from_budget"] is False

    def test_create_category_with_exclude_flag(self, client: TestClient):
        resp = client.post(
            "/api/categories",
            json={"name": "Mortgage Payoff", "exclude_from_budget": True},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["exclude_from_budget"] is True

    def test_patch_exclude_flag_only(self, client: TestClient, seed_categories):
        gid = seed_categories["Groceries"]
        resp = client.patch(
            f"/api/categories/{gid}",
            json={"exclude_from_budget": True},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == "Groceries"
        assert body["exclude_from_budget"] is True

    def test_patch_flag_on_system_category(self, client: TestClient, seed_categories):
        # Toggling exclude_from_budget on a system category is allowed.
        tid = seed_categories["Transfers"]
        resp = client.patch(
            f"/api/categories/{tid}",
            json={"exclude_from_budget": True},
        )
        assert resp.status_code == 200
        assert resp.json()["exclude_from_budget"] is True

    def test_patch_no_fields_is_noop(self, client: TestClient, seed_categories):
        gid = seed_categories["Groceries"]
        resp = client.patch(f"/api/categories/{gid}", json={})
        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == "Groceries"
        assert body["exclude_from_budget"] is False

    def test_create_duplicate(self, client: TestClient, seed_categories):
        resp = client.post("/api/categories", json={"name": "Groceries"})
        assert resp.status_code == 409

    def test_rename_category(self, client: TestClient, seed_categories):
        gid = seed_categories["Groceries"]
        resp = client.patch(f"/api/categories/{gid}", json={"name": "Food & Groceries"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Food & Groceries"

    def test_rename_conflict(self, client: TestClient, seed_categories):
        gid = seed_categories["Groceries"]
        resp = client.patch(f"/api/categories/{gid}", json={"name": "Dining"})
        assert resp.status_code == 409

    def test_delete_unused(self, client: TestClient, db: Session):
        cat = Category(name="Temp", is_system=False)
        db.add(cat)
        db.commit()
        db.refresh(cat)
        resp = client.delete(f"/api/categories/{cat.id}")
        assert resp.status_code == 204

    def test_delete_in_use(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        _make_txn(db, category_id=gid, import_hash="del1")
        resp = client.delete(f"/api/categories/{gid}")
        assert resp.status_code == 409

    def test_delete_not_found(self, client: TestClient):
        resp = client.delete("/api/categories/99999")
        assert resp.status_code == 404
