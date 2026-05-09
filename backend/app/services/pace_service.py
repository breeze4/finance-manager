"""Monthly pace service — Overview dashboard core math.

Two modes, sharing filter rules and dataclasses.

**Pace mode** — only when ``[date_from, date_to]`` is the in-progress
current month (``date_from == first-of-current-month`` AND ``date_to >=
today``). Per-category math (verbatim from the spec):

    full_budget       = effective_monthly_budget(category, this_month)
    subs_due          = sum of active subs in this category, expected
                        this month
    subs_already_hit  = sum of subs_due whose expected_date <= today
                        AND matched
    discretionary     = max(0, full_budget - subs_due)
    pace_factor       = elapsed_days / days_in_month
    expected_mtd      = subs_already_hit + discretionary * pace_factor

**Actual-vs-budget mode** — every other range (completed last month,
last 30 days, YTD, custom windows). Per-category math:

    actual       = sum of transactions in [date_from, date_to] (same
                   filter rules as pace mode)
    range_budget = Σ effective_monthly_budget(category, year, month)
                   over every (year, month) overlapping the range
    expected_mtd = range_budget   (no pace fraction; "expected" means
                                   "the planned figure for the range")
    full_budget  = range_budget   (same value; bucket cards use this for
                                   the progress fill)

The two modes share these filter rules (every sum):
  - ``Transaction.is_transfer = false``
  - ``Category.exclude_from_budget = false``
  - pre-tax categories (``Category.is_pre_tax = true``) are SKIPPED
    entirely (they have no transactions and would otherwise read on-pace)

Uncategorized handling is identical in both modes:
  - Non-transfer transactions with ``category_id IS NULL`` surface as a
    synthetic row with ``full_budget = 0``, ``expected_mtd = 0``,
    ``actual_mtd = sum of those transactions``. Listed in
    ``categories[]`` with ``bucket=None``. Does NOT belong to any
    bucket's category list and does NOT contribute to bucket totals.

Bucket rollup (both modes):
  - bucket-level expected = sum across categories
  - bucket-level actual = sum of category actuals
  - bucket-level budget = sum of category full_budget

Wire shape (in ``app/schemas/stats.py``) is unchanged across modes — only
``mode`` and the field semantics inside the rows differ. Pace v1 ignores
budget rollover (spec: Out of Scope).
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Budget, Category
from app.models.category import CspBucket
from app.services import spending, subscription_due_service
from app.services.spending import BudgetTarget, Period

# Canonical bucket order — same as csp_rollup_service.
_BUCKET_ORDER: tuple[str, ...] = (
    CspBucket.FIXED.value,
    CspBucket.INVESTMENTS.value,
    CspBucket.SAVINGS.value,
    CspBucket.GUILT_FREE.value,
)


# ---------------------------------------------------------------------------
# Public dataclasses (the wire shape is in app/schemas/stats.py)
# ---------------------------------------------------------------------------


@dataclass
class CategoryPace:
    category_id: int | None
    category_name: str
    bucket: str | None
    actual_mtd: Decimal
    expected_mtd: Decimal
    full_budget: Decimal


@dataclass
class BucketPace:
    bucket: str
    actual: Decimal
    expected: Decimal
    budget: Decimal
    categories: list[CategoryPace]


@dataclass
class Headline:
    actual_total: Decimal
    expected_total: Decimal
    variance: Decimal


@dataclass
class MonthlyPace:
    mode: str  # "pace" or "actual_vs_budget"
    headline: Headline
    buckets: list[BucketPace]
    categories: list[CategoryPace]
    date_from: date
    date_to: date


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def compute_monthly_pace(
    db: Session,
    date_from: date,
    date_to: date,
    *,
    today: date | None = None,
) -> MonthlyPace:
    """Compute the monthly pace dashboard for ``[date_from, date_to]``.

    Routes to pace mode iff ``date_from == first-of-(today's month)`` AND
    ``date_to >= today``; every other range goes through the
    actual-vs-budget branch. Raises ``ValueError`` only on genuinely
    invalid ranges (``date_to < date_from``); the router maps that to a
    400.

    The optional ``today`` parameter lets tests pin "today" without
    monkeypatching ``date.today``. Production callers omit it and the
    function uses wall-clock today.
    """
    if date_to < date_from:
        raise ValueError(f"date_to ({date_to}) must be on or after date_from ({date_from})")

    today = today or date.today()
    if _is_pace_range(date_from, date_to, today):
        return _compute_pace_mode(db, date_from, date_to)
    return _compute_actual_vs_budget_mode(db, date_from, date_to)


def _is_pace_range(date_from: date, date_to: date, today: date) -> bool:
    """Pace mode iff range = ``[first-of-current-month, today-or-later]``.

    Both anchors matter:
      - ``date_from`` must equal the first day of *today's* month (so a
        completed month range like ``[April 1, April 30]`` lands in
        actual-vs-budget mode even though April 1 is "first-of-its-month").
      - ``date_to`` must be on/after today (so an in-progress sub-window
        like ``[May 1, May 4]`` when today is May 8 also lands in
        actual-vs-budget mode — it's a completed sub-range, not the
        in-progress current month).
    """
    return date_from == date(today.year, today.month, 1) and date_to >= today


# ---------------------------------------------------------------------------
# Pace mode (Step 1 — preserved bit-for-bit; only relocated under a name)
# ---------------------------------------------------------------------------


def _compute_pace_mode(db: Session, date_from: date, date_to: date) -> MonthlyPace:
    """Pace-mode computation for the in-progress current month.

    The math is unchanged from Step 1: per-category linear pace factor
    with subscription holdout, plus a synthetic Uncategorized row.
    """
    year = date_to.year
    month = date_to.month

    # Linear pace factor: elapsed / month length. ``date_to`` doubles as
    # "today" in pace mode (the in-progress-current-month invariant
    # enforced by ``_is_pace_range``).
    pace_factor = Period.range(date_from, date_to).pace_factor(date_to)

    # ---- 1. Load reference data (categories, budgets) ----
    categories: list[Category] = db.query(Category).all()
    budgets: list[Budget] = db.query(Budget).filter(Budget.year == year).all()
    budget_by_cat: dict[int, Budget] = {b.category_id: b for b in budgets}

    # ---- 2. Already-hit subs per category ----
    subs_already_hit_by_cat = subscription_due_service.subscriptions_already_hit(
        db, year * 100 + month
    )

    # ---- 3. Subs due this month per category (sum of expected amounts) ----
    subs_due_by_cat = _subs_due_this_month(db, year, month)

    # ---- 4. Actual MTD per category in [date_from, date_to] ----
    actuals_by_cat = spending.by_category(db, Period.range(date_from, date_to))
    uncategorized_actual = actuals_by_cat.pop(None, Decimal("0"))

    # ---- 5. Build per-category pace rows ----
    rows: list[CategoryPace] = []
    bucket_categories: dict[str, list[CategoryPace]] = {b: [] for b in _BUCKET_ORDER}

    for cat in categories:
        if cat.exclude_from_budget:
            continue
        if cat.is_pre_tax:
            # Pre-tax categories never appear in pace math.
            continue

        full_budget = BudgetTarget.with_overrides(budget_by_cat.get(cat.id)).effective(year, month)
        actual = actuals_by_cat.get(cat.id, Decimal("0"))
        subs_due = subs_due_by_cat.get(cat.id, Decimal("0"))
        subs_hit = subs_already_hit_by_cat.get(cat.id, Decimal("0"))

        # Only include rows that have either a budget, actuals, or subs
        # activity — categories with nothing going on aren't useful noise.
        # (We always keep budgeted categories so the bucket totals match
        # the user's plan even when nothing's been spent yet.)
        has_budget = full_budget > 0
        has_actual = actual != 0
        has_sub_signal = subs_due > 0 or subs_hit > 0
        if not (has_budget or has_actual or has_sub_signal):
            continue

        discretionary = max(Decimal("0"), full_budget - subs_due)
        expected_mtd = subs_hit + discretionary * pace_factor

        row = CategoryPace(
            category_id=cat.id,
            category_name=cat.name,
            bucket=cat.csp_bucket,
            actual_mtd=_round_money(actual),
            expected_mtd=_round_money(expected_mtd),
            full_budget=_round_money(full_budget),
        )
        rows.append(row)
        if cat.csp_bucket in bucket_categories:
            bucket_categories[cat.csp_bucket].append(row)

    # ---- 6. Synthetic Uncategorized row ----
    if uncategorized_actual != 0:
        uncategorized_row = CategoryPace(
            category_id=None,
            category_name="Uncategorized",
            bucket=None,
            actual_mtd=_round_money(uncategorized_actual),
            expected_mtd=Decimal("0.00"),
            full_budget=Decimal("0.00"),
        )
        rows.append(uncategorized_row)
        # Does NOT belong to any bucket — intentionally not appended to
        # bucket_categories.

    # ---- 7. Bucket rollups ----
    buckets = _build_bucket_rollups(bucket_categories)

    # ---- 8. Headline ----
    # The headline sums across all rows that contribute to pace —
    # including the synthetic Uncategorized row's actual (which has
    # expected = 0, so it pushes variance up). This mirrors the spec
    # "uncategorized counts toward actual but not toward expected".
    headline = _build_headline(rows)

    return MonthlyPace(
        mode="pace",
        headline=headline,
        buckets=buckets,
        categories=rows,
        date_from=date_from,
        date_to=date_to,
    )


# ---------------------------------------------------------------------------
# Actual-vs-budget mode (Step 5)
# ---------------------------------------------------------------------------


def _compute_actual_vs_budget_mode(db: Session, date_from: date, date_to: date) -> MonthlyPace:
    """Actual-vs-budget computation for any range that isn't pace mode.

    For each non-excluded, non-pre-tax category:
      - ``actual`` = sum of in-range transactions (same filter rules)
      - ``range_budget`` = Σ effective_monthly_budget(cat, year, month) for
        every (year, month) overlapping the range

    Field reuse on the wire:
      - ``CategoryPace.actual_mtd`` ← actual for the range
      - ``CategoryPace.expected_mtd`` ← range_budget (top-movers ranks
        by ``|actual_mtd − expected_mtd|`` so this gives the spec's
        ``|actual − range_budget|`` ranking unchanged)
      - ``CategoryPace.full_budget`` ← range_budget (same value; the
        bucket-card progress bar fills against this)

    No pace fraction; no subscription holdout — both are pace-mode-only.
    """
    months = Period.range(date_from, date_to).months_overlapping()

    # ---- 1. Load reference data (categories + every budget for years touched) ----
    categories: list[Category] = db.query(Category).all()
    years_in_range = {y for (y, _m) in months} or {date_to.year}
    budgets: list[Budget] = db.query(Budget).filter(Budget.year.in_(years_in_range)).all()
    budget_by_cat_year: dict[tuple[int, int], Budget] = {
        (b.category_id, b.year): b for b in budgets
    }

    # ---- 2. Actual per category in [date_from, date_to] ----
    actuals_by_cat = spending.by_category(db, Period.range(date_from, date_to))
    uncategorized_actual = actuals_by_cat.pop(None, Decimal("0"))

    # ---- 3. Build per-category rows ----
    rows: list[CategoryPace] = []
    bucket_categories: dict[str, list[CategoryPace]] = {b: [] for b in _BUCKET_ORDER}

    for cat in categories:
        if cat.exclude_from_budget:
            continue
        if cat.is_pre_tax:
            continue

        # Sum the effective monthly budget across every month overlapping
        # the range. Each (cat, year) pair maps to a Budget; the override
        # (if any) for the specific month wins.
        range_budget = Decimal("0")
        for year, month in months:
            range_budget += BudgetTarget.with_overrides(
                budget_by_cat_year.get((cat.id, year))
            ).effective(year, month)

        actual = actuals_by_cat.get(cat.id, Decimal("0"))

        has_budget = range_budget > 0
        has_actual = actual != 0
        if not (has_budget or has_actual):
            continue

        row = CategoryPace(
            category_id=cat.id,
            category_name=cat.name,
            bucket=cat.csp_bucket,
            actual_mtd=_round_money(actual),
            expected_mtd=_round_money(range_budget),
            full_budget=_round_money(range_budget),
        )
        rows.append(row)
        if cat.csp_bucket in bucket_categories:
            bucket_categories[cat.csp_bucket].append(row)

    # ---- 4. Synthetic Uncategorized row ----
    if uncategorized_actual != 0:
        uncategorized_row = CategoryPace(
            category_id=None,
            category_name="Uncategorized",
            bucket=None,
            actual_mtd=_round_money(uncategorized_actual),
            expected_mtd=Decimal("0.00"),
            full_budget=Decimal("0.00"),
        )
        rows.append(uncategorized_row)

    # ---- 5. Bucket rollups + headline ----
    buckets = _build_bucket_rollups(bucket_categories)
    headline = _build_headline(rows)

    return MonthlyPace(
        mode="actual_vs_budget",
        headline=headline,
        buckets=buckets,
        categories=rows,
        date_from=date_from,
        date_to=date_to,
    )


# ---------------------------------------------------------------------------
# Helpers shared by both modes
# ---------------------------------------------------------------------------


def _build_bucket_rollups(
    bucket_categories: dict[str, list[CategoryPace]],
) -> list[BucketPace]:
    """Roll category rows into bucket totals in canonical order."""
    buckets: list[BucketPace] = []
    for bucket_key in _BUCKET_ORDER:
        items = bucket_categories[bucket_key]
        actual_sum = sum((c.actual_mtd for c in items), Decimal("0"))
        expected_sum = sum((c.expected_mtd for c in items), Decimal("0"))
        budget_sum = sum((c.full_budget for c in items), Decimal("0"))
        buckets.append(
            BucketPace(
                bucket=bucket_key,
                actual=_round_money(actual_sum),
                expected=_round_money(expected_sum),
                budget=_round_money(budget_sum),
                categories=items,
            )
        )
    return buckets


def _build_headline(rows: list[CategoryPace]) -> Headline:
    """Aggregate per-category rows into the top-of-page headline."""
    actual_total = sum((r.actual_mtd for r in rows), Decimal("0"))
    expected_total = sum((r.expected_mtd for r in rows), Decimal("0"))
    return Headline(
        actual_total=_round_money(actual_total),
        expected_total=_round_money(expected_total),
        variance=_round_money(actual_total - expected_total),
    )


def _subs_due_this_month(db: Session, year: int, month: int) -> dict[int, Decimal]:
    """For each category, total expected-amount of subs due this month.

    "Due this month" means ``last_charge_date + frequency_days`` lands in
    the target calendar month. Only active subscriptions with a
    non-NULL, non-excluded category contribute.
    """
    from app.models import Subscription

    excluded = select(Category.id).where(Category.exclude_from_budget.is_(True))
    subs: list[Subscription] = (
        db.query(Subscription)
        .filter(Subscription.is_active.is_(True))
        .filter(Subscription.category_id.isnot(None))
        .filter(Subscription.category_id.notin_(excluded))
        .all()
    )
    out: dict[int, Decimal] = {}
    for sub in subs:
        expected_date = subscription_due_service._expected_date_in_month(sub, year, month)
        if expected_date.year != year or expected_date.month != month:
            continue
        amt = subscription_due_service._expected_amount(sub)
        out[sub.category_id] = out.get(sub.category_id, Decimal("0")) + amt
    return out


def _round_money(value: Decimal) -> Decimal:
    """Two-decimal rounding for response numbers."""
    return value.quantize(Decimal("0.01"))
