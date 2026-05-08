"""seed csp buckets

Revision ID: 4810a336d8d4
Revises: 3a85869c7289
Create Date: 2026-05-07 20:00:00.000000

Seeds ``csp_bucket`` on the canonical system categories per the
Conscious Spending Plan defaults the user approved in the Step 1 review.

Categories whose bucket should remain NULL — Income, Transfers, and
Uncategorized — are deliberately not touched. Their column was added
nullable with no default by the previous schema migration, so they
already hold NULL and stay that way.

``is_pre_tax`` is left at False for every existing category. The schema
migration's ``server_default='0'`` already covers that, so no UPDATE is
required.

Match is by ``name`` (not id) so the migration is idempotent against any
environment seeded by ``9650d330fb7a_seed_canonical_categories``.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4810a336d8d4'
down_revision: Union[str, Sequence[str], None] = '3a85869c7289'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Approved bucket assignments. Categories absent from this list keep
# csp_bucket = NULL (Income, Transfers, Uncategorized).
BUCKET_ASSIGNMENTS: list[tuple[str, str]] = [
    ("Investments", "investments"),
    ("Bills & Utilities", "fixed"),
    ("Gas", "fixed"),
    ("Groceries", "fixed"),
    ("Home", "fixed"),
    ("Health & Wellness", "fixed"),
    ("Education", "fixed"),
    ("Gifts & Donations", "savings"),
    ("Dining", "guilt_free"),
    ("Entertainment", "guilt_free"),
    ("Shopping", "guilt_free"),
    ("Travel", "guilt_free"),
    ("Personal", "guilt_free"),
]


def upgrade() -> None:
    stmt = sa.text(
        "UPDATE categories SET csp_bucket = :bucket WHERE name = :name"
    )
    for name, bucket in BUCKET_ASSIGNMENTS:
        op.execute(stmt.bindparams(bucket=bucket, name=name))


def downgrade() -> None:
    stmt = sa.text(
        "UPDATE categories SET csp_bucket = NULL WHERE name = :name"
    )
    for name, _bucket in BUCKET_ASSIGNMENTS:
        op.execute(stmt.bindparams(name=name))
