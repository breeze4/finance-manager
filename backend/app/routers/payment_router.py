"""HTTP layer for ``/api/payments``.

Returns a list of every positive-amount transaction on a credit-card
account, optionally narrowed by ``account_id`` and date bounds. See
``docs/specs/2026-05-08-04-payments-redesign.md`` for the design.
"""

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.payment import PaymentListItem
from app.services import payment_service

router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.get("", response_model=list[PaymentListItem])
def list_payments(
    account_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
) -> list[PaymentListItem]:
    txns = payment_service.list_cc_payments(
        db,
        account_id=account_id,
        start_date=start_date,
        end_date=end_date,
    )
    return [
        PaymentListItem(
            id=t.id,
            date=t.date,
            account_id=t.account_id,
            account_name=t.account.name if t.account is not None else "",
            vendor=t.vendor,
            amount=t.amount,
        )
        for t in txns
    ]
