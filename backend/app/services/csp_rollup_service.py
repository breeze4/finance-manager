"""Conscious Spending Plan (CSP) rollup service — planning mode only.

Computes the four-bucket dashboard the Set Budget tab renders:

  Fixed | Investments | Savings | Guilt-Free

Numerator (per bucket):
    Sum of ``Budget.monthly_amount`` for every category in that bucket.
    Pre-tax categories also contribute their baseline (because the user is
    "spending" the pre-tax amount even though it never lands in the
    take-home denominator).

Denominator:
    ``net_income(month) + sum(all pre_tax baselines across all buckets)``.
    The pre-tax sum is added to the take-home to get a synthetic "gross"
    that lets the percentages stay comparable to Ramit's ranges, which
    are stated against gross-ish income.

Status classifier (Ramit's defaults — hardcoded constants below):
    Fixed:        50–60% — under if <50, over if >60
    Investments:  >=10%  — under if <10, over (open-ended OK) if >10
    Savings:      5–10%  — under if <5,  over if >10
    Guilt-Free:   20–35% — under if <20, over if >35

Boundary semantics: lower- and upper-bound values are *in-range*
(strict-less / strict-greater for under/over).

Slice 4 will add ``get_actuals_rollup`` alongside this. The router is
already structured so a single dispatch line will be enough.
"""

from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import Budget, Category
from app.models.category import CspBucket
from app.services import budget_service, net_income_service

# Categories that intentionally have ``csp_bucket=NULL`` per the
# user-approved seed (Step 1 handoff). They are not a misconfiguration —
# do NOT surface them in the unbucketed-warning list. This is a policy
# decision documented in docs/handoff/step-1-csp-category-fields.md.
_INTENTIONALLY_NULL_BUCKET_NAMES: frozenset[str] = frozenset(
    {"Income", "Transfers", "Uncategorized"}
)


# Ramit ranges per bucket. ``upper`` is None for Investments — open-ended.
_RANGES: dict[str, tuple[Decimal, Decimal | None]] = {
    CspBucket.FIXED.value: (Decimal("50"), Decimal("60")),
    CspBucket.INVESTMENTS.value: (Decimal("10"), None),
    CspBucket.SAVINGS.value: (Decimal("5"), Decimal("10")),
    CspBucket.GUILT_FREE.value: (Decimal("20"), Decimal("35")),
}

# Canonical UI order — also the order of records in the response.
_BUCKET_ORDER: tuple[str, ...] = (
    CspBucket.FIXED.value,
    CspBucket.INVESTMENTS.value,
    CspBucket.SAVINGS.value,
    CspBucket.GUILT_FREE.value,
)


@dataclass
class BucketRollup:
    """One bucket record in a planning or actuals rollup.

    Shared by both modes; the actuals path additionally populates the two
    optional ``planned_*`` / ``tracking_status`` fields.

    Fields:
      bucket: one of ``"fixed" | "investments" | "savings" | "guilt_free"``.
      numerator: sum of category baselines (incl. pre-tax) in this bucket
                 for planning; sum of per-category ``actual_spend`` (which
                 already equals the effective budget for pre-tax categories
                 — see ``budget_service.get_actual_vs_budget``) for actuals.
      denominator: ``net_income + total_pre_tax`` — same on every record,
                   identical math across modes.
      percentage: ``numerator / denominator * 100`` rounded to 1 decimal.
                  0 when denominator is unavailable.
      ramit_min: lower range bound (in percent).
      ramit_max: upper range bound or None (Investments is open-ended).
      status: ``"under" | "in-range" | "over"`` against Ramit's range.
      is_open_ended_over: True only for Investments when over its 10%
                          floor — the UI labels this "over (ok)".
      planned_percentage: actuals-mode only — the planning rollup's bucket
                          percentage for the same month, so the UI can
                          render "target X% / actual Y%". None on planning.
      tracking_status: actuals-mode only — ``"on-track" | "over-plan" |
                       "under-plan"``. Computed as a delta against
                       ``planned_percentage`` with a ±2 percentage-point
                       tolerance: ``|actual - plan| <= 2 → on-track``,
                       ``actual - plan > 2 → over-plan``, ``< -2 →
                       under-plan``. None on planning.
    """

    bucket: str
    numerator: Decimal
    denominator: Decimal
    percentage: Decimal
    ramit_min: Decimal
    ramit_max: Decimal | None
    status: str
    is_open_ended_over: bool
    planned_percentage: Decimal | None = None
    tracking_status: str | None = None


@dataclass
class PlanningRollup:
    """Top-level response for the planning rollup."""

    month_yyyymm: int
    denominator: Decimal
    take_home: Decimal | None
    pre_tax_total: Decimal
    buckets: list[BucketRollup]
    unbucketed_categories: list[dict] = field(default_factory=list)
    has_net_income: bool = False


