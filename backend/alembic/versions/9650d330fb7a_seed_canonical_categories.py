"""seed canonical categories

Revision ID: 9650d330fb7a
Revises: b762a8a2c851
Create Date: 2026-02-13 23:23:13.741681

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9650d330fb7a'
down_revision: Union[str, Sequence[str], None] = 'b762a8a2c851'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CATEGORIES = [
    "Shopping",
    "Groceries",
    "Dining",
    "Health & Wellness",
    "Entertainment",
    "Bills & Utilities",
    "Travel",
    "Gas",
    "Education",
    "Personal",
    "Home",
    "Gifts & Donations",
    "Income",
    "Investments",
    "Transfers",
    "Uncategorized",
]


def upgrade() -> None:
    categories_table = sa.table(
        "categories",
        sa.column("name", sa.String),
        sa.column("is_system", sa.Boolean),
    )
    op.bulk_insert(
        categories_table,
        [{"name": name, "is_system": True} for name in CATEGORIES],
    )


def downgrade() -> None:
    op.execute(
        sa.text("DELETE FROM categories WHERE is_system = 1")
    )
