"""balance snapshots

Revision ID: 035a4eef4cee
Revises: a3f1c2b8d4e5
Create Date: 2026-05-07 07:59:40.149321

Creates the ``balance_snapshots`` table for the manual net-worth-snapshot
flow. The unique ``(account_id, as_of_date)`` constraint enforces "one
snapshot per account per day"; ``POST /api/snapshots/batch`` upserts via
this constraint.

NOTE: Alembic autogenerate also emits ``drop_index`` ops for the partial
unique indexes on ``coast_fire_scenarios.is_active`` and
``mortgage_scenarios.is_active`` because autogen does not understand
``CREATE UNIQUE INDEX ... WHERE`` (see step-4 handoff notes). Those drops
are hand-edited out here — the partial indexes still exist and are still
correct.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '035a4eef4cee'
down_revision: Union[str, Sequence[str], None] = 'a3f1c2b8d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'balance_snapshots',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('as_of_date', sa.Date(), nullable=False),
        sa.Column('balance', sa.Float(), nullable=False),
        sa.Column('source', sa.Enum('manual', name='snapshotsource'), nullable=False),
        sa.Column('notes', sa.String(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(),
            server_default=sa.text('(CURRENT_TIMESTAMP)'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(),
            server_default=sa.text('(CURRENT_TIMESTAMP)'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'account_id', 'as_of_date', name='uq_balance_snapshots_account_date'
        ),
    )
    with op.batch_alter_table('balance_snapshots', schema=None) as batch_op:
        batch_op.create_index(
            'ix_balance_snapshots_account_id', ['account_id'], unique=False
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('balance_snapshots', schema=None) as batch_op:
        batch_op.drop_index('ix_balance_snapshots_account_id')

    op.drop_table('balance_snapshots')
