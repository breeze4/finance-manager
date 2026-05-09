"""Payments service.

The credit-card account is the source of truth for payment activity:
every positive-amount transaction on an account of type ``credit_card``
is treated as money flowing back into the card (payment, refund, credit).
Users classify checking-side debits manually via the existing
transactions UI; no auto-matching runs at import time.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session, joinedload

from app.models import Account, Transaction


def list_cc_payments(
    db: Session,
    *,
    account_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[Transaction]:
    """List positive-amount transactions on credit-card accounts.

    Joined to ``accounts`` and filtered to ``accounts.type = 'credit_card'``
    AND ``transactions.amount > 0``. Optional ``account_id`` narrows to a
    single CC; absent means "All CCs". Optional ``start_date`` / ``end_date``
    are inclusive bounds on ``transactions.date``. Sorted by ``date DESC,
    id DESC``.
    """
    query = (
        db.query(Transaction)
        .join(Account, Transaction.account_id == Account.id)
        .options(joinedload(Transaction.account))
        .filter(Account.type == "credit_card")
        .filter(Transaction.amount > 0)
    )
    if account_id is not None:
        query = query.filter(Transaction.account_id == account_id)
    if start_date is not None:
        query = query.filter(Transaction.date >= start_date)
    if end_date is not None:
        query = query.filter(Transaction.date <= end_date)
    return query.order_by(Transaction.date.desc(), Transaction.id.desc()).all()
