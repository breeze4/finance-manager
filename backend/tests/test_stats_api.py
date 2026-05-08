from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Budget, Category, Transaction
from app.models.category import CspBucket


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
    }
    # Resolve account string -> account_id (fixtures may already exist)
    account_name = overrides.pop("account", None) or "Chase CC"
    account = get_or_create_account(db, account_name, type="credit_card", institution="Chase")
    defaults["account_id"] = account.id
    defaults.update(overrides)
    if defaults["import_hash"] is None:
        defaults["import_hash"] = f"hash_{id(defaults)}_{defaults['amount']}"
    txn = Transaction(**defaults)
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


class TestSummaryTransferExclusion:
    """Stats must exclude transactions where is_transfer=true."""

    def test_transfers_excluded_from_spending(
        self, client: TestClient, db: Session, seed_categories
    ):
        gid = seed_categories["Groceries"]
        # Regular spending
        _make_txn(db, amount=-100.0, category_id=gid, import_hash="te1")
        _make_txn(db, amount=-200.0, category_id=gid, import_hash="te2")
        # Transfer — should be excluded
        _make_txn(
            db,
            amount=-500.0,
            is_transfer=True,
            category_id=seed_categories["Transfers"],
            import_hash="te3",
        )

        resp = client.get("/api/stats/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_spending"] == 300.0  # Not 800

    def test_transfers_excluded_from_income(self, client: TestClient, db: Session, seed_categories):
        # Regular income
        _make_txn(
            db,
            amount=3000.0,
            category_id=seed_categories["Income"],
            import_hash="ti1",
        )
        # Transfer credit (CC payment) — should be excluded
        _make_txn(
            db,
            amount=500.0,
            is_transfer=True,
            category_id=seed_categories["Transfers"],
            import_hash="ti2",
        )

        resp = client.get("/api/stats/summary")
        data = resp.json()
        assert data["total_income"] == 3000.0  # Not 3500

    def test_transfers_excluded_from_transaction_count(self, client: TestClient, db: Session):
        _make_txn(db, amount=-50.0, import_hash="tc1")
        _make_txn(db, amount=-50.0, import_hash="tc2")
        _make_txn(db, amount=-50.0, is_transfer=True, import_hash="tc3")

        resp = client.get("/api/stats/summary")
        data = resp.json()
        assert data["transaction_count"] == 2

    def test_transfers_excluded_from_monthly(
        self, client: TestClient, db: Session, seed_categories
    ):
        gid = seed_categories["Groceries"]
        _make_txn(db, amount=-100.0, date=date(2025, 3, 10), category_id=gid, import_hash="tm1")
        # Transfer in the same month — excluded
        _make_txn(
            db,
            amount=-500.0,
            date=date(2025, 3, 15),
            is_transfer=True,
            category_id=seed_categories["Transfers"],
            import_hash="tm2",
        )

        resp = client.get("/api/stats/monthly", params={"year": 2025})
        data = resp.json()
        assert data["year"] == 2025
        # Only the Groceries entry should appear
        march_entries = [m for m in data["months"] if m["month"] == 3]
        assert len(march_entries) == 1
        assert march_entries[0]["category_name"] == "Groceries"
        assert march_entries[0]["total"] == 100.0


