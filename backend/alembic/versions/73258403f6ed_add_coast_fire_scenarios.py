"""add coast fire scenarios

Revision ID: 73258403f6ed
Revises: 9650d330fb7a
Create Date: 2026-05-06 20:55:57.150158

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '73258403f6ed'
down_revision: Union[str, Sequence[str], None] = '9650d330fb7a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('coast_fire_scenarios',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('current_age', sa.Float(), nullable=False),
    sa.Column('retirement_age', sa.Float(), nullable=False),
    sa.Column('current_savings', sa.Float(), nullable=False),
    sa.Column('expected_return_rate', sa.Float(), nullable=False),
    sa.Column('target_retirement_amount', sa.Float(), nullable=False),
    sa.Column('monthly_expenses', sa.Float(), nullable=False),
    sa.Column('yearly_expenses', sa.Float(), nullable=False),
    sa.Column('withdrawal_rate', sa.Float(), nullable=False),
    sa.Column('inflation_rate', sa.Float(), nullable=False),
    sa.Column('use_real_returns', sa.Boolean(), nullable=False),
    sa.Column('last_edited_field', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )

    # Partial unique index: at most one row may have is_active = true.
    # SQLite stores booleans as 0/1; Postgres uses true/false. The matching
    # `Index(...)` declaration in the model's `__table_args__` is what keeps
    # autogenerate from proposing to drop this index on every subsequent run.
    op.create_index(
        "ix_coast_fire_scenarios_is_active",
        "coast_fire_scenarios",
        ["is_active"],
        unique=True,
        sqlite_where=sa.text("is_active = 1"),
        postgresql_where=sa.text("is_active = true"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_coast_fire_scenarios_is_active", table_name="coast_fire_scenarios")
    op.drop_table('coast_fire_scenarios')
