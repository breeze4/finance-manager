"""add mortgage scenarios

Revision ID: 6111fd0f67c9
Revises: 73258403f6ed
Create Date: 2026-05-07 07:25:03.544946

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6111fd0f67c9'
down_revision: Union[str, Sequence[str], None] = '73258403f6ed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('mortgage_scenarios',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('principal', sa.Float(), nullable=False),
    sa.Column('years_left', sa.Float(), nullable=False),
    sa.Column('interest_rate', sa.Float(), nullable=False),
    sa.Column('monthly_payment', sa.Float(), nullable=False),
    sa.Column('additional_monthly_payment', sa.Float(), nullable=False),
    sa.Column('lump_sum_payment', sa.Float(), nullable=False),
    sa.Column('investment_return_rate', sa.Float(), nullable=False),
    sa.Column('investment_tax_rate', sa.Float(), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )

    # Partial unique index: at most one row may have is_active = true.
    # The matching `Index(...)` declaration in the model's `__table_args__`
    # is what keeps autogenerate from proposing to drop this index on every
    # subsequent run.
    op.create_index(
        "ix_mortgage_scenarios_is_active",
        "mortgage_scenarios",
        ["is_active"],
        unique=True,
        sqlite_where=sa.text("is_active = 1"),
        postgresql_where=sa.text("is_active = true"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_mortgage_scenarios_is_active", table_name="mortgage_scenarios")
    op.drop_table('mortgage_scenarios')
