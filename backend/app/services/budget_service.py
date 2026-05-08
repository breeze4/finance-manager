import statistics
from collections import defaultdict
from dataclasses import dataclass, field

from sqlalchemy import extract, func
from sqlalchemy.orm import Session, joinedload

from app.models import Budget, BudgetMonthlyOverride, Category, Transaction
from app.services.category_filters import not_excluded_from_budget


@dataclass
class CategoryHistoricalStats:
    category_id: int
    category_name: str
    monthly_average: float
    monthly_median: float
    monthly_min: float
    monthly_max: float
    std_dev: float
    coefficient_of_variation: float
    confidence_interval_low: float
    confidence_interval_high: float
    trend: str  # "increasing", "decreasing", "stable"
    seasonal_months: list[int]  # months (1-12) flagged as seasonal spikes
    months_of_data: int
    monthly_totals: dict[str, float] = field(default_factory=dict)  # "YYYY-MM" -> total


def get_historical_analysis(
    db: Session,
    *,
    year: int | None = None,
) -> list[CategoryHistoricalStats]:
    """Compute per-category historical spending statistics.

    All queries exclude transfers and exclude-from-budget categories, and
    only consider outflows (amount < 0).
    """
    base = db.query(Transaction).filter(
        Transaction.is_transfer.is_(False),
        not_excluded_from_budget(),
        Transaction.amount < 0,
    )

    if year is not None:
        base = base.filter(extract("year", Transaction.date) == year)

    # Get monthly totals per category.
    rows = (
        base.join(Category, Transaction.category_id == Category.id, isouter=True)
        .with_entities(
            Transaction.category_id,
            func.coalesce(Category.name, "Uncategorized").label("category_name"),
            extract("year", Transaction.date).label("yr"),
            extract("month", Transaction.date).label("mo"),
            func.sum(Transaction.amount).label("total"),
        )
        .group_by(
            Transaction.category_id,
            extract("year", Transaction.date),
            extract("month", Transaction.date),
        )
        .all()
    )

    # Group by category.
    category_months: dict[tuple[int | None, str], list[tuple[int, int, float]]] = defaultdict(list)
    for row in rows:
        key = (row.category_id, row.category_name)
        category_months[key].append((int(row.yr), int(row.mo), abs(row.total)))

    results = []
    for (cat_id, cat_name), months_data in category_months.items():
        if not months_data:
            continue

        monthly_amounts = [amt for _, _, amt in months_data]
        n = len(monthly_amounts)

        avg = statistics.mean(monthly_amounts)
        median = statistics.median(monthly_amounts)
        mn = min(monthly_amounts)
        mx = max(monthly_amounts)

        if n >= 2:
            sd = statistics.stdev(monthly_amounts)
        else:
            sd = 0.0

        cv = sd / avg if avg > 0 else 0.0

        # 80% confidence interval: mean ± 1.28 * std_dev, clamped to observed range.
        ci_low = max(avg - 1.28 * sd, mn)
        ci_high = min(avg + 1.28 * sd, mx)

        # Trend: linear regression on the last 6 months of data.
        trend = _compute_trend(months_data)

        # Seasonal detection: months where historical average > 1.5x overall average.
        seasonal = _detect_seasonal_months(months_data, avg)

        # Monthly totals dict for transparency.
        monthly_totals = {
            f"{yr:04d}-{mo:02d}": round(amt, 2) for yr, mo, amt in sorted(months_data)
        }

        results.append(
            CategoryHistoricalStats(
                category_id=cat_id if cat_id is not None else 0,
                category_name=cat_name,
                monthly_average=round(avg, 2),
                monthly_median=round(median, 2),
                monthly_min=round(mn, 2),
                monthly_max=round(mx, 2),
                std_dev=round(sd, 2),
                coefficient_of_variation=round(cv, 4),
                confidence_interval_low=round(ci_low, 2),
                confidence_interval_high=round(ci_high, 2),
                trend=trend,
                seasonal_months=seasonal,
                months_of_data=n,
                monthly_totals=monthly_totals,
            )
        )

    # Sort by average spending descending.
    results.sort(key=lambda r: r.monthly_average, reverse=True)
    return results


def _compute_trend(months_data: list[tuple[int, int, float]]) -> str:
    """Compute trend direction from the last 6 months of data using linear regression.

    Returns "increasing", "decreasing", or "stable".
    """
    # Sort chronologically and take last 6.
    sorted_data = sorted(months_data, key=lambda x: (x[0], x[1]))
    recent = sorted_data[-6:]

    if len(recent) < 3:
        return "stable"

    # Simple linear regression: y = mx + b
    xs = list(range(len(recent)))
    ys = [amt for _, _, amt in recent]

    n = len(xs)
    sum_x = sum(xs)
    sum_y = sum(ys)
    sum_xy = sum(x * y for x, y in zip(xs, ys))
    sum_x2 = sum(x * x for x in xs)

    denom = n * sum_x2 - sum_x * sum_x
    if denom == 0:
        return "stable"

    slope = (n * sum_xy - sum_x * sum_y) / denom
    mean_y = sum_y / n

    # Slope as percentage of mean — threshold for significance.
    if mean_y == 0:
        return "stable"

    relative_slope = slope / mean_y

    if relative_slope > 0.05:
        return "increasing"
    elif relative_slope < -0.05:
        return "decreasing"
    return "stable"


