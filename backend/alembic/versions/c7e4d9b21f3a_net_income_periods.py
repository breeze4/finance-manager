"""net income periods

Revision ID: c7e4d9b21f3a
Revises: 4810a336d8d4
Create Date: 2026-05-07 21:00:00.000000

Creates ``net_income_periods``: a step-function table holding one row per
"effective month" with a take-home amount. Lookups for any month ``M``
return the row with the largest ``effective_month <= M``.

``effective_month`` is encoded as integer ``YYYYMM`` (e.g. 202605 for
May 2026) — total-orderable, indexable, and unambiguous (no
day-of-month). The unique constraint enforces one row per month so the
service-level "set" operation can upsert cleanly.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c7e4d9b21f3a"
down_revision: Union[str, Sequence[str], None] = "4810a336d8d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "net_income_periods",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("effective_month", sa.Integer(), nullable=False),
        sa.Column("take_home_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("effective_month", name="uq_net_income_effective_month"),
    )
    op.create_index(
        "ix_net_income_effective_month",
        "net_income_periods",
        ["effective_month"],
    )


def downgrade() -> None:
    op.drop_index("ix_net_income_effective_month", table_name="net_income_periods")
    op.drop_table("net_income_periods")