class TestSummaryAccuracy:
    """Cross-check stats math."""

    def test_spending_sums_correctly(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        did = seed_categories["Dining"]
        amounts = [-45.67, -89.00, -120.50, -33.25]
        for i, amt in enumerate(amounts):
            cat = gid if i % 2 == 0 else did
            _make_txn(db, amount=amt, category_id=cat, import_hash=f"sa{i}")

        resp = client.get("/api/stats/summary")
        data = resp.json()
        expected = sum(abs(a) for a in amounts)
        assert abs(data["total_spending"] - expected) < 0.01

    def test_savings_rate_calculation(self, client: TestClient, db: Session, seed_categories):
        _make_txn(
            db,
            amount=5000.0,
            category_id=seed_categories["Income"],
            import_hash="sr1",
        )
        _make_txn(
            db,
            amount=-3000.0,
            category_id=seed_categories["Groceries"],
            import_hash="sr2",
        )

        resp = client.get("/api/stats/summary")
        data = resp.json()
        assert data["total_income"] == 5000.0
        assert data["total_spending"] == 3000.0
        # savings_rate = (5000 - 3000) / 5000 = 0.4
        assert abs(data["savings_rate"] - 0.4) < 0.001

    def test_top_categories_sorted_by_spending(
        self, client: TestClient, db: Session, seed_categories
    ):
        _make_txn(
            db,
            amount=-500.0,
            category_id=seed_categories["Groceries"],
            import_hash="top1",
        )
        _make_txn(
            db,
            amount=-100.0,
            category_id=seed_categories["Dining"],
            import_hash="top2",
        )
        _make_txn(
            db,
            amount=-300.0,
            category_id=seed_categories["Entertainment"],
            import_hash="top3",
        )

        resp = client.get("/api/stats/summary")
        cats = resp.json()["top_categories"]
        assert len(cats) == 3
        # Sorted by spending descending
        assert cats[0]["category_name"] == "Groceries"
        assert cats[0]["total"] == 500.0
        assert cats[1]["category_name"] == "Entertainment"
        assert cats[2]["category_name"] == "Dining"

    def test_top_categories_percentages(self, client: TestClient, db: Session, seed_categories):
        _make_txn(
            db,
            amount=-750.0,
            category_id=seed_categories["Groceries"],
            import_hash="pct1",
        )
        _make_txn(
            db,
            amount=-250.0,
            category_id=seed_categories["Dining"],
            import_hash="pct2",
        )

        resp = client.get("/api/stats/summary")
        cats = resp.json()["top_categories"]
        # Groceries = 75%, Dining = 25%
        assert cats[0]["percentage"] == 75.0
        assert cats[1]["percentage"] == 25.0

    def test_date_range_filter(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        _make_txn(db, amount=-100.0, date=date(2025, 1, 15), category_id=gid, import_hash="dr1")
        _make_txn(db, amount=-200.0, date=date(2025, 6, 15), category_id=gid, import_hash="dr2")
        _make_txn(db, amount=-300.0, date=date(2025, 12, 1), category_id=gid, import_hash="dr3")

        resp = client.get(
            "/api/stats/summary",
            params={"date_from": "2025-03-01", "date_to": "2025-09-01"},
        )
        data = resp.json()
        assert data["total_spending"] == 200.0

    def test_no_income_savings_rate_zero(self, client: TestClient, db: Session, seed_categories):
        _make_txn(
            db,
            amount=-100.0,
            category_id=seed_categories["Groceries"],
            import_hash="noi1",
        )
        resp = client.get("/api/stats/summary")
        assert resp.json()["savings_rate"] == 0.0


class TestMonthlyStatsAccuracy:
    def test_monthly_breakdown(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        did = seed_categories["Dining"]

        _make_txn(db, amount=-100.0, date=date(2025, 1, 10), category_id=gid, import_hash="mb1")
        _make_txn(db, amount=-50.0, date=date(2025, 1, 20), category_id=gid, import_hash="mb2")
        _make_txn(db, amount=-80.0, date=date(2025, 1, 15), category_id=did, import_hash="mb3")
        _make_txn(db, amount=-200.0, date=date(2025, 3, 10), category_id=gid, import_hash="mb4")

        resp = client.get("/api/stats/monthly", params={"year": 2025})
        data = resp.json()
        months = data["months"]

        # January should have Groceries (150) and Dining (80)
        jan_grocery = next(
            m for m in months if m["month"] == 1 and m["category_name"] == "Groceries"
        )
        assert jan_grocery["total"] == 150.0

        jan_dining = next(m for m in months if m["month"] == 1 and m["category_name"] == "Dining")
        assert jan_dining["total"] == 80.0

        # March should have Groceries (200)
        mar_grocery = next(
            m for m in months if m["month"] == 3 and m["category_name"] == "Groceries"
        )
        assert mar_grocery["total"] == 200.0

    def test_monthly_category_filter(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        did = seed_categories["Dining"]

        _make_txn(db, amount=-100.0, date=date(2025, 1, 10), category_id=gid, import_hash="mcf1")
        _make_txn(db, amount=-80.0, date=date(2025, 1, 15), category_id=did, import_hash="mcf2")

        resp = client.get("/api/stats/monthly", params={"year": 2025, "category_id": gid})
        months = resp.json()["months"]
        assert len(months) == 1
        assert months[0]["category_name"] == "Groceries"
        assert months[0]["total"] == 100.0

    def test_monthly_wrong_year_empty(self, client: TestClient, db: Session, seed_categories):
        gid = seed_categories["Groceries"]
        _make_txn(db, amount=-100.0, date=date(2025, 1, 10), category_id=gid, import_hash="wy1")

        resp = client.get("/api/stats/monthly", params={"year": 2024})
        assert resp.json()["months"] == []


# ---------------------------------------------------------------------------
# Monthly pace endpoint (Step 1 — Overview redesign)
# ---------------------------------------------------------------------------


def _seed_pace_categories(db: Session) -> dict[str, int]:
    """Seed categories with CSP buckets (the conftest seed_categories
    fixture leaves csp_bucket NULL, which doesn't work for pace tests)."""
    rows = [
        ("Bills & Utilities", CspBucket.FIXED.value, False),
        ("Groceries", CspBucket.FIXED.value, False),
        ("Investments", CspBucket.INVESTMENTS.value, False),
        ("Dining", CspBucket.GUILT_FREE.value, False),
        ("Travel", CspBucket.GUILT_FREE.value, False),
        ("401k", CspBucket.INVESTMENTS.value, True),  # pre-tax
        ("Income", None, False),
        ("Transfers", None, False),
        ("Uncategorized", None, False),
    ]
    out: dict[str, int] = {}
    for name, bucket, pre_tax in rows:
        cat = Category(
            name=name,
            is_system=True,
            csp_bucket=bucket,
            is_pre_tax=pre_tax,
        )
        db.add(cat)
    db.commit()
    for cat in db.query(Category).all():
        out[cat.name] = cat.id
    return out


def _set_budget(db: Session, *, category_id: int, year: int, monthly: float):
    b = Budget(category_id=category_id, year=year, monthly_amount=monthly)
    db.add(b)
    db.commit()


class TestMonthlyPaceEndpoint:
    """Step 1 — pace mode for the in-progress current month only.

    The endpoint validates ``date_from = first-of-current-month`` and
    ``date_to >= today`` against wall-clock today, so these tests use
    ``date.today()`` directly rather than a fixture-controlled date.
    """

    def _today_range(self) -> tuple[str, str]:
        today = date.today()
        first = date(today.year, today.month, 1)
        return first.isoformat(), today.isoformat()

    def test_returns_200_with_pace_mode(self, client: TestClient, db: Session):
        _seed_pace_categories(db)
        date_from, date_to = self._today_range()
        resp = client.get(
            "/api/stats/monthly-pace",
            params={"date_from": date_from, "date_to": date_to},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["mode"] == "pace"
        assert body["date_from"] == date_from
        assert body["date_to"] == date_to

    def test_four_buckets_in_canonical_order(self, client: TestClient, db: Session):
        _seed_pace_categories(db)
        date_from, date_to = self._today_range()
        resp = client.get(
            "/api/stats/monthly-pace",
            params={"date_from": date_from, "date_to": date_to},
        )
        body = resp.json()
        assert [b["bucket"] for b in body["buckets"]] == [
            "fixed",
            "investments",
            "savings",
            "guilt_free",
        ]

    def test_non_pace_range_returns_actual_vs_budget_mode(self, client: TestClient, db: Session):
        """date_from != first-of-current-month → 200 with AvB mode."""
        _seed_pace_categories(db)
        today = date.today()
        # Pick a date_from within the prior month so the range is valid
        # (date_to >= date_from) but date_from is not first-of-current-month.
        first_of_month = date(today.year, today.month, 1)
        prior_first = (
            date(today.year, today.month - 1, 1) if today.month > 1 else date(today.year - 1, 12, 1)
        )
        # Use a clearly non-first-of-current-month date for date_from.
        _ = first_of_month
        resp = client.get(
            "/api/stats/monthly-pace",
            params={
                "date_from": prior_first.isoformat(),
                "date_to": today.isoformat(),
            },
        )
        assert resp.status_code == 200
        assert resp.json()["mode"] == "actual_vs_budget"

    def test_completed_last_month_returns_actual_vs_budget(self, client: TestClient, db: Session):
        """A range entirely before today → AvB mode."""
        _seed_pace_categories(db)
        today = date.today()
        first = date(today.year, today.month, 1)
        # Last day of the prior month: day before first-of-month.
        prior_month_last_day = first - date.resolution
        prior_month_first = date(prior_month_last_day.year, prior_month_last_day.month, 1)
        resp = client.get(
            "/api/stats/monthly-pace",
            params={
                "date_from": prior_month_first.isoformat(),
                "date_to": prior_month_last_day.isoformat(),
            },
        )
        assert resp.status_code == 200
        assert resp.json()["mode"] == "actual_vs_budget"

    def test_400_on_inverted_range(self, client: TestClient, db: Session):
        """date_to < date_from is genuinely invalid → 400."""
        _seed_pace_categories(db)
        resp = client.get(
            "/api/stats/monthly-pace",
            params={"date_from": "2026-05-01", "date_to": "2026-04-30"},
        )
        assert resp.status_code == 400

    def test_transfer_excluded(self, client: TestClient, db: Session):
        cats = _seed_pace_categories(db)
        _set_budget(
            db,
            category_id=cats["Bills & Utilities"],
            year=date.today().year,
            monthly=310.0,
        )
        # Transfer in this month.
        today = date.today()
        _make_txn(
            db,
            amount=-500.0,
            date=date(today.year, today.month, 1),
            category_id=cats["Bills & Utilities"],
            is_transfer=True,
            import_hash="pace_txfer",
        )
        date_from, date_to = self._today_range()
        resp = client.get(
            "/api/stats/monthly-pace",
            params={"date_from": date_from, "date_to": date_to},
        )
        body = resp.json()
        bills = next(c for c in body["categories"] if c["category_id"] == cats["Bills & Utilities"])
        assert bills["actual_mtd"] == 0.0

    def test_pre_tax_excluded(self, client: TestClient, db: Session):
        cats = _seed_pace_categories(db)
        _set_budget(db, category_id=cats["401k"], year=date.today().year, monthly=2000.0)
        date_from, date_to = self._today_range()
        resp = client.get(
            "/api/stats/monthly-pace",
            params={"date_from": date_from, "date_to": date_to},
        )
        body = resp.json()
        # 401k must not appear in categories[] or contribute to bucket totals.
        assert all(c["category_id"] != cats["401k"] for c in body["categories"])
        inv = next(b for b in body["buckets"] if b["bucket"] == "investments")
        assert inv["budget"] == 0.0

    def test_uncategorized_synthetic_row(self, client: TestClient, db: Session):
        _seed_pace_categories(db)
        today = date.today()
        _make_txn(
            db,
            amount=-40.0,
            date=date(today.year, today.month, 1),
            category_id=None,
            import_hash="pace_uncat",
        )
        date_from, date_to = self._today_range()
        resp = client.get(
            "/api/stats/monthly-pace",
            params={"date_from": date_from, "date_to": date_to},
        )
        body = resp.json()
        uncat = next(c for c in body["categories"] if c["category_id"] is None)
        assert uncat["category_name"] == "Uncategorized"
        assert uncat["bucket"] is None
        assert uncat["full_budget"] == 0.0
        assert uncat["expected_mtd"] == 0.0
        assert uncat["actual_mtd"] == 40.0
        # Doesn't appear in any bucket's category list.
        for b in body["buckets"]:
            assert all(c["category_id"] is not None for c in b["categories"])

    def test_headline_variance_is_actual_minus_expected(self, client: TestClient, db: Session):
        _seed_pace_categories(db)
        date_from, date_to = self._today_range()
        resp = client.get(
            "/api/stats/monthly-pace",
            params={"date_from": date_from, "date_to": date_to},
        )
        body = resp.json()
        h = body["headline"]
        assert h["variance"] == round(h["actual_total"] - h["expected_total"], 2)


# ---------------------------------------------------------------------------
# Spending-trend endpoint (Step 3 — Overview redesign)
# ---------------------------------------------------------------------------


class TestSpendingTrendEndpoint:
    """Step 3 — actual-vs-expected per-month chart endpoint.

    Same wire contract as Step 5 will use; only the range changes.
    """

    def test_returns_200_with_correct_shape(self, client: TestClient, db: Session):
        _seed_pace_categories(db)
        resp = client.get(
            "/api/stats/spending-trend",
            params={"date_from": "2025-04-01", "date_to": "2025-06-30"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["date_from"] == "2025-04-01"
        assert body["date_to"] == "2025-06-30"
        assert isinstance(body["months"], list)

    def test_months_count_matches_calendar_overlap(self, client: TestClient, db: Session):
        _seed_pace_categories(db)
        # April → June = 3 calendar months.
        resp = client.get(
            "/api/stats/spending-trend",
            params={"date_from": "2025-04-15", "date_to": "2025-06-10"},
        )
        body = resp.json()
        assert [m["month"] for m in body["months"]] == ["2025-04", "2025-05", "2025-06"]

    def test_row_shape_has_required_keys(self, client: TestClient, db: Session):
        _seed_pace_categories(db)
        resp = client.get(
            "/api/stats/spending-trend",
            params={"date_from": "2025-06-01", "date_to": "2025-06-30"},
        )
        body = resp.json()
        assert len(body["months"]) == 1
        row = body["months"][0]
        assert set(row.keys()) == {"month", "actual", "expected"}
        assert row["month"] == "2025-06"

    def test_actual_and_expected_math(self, client: TestClient, db: Session):
        cats = _seed_pace_categories(db)
        _set_budget(db, category_id=cats["Groceries"], year=2025, monthly=500.0)
        # In-range outflow.
        _make_txn(
            db,
            amount=-120.0,
            date=date(2025, 6, 5),
            category_id=cats["Groceries"],
            import_hash="trend1",
        )
        # Out-of-range outflow (should NOT appear in actual).
        _make_txn(
            db,
            amount=-999.0,
            date=date(2025, 7, 1),
            category_id=cats["Groceries"],
            import_hash="trend2",
        )
        resp = client.get(
            "/api/stats/spending-trend",
            params={"date_from": "2025-06-01", "date_to": "2025-06-30"},
        )
        body = resp.json()
        row = body["months"][0]
        assert row["actual"] == 120.0
        assert row["expected"] == 500.0

    def test_one_year_range_yields_twelve_months(self, client: TestClient, db: Session):
        """A 1-year range (Jan 1 → Dec 31) → 12 month bars."""
        _seed_pace_categories(db)
        resp = client.get(
            "/api/stats/spending-trend",
            params={"date_from": "2025-01-01", "date_to": "2025-12-31"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["months"]) == 12
        assert body["months"][0]["month"] == "2025-01"
        assert body["months"][-1]["month"] == "2025-12"

    def test_three_month_range_yields_three_months(self, client: TestClient, db: Session):
        """3-month range → 3 month bars (calendar months overlapping)."""
        _seed_pace_categories(db)
        resp = client.get(
            "/api/stats/spending-trend",
            params={"date_from": "2025-04-01", "date_to": "2025-06-30"},
        )
        body = resp.json()
        assert [m["month"] for m in body["months"]] == [
            "2025-04",
            "2025-05",
            "2025-06",
        ]

    def test_last_30_days_spanning_month_boundary(self, client: TestClient, db: Session):
        """Last-30-days that crosses a month boundary → 1 or 2 month bars."""
        _seed_pace_categories(db)
        resp = client.get(
            "/api/stats/spending-trend",
            params={"date_from": "2025-05-15", "date_to": "2025-06-14"},
        )
        body = resp.json()
        assert [m["month"] for m in body["months"]] == ["2025-05", "2025-06"]

    def test_last_year_full_calendar_year(self, client: TestClient, db: Session):
        """Last-year preset (Jan 1 prior → Dec 31 prior) → 12 bars."""
        _seed_pace_categories(db)
        resp = client.get(
            "/api/stats/spending-trend",
            params={"date_from": "2024-01-01", "date_to": "2024-12-31"},
        )
        body = resp.json()
        assert len(body["months"]) == 12
        assert body["months"][0]["month"] == "2024-01"
        assert body["months"][-1]["month"] == "2024-12"

    def test_ytd_partial_year(self, client: TestClient, db: Session):
        """YTD-style range (Jan 1 → mid-year) → bars up to and including end month."""
        _seed_pace_categories(db)
        resp = client.get(
            "/api/stats/spending-trend",
            params={"date_from": "2025-01-01", "date_to": "2025-05-15"},
        )
        body = resp.json()
        assert [m["month"] for m in body["months"]] == [
            "2025-01",
            "2025-02",
            "2025-03",
            "2025-04",
            "2025-05",
        ]
