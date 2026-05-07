"""Verifies the accounts/transactions FK Alembic migration.

Spins up a fresh sqlite database, runs every migration up to the previous
head, inserts sample transactions whose ``account`` strings match what the
existing parsers emit, then runs the new migration and asserts the FK
backfill is correct.
"""

import tempfile
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from alembic import command
from app.config import settings

PREV_REVISION = "6111fd0f67c9"  # add mortgage scenarios
NEW_REVISION = "a3f1c2b8d4e5"  # accounts and transaction fk


@pytest.fixture
def alembic_cfg(monkeypatch):
    """Yield an Alembic Config pointing at a throwaway sqlite DB.

    Monkey-patches ``app.config.settings.database_url`` because
    ``alembic/env.py`` reads from it at migration time, overwriting any
    URL we set on the Config object directly.
    """
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    db_path = Path(tmp.name)
    db_url = f"sqlite:///{db_path}"

    monkeypatch.setattr(settings, "database_url", db_url)

    cfg_path = Path(__file__).resolve().parent.parent / "alembic.ini"
    cfg = Config(str(cfg_path))
    cfg.set_main_option("sqlalchemy.url", db_url)
    try:
        yield cfg, db_url
    finally:
        db_path.unlink(missing_ok=True)


def _seed_legacy_transactions(db_url: str) -> None:
    """Insert a few transactions using the pre-FK schema."""
    engine = create_engine(db_url)
    with engine.begin() as conn:
        # Need a category row since transactions has FK to categories
        # (nullable=True so we can skip it). Insert without category_id.
        conn.execute(
            text(
                "INSERT INTO transactions "
                "(source_file, account, date, raw_description, vendor, amount, "
                "is_verified, is_transfer, is_reviewed, import_hash) VALUES "
                "(:f, :a, :d, :r, :v, :amt, 0, 0, 0, :h)"
            ),
            [
                {
                    "f": "chase.csv",
                    "a": "Chase CC",
                    "d": "2025-01-15",
                    "r": "FRED-MEYER",
                    "v": "Fred Meyer",
                    "amt": -45.67,
                    "h": "h-chase-1",
                },
                {
                    "f": "chase.csv",
                    "a": "Chase CC",
                    "d": "2025-01-16",
                    "r": "STARBUCKS",
                    "v": "Starbucks",
                    "amt": -5.50,
                    "h": "h-chase-2",
                },
                {
                    "f": "becu.csv",
                    "a": "BECU Checking",
                    "d": "2025-01-15",
                    "r": "PAYROLL",
                    "v": "Employer",
                    "amt": 3000.00,
                    "h": "h-becu-1",
                },
            ],
        )
    engine.dispose()


def test_migration_creates_accounts_and_backfills_transactions(alembic_cfg):
    cfg, db_url = alembic_cfg

    # Apply everything up to the previous head.
    command.upgrade(cfg, PREV_REVISION)

    # Seed sample data with legacy `account` string column.
    _seed_legacy_transactions(db_url)

    # Run our migration.
    command.upgrade(cfg, NEW_REVISION)

    engine = create_engine(db_url)
    insp = inspect(engine)

    # 1. accounts table exists with expected columns.
    assert "accounts" in insp.get_table_names()
    cols = {c["name"] for c in insp.get_columns("accounts")}
    assert {
        "id",
        "name",
        "type",
        "institution",
        "is_archived",
        "created_at",
        "updated_at",
    }.issubset(cols)

    # 2. Two seeded rows exist with the corrected names.
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT name, type, institution FROM accounts ORDER BY name")
        ).fetchall()
        assert rows == [
            ("BECU Checking", "checking", "BECU"),
            ("Chase CC", "credit_card", "Chase"),
        ]

        # 3. transactions.account_id is non-null and matches by string.
        txns = conn.execute(
            text(
                "SELECT t.import_hash, a.name FROM transactions t "
                "JOIN accounts a ON a.id = t.account_id ORDER BY t.import_hash"
            )
        ).fetchall()
        assert txns == [
            ("h-becu-1", "BECU Checking"),
            ("h-chase-1", "Chase CC"),
            ("h-chase-2", "Chase CC"),
        ]

        nulls = conn.execute(
            text("SELECT COUNT(*) FROM transactions WHERE account_id IS NULL")
        ).scalar()
        assert nulls == 0

        # 4. old `account` column has been dropped.
        cols_now = {c["name"] for c in insp.get_columns("transactions")}

    assert "account" not in cols_now
    assert "account_id" in cols_now

    # 5. ix_transactions_account_id index exists.
    idx_names = {ix["name"] for ix in insp.get_indexes("transactions")}
    assert "ix_transactions_account_id" in idx_names
    assert "ix_transactions_account" not in idx_names

    engine.dispose()


def test_migration_aborts_on_unmapped_account_string(alembic_cfg):
    """If a stray account string can't be matched, the migration must raise
    rather than insert NULL."""
    cfg, db_url = alembic_cfg

    command.upgrade(cfg, PREV_REVISION)

    # Seed a row with an unrecognised account string.
    engine = create_engine(db_url)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO transactions "
                "(source_file, account, date, raw_description, vendor, amount, "
                "is_verified, is_transfer, is_reviewed, import_hash) VALUES "
                "('x.csv', 'Mystery Account', '2025-01-01', 'r', 'v', "
                "-1.0, 0, 0, 0, 'mystery-1')"
            )
        )
    engine.dispose()

    with pytest.raises(RuntimeError, match="unmatched account strings"):
        command.upgrade(cfg, NEW_REVISION)