def _detect_seasonal_months(
    months_data: list[tuple[int, int, float]], overall_avg: float
) -> list[int]:
    """Flag months where historical average spending > 1.5x overall average."""
    if overall_avg == 0:
        return []

    # Group amounts by month-of-year.
    by_month: dict[int, list[float]] = defaultdict(list)
    for _, mo, amt in months_data:
        by_month[mo].append(amt)

    seasonal = []
    for mo, amounts in sorted(by_month.items()):
        mo_avg = statistics.mean(amounts)
        if mo_avg > 1.5 * overall_avg:
            seasonal.append(mo)

    return seasonal


# ---------------------------------------------------------------------------
# Budget CRUD
# ---------------------------------------------------------------------------


def list_budgets(db: Session, *, year: int) -> list[Budget]:
    """List all budgets for a given year, with category and overrides loaded."""
    return (
        db.query(Budget)
        .filter(Budget.year == year)
        .options(
            joinedload(Budget.category),
            joinedload(Budget.monthly_overrides),
        )
        .all()
    )


def set_budget(
    db: Session,
    *,
    category_id: int,
    year: int,
    monthly_amount: float,
    rollover_mode: bool = False,
) -> Budget:
    """Create or update a budget baseline for a category/year."""
    budget = db.query(Budget).filter(Budget.category_id == category_id, Budget.year == year).first()
    if budget is None:
        budget = Budget(
            category_id=category_id,
            year=year,
            monthly_amount=monthly_amount,
            rollover_mode=rollover_mode,
        )
        db.add(budget)
    else:
        budget.monthly_amount = monthly_amount
        budget.rollover_mode = rollover_mode

    db.commit()
    db.refresh(budget)
    return budget


def set_monthly_override(
    db: Session,
    *,
    category_id: int,
    year: int,
    month: int,
    amount: float,
) -> BudgetMonthlyOverride:
    """Set a per-month budget override. Creates the parent budget if needed."""
    budget = db.query(Budget).filter(Budget.category_id == category_id, Budget.year == year).first()
    if budget is None:
        return None

    override = (
        db.query(BudgetMonthlyOverride)
        .filter(
            BudgetMonthlyOverride.budget_id == budget.id,
            BudgetMonthlyOverride.month == month,
        )
        .first()
    )
    if override is None:
        override = BudgetMonthlyOverride(
            budget_id=budget.id,
            month=month,
            amount=amount,
        )
        db.add(override)
    else:
        override.amount = amount

    db.commit()
    db.refresh(override)
    return override


def delete_monthly_override(
    db: Session,
    *,
    category_id: int,
    year: int,
    month: int,
) -> bool:
    """Remove a monthly override. Returns True if deleted, False if not found."""
    budget = db.query(Budget).filter(Budget.category_id == category_id, Budget.year == year).first()
    if budget is None:
        return False

    override = (
        db.query(BudgetMonthlyOverride)
        .filter(
            BudgetMonthlyOverride.budget_id == budget.id,
            BudgetMonthlyOverride.month == month,
        )
        .first()
    )
    if override is None:
        return False

    db.delete(override)
    db.commit()
    return True


# ---------------------------------------------------------------------------
# Actual vs Budget
# ---------------------------------------------------------------------------


@dataclass
class ActualVsBudgetEntry:
    category_id: int
    category_name: str
    month: int
    budget_target: float
    actual_spend: float
    difference: float  # positive = under budget, negative = over budget
    percentage: float  # actual / target * 100


@dataclass
class MonthlyRollup:
    month: int
    total_budgeted: float
    total_actual: float
    difference: float
    percentage: float


@dataclass
class ActualVsBudgetResult:
    entries: list[ActualVsBudgetEntry]
    monthly_rollups: list[MonthlyRollup]


