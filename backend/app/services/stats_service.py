from datetime import date
from decimal import Decimal

from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app.models import Budget, Category, Transaction
from app.services.category_filters import not_excluded_from_budget


def get_summary(
    db: Session,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    """Compute spending summary. Excludes transfers and exclude-from-budget categories."""
    base = db.query(Transaction).filter(
        Transaction.is_transfer.is_(False),
        not_excluded_from_budget(),
    )

    if date_from is not None:
        base = base.filter(Transaction.date >= date_from)
    if date_to is not None:
        base = base.filter(Transaction.date <= date_to)

    # Total spending (negative amounts = outflow)
    spending_result = (
        base.filter(Transaction.amount < 0)
        .with_entities(func.coalesce(func.sum(Transaction.amount), 0.0))
        .scalar()
    )
    total_spending = abs(spending_result)

    # Total income (positive amounts = inflow)
    income_result = (
        base.filter(Transaction.amount > 0)
        .with_entities(func.coalesce(func.sum(Transaction.amount), 0.0))
        .scalar()
    )
    total_income = float(income_result)

    # Savings rate
    savings_rate = 0.0
    if total_income > 0:
        savings_rate = (total_income - total_spending) / total_income

    # Transaction count
    transaction_count = base.count()

    # Top categories by spending (top 10, negative amounts only)
    category_rows = (
        base.filter(Transaction.amount < 0)
        .join(Category, Transaction.category_id == Category.id, isouter=True)
        .with_entities(
            Transaction.category_id,
            func.coalesce(Category.name, "Uncategorized").label("category_name"),
            func.sum(Transaction.amount).label("total"),
        )
        .group_by(Transaction.category_id)
        .order_by(func.sum(Transaction.amount).asc())  # most negative first
        .limit(10)
        .all()
    )

    top_categories = []
    for row in category_rows:
        cat_total = abs(row.total)
        pct = (cat_total / total_spending * 100) if total_spending > 0 else 0.0
        top_categories.append(
            {
                "category_id": row.category_id,
                "category_name": row.category_name,
                "total": cat_total,
                "percentage": round(pct, 1),
            }
        )

    return {
        "total_spending": round(total_spending, 2),
        "total_income": round(total_income, 2),
        "savings_rate": round(savings_rate, 4),
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
    base = db.query(Transaction).filter(
        Transaction.is_transfer.is_(False),
        not_excluded_from_budget(),
        Transaction.amount < 0,
        extract("year", Transaction.date) == year,
    )

    if category_id is not None:
        base = base.filter(Transaction.category_id == category_id)

    rows = (
        base.join(Category, Transaction.category_id == Category.id, isouter=True)
        .with_entities(
            extract("month", Transaction.date).label("month"),
            Transaction.category_id,
            func.coalesce(Category.name, "Uncategorized").label("category_name"),
            func.sum(Transaction.amount).label("total"),
        )
        .group_by(
            extract("month", Transaction.date),
            Transaction.category_id,
        )
        .order_by(
            extract("month", Transaction.date),
            func.sum(Transaction.amount).asc(),
        )
        .all()
    )

    return [
        {
            "month": int(row.month),
            "category_id": row.category_id,
            "category_name": row.category_name,
            "total": round(abs(row.total), 2),
        }
        for row in rows
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

    Mirrors the SQLAlchemy patterns of ``get_monthly_stats`` for the actual
    side and the inline override-or-baseline lookup used by ``pace_service``
    for the expected side. Step 5's range picker reuses this with arbitrary
    ranges.
    """
    # ---- 1. Enumerate every (year, month) overlapping the range ----
    months: list[tuple[int, int]] = []
    if date_from <= date_to:
        y, m = date_from.year, date_from.month
        end_y, end_m = date_to.year, date_to.month
        while (y, m) <= (end_y, end_m):
            months.append((y, m))
            if m == 12:
                y, m = y + 1, 1
            else:
                m += 1

    if not months:
        return []

    # ---- 2. Actual: per-month sum of non-transfer outflows in the range ----
    # Pre-tax categories are excluded by filtering on Category.is_pre_tax.
    # We left-outer join Category so uncategorized rows (category_id IS NULL)
    # naturally fall through (Category.is_pre_tax IS NULL → not True → kept).
    rows = (
        db.query(Transaction)
        .filter(
            Transaction.is_transfer.is_(False),
            not_excluded_from_budget(),
            Transaction.amount < 0,
            Transaction.date >= date_from,
            Transaction.date <= date_to,
        )
        .join(Category, Transaction.category_id == Category.id, isouter=True)
        .filter(
            # Keep uncategorized (Category.is_pre_tax IS NULL) and non-pre-tax.
            (Category.is_pre_tax.is_(False)) | (Category.id.is_(None))
        )
        .with_entities(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            func.sum(Transaction.amount).label("total"),
        )
        .group_by(
            extract("year", Transaction.date),
            extract("month", Transaction.date),
        )
        .all()
    )
    actual_by_month: dict[tuple[int, int], Decimal] = {}
    for row in rows:
        key = (int(row.year), int(row.month))
        if row.total is None:
            actual_by_month[key] = Decimal("0")
        else:
            actual_by_month[key] = abs(Decimal(str(row.total)))

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
            total += _effective_monthly_budget(budget, month)
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


def _effective_monthly_budget(budget: Budget | None, month: int) -> Decimal:
    """Return ``override-or-baseline`` for the given month.

    Duplicated from ``pace_service._effective_budget`` (private over there)
    to keep ``budget_service`` must-not-touch and avoid an awkward cross-
    service import for a 2-line lookup. Same semantics.
    """
    if budget is None:
        return Decimal("0")
    for override in budget.monthly_overrides:
        if override.month == month:
            return Decimal(str(override.amount))
    return Decimal(str(budget.monthly_amount))
