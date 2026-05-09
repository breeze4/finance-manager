"""exclude transfers category from budget

Revision ID: d3e91a4f7c52
Revises: c7e4d9b21f3a
Create Date: 2026-05-08 20:10:00.000000

Sets ``exclude_from_budget = true`` on the seeded ``Transfers`` category.
Transactions categorized as Transfers but missing the row-level
``is_transfer`` flag (e.g. brokerage buys, account-to-account moves
imported without the flag) were leaking through the structural filter
into historical-analysis stats. Marking the category itself as
budget-excluded closes the leak at the SQL level via
``not_excluded_from_budget()``.

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'd3e91a4f7c52'
down_revision: Union[str, Sequence[str], None] = 'c7e4d9b21f3a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE categories SET exclude_from_budget = 1 "
        "WHERE name = 'Transfers' AND is_system = 1"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE categories SET exclude_from_budget = 0 "
        "WHERE name = 'Transfers' AND is_system = 1"
    )
