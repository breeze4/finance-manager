"""Tests for Category.csp_bucket and Category.is_pre_tax.

Covers:
- Column shape on a fresh insert (bucket is nullable, is_pre_tax defaults
  to False).
- Round-trip via the /api/categories endpoints: create with both fields,
  update both fields, GET returns both.
- Bucket value validation at the API boundary.
"""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Category
from app.models.category import CspBucket


class TestCategoryColumnShape:
    def test_csp_bucket_allows_null_and_is_pre_tax_defaults_false(self, db: Session):
        cat = Category(name="Test Bucket Defaults", is_system=False)
        db.add(cat)
        db.commit()
        db.refresh(cat)

        assert cat.csp_bucket is None
        assert cat.is_pre_tax is False
        assert cat.exclude_from_budget is False

    def test_can_assign_each_bucket_value(self, db: Session):
        for i, bucket in enumerate(CspBucket):
            cat = Category(
                name=f"Cat {bucket.value}",
                is_system=False,
                csp_bucket=bucket.value,
                is_pre_tax=(i % 2 == 0),
            )
            db.add(cat)
        db.commit()

        rows = db.query(Category).order_by(Category.name).all()
        stored = {row.name: row.csp_bucket for row in rows}
        assert stored["Cat fixed"] == "fixed"
        assert stored["Cat investments"] == "investments"
        assert stored["Cat savings"] == "savings"
        assert stored["Cat guilt_free"] == "guilt_free"


class TestCategoryApiRoundTrip:
    def test_create_with_csp_fields(self, client: TestClient):
        resp = client.post(
            "/api/categories",
            json={
                "name": "401k",
                "exclude_from_budget": False,
                "csp_bucket": "investments",
                "is_pre_tax": True,
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["csp_bucket"] == "investments"
        assert body["is_pre_tax"] is True
        assert body["exclude_from_budget"] is False

    def test_create_defaults_when_omitted(self, client: TestClient):
        resp = client.post("/api/categories", json={"name": "Random Custom"})
        assert resp.status_code == 201
        body = resp.json()
        assert body["csp_bucket"] is None
        assert body["is_pre_tax"] is False

    def test_patch_csp_fields(self, client: TestClient, db: Session):
        cat = Category(name="To Update", is_system=False)
        db.add(cat)
        db.commit()
        db.refresh(cat)

        resp = client.patch(
            f"/api/categories/{cat.id}",
            json={"csp_bucket": "fixed", "is_pre_tax": True},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["csp_bucket"] == "fixed"
        assert body["is_pre_tax"] is True

        # Then clear the bucket explicitly.
        resp = client.patch(
            f"/api/categories/{cat.id}",
            json={"csp_bucket": None},
        )
        assert resp.status_code == 200
        assert resp.json()["csp_bucket"] is None
        # is_pre_tax is unchanged when not in payload.
        assert resp.json()["is_pre_tax"] is True

    def test_list_returns_new_fields(self, client: TestClient, db: Session):
        cat = Category(
            name="Listed",
            is_system=True,
            csp_bucket="guilt_free",
            is_pre_tax=False,
        )
        db.add(cat)
        db.commit()

        resp = client.get("/api/categories")
        assert resp.status_code == 200
        rows = resp.json()
        listed = next(r for r in rows if r["name"] == "Listed")
        assert listed["csp_bucket"] == "guilt_free"
        assert listed["is_pre_tax"] is False

    def test_invalid_bucket_value_rejected(self, client: TestClient):
        resp = client.post(
            "/api/categories",
            json={"name": "Bad Bucket", "csp_bucket": "not_a_real_bucket"},
        )
        assert resp.status_code == 422
