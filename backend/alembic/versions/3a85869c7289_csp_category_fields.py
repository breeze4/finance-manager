"""csp category fields

Revision ID: 3a85869c7289
Revises: 7e2c1a9d4f8b
Create Date: 2026-05-07 19:00:00.000000

Adds the Conscious Spending Plan fields to ``categories``:

- ``csp_bucket``: nullable string holding one of ``fixed``, ``investments``,
  ``savings``, or ``guilt_free``. NULL for income/transfer/excluded
  categories; non-NULL for every spending category once seeded.
- ``is_pre_tax``: boolean flag for categories whose dollars come out of
  paychecks before deposit (e.g. 401(k), employer health premium). Used
  later to compute net vs gross income and to keep pre-tax actuals out of
  bank-side actual-vs-budget comparisons.

This migration only changes the schema. Bucket assignments for existing
rows are seeded by a separate data migration after the user reviews the
proposed mappings.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3a85869c7289'
down_revision: Union[str, Sequence[str], None] = '7e2c1a9d4f8b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('csp_bucket', sa.String(), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                'is_pre_tax',
                sa.Boolean(),
                nullable=False,
                server_default=sa.text('0'),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.drop_column('is_pre_tax')
        batch_op.drop_column('csp_bucket')
