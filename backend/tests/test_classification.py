import csv
import tempfile
from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import ClassificationRule, Transaction
from app.services.classification_service import find_matching_rule


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
        "is_verified": False,
    }
    account_name = overrides.pop("account", None) or "Chase CC"
    account = get_or_create_account(db, account_name, type="credit_card", institution="Chase")
    defaults["account_id"] = account.id
    defaults.update(overrides)
    if defaults["import_hash"] is None:
        defaults["import_hash"] = f"hash_{id(defaults)}_{defaults['vendor']}_{defaults['amount']}"
    txn = Transaction(**defaults)
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


class TestRuleMatchPrecedence:
    """exact > starts_with > contains, each ordered by priority."""

    def test_exact_beats_contains(self, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        did = seed_categories["Dining"]

        db.add(
            ClassificationRule(vendor_pattern="Fred Meyer", match_type="contains", category_id=did)
        )
        db.add(ClassificationRule(vendor_pattern="Fred Meyer", match_type="exact", category_id=gid))
        db.commit()

        rule = find_matching_rule(db, "Fred Meyer")
        assert rule is not None
        assert rule.match_type == "exact"
        assert rule.category_id == gid

    def test_exact_beats_starts_with(self, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        did = seed_categories["Dining"]

        db.add(ClassificationRule(vendor_pattern="Fred", match_type="starts_with", category_id=did))
        db.add(ClassificationRule(vendor_pattern="Fred Meyer", match_type="exact", category_id=gid))
        db.commit()

        rule = find_matching_rule(db, "Fred Meyer")
        assert rule.match_type == "exact"
        assert rule.category_id == gid

    def test_starts_with_beats_contains(self, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        did = seed_categories["Dining"]

        db.add(ClassificationRule(vendor_pattern="Meyer", match_type="contains", category_id=did))
        db.add(ClassificationRule(vendor_pattern="Fred", match_type="starts_with", category_id=gid))
        db.commit()

        rule = find_matching_rule(db, "Fred Meyer")
        assert rule.match_type == "starts_with"
        assert rule.category_id == gid

    def test_higher_priority_wins_within_same_type(self, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        did = seed_categories["Dining"]

        db.add(
            ClassificationRule(
                vendor_pattern="Fred Meyer", match_type="exact", category_id=did, priority=0
            )
        )
        db.add(
            ClassificationRule(
                vendor_pattern="Fred Meyer", match_type="exact", category_id=gid, priority=10
            )
        )
        db.commit()

        rule = find_matching_rule(db, "Fred Meyer")
        assert rule.category_id == gid

    def test_case_insensitive_matching(self, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        db.add(ClassificationRule(vendor_pattern="fred meyer", match_type="exact", category_id=gid))
        db.commit()

        rule = find_matching_rule(db, "Fred Meyer")
        assert rule is not None
        assert rule.category_id == gid

    def test_no_matching_rule(self, db: Session):
        rule = find_matching_rule(db, "Unknown Vendor")
        assert rule is None


class TestAutoRuleCreationOnClassify:
    """PATCH transaction category → auto-creates rule."""

    def test_classify_creates_rule(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        txn = _make_txn(db, vendor="Fred Meyer", import_hash="acr1")

        resp = client.patch(f"/api/transactions/{txn.id}", json={"category_id": gid})
        assert resp.status_code == 200

        # Rule should exist
        rule = (
            db.query(ClassificationRule)
            .filter(ClassificationRule.vendor_pattern == "Fred Meyer")
            .first()
        )
        assert rule is not None
        assert rule.match_type == "exact"
        assert rule.category_id == gid

    def test_reclassify_updates_existing_rule(
        self, client: TestClient, db: Session, seed_categories
    ):
        gid = seed_categories["Groceries"]
        did = seed_categories["Dining"]
        txn = _make_txn(db, vendor="Fred Meyer", import_hash="acr2")

        # First classify as Groceries
        client.patch(f"/api/transactions/{txn.id}", json={"category_id": gid})
        # Re-classify as Dining
        client.patch(f"/api/transactions/{txn.id}", json={"category_id": did})

        rules = (
            db.query(ClassificationRule)
            .filter(ClassificationRule.vendor_pattern.ilike("Fred Meyer"))
            .all()
        )
        # Should be one rule, updated
        assert len(rules) == 1
        assert rules[0].category_id == did


class TestRetroactiveApply:
    """Applying a rule updates matching unverified transactions."""

    def test_apply_single_rule(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        t1 = _make_txn(db, vendor="Fred Meyer", is_verified=False, import_hash="ra1")
        t2 = _make_txn(db, vendor="Fred Meyer", is_verified=False, import_hash="ra2")
        t3 = _make_txn(db, vendor="Safeway", is_verified=False, import_hash="ra3")

        rule = ClassificationRule(vendor_pattern="Fred Meyer", match_type="exact", category_id=gid)
        db.add(rule)
        db.commit()
        db.refresh(rule)

        resp = client.post(f"/api/rules/{rule.id}/apply")
        assert resp.status_code == 200
        assert resp.json()["updated"] == 2

        db.refresh(t1)
        db.refresh(t2)
        db.refresh(t3)
        assert t1.category_id == gid
        assert t2.category_id == gid
        assert t3.category_id is None  # Not matched

    def test_apply_skips_verified(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        did = seed_categories["Dining"]
        _make_txn(db, vendor="Fred Meyer", is_verified=True, category_id=did, import_hash="rv1")
        _make_txn(db, vendor="Fred Meyer", is_verified=False, import_hash="rv2")

        rule = ClassificationRule(vendor_pattern="Fred Meyer", match_type="exact", category_id=gid)
        db.add(rule)
        db.commit()
        db.refresh(rule)

        resp = client.post(f"/api/rules/{rule.id}/apply")
        # Only the unverified one should be updated
        assert resp.json()["updated"] == 1

    def test_apply_all_rules(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        did = seed_categories["Dining"]

        _make_txn(db, vendor="Fred Meyer", is_verified=False, import_hash="aa1")
        _make_txn(db, vendor="Safeway", is_verified=False, import_hash="aa2")

        db.add(ClassificationRule(vendor_pattern="Fred Meyer", match_type="exact", category_id=gid))
        db.add(ClassificationRule(vendor_pattern="Safeway", match_type="exact", category_id=did))
        db.commit()

        resp = client.post("/api/rules/apply-all")
        assert resp.status_code == 200
        assert resp.json()["updated"] == 2

    def test_contains_rule_applies(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        _make_txn(db, vendor="Fred Meyer Store", is_verified=False, import_hash="ca1")
        _make_txn(db, vendor="Fred Meyer Fuel", is_verified=False, import_hash="ca2")

        rule = ClassificationRule(
            vendor_pattern="Fred Meyer", match_type="contains", category_id=gid
        )
        db.add(rule)
        db.commit()
        db.refresh(rule)

        resp = client.post(f"/api/rules/{rule.id}/apply")
        assert resp.json()["updated"] == 2

    def test_starts_with_rule_applies(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        _make_txn(db, vendor="Fred Meyer Store", is_verified=False, import_hash="sw1")
        _make_txn(db, vendor="Freddy's BBQ", is_verified=False, import_hash="sw2")

        rule = ClassificationRule(
            vendor_pattern="Fred Meyer", match_type="starts_with", category_id=gid
        )
        db.add(rule)
        db.commit()
        db.refresh(rule)

        resp = client.post(f"/api/rules/{rule.id}/apply")
        # Only "Fred Meyer Store" starts with "Fred Meyer"
        assert resp.json()["updated"] == 1


class TestBulkClassifyCreatesRules:
    """Bulk-update with category → creates rules per vendor, marks verified."""

    def test_bulk_creates_rules(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        t1 = _make_txn(db, vendor="Fred Meyer", import_hash="bc1")
        t2 = _make_txn(db, vendor="Fred Meyer", import_hash="bc2")
        t3 = _make_txn(db, vendor="Safeway", import_hash="bc3")

        resp = client.post(
            "/api/transactions/bulk-update",
            json={"ids": [t1.id, t2.id, t3.id], "category_id": gid},
        )
        assert resp.status_code == 200

        # Rules created for both vendors
        rules = db.query(ClassificationRule).all()
        vendor_patterns = {r.vendor_pattern for r in rules}
        assert "Fred Meyer" in vendor_patterns
        assert "Safeway" in vendor_patterns

        # All marked verified
        for tid in [t1.id, t2.id, t3.id]:
            db.expire_all()
            txn = db.query(Transaction).filter(Transaction.id == tid).first()
            assert txn.is_verified is True
            assert txn.category_id == gid


class TestRulesCRUD:
    def test_list_rules(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        db.add(ClassificationRule(vendor_pattern="Fred Meyer", match_type="exact", category_id=gid))
        db.commit()

        resp = client.get("/api/rules")
        assert resp.status_code == 200
        rules = resp.json()
        assert len(rules) == 1
        assert rules[0]["vendor_pattern"] == "Fred Meyer"
        assert rules[0]["category_name"] == "Groceries"

    def test_create_rule(self, client: TestClient, seed_categories):
        gid = seed_categories["Groceries"]
        resp = client.post(
            "/api/rules",
            json={
                "vendor_pattern": "Fred Meyer",
                "match_type": "exact",
                "category_id": gid,
            },
        )
        assert resp.status_code == 201
        assert resp.json()["vendor_pattern"] == "Fred Meyer"

    def test_create_invalid_match_type(self, client: TestClient):
        resp = client.post(
            "/api/rules",
            json={
                "vendor_pattern": "Fred Meyer",
                "match_type": "regex",
            },
        )
        assert resp.status_code == 400

    def test_update_rule(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        did = seed_categories["Dining"]
        rule = ClassificationRule(vendor_pattern="Fred Meyer", match_type="exact", category_id=gid)
        db.add(rule)
        db.commit()
        db.refresh(rule)

        resp = client.patch(f"/api/rules/{rule.id}", json={"category_id": did})
        assert resp.status_code == 200
        assert resp.json()["category_id"] == did

    def test_delete_rule(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        rule = ClassificationRule(vendor_pattern="Fred Meyer", match_type="exact", category_id=gid)
        db.add(rule)
        db.commit()
        db.refresh(rule)

        resp = client.delete(f"/api/rules/{rule.id}")
        assert resp.status_code == 204

        assert db.query(ClassificationRule).count() == 0

    def test_delete_not_found(self, client: TestClient):
        resp = client.delete("/api/rules/99999")
        assert resp.status_code == 404


class TestReimportAppliesRules:
    """After classifying, re-importing new data applies the rule."""

    def test_reimport_uses_rule(self, client: TestClient, db: Session, seed_categories):
        from app.services.import_service import import_file

        gid = seed_categories["Groceries"]

        # Create a rule
        db.add(ClassificationRule(vendor_pattern="Fred-Meyer", match_type="exact", category_id=gid))
        db.commit()

        # Import a file with Fred Meyer
        header = [
            "Transaction Date",
            "Post Date",
            "Description",
            "Category",
            "Type",
            "Amount",
            "Memo",
        ]
        rows = [
            ["01/15/2025", "01/16/2025", "FRED-MEYER #0013", "Shopping", "Sale", "-45.67", ""],
        ]
        f = tempfile.NamedTemporaryFile(mode="w", suffix=".CSV", delete=False, newline="")
        writer = csv.writer(f)
        writer.writerow(header)
        for row in rows:
            writer.writerow(row)
        f.close()

        result = import_file(db, Path(f.name))
        assert result.rows_imported == 1

        # The imported transaction should have the rule's category
        txn = db.query(Transaction).filter(Transaction.vendor == "Fred-Meyer").first()
        assert txn is not None
        assert txn.category_id == gid
