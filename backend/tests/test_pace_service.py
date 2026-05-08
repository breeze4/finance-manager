"""Unit tests for pace_service.compute_monthly_pace.

Covers the spec-acceptance list:
  - linear pace formula with no subs
  - subs already hit
  - subs not yet hit
  - day 1 of month (smallest pace_factor)
  - last day of month (pace_factor = 1)
  - leap-year February (Feb 29 2024)
  - end-of-month override
  - pre-tax exclusion
  - uncategorized handling (synthetic row, no bucket attribution)
  - monthly override taking precedence over baseline
  - transfer exclusion / exclude_from_budget exclusion
  - bucket totals match category totals
  - mode discriminator emitted as "pace"

Tests pass an explicit ``date_to`` (which doubles as "today" for the pace
formula), mirroring the structure of test_csp_rollup_service.py.
"""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.models import Budget, Category, Subscription, Transaction
from app.models.category import CspBucket
from app.services import budget_service, pace_service

# ---------------------------------------------------------------------------
# Helpers (mirror test_csp_rollup_service.py style)
# ---------------------------------------------------------------------------


def _seed_csp_categories(db: Session) -> dict[str, Category]:
    rows = [
        ("Bills & Utilities", CspBucket.FIXED.value, False),
        ("Groceries", CspBucket.FIXED.value, False),
        ("Investments", CspBucket.INVESTMENTS.value, False),
        ("Gifts & Donations", CspBucket.SAVINGS.value, False),
        ("Dining", CspBucket.GUILT_FREE.value, False),
        ("Entertainment", CspBucket.GUILT_FREE.value, False),
        ("Travel", CspBucket.GUILT_FREE.value, False),
        # Pre-tax — must be skipped entirely
        ("401k", CspBucket.INVESTMENTS.value, True),
        # Intentionally NULL bucket
        ("Income", None, False),
        ("Transfers", None, False),
        ("Uncategorized", None, False),
    ]
    out: dict[str, Category] = {}
    for name, bucket, pre_tax in rows:
        cat = Category(
            name=name,
            is_system=True,
            csp_bucket=bucket,
            is_pre_tax=pre_tax,
        )
        db.add(cat)
        out[name] = cat
    db.commit()
    for cat in out.values():
        db.refresh(cat)
    return out


def _set_budget(db: Session, *, category_id: int, year: int, monthly: float) -> Budget:
    b = Budget(category_id=category_id, year=year, monthly_amount=monthly)
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


