"""category exclude_from_budget

Revision ID: 61d1164fa063
Revises: 035a4eef4cee
Create Date: 2026-05-07 16:00:00.000000

Adds the ``exclude_from_budget`` flag to ``categories``. When set, every
transaction in that category is filtered out of budget actuals,
historical analysis, spending stats, forecasts, and subscription
detection — same call sites that filter ``transactions.is_transfer``.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '61d1164fa063'
down_revision: Union[str, Sequence[str], None] = '035a4eef4cee'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                'exclude_from_budget',
                sa.Boolean(),
                nullable=False,
                server_default=sa.text('0'),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.drop_column('exclude_from_budget')
