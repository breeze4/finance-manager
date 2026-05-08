from datetime import date

from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app.models import Category, Transaction
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