def _make_txn(
    db: Session,
    *,
    vendor: str,
    amount: float,
    txn_date: date,
    category_id: int | None,
    import_hash: str,
    is_transfer: bool = False,
) -> Transaction:
    from tests.conftest import get_or_create_account

    account = get_or_create_account(db, "Test")
    txn = Transaction(
        source_file="test.csv",
        account_id=account.id,
        date=txn_date,
        raw_description=vendor,
        vendor=vendor,
        amount=amount,
        category_id=category_id,
        import_hash=import_hash,
        is_transfer=is_transfer,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


def _make_sub(
    db: Session,
    *,
    vendor: str,
    frequency: str,
    last_charge_date: date,
    amount: float,
    category_id: int,
    annual_estimate: float = 120.0,
) -> Subscription:
    sub = Subscription(
        vendor=vendor,
        frequency=frequency,
        subscription_type="fixed",
        amount=amount,
        annual_estimate=annual_estimate,
        last_charge_date=last_charge_date,
        category_id=category_id,
        is_active=True,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


# ---------------------------------------------------------------------------
# Mode + range validation
# ---------------------------------------------------------------------------


_TODAY = date(2026, 5, 8)
"""Frozen "today" anchor used by every test in this file. Passing it
explicitly via the ``today=`` kwarg sidesteps wall-clock dependency."""


def _pace(db: Session, date_from: date, date_to: date, *, today: date = _TODAY):
    """Test helper — computes pace_service.compute_monthly_pace with the
    file's frozen today anchor (or an override)."""
    return pace_service.compute_monthly_pace(db, date_from, date_to, today=today)


def test_mode_is_pace(db: Session):
    _seed_csp_categories(db)
    result = _pace(db, date(2026, 5, 1), date(2026, 5, 8))
    assert result.mode == "pace"


def test_mode_is_pace_when_date_to_after_today(db: Session):
    """date_to >= today (future end date) still resolves to pace mode."""
    _seed_csp_categories(db)
    result = _pace(db, date(2026, 5, 1), date(2026, 5, 31))
    assert result.mode == "pace"


def test_buckets_in_canonical_order(db: Session):
    _seed_csp_categories(db)
    result = _pace(db, date(2026, 5, 1), date(2026, 5, 8))
    assert [b.bucket for b in result.buckets] == [
        "fixed",
        "investments",
        "savings",
        "guilt_free",
    ]


def test_non_pace_range_returns_actual_vs_budget(db: Session):
    """A range whose date_from != first-of-current-month is AvB mode."""
    _seed_csp_categories(db)
    result = _pace(db, date(2026, 4, 15), date(2026, 5, 8))
    assert result.mode == "actual_vs_budget"


def test_completed_last_month_is_actual_vs_budget(db: Session):
    """Last calendar month, fully completed, lands in AvB mode."""
    _seed_csp_categories(db)
    result = _pace(db, date(2026, 4, 1), date(2026, 4, 30))
    assert result.mode == "actual_vs_budget"


def test_in_month_subwindow_with_date_to_before_today_is_avb(db: Session):
    """[May 1, May 4] when today is May 8 → completed sub-window → AvB."""
    _seed_csp_categories(db)
    result = _pace(db, date(2026, 5, 1), date(2026, 5, 4))
    assert result.mode == "actual_vs_budget"


def test_invalid_date_to_before_from_raises(db: Session):
    _seed_csp_categories(db)
    with pytest.raises(ValueError):
        _pace(db, date(2026, 5, 1), date(2026, 4, 30))


# ---------------------------------------------------------------------------
# Linear pace formula (no subs)
# ---------------------------------------------------------------------------


def test_linear_pace_no_subs(db: Session):
    """day 8 of 31 → pace_factor = 8/31; budget $310; expected = $80."""
    cats = _seed_csp_categories(db)
    _set_budget(db, category_id=cats["Bills & Utilities"].id, year=2026, monthly=310.0)
    result = _pace(db, date(2026, 5, 1), date(2026, 5, 8))
    by_id = {c.category_id: c for c in result.categories}
    bills = by_id[cats["Bills & Utilities"].id]
    assert bills.full_budget == Decimal("310.00")
    # 310 * 8/31 = 80.00
    assert bills.expected_mtd == Decimal("80.00")
    assert bills.actual_mtd == Decimal("0.00")


def test_pace_factor_day_one(db: Session):
    """Day 1 of 31 → pace_factor = 1/31; budget $310 → expected ≈ $10.00."""
    cats = _seed_csp_categories(db)
    _set_budget(db, category_id=cats["Bills & Utilities"].id, year=2026, monthly=310.0)
    # today = 2026-05-01 so we're in pace mode on day one of the month.
    result = _pace(db, date(2026, 5, 1), date(2026, 5, 1), today=date(2026, 5, 1))
    by_id = {c.category_id: c for c in result.categories}
    bills = by_id[cats["Bills & Utilities"].id]
    assert bills.expected_mtd == Decimal("10.00")


def test_pace_factor_last_day_of_month(db: Session):
    """Day 31 of 31 → pace_factor = 1; expected = full budget."""
    cats = _seed_csp_categories(db)
    _set_budget(db, category_id=cats["Bills & Utilities"].id, year=2026, monthly=310.0)
    # date_to = today = May 31 → pace mode on the last day.
    result = _pace(db, date(2026, 5, 1), date(2026, 5, 31), today=date(2026, 5, 31))
    by_id = {c.category_id: c for c in result.categories}
    bills = by_id[cats["Bills & Utilities"].id]
    assert bills.expected_mtd == Decimal("310.00")


def test_leap_year_february_29(db: Session):
    """Feb 29 2024 (leap) — day 29 of 29; pace_factor = 1."""
    cats = _seed_csp_categories(db)
    _set_budget(db, category_id=cats["Bills & Utilities"].id, year=2024, monthly=290.0)
    result = _pace(db, date(2024, 2, 1), date(2024, 2, 29), today=date(2024, 2, 29))
    by_id = {c.category_id: c for c in result.categories}
    bills = by_id[cats["Bills & Utilities"].id]
    assert bills.expected_mtd == Decimal("290.00")


# ---------------------------------------------------------------------------
# Subscription holdout
# ---------------------------------------------------------------------------


def test_sub_already_hit_pulled_into_expected(db: Session):
    """subs_already_hit is added in full to expected_mtd (the pace formula)."""
    cats = _seed_csp_categories(db)
    bills = cats["Bills & Utilities"]
    _set_budget(db, category_id=bills.id, year=2026, monthly=310.0)
    # Sub: $50/mo, last charge 2026-04-05 → expected 2026-05-05.
    _make_sub(
        db,
        vendor="ISP",
        frequency="monthly",
        last_charge_date=date(2026, 4, 5),
        amount=50.0,
        category_id=bills.id,
    )
    # Charge actually hit 2026-05-05.
    _make_txn(
        db,
        vendor="ISP",
        amount=-50.0,
        txn_date=date(2026, 5, 5),
        category_id=bills.id,
        import_hash="hit_isp",
    )
    result = _pace(db, date(2026, 5, 1), date(2026, 5, 8))
    by_id = {c.category_id: c for c in result.categories}
    row = by_id[bills.id]
    # discretionary = 310 - 50 = 260; pace_factor = 8/31; expected = 50 + 260*8/31
    # 260 * 8 / 31 = 67.0967... rounded to 67.10. Total = 117.10.
    expected_pace = Decimal("50") + Decimal("260") * Decimal(8) / Decimal(31)
    assert row.expected_mtd == expected_pace.quantize(Decimal("0.01"))
    assert row.actual_mtd == Decimal("50.00")


def test_sub_not_yet_hit_excluded_from_expected(db: Session):
    """subs_due but not yet matched contribute zero to expected_mtd."""
    cats = _seed_csp_categories(db)
    bills = cats["Bills & Utilities"]
    _set_budget(db, category_id=bills.id, year=2026, monthly=310.0)
    # Sub due in May but no transaction yet.
    _make_sub(
        db,
        vendor="ISP",
        frequency="monthly",
        last_charge_date=date(2026, 4, 5),
        amount=50.0,
        category_id=bills.id,
    )
    result = _pace(db, date(2026, 5, 1), date(2026, 5, 8))
    by_id = {c.category_id: c for c in result.categories}
    row = by_id[bills.id]
    # subs_already_hit = 0; discretionary = 310 - 50 = 260; expected = 0 + 260*8/31
    expected_pace = Decimal("260") * Decimal(8) / Decimal(31)
    assert row.expected_mtd == expected_pace.quantize(Decimal("0.01"))


# ---------------------------------------------------------------------------
# Pre-tax & uncategorized
# ---------------------------------------------------------------------------


def test_pre_tax_excluded_entirely(db: Session):
    """Pre-tax categories never appear in categories[] or any bucket totals."""
    cats = _seed_csp_categories(db)
    _set_budget(db, category_id=cats["401k"].id, year=2026, monthly=2000.0)
    result = _pace(db, date(2026, 5, 1), date(2026, 5, 8))
    assert all(c.category_id != cats["401k"].id for c in result.categories)
    inv = next(b for b in result.buckets if b.bucket == "investments")
    assert inv.budget == Decimal("0.00")
    assert inv.expected == Decimal("0.00")


def test_uncategorized_synthetic_row(db: Session):
    """Non-transfer txns with category_id=NULL produce a synthetic row."""
    _seed_csp_categories(db)
    # An uncategorized outflow of $40.
    _make_txn(
        db,
        vendor="Mystery",
        amount=-40.0,
        txn_date=date(2026, 5, 3),
        category_id=None,
        import_hash="uncat1",
    )
    result = _pace(db, date(2026, 5, 1), date(2026, 5, 8))
    uncat = next(c for c in result.categories if c.category_id is None)
    assert uncat.category_name == "Uncategorized"
    assert uncat.bucket is None
    assert uncat.full_budget == Decimal("0.00")
    assert uncat.expected_mtd == Decimal("0.00")
    assert uncat.actual_mtd == Decimal("40.00")
    # Doesn't appear in any bucket's category list.
    for b in result.buckets:
        assert all(c.category_id is not None for c in b.categories)


def test_uncategorized_pushes_headline_variance(db: Session):
    """Uncategorized counts toward actual but not expected, so variance > 0."""
    _seed_csp_categories(db)
    _make_txn(
        db,
        vendor="Mystery",
        amount=-40.0,
        txn_date=date(2026, 5, 3),
        category_id=None,
        import_hash="uncat2",
    )
    result = _pace(db, date(2026, 5, 1), date(2026, 5, 8))
    assert result.headline.actual_total == Decimal("40.00")
    assert result.headline.expected_total == Decimal("0.00")
    assert result.headline.variance == Decimal("40.00")


# ---------------------------------------------------------------------------
# Filter rules
# ---------------------------------------------------------------------------


def test_transfer_excluded(db: Session):
    cats = _seed_csp_categories(db)
    _set_budget(db, category_id=cats["Bills & Utilities"].id, year=2026, monthly=310.0)
    _make_txn(
        db,
        vendor="Transfer",
        amount=-500.0,
        txn_date=date(2026, 5, 3),
        category_id=cats["Bills & Utilities"].id,
        import_hash="txfer",
        is_transfer=True,
    )
    result = _pace(db, date(2026, 5, 1), date(2026, 5, 8))
    by_id = {c.category_id: c for c in result.categories}
    bills = by_id[cats["Bills & Utilities"].id]
    assert bills.actual_mtd == Decimal("0.00")


def test_exclude_from_budget_category_excluded(db: Session):
    cats = _seed_csp_categories(db)
    cats["Travel"].exclude_from_budget = True
    db.commit()
    _set_budget(db, category_id=cats["Travel"].id, year=2026, monthly=500.0)
    _make_txn(
        db,
        vendor="Hotel",
        amount=-200.0,
        txn_date=date(2026, 5, 3),
        category_id=cats["Travel"].id,
        import_hash="excl1",
    )
    result = _pace(db, date(2026, 5, 1), date(2026, 5, 8))
    assert all(c.category_id != cats["Travel"].id for c in result.categories)


# ---------------------------------------------------------------------------
# Override / baseline precedence
# ---------------------------------------------------------------------------


def test_monthly_override_takes_precedence(db: Session):
    """Per-month override beats baseline for that month's full_budget."""
    cats = _seed_csp_categories(db)
    bills = cats["Bills & Utilities"]
    _set_budget(db, category_id=bills.id, year=2026, monthly=300.0)
    budget_service.set_monthly_override(db, category_id=bills.id, year=2026, month=5, amount=620.0)
    result = _pace(db, date(2026, 5, 1), date(2026, 5, 31), today=date(2026, 5, 31))
    by_id = {c.category_id: c for c in result.categories}
    row = by_id[bills.id]
    assert row.full_budget == Decimal("620.00")
    assert row.expected_mtd == Decimal("620.00")  # last day of month


def test_end_of_month_override_for_february(db: Session):
    """Override on Feb 28 (non-leap year) — pace_factor=1, expected=override."""
    cats = _seed_csp_categories(db)
    bills = cats["Bills & Utilities"]
    _set_budget(db, category_id=bills.id, year=2026, monthly=200.0)
    budget_service.set_monthly_override(db, category_id=bills.id, year=2026, month=2, amount=400.0)
    result = _pace(db, date(2026, 2, 1), date(2026, 2, 28), today=date(2026, 2, 28))
    by_id = {c.category_id: c for c in result.categories}
    row = by_id[bills.id]
    assert row.full_budget == Decimal("400.00")
    assert row.expected_mtd == Decimal("400.00")


# ---------------------------------------------------------------------------
# Bucket rollup math
# ---------------------------------------------------------------------------


def test_bucket_totals_match_category_totals(db: Session):
    """bucket.actual = sum(cat.actual_mtd); same for expected/budget."""
    cats = _seed_csp_categories(db)
    _set_budget(db, category_id=cats["Bills & Utilities"].id, year=2026, monthly=310.0)
    _set_budget(db, category_id=cats["Groceries"].id, year=2026, monthly=620.0)
    _make_txn(
        db,
        vendor="Power",
        amount=-100.0,
        txn_date=date(2026, 5, 3),
        category_id=cats["Bills & Utilities"].id,
        import_hash="bx1",
    )
    _make_txn(
        db,
        vendor="Store",
        amount=-200.0,
        txn_date=date(2026, 5, 4),
        category_id=cats["Groceries"].id,
        import_hash="bx2",
    )
    result = _pace(db, date(2026, 5, 1), date(2026, 5, 8))
    fixed = next(b for b in result.buckets if b.bucket == "fixed")
    cat_actual_sum = sum((c.actual_mtd for c in fixed.categories), Decimal("0"))
    cat_expected_sum = sum((c.expected_mtd for c in fixed.categories), Decimal("0"))
    cat_budget_sum = sum((c.full_budget for c in fixed.categories), Decimal("0"))
    assert fixed.actual == cat_actual_sum
    assert fixed.expected == cat_expected_sum
    assert fixed.budget == cat_budget_sum
    assert fixed.budget == Decimal("930.00")


def test_headline_excludes_pre_tax(db: Session):
    """Pre-tax has budget but never contributes to headline (it's not in
    categories[] at all, so the sums skip it)."""
    cats = _seed_csp_categories(db)
    _set_budget(db, category_id=cats["401k"].id, year=2026, monthly=2000.0)
    _set_budget(db, category_id=cats["Dining"].id, year=2026, monthly=310.0)
    result = _pace(db, date(2026, 5, 1), date(2026, 5, 8))
    # Only Dining contributes — 310 * 8/31 = 80.
    assert result.headline.expected_total == Decimal("80.00")


# ---------------------------------------------------------------------------
# Actual-vs-budget mode (Step 5)
# ---------------------------------------------------------------------------


def test_avb_three_month_range_sums_actuals_and_budgets(db: Session):
    """3-month range — actual = Σ in-range txns; expected = 3 × monthly budget."""
    cats = _seed_csp_categories(db)
    bills = cats["Bills & Utilities"]
    _set_budget(db, category_id=bills.id, year=2026, monthly=300.0)

    # One transaction per month inside the range.
    for d, amt, h in [
        (date(2026, 2, 10), -100.0, "feb"),
        (date(2026, 3, 12), -150.0, "mar"),
        (date(2026, 4, 8), -75.0, "apr"),
    ]:
        _make_txn(
            db,
            vendor="Power",
            amount=amt,
            txn_date=d,
            category_id=bills.id,
            import_hash=h,
        )

    # Range Feb 1 → Apr 30 spans 3 calendar months.
    result = _pace(db, date(2026, 2, 1), date(2026, 4, 30))
    assert result.mode == "actual_vs_budget"

    by_id = {c.category_id: c for c in result.categories}
    row = by_id[bills.id]
    # actual = 100 + 150 + 75 = 325
    assert row.actual_mtd == Decimal("325.00")
    # range_budget = 3 * 300 = 900
    assert row.expected_mtd == Decimal("900.00")
    assert row.full_budget == Decimal("900.00")


def test_avb_completed_last_month(db: Session):
    """Completed last month — actual = month's txns; expected = monthly budget."""
    cats = _seed_csp_categories(db)
    dining = cats["Dining"]
    _set_budget(db, category_id=dining.id, year=2026, monthly=400.0)
    _make_txn(
        db,
        vendor="Cafe",
        amount=-120.0,
        txn_date=date(2026, 4, 15),
        category_id=dining.id,
        import_hash="apr_dining",
    )
    # Range Apr 1 → Apr 30 with today still 2026-05-08 → completed → AvB.
    result = _pace(db, date(2026, 4, 1), date(2026, 4, 30))
    assert result.mode == "actual_vs_budget"
    by_id = {c.category_id: c for c in result.categories}
    row = by_id[dining.id]
    assert row.actual_mtd == Decimal("120.00")
    assert row.expected_mtd == Decimal("400.00")
    assert row.full_budget == Decimal("400.00")


def test_avb_range_crossing_year_boundary(db: Session):
    """Dec 2024 → Feb 2025 — sums monthly budgets across two budget years."""
    cats = _seed_csp_categories(db)
    bills = cats["Bills & Utilities"]
    # Different baselines per year exercise the (cat, year) lookup.
    _set_budget(db, category_id=bills.id, year=2024, monthly=200.0)
    _set_budget(db, category_id=bills.id, year=2025, monthly=300.0)
    result = _pace(db, date(2024, 12, 1), date(2025, 2, 28))
    assert result.mode == "actual_vs_budget"
    by_id = {c.category_id: c for c in result.categories}
    row = by_id[bills.id]
    # range_budget = 200 (Dec 2024) + 300 (Jan 2025) + 300 (Feb 2025) = 800
    assert row.expected_mtd == Decimal("800.00")
    assert row.full_budget == Decimal("800.00")


def test_avb_override_in_middle_month_only(db: Session):
    """An override on month 2 of 3 wins for that month only."""
    cats = _seed_csp_categories(db)
    bills = cats["Bills & Utilities"]
    _set_budget(db, category_id=bills.id, year=2026, monthly=300.0)
    budget_service.set_monthly_override(db, category_id=bills.id, year=2026, month=3, amount=500.0)
    # Range Feb 1 → Apr 30; override only applies to March.
    result = _pace(db, date(2026, 2, 1), date(2026, 4, 30))
    by_id = {c.category_id: c for c in result.categories}
    row = by_id[bills.id]
    # range_budget = 300 (Feb) + 500 (Mar override) + 300 (Apr) = 1100
    assert row.expected_mtd == Decimal("1100.00")
    assert row.full_budget == Decimal("1100.00")


def test_avb_pre_tax_excluded(db: Session):
    """Pre-tax categories must not appear in AvB-mode rows either."""
    cats = _seed_csp_categories(db)
    _set_budget(db, category_id=cats["401k"].id, year=2026, monthly=2000.0)
    result = _pace(db, date(2026, 4, 1), date(2026, 4, 30))
    assert all(c.category_id != cats["401k"].id for c in result.categories)
    inv = next(b for b in result.buckets if b.bucket == "investments")
    assert inv.budget == Decimal("0.00")


def test_avb_uncategorized_synthetic_row(db: Session):
    """Uncategorized still surfaces in AvB mode with expected = 0."""
    _seed_csp_categories(db)
    _make_txn(
        db,
        vendor="Mystery",
        amount=-90.0,
        txn_date=date(2026, 4, 10),
        category_id=None,
        import_hash="avb_uncat",
    )
    result = _pace(db, date(2026, 4, 1), date(2026, 4, 30))
    uncat = next(c for c in result.categories if c.category_id is None)
    assert uncat.category_name == "Uncategorized"
    assert uncat.expected_mtd == Decimal("0.00")
    assert uncat.full_budget == Decimal("0.00")
    assert uncat.actual_mtd == Decimal("90.00")
    # Doesn't appear in any bucket's category list.
    for b in result.buckets:
        assert all(c.category_id is not None for c in b.categories)


def test_avb_transfers_excluded(db: Session):
    """Transfers stay excluded in AvB mode."""
    cats = _seed_csp_categories(db)
    bills = cats["Bills & Utilities"]
    _set_budget(db, category_id=bills.id, year=2026, monthly=300.0)
    _make_txn(
        db,
        vendor="Transfer",
        amount=-500.0,
        txn_date=date(2026, 4, 5),
        category_id=bills.id,
        import_hash="avb_txfer",
        is_transfer=True,
    )
    result = _pace(db, date(2026, 4, 1), date(2026, 4, 30))
    by_id = {c.category_id: c for c in result.categories}
    row = by_id[bills.id]
    assert row.actual_mtd == Decimal("0.00")


def test_avb_headline_variance_actual_minus_expected(db: Session):
    """Headline variance = sum(actual) − sum(expected) across rows."""
    cats = _seed_csp_categories(db)
    dining = cats["Dining"]
    bills = cats["Bills & Utilities"]
    _set_budget(db, category_id=dining.id, year=2026, monthly=400.0)
    _set_budget(db, category_id=bills.id, year=2026, monthly=300.0)
    _make_txn(
        db,
        vendor="Cafe",
        amount=-450.0,  # over dining budget
        txn_date=date(2026, 4, 10),
        category_id=dining.id,
        import_hash="avb_hl1",
    )
    _make_txn(
        db,
        vendor="Power",
        amount=-200.0,  # under bills budget
        txn_date=date(2026, 4, 15),
        category_id=bills.id,
        import_hash="avb_hl2",
    )
    result = _pace(db, date(2026, 4, 1), date(2026, 4, 30))
    # actual_total = 450 + 200 = 650; expected_total = 400 + 300 = 700
    # variance = -50 (under budget).
    assert result.headline.actual_total == Decimal("650.00")
    assert result.headline.expected_total == Decimal("700.00")
    assert result.headline.variance == Decimal("-50.00")
