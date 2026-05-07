"""Balance snapshot service.

Two responsibilities:

* :func:`upsert_batch` validates and writes a batch of ``BalanceSnapshot``
  rows for a single ``as_of_date``. Same-day re-entry overwrites prior values
  via the unique ``(account_id, as_of_date)`` constraint.
* :func:`get_latest_balances` returns one row per non-archived account with
  the most recent snapshot's balance + date (or ``None`` if no snapshots
  exist for that account yet).
"""

from datetime import date

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session, aliased

from app.models import Account, BalanceSnapshot
from app.schemas.balance_snapshot import LatestBalanceResponse, SnapshotBatchEntry


def upsert_batch(db: Session, as_of_date: date, entries: list[SnapshotBatchEntry]) -> int:
    """Upsert balance snapshots for ``as_of_date``.

    Entries with ``balance is None`` are skipped (treated as "user left the
    field blank"). Validation errors (unknown account, archived account,
    negative balance) raise ``HTTPException(400)``.

    Returns the number of rows written (one per non-skipped entry).
    """
    written = 0
    for entry in entries:
        if entry.balance is None:
            continue

        account = db.query(Account).filter(Account.id == entry.account_id).first()
        if account is None:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown account_id: {entry.account_id}",
            )
        if account.is_archived:
            raise HTTPException(
                status_code=400,
                detail=f"Account '{account.name}' is archived",
            )
        if entry.balance < 0:
            raise HTTPException(
                status_code=400,
                detail=(f"Balance for account '{account.name}' must be >= 0; got {entry.balance}"),
            )

        stmt = (
            sqlite_insert(BalanceSnapshot)
            .values(
                account_id=entry.account_id,
                as_of_date=as_of_date,
                balance=entry.balance,
                source="manual",
                notes=entry.notes,
            )
            .on_conflict_do_update(
                index_elements=["account_id", "as_of_date"],
                set_={
                    "balance": entry.balance,
                    "source": "manual",
                    "notes": entry.notes,
                    "updated_at": func.now(),
                },
            )
        )
        db.execute(stmt)
        written += 1

    db.commit()
    return written


def get_latest_balances(db: Session) -> list[LatestBalanceResponse]:
    """Return latest balance per non-archived account, ordered by name.

    Accounts with no snapshots are still listed with ``balance=None`` and
    ``as_of_date=None``.
    """
    latest_dates = (
        db.query(
            BalanceSnapshot.account_id.label("account_id"),
            func.max(BalanceSnapshot.as_of_date).label("max_date"),
        )
        .group_by(BalanceSnapshot.account_id)
        .subquery()
    )
    snap = aliased(BalanceSnapshot)

    rows = (
        db.query(
            Account.id,
            Account.name,
            Account.type,
            snap.balance,
            snap.as_of_date,
        )
        .outerjoin(latest_dates, latest_dates.c.account_id == Account.id)
        .outerjoin(
            snap,
            (snap.account_id == Account.id) & (snap.as_of_date == latest_dates.c.max_date),
        )
        .filter(Account.is_archived.is_(False))
        .order_by(Account.name)
        .all()
    )

    return [
        LatestBalanceResponse(
            account_id=acct_id,
            account_name=name,
            account_type=type_,
            balance=balance,
            as_of_date=as_of,
        )
        for acct_id, name, type_, balance, as_of in rows
    ]
