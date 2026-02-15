from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.payment import DetectionResultResponse, PaymentMatchResponse
from app.schemas.transaction import TransactionResponse
from app.services import payment_service, transaction_service

router = APIRouter(prefix="/api/payments", tags=["payments"])


def _txn_to_response(txn) -> TransactionResponse:
    return TransactionResponse(
        id=txn.id,
        source_file=txn.source_file,
        account=txn.account,
        date=txn.date,
        post_date=txn.post_date,
        raw_description=txn.raw_description,
        vendor=txn.vendor,
        amount=txn.amount,
        source_category=txn.source_category,
        category_id=txn.category_id,
        category_name=transaction_service.get_category_name(txn),
        type=txn.type,
        is_verified=txn.is_verified,
        is_transfer=txn.is_transfer,
        is_reviewed=txn.is_reviewed,
        memo=txn.memo,
        created_at=txn.created_at,
        updated_at=txn.updated_at,
    )


def _match_to_response(match) -> PaymentMatchResponse:
    return PaymentMatchResponse(
        id=match.id,
        checking_transaction=_txn_to_response(match.checking_transaction),
        cc_transaction=_txn_to_response(match.cc_transaction),
        matched_at=match.matched_at,
    )


@router.get("", response_model=list[PaymentMatchResponse])
def list_matches(db: Session = Depends(get_db)):
    matches = payment_service.list_matches(db)
    return [_match_to_response(m) for m in matches]


@router.post("/detect", response_model=DetectionResultResponse)
def detect_payments(db: Session = Depends(get_db)):
    result = payment_service.detect_payments(db)
    return result


@router.delete("/{match_id}", status_code=204)
def unmatch(match_id: int, db: Session = Depends(get_db)):
    result = payment_service.unmatch(db, match_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Match not found")
