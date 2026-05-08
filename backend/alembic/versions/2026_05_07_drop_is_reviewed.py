"""drop is_reviewed

Revision ID: 7e2c1a9d4f8b
Revises: 61d1164fa063
Create Date: 2026-05-07 18:00:00.000000

Removes the ``transactions.is_reviewed`` column. The flag was meant as an
independent "user has eyeballed this row" marker but in practice was
never given a dedicated UI; "needs attention" is now defined as
``category_id IS NULL``.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7e2c1a9d4f8b'
down_revision: Union[str, Sequence[str], None] = '61d1164fa063'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.drop_column('is_reviewed')


def downgrade() -> None:
    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                'is_reviewed',
                sa.Boolean(),
                nullable=False,
                server_default=sa.text('0'),
            )
        )