def get_actual_vs_budget(db: Session, *, year: int) -> ActualVsBudgetResult:
    """Compare actual spending against budgets for each category and month.

    Effective budget = monthly override if exists, else baseline monthly_amount.
    Actual = sum of non-transfer outflow transactions for that category/month.
    """
    budgets = list_budgets(db, year=year)

    # Build override lookup: budget_id -> {month: amount}
    override_map: dict[int, dict[int, float]] = {}
    for b in budgets:
        override_map[b.id] = {o.month: o.amount for o in b.monthly_overrides}

    # Get actual monthly spending per category for this year.
    actual_rows = (
        db.query(Transaction)
        .filter(
            Transaction.is_transfer.is_(False),
            not_excluded_from_budget(),
            Transaction.amount < 0,
            extract("year", Transaction.date) == year,
        )
        .with_entities(
            Transaction.category_id,
            extract("month", Transaction.date).label("mo"),
            func.sum(Transaction.amount).label("total"),
        )
        .group_by(Transaction.category_id, extract("month", Transaction.date))
        .all()
    )

    # Build actual lookup: (category_id, month) -> abs(total)
    actual_map: dict[tuple[int, int], float] = {}
    for row in actual_rows:
        if row.category_id is not None:
            actual_map[(row.category_id, int(row.mo))] = round(abs(row.total), 2)

    entries = []
    month_totals: dict[int, dict[str, float]] = defaultdict(
        lambda: {"budgeted": 0.0, "actual": 0.0}
    )

    for budget in budgets:
        overrides = override_map.get(budget.id, {})
        cat_name = budget.category.name if budget.category else "Unknown"

        # For rollover budgets, accumulate surplus/deficit across months.
        rollover_carry = 0.0

        for month in range(1, 13):
            base_target = overrides.get(month, budget.monthly_amount)

            if budget.rollover_mode:
                # Effective budget = base + accumulated carry from prior months.
                target = base_target + rollover_carry
            else:
                target = base_target

            actual = actual_map.get((budget.category_id, month), 0.0)
            diff = round(target - actual, 2)
            pct = round(actual / target * 100, 1) if target > 0 else 0.0

            entries.append(
                ActualVsBudgetEntry(
                    category_id=budget.category_id,
                    category_name=cat_name,
                    month=month,
                    budget_target=round(target, 2),
                    actual_spend=actual,
                    difference=diff,
                    percentage=pct,
                )
            )

            month_totals[month]["budgeted"] += target
            month_totals[month]["actual"] += actual

            if budget.rollover_mode:
                # Carry = effective_budget - actual. Positive = surplus, negative = deficit.
                rollover_carry = target - actual

    monthly_rollups = []
    for month in range(1, 13):
        totals = month_totals[month]
        budgeted = round(totals["budgeted"], 2)
        actual = round(totals["actual"], 2)
        diff = round(budgeted - actual, 2)
        pct = round(actual / budgeted * 100, 1) if budgeted > 0 else 0.0
        monthly_rollups.append(
            MonthlyRollup(
                month=month,
                total_budgeted=budgeted,
                total_actual=actual,
                difference=diff,
                percentage=pct,
            )
        )

    return ActualVsBudgetResult(entries=entries, monthly_rollups=monthly_rollups)


# ---------------------------------------------------------------------------
# Budget Suggestions
# ---------------------------------------------------------------------------


@dataclass
class BudgetSuggestion:
    category_id: int
    category_name: str
    baseline_monthly: float
    monthly_suggestions: dict[int, float]  # month (1-12) -> suggested amount
    basis: str  # explanation text


def get_budget_suggestions(db: Session, *, year: int) -> list[BudgetSuggestion]:
    """Generate suggested budgets from historical data.

    - Baseline: historical monthly average per category
    - For months flagged as seasonal: use that month's historical average
    - Clamp all values to the 80% confidence interval
    """
    stats = get_historical_analysis(db)

    suggestions = []
    for s in stats:
        if s.months_of_data < 3:
            continue

        baseline = s.monthly_average

        # Build per-month suggestions.
        monthly = {}
        for month in range(1, 13):
            if month in s.seasonal_months:
                # Use the historical average for this specific month.
                month_key_candidates = [
                    v for k, v in s.monthly_totals.items() if k.endswith(f"-{month:02d}")
                ]
                if month_key_candidates:
                    month_avg = statistics.mean(month_key_candidates)
                else:
                    month_avg = baseline
                # Clamp to CI.
                suggested = max(
                    s.confidence_interval_low, min(month_avg, s.confidence_interval_high)
                )
            else:
                suggested = baseline

            monthly[month] = round(suggested, 2)

        # Build basis text.
        parts = [f"Based on ${baseline:.0f} avg"]
        if s.confidence_interval_low != s.confidence_interval_high:
            parts.append(
                f"${s.confidence_interval_low:.0f}–${s.confidence_interval_high:.0f} range"
            )
        if s.seasonal_months:
            month_names = {
                1: "Jan",
                2: "Feb",
                3: "Mar",
                4: "Apr",
                5: "May",
                6: "Jun",
                7: "Jul",
                8: "Aug",
                9: "Sep",
                10: "Oct",
                11: "Nov",
                12: "Dec",
            }
            seasonal_str = ", ".join(month_names[m] for m in s.seasonal_months)
            parts.append(f"spike detected in {seasonal_str}")
        basis = ", ".join(parts)

        suggestions.append(
            BudgetSuggestion(
                category_id=s.category_id,
                category_name=s.category_name,
                baseline_monthly=round(baseline, 2),
                monthly_suggestions=monthly,
                basis=basis,
            )
        )

    return suggestions
