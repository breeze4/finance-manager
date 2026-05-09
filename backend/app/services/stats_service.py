from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Budget, Category, Transaction
from app.services import spending
from app.services.category_filters import not_excluded_from_budget
from app.services.spending import BudgetTarget, Period


def get_summary(
    db: Session,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    """Compute spending summary. Excludes transfers and exclude-from-budget categories."""
    period = Period.range(date_from or date.min, date_to or date.max)

    total_spending = spending.range_total(db, period)
    total_income = spending.income_total(db, period)

    # Savings rate
    savings_rate = Decimal("0")
    if total_income > 0:
        savings_rate = (total_income - total_spending) / total_income

    # Transaction count — kept inline; no spending.count function in scope.
    # Mirrors the structural filter applied inside spending.* (no sign filter).
    transaction_count = (
        db.query(func.count(Transaction.id))
        .filter(
            Transaction.is_transfer.is_(False),
            not_excluded_from_budget(),
            Transaction.date >= period.start,
            Transaction.date <= period.end,
        )
        .scalar()
        or 0
    )

    # Top categories by spending: top 10 by Decimal value, descending.
    by_cat = spending.by_category(db, period)
    top_keys = sorted(by_cat.items(), key=lambda kv: kv[1], reverse=True)[:10]
    cat_ids = {k for k, _ in top_keys if k is not None}
    cat_names = (
        {c.id: c.name for c in db.query(Category).filter(Category.id.in_(cat_ids)).all()}
        if cat_ids
        else {}
    )
    top_categories = []
    for cid, total in top_keys:
        name = cat_names.get(cid, "Uncategorized") if cid is not None else "Uncategorized"
        pct = float(total) / float(total_spending) * 100 if total_spending > 0 else 0.0
        top_categories.append(
            {
                "category_id": cid,
                "category_name": name,
                "total": float(total),
                "percentage": round(pct, 1),
            }
        )

    return {
        "total_spending": round(float(total_spending), 2),
        "total_income": round(float(total_income), 2),
        "savings_rate": round(float(savings_rate), 4),
        "transaction_count": transaction_count,
        "top_categories": top_categories,
    }


def get_monthly_stats(
    db: Session,
    *,
    year: int,
    category_id: int | None = None,
) -> list[dict]:
    """Per-month spending by category. Excludes transfers and exclude-from-budget categories."""
    keyed = spending.by_category_and_month(db, Period.year(year))
    if category_id is not None:
        keyed = {k: v for k, v in keyed.items() if k[0] == category_id}

    # Resolve category names in one query.
    cat_ids = {k[0] for k in keyed if k[0] is not None}
    cats = (
        {c.id: c.name for c in db.query(Category).filter(Category.id.in_(cat_ids)).all()}
        if cat_ids
        else {}
    )

    # Sort by month ascending, then by largest magnitude first within a month
    # (mirrors the previous ``func.sum(amount).asc()`` — most negative first
    # is largest magnitude first because outflow amounts are negative).
    return [
        {
            "month": m,
            "category_id": cid,
            "category_name": cats.get(cid, "Uncategorized") if cid is not None else "Uncategorized",
            "total": round(float(total), 2),
        }
        for (cid, _y, m), total in sorted(keyed.items(), key=lambda kv: (kv[0][2], -kv[1]))
    ]


def get_spending_trend(
    db: Session,
    *,
    date_from: date,
    date_to: date,
) -> list[dict]:
    """Per-calendar-month actual-vs-expected totals for the spending-trend chart.

    Emits one entry per calendar month any of whose days falls in
    ``[date_from, date_to]``, in chronological order. Each entry:

      - ``month`` — "YYYY-MM"
      - ``actual`` — sum of non-transfer, non-excluded, non-pre-tax outflow
        magnitudes in that month, restricted to ``[date_from, date_to]``.
        A range that ends mid-month therefore truncates ``actual`` for that
        month while ``expected`` remains the full-month figure (expected =
        "what we planned for that month").
      - ``expected`` — sum of effective monthly budgets (override > baseline)
        across all non-pre-tax, non-excluded-from-budget categories for that
        ``(year, month)``.
    """
    # ---- 1. Enumerate every (year, month) overlapping the range ----
    if date_from > date_to:
        return []
    period = Period.range(date_from, date_to)
    months = period.months_overlapping()

    # ---- 2. Actual: per-month sum of non-transfer outflows in the range ----
    actual_by_month = spending.by_year_month(db, period, exclude_pre_tax=True)

    # ---- 3. Expected: per-month sum of effective monthly budgets ----
    # Effective = override-or-baseline. Categories with exclude_from_budget or
    # is_pre_tax don't contribute. We need budgets for every year touched.
    years_in_range = {y for (y, _m) in months}
    categories: list[Category] = (
        db.query(Category)
        .filter(Category.exclude_from_budget.is_(False))
        .filter(Category.is_pre_tax.is_(False))
        .all()
    )
    cat_ids = {c.id for c in categories}
    budgets: list[Budget] = (
        db.query(Budget)
        .filter(Budget.year.in_(years_in_range))
        .filter(Budget.category_id.in_(cat_ids))
        .all()
        if cat_ids
        else []
    )
    # Index by (category_id, year) for quick lookup.
    budget_index: dict[tuple[int, int], Budget] = {(b.category_id, b.year): b for b in budgets}

    expected_by_month: dict[tuple[int, int], Decimal] = {}
    for year, month in months:
        total = Decimal("0")
        for cat in categories:
            budget = budget_index.get((cat.id, year))
            total += BudgetTarget.with_overrides(budget).effective(year, month)
        expected_by_month[(year, month)] = total

    # ---- 4. Compose the chronological result ----
    result: list[dict] = []
    for year, month in months:
        actual = actual_by_month.get((year, month), Decimal("0"))
        expected = expected_by_month.get((year, month), Decimal("0"))
        result.append(
            {
                "month": f"{year:04d}-{month:02d}",
                "actual": float(round(actual, 2)),
                "expected": float(round(expected, 2)),
            }
        )
    return result
