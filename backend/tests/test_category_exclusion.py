"""Tests for the Category.exclude_from_budget filter at every spending-analysis surface.

Mirrors the existing transfer-exclusion tests: when a category has
exclude_from_budget=True, transactions in that category should disappear from
budget actuals, historical analysis, stats, forecasts, and subscription
detection — same set of surfaces that already filter is_transfer.
"""

from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Category, Transaction
from app.services.budget_service import (
    get_actual_vs_budget,
    get_historical_analysis,
    set_budget,
)
from app.services.subscription_service import detect_subscriptions


def _make_txn(
    db: Session,
    *,
    amount: float,
    category_id: int | None = None,
    txn_date: date = date(2025, 6, 15),
    vendor: str = "Test Vendor",
    is_transfer: bool = False,
    import_hash: str | None = None,
) -> Transaction:
    from tests.conftest import get_or_create_account

    if import_hash is None:
        import_hash = f"{vendor}_{amount}_{txn_date}_{category_id}"
    account = get_or_create_account(db, "Chase CC", type="credit_card", institution="Chase")
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


def _add_excluded_category(db: Session, name: str = "Mortgage Payoff") -> int:
    cat = Category(name=name, is_system=False, exclude_from_budget=True)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat.id


class TestExcludeFromBudgetAtEverySurface:
    def test_excluded_from_actual_vs_budget(self, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        excluded_id = _add_excluded_category(db)

        set_budget(db, category_id=gid, year=2026, monthly_amount=500.0)

        _make_txn(db, amount=-300, category_id=gid, txn_date=date(2026, 1, 10))
        _make_txn(db, amount=-1500, category_id=excluded_id, txn_date=date(2026, 1, 12))

        result = get_actual_vs_budget(db, year=2026)
        jan = next(e for e in result.entries if e.month == 1 and e.category_id == gid)
        # Excluded-category transaction does not appear in any category's actuals,
        # and the Groceries actual is unaffected.
        assert jan.actual_spend == 300.0

    def test_excluded_from_historical_analysis(self, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        excluded_id = _add_excluded_category(db)

        _make_txn(db, amount=-300, category_id=gid, txn_date=date(2025, 1, 10))
        _make_txn(db, amount=-300, category_id=gid, txn_date=date(2025, 2, 10))
        _make_txn(db, amount=-1500, category_id=excluded_id, txn_date=date(2025, 1, 11))

        results = get_historical_analysis(db)
        names = [r.category_name for r in results]
        assert "Mortgage Payoff" not in names
        groceries = next(r for r in results if r.category_name == "Groceries")
        assert groceries.monthly_average == 300.0

    def test_excluded_from_stats_summary(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        excluded_id = _add_excluded_category(db)

        _make_txn(db, amount=-100, category_id=gid)
        _make_txn(db, amount=-200, category_id=gid)
        _make_txn(db, amount=-5000, category_id=excluded_id)

        resp = client.get("/api/stats/summary")
        assert resp.status_code == 200
        data = resp.json()
        # 5000 mortgage-payoff outflow must not inflate spending.
        assert data["total_spending"] == 300.0
        category_names = [c["category_name"] for c in data["top_categories"]]
        assert "Mortgage Payoff" not in category_names

    def test_excluded_from_monthly_stats(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        excluded_id = _add_excluded_category(db)

        _make_txn(db, amount=-100, category_id=gid, txn_date=date(2025, 3, 1))
        _make_txn(db, amount=-2000, category_id=excluded_id, txn_date=date(2025, 3, 2))

        resp = client.get("/api/stats/monthly", params={"year": 2025})
        data = resp.json()
        march = [m for m in data["months"] if m["month"] == 3]
        assert all(m["category_name"] != "Mortgage Payoff" for m in march)

    def test_excluded_from_forecast_yoy(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        excluded_id = _add_excluded_category(db)

        _make_txn(db, amount=-300, category_id=gid, txn_date=date(2025, 6, 1))
        _make_txn(db, amount=-9000, category_id=excluded_id, txn_date=date(2025, 6, 2))

        resp = client.get("/api/forecast/yoy")
        assert resp.status_code == 200
        rows = resp.json()
        assert all(r["category_name"] != "Mortgage Payoff" for r in rows)

    def test_excluded_from_forecast_projection(
        self, client: TestClient, db: Session, seed_categories
    ):
        gid = seed_categories["Groceries"]
        excluded_id = _add_excluded_category(db)

        # Five months of recurring grocery spend.
        for m in range(1, 6):
            _make_txn(
                db,
                amount=-300,
                category_id=gid,
                txn_date=date(2025, m, 5),
                vendor="Grocer",
                import_hash=f"g_{m}",
            )
        _make_txn(
            db,
            amount=-50000,
            category_id=excluded_id,
            txn_date=date(2025, 5, 1),
            vendor="Mortgage Co",
            import_hash="mp_1",
        )

        resp = client.get("/api/forecast/2025?method=simple")
        assert resp.status_code == 200
        data = resp.json()
        # No month's line items should reference the excluded category.
        for month in data["months"]:
            for item in month.get("line_items", []):
                assert item["category_name"] != "Mortgage Payoff"

    def test_excluded_subs_skipped_in_forecast_projection(
        self, client: TestClient, db: Session, seed_categories
    ):
        from app.models import Subscription

        gid = seed_categories["Groceries"]
        excluded_id = _add_excluded_category(db)

        # Some grocery history so the projection has something to anchor.
        for m in range(1, 6):
            _make_txn(
                db,
                amount=-300,
                category_id=gid,
                txn_date=date(2025, m, 5),
                vendor="Grocer",
                import_hash=f"sf_g_{m}",
            )

        # Stale active sub on an excluded category — leftover from before
        # the exclusion was enforced. Must not feed into projections.
        db.add(
            Subscription(
                vendor="Big Transfer",
                frequency="monthly",
                subscription_type="fixed",
                amount=50000.0,
                annual_estimate=600000.0,
                last_charge_date=date(2025, 5, 1),
                category_id=excluded_id,
                is_active=True,
            )
        )
        db.commit()

        resp = client.get("/api/forecast/2025?method=simple")
        assert resp.status_code == 200
        data = resp.json()
        for month in data["months"]:
            for item in month.get("line_items", []):
                assert item["category_id"] != excluded_id, (
                    f"excluded sub leaked into forecast month {month['month']}"
                )

    def test_excluded_from_subscription_detection(self, db: Session, seed_categories):
        from app.models import Subscription

        excluded_id = _add_excluded_category(db)

        # 4 evenly-spaced monthly same-amount charges in the excluded category —
        # would normally trip the subscription detector. Must be skipped.
        for i, month in enumerate([1, 2, 3, 4]):
            _make_txn(
                db,
                amount=-1500,
                category_id=excluded_id,
                vendor="Mortgage Co",
                txn_date=date(2025, month, 1),
                import_hash=f"sub_{i}",
            )

        detect_subscriptions(db)
        subs = db.query(Subscription).filter(Subscription.vendor == "Mortgage Co").all()
        assert subs == []

    def test_uncategorized_unaffected_by_exclusion(
        self, client: TestClient, db: Session, seed_categories
    ):
        # Adding an excluded category must not shadow uncategorized transactions
        # (category_id IS NULL) — they should still flow through stats/budget.
        _add_excluded_category(db)
        _make_txn(db, amount=-100, category_id=None)

        resp = client.get("/api/stats/summary")
        data = resp.json()
        assert data["total_spending"] == 100.0
