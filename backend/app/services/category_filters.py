"""Reusable filter expressions for category-based exclusion from spending analysis.

`Category.exclude_from_budget` is a category-level companion to the per-row
`Transaction.is_transfer` flag: when set, every transaction in that category is
treated as "not real spending" and dropped from budget actuals, historical
analysis, stats, forecasts, and subscription detection.

Use `not_excluded_from_budget()` next to `Transaction.is_transfer.is_(False)` at
each spending-analysis call site. Uncategorized transactions
(`category_id IS NULL`) pass through.
"""

from sqlalchemy import or_, select
from sqlalchemy.sql.elements import ColumnElement

from app.models import Category, Transaction


def not_excluded_from_budget() -> ColumnElement[bool]:
    excluded = select(Category.id).where(Category.exclude_from_budget.is_(True))
    return or_(
        Transaction.category_id.is_(None),
        Transaction.category_id.notin_(excluded),
    )