@dataclass
class ActualsRollup:
    """Top-level response for the actuals rollup.

    Shape mirrors :class:`PlanningRollup` exactly. The numerator math
    differs (sum of per-category ``actual_spend`` from
    ``budget_service.get_actual_vs_budget`` for the requested month);
    the denominator math is the same so the percentages are directly
    comparable between modes.

    Each ``BucketRollup`` in ``buckets`` carries the actuals percentage
    in ``percentage`` plus the planned percentage in ``planned_percentage``
    and the derived ``tracking_status`` ("on-track" / "over-plan" /
    "under-plan", ±2 pts tolerance).
    """

    month_yyyymm: int
    denominator: Decimal
    take_home: Decimal | None
    pre_tax_total: Decimal
    buckets: list[BucketRollup]
    unbucketed_categories: list[dict] = field(default_factory=list)
    has_net_income: bool = False


# Tolerance band for tracking_status. ±2 percentage points → "on-track".
# Outside that band, the bucket is over- or under-plan. Documented in the
# plan file (Step 4 — pretax actuals and actual vs budget CSP).
_TRACKING_TOLERANCE_PTS: Decimal = Decimal("2")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_planning_rollup(db: Session, month_yyyymm: int) -> PlanningRollup:
    """Compute the four-bucket planning rollup for a given month.

    The numerator/denominator math uses Budget.monthly_amount baselines
    only — overrides and rollover are intentionally excluded so the
    dashboard reflects the user's plan, not the latest in-flight tweak.
    """
    year = month_yyyymm // 100

    categories: list[Category] = db.query(Category).all()
    budgets = db.query(Budget).filter(Budget.year == year).all()
    budget_by_cat: dict[int, Budget] = {b.category_id: b for b in budgets}

    # Per-bucket numerator accumulators (Decimal so the math stays exact).
    bucket_numerators: dict[str, Decimal] = {b: Decimal("0") for b in _BUCKET_ORDER}
    pre_tax_total = Decimal("0")
    unbucketed: list[dict] = []

    for cat in categories:
        if cat.exclude_from_budget:
            continue

        baseline = _baseline(budget_by_cat.get(cat.id))

        if cat.csp_bucket is None:
            # Either intentionally NULL (Income/Transfers/Uncategorized) or
            # a misconfigured spending category that the UI must warn on.
            if cat.name not in _INTENTIONALLY_NULL_BUCKET_NAMES:
                unbucketed.append({"id": cat.id, "name": cat.name})
            continue

        # Pre-tax inflates the denominator and contributes to its bucket.
        if cat.is_pre_tax:
            pre_tax_total += baseline

        if cat.csp_bucket in bucket_numerators:
            bucket_numerators[cat.csp_bucket] += baseline
        # else: unknown string in DB — skip silently (defensive; the seed
        # migration restricts the column to known values).

    take_home = net_income_service.get_for_month(db, month_yyyymm)
    has_net_income = take_home is not None
    denominator = (take_home or Decimal("0")) + pre_tax_total

    rollups = [
        _build_bucket(bucket, bucket_numerators[bucket], denominator, has_net_income)
        for bucket in _BUCKET_ORDER
    ]

    return PlanningRollup(
        month_yyyymm=month_yyyymm,
        denominator=denominator,
        take_home=take_home,
        pre_tax_total=pre_tax_total,
        buckets=rollups,
        unbucketed_categories=unbucketed,
        has_net_income=has_net_income,
    )


