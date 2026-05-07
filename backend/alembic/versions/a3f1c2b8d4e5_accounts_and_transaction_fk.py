"""accounts and transaction fk

Revision ID: a3f1c2b8d4e5
Revises: 6111fd0f67c9
Create Date: 2026-05-07 09:00:00.000000

Promotes ``transactions.account`` from a freeform string to an FK pointing
at a new ``accounts`` table. The two account strings produced by the
existing parsers ("Chase CC", "BECU Checking") are seeded directly so the
backfill step matches every existing transaction row.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3f1c2b8d4e5"
down_revision: Union[str, Sequence[str], None] = "6111fd0f67c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ACCOUNT_TYPES = (
    "checking",
    "savings",
    "credit_card",
    "brokerage",
    "retirement",
    "asset",
)


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()

    # 1. Create the accounts table with the AccountType enum constraint.
    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column(
            "type",
            sa.Enum(*ACCOUNT_TYPES, name="accounttype"),
            nullable=False,
        ),
        sa.Column("institution", sa.String(), nullable=True),
        sa.Column("is_archived", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    # 2. Seed the two known accounts that match strings emitted by the
    # current parsers. Names verified against:
    #   backend/app/parsers/chase_cc.py       -> "Chase CC"
    #   backend/app/parsers/becu_checking.py  -> "BECU Checking"
    accounts_table = sa.table(
        "accounts",
        sa.column("id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("type", sa.String),
        sa.column("institution", sa.String),
        sa.column("is_archived", sa.Boolean),
    )
    op.bulk_insert(
        accounts_table,
        [
            {
                "name": "Chase CC",
                "type": "credit_card",
                "institution": "Chase",
                "is_archived": False,
            },
            {
                "name": "BECU Checking",
                "type": "checking",
                "institution": "BECU",
                "is_archived": False,
            },
        ],
    )

    # 3. Add nullable FK column then backfill from the existing string.
    with op.batch_alter_table("transactions", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("account_id", sa.Integer(), nullable=True),
        )
        batch_op.create_foreign_key(
            "fk_transactions_account_id_accounts",
            "accounts",
            ["account_id"],
            ["id"],
        )

    op.execute(
        sa.text(
            "UPDATE transactions SET account_id = "
            "(SELECT id FROM accounts WHERE accounts.name = transactions.account)"
        )
    )

    # 4. Refuse to proceed if any transaction failed to match. This indicates
    # the database has account strings that aren't seeded — operator must
    # add the row first.
    leftovers = bind.execute(
        sa.text("SELECT COUNT(*) FROM transactions WHERE account_id IS NULL")
    ).scalar()
    if leftovers:
        unmatched = bind.execute(
            sa.text(
                "SELECT DISTINCT account FROM transactions WHERE account_id IS NULL"
            )
        ).fetchall()
        names = sorted({row[0] for row in unmatched})
        raise RuntimeError(
            f"Cannot backfill account_id for {leftovers} transaction(s); "
            f"unmatched account strings: {names}"
        )

    # 5. Lock the column down and rebuild the index against the FK.
    with op.batch_alter_table("transactions", schema=None) as batch_op:
        batch_op.alter_column("account_id", nullable=False)
        batch_op.drop_index("ix_transactions_account")
        batch_op.drop_column("account")
        batch_op.create_index(
            "ix_transactions_account_id", ["account_id"], unique=False
        )


def downgrade() -> None:
    """Downgrade schema. Best-effort: re-creates the string column from
    accounts.name and drops the FK + accounts table."""
    with op.batch_alter_table("transactions", schema=None) as batch_op:
        batch_op.add_column(sa.Column("account", sa.String(), nullable=True))

    op.execute(
        sa.text(
            "UPDATE transactions SET account = "
            "(SELECT name FROM accounts WHERE accounts.id = transactions.account_id)"
        )
    )

    with op.batch_alter_table("transactions", schema=None) as batch_op:
        batch_op.alter_column("account", nullable=False)
        batch_op.drop_index("ix_transactions_account_id")
        batch_op.drop_constraint(
            "fk_transactions_account_id_accounts", type_="foreignkey"
        )
        batch_op.drop_column("account_id")
        batch_op.create_index("ix_transactions_account", ["account"], unique=False)

    op.drop_table("accounts")
