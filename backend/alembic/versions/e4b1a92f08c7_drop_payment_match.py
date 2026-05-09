"""drop payment_matches table

Revision ID: e4b1a92f08c7
Revises: d3e91a4f7c52
Create Date: 2026-05-09 09:00:00.000000

Drops the ``payment_matches`` table and removes the associated
auto-matcher / detect endpoint from the application. The credit-card
account is now the source of truth for payment activity (see
``docs/specs/2026-05-08-04-payments-redesign.md``).

The migration is intentionally schema-only: existing
``transactions.is_transfer`` flags from previously-matched payment pairs
are preserved untouched so historical spending stats stay consistent.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e4b1a92f08c7'
down_revision: Union[str, Sequence[str], None] = 'd3e91a4f7c52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table('payment_matches')


def downgrade() -> None:
    op.create_table(
        'payment_matches',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('checking_transaction_id', sa.Integer(), nullable=False),
        sa.Column('cc_transaction_id', sa.Integer(), nullable=False),
        sa.Column(
            'matched_at',
            sa.DateTime(),
            server_default=sa.text('(CURRENT_TIMESTAMP)'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['cc_transaction_id'], ['transactions.id']),
        sa.ForeignKeyConstraint(['checking_transaction_id'], ['transactions.id']),
        sa.PrimaryKeyConstraint('id'),
    )