def get_actuals_rollup(db: Session, month_yyyymm: int) -> ActualsRollup:
    """Compute the four-bucket actuals rollup for a given month.

    Numerator per bucket: sum of ``actual_spend`` from
    ``budget_service.get_actual_vs_budget`` entries that fall in the
    requested month, grouped by ``Category.csp_bucket``. Pre-tax
    categories naturally contribute their effective budget here because
    the budget service already substitutes ``actual = target`` for them
    — so this function does NOT separately re-add pre-tax baselines (that
    would double-count).

    Denominator: same as planning — ``net_income(month) + sum(pre_tax
    baselines)`` — so percentages are directly comparable between modes.

    Each bucket's ``tracking_status`` is derived from the delta between
    the actuals percentage and the planning rollup's percentage for the
    same month with a ±2 percentage-point tolerance.
    """
    year = month_yyyymm // 100
    month = month_yyyymm % 100

    categories: dict[int, Category] = {c.id: c for c in db.query(Category).all()}

    # Per-category actuals for the year (one query, then filter by month).
    actual_result = budget_service.get_actual_vs_budget(db, year=year)

    bucket_numerators: dict[str, Decimal] = {b: Decimal("0") for b in _BUCKET_ORDER}
    pre_tax_total = Decimal("0")

    # Sum actuals by bucket for the requested month only.
    for entry in actual_result.entries:
        if entry.month != month:
            continue
        cat = categories.get(entry.category_id)
        if cat is None or cat.exclude_from_budget:
            continue
        if cat.csp_bucket is None:
            # Intentionally NULL or misconfigured — neither contributes
            # to a bucket numerator. The unbucketed-warning surface is
            # built below from the full Category list.
            continue
        if cat.csp_bucket in bucket_numerators:
            bucket_numerators[cat.csp_bucket] += Decimal(str(entry.actual_spend))

    # Denominator composition: take_home + pre_tax_total. We compute
    # pre_tax_total from the planning baselines (Budget.monthly_amount) for
    # every pre-tax category — same composition as the planning rollup so
    # the two modes share a denominator.
    budgets = db.query(Budget).filter(Budget.year == year).all()
    budget_by_cat: dict[int, Budget] = {b.category_id: b for b in budgets}
    unbucketed: list[dict] = []
    for cat in categories.values():
        if cat.exclude_from_budget:
            continue
        if cat.csp_bucket is None:
            if cat.name not in _INTENTIONALLY_NULL_BUCKET_NAMES:
                unbucketed.append({"id": cat.id, "name": cat.name})
            continue
        if cat.is_pre_tax:
            pre_tax_total += _baseline(budget_by_cat.get(cat.id))

    take_home = net_income_service.get_for_month(db, month_yyyymm)
    has_net_income = take_home is not None
    denominator = (take_home or Decimal("0")) + pre_tax_total

    # Resolve planned percentages from the planning rollup (one query;
    # cheap relative to the rest of the work). Index by bucket for the
    # tracking-status delta computation below.
    planning = get_planning_rollup(db, month_yyyymm)
    planned_pct_by_bucket = {b.bucket: b.percentage for b in planning.buckets}

    rollups: list[BucketRollup] = []
    for bucket in _BUCKET_ORDER:
        record = _build_bucket(bucket, bucket_numerators[bucket], denominator, has_net_income)
        planned_pct = planned_pct_by_bucket.get(bucket, Decimal("0"))
        record.planned_percentage = planned_pct
        record.tracking_status = _tracking_status(record.percentage, planned_pct)
        rollups.append(record)

    return ActualsRollup(
        month_yyyymm=month_yyyymm,
        denominator=denominator,
        take_home=take_home,
        pre_tax_total=pre_tax_total,
        buckets=rollups,
        unbucketed_categories=unbucketed,
        has_net_income=has_net_income,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _tracking_status(actual_pct: Decimal, planned_pct: Decimal) -> str:
    """Classify actual vs planned with a ±2 pt tolerance band.

    Equal percentages → on-track. Within ±2 pts → on-track. Outside the
    band → over-plan or under-plan. The boundary itself (exactly ±2) is
    inclusive of on-track.
    """
    delta = actual_pct - planned_pct
    if delta > _TRACKING_TOLERANCE_PTS:
        return "over-plan"
    if delta < -_TRACKING_TOLERANCE_PTS:
        return "under-plan"
    return "on-track"


def _baseline(budget: Budget | None) -> Decimal:
    """Return Budget.monthly_amount as a Decimal, or 0 if no row exists."""
    if budget is None:
        return Decimal("0")
    return Decimal(str(budget.monthly_amount))


def _build_bucket(
    bucket: str,
    numerator: Decimal,
    denominator: Decimal,
    has_net_income: bool,
) -> BucketRollup:
    ramit_min, ramit_max = _RANGES[bucket]

    if not has_net_income or denominator <= 0:
        # Without a denominator we can't form a percentage; report 0 and
        # let the frontend render the under/missing state.
        return BucketRollup(
            bucket=bucket,
            numerator=numerator,
            denominator=denominator,
            percentage=Decimal("0"),
            ramit_min=ramit_min,
            ramit_max=ramit_max,
            status="under",
            is_open_ended_over=False,
        )

    pct = (numerator / denominator * Decimal("100")).quantize(Decimal("0.1"))
    status = _classify(pct, ramit_min, ramit_max)
    is_open_ended_over = bucket == CspBucket.INVESTMENTS.value and status == "over"

    return BucketRollup(
        bucket=bucket,
        numerator=numerator,
        denominator=denominator,
        percentage=pct,
        ramit_min=ramit_min,
        ramit_max=ramit_max,
        status=status,
        is_open_ended_over=is_open_ended_over,
    )


def _classify(pct: Decimal, ramit_min: Decimal, ramit_max: Decimal | None) -> str:
    """Strict comparisons: boundary values are in-range.

    For Investments (``ramit_max=None``) the threshold is the *floor*: any
    percentage strictly above ``ramit_min`` is "over" — the UI labels it
    "over (ok)" via the ``is_open_ended_over`` flag.
    """
    if pct < ramit_min:
        return "under"
    if ramit_max is None:
        # Open-ended bucket: > floor means over (the bucket has no ceiling
        # but Ramit still wants to flag it as "above target").
        return "over" if pct > ramit_min else "in-range"
    if pct > ramit_max:
        return "over"
    return "in-range"
