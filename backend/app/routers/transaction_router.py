from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Transaction
from app.schemas.transaction import (
    BulkUpdateRequest,
    PaginatedTransactions,
    TransactionResponse,
    TransactionUpdate,
)
from app.services import classification_service, transaction_service

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


def _txn_to_response(txn) -> TransactionResponse:
    return TransactionResponse(
        id=txn.id,
        source_file=txn.source_file,
        account_id=txn.account_id,
        account_name=txn.account.name if txn.account is not None else "",
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


@router.get("", response_model=PaginatedTransactions)
def list_transactions(
    account_id: int | None = None,
    category_id: int | None = None,
    vendor: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    amount_min: float | None = None,
    amount_max: float | None = None,
    is_verified: bool | None = None,
    is_reviewed: bool | None = None,
    is_transfer: bool | None = None,
    search: str | None = None,
    sort_by: str = "date",
    sort_dir: str = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    items, total = transaction_service.list_transactions(
        db,
        account_id=account_id,
        category_id=category_id,
        vendor=vendor,
        date_from=date_from,
        date_to=date_to,
        amount_min=amount_min,
        amount_max=amount_max,
        is_verified=is_verified,
        is_reviewed=is_reviewed,
        is_transfer=is_transfer,
        search=search,
        sort_by=sort_by,
        sort_dir=sort_dir,
        page=page,
        page_size=page_size,
    )
    return PaginatedTransactions(
        items=[_txn_to_response(t) for t in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{transaction_id}", response_model=TransactionResponse)
def get_transaction(transaction_id: int, db: Session = Depends(get_db)):
    txn = transaction_service.get_transaction(db, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return _txn_to_response(txn)


@router.patch("/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int,
    body: TransactionUpdate,
    db: Session = Depends(get_db),
):
    kwargs = {}
    if body.category_id is not None:
        kwargs["category_id"] = body.category_id
    if body.is_verified is not None:
        kwargs["is_verified"] = body.is_verified
    if body.is_reviewed is not None:
        kwargs["is_reviewed"] = body.is_reviewed
    if body.vendor is not None:
        kwargs["vendor"] = body.vendor
    if body.memo is not None:
        kwargs["memo"] = body.memo

    if not kwargs:
        raise HTTPException(status_code=400, detail="No fields to update")

    txn = transaction_service.update_transaction(db, transaction_id, **kwargs)
    if txn is None:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Auto-create classification rule when category changes
    if body.category_id is not None:
        classification_service.auto_create_rule(db, txn.vendor, body.category_id)
        db.commit()

    return _txn_to_response(txn)


@router.post("/bulk-update")
def bulk_update_transactions(body: BulkUpdateRequest, db: Session = Depends(get_db)):
    if not body.ids:
        raise HTTPException(status_code=400, detail="No transaction IDs provided")

    kwargs = {}
    if body.category_id is not None:
        kwargs["category_id"] = body.category_id
    if body.is_verified is not None:
        kwargs["is_verified"] = body.is_verified
    if body.is_reviewed is not None:
        kwargs["is_reviewed"] = body.is_reviewed

    if not kwargs:
        raise HTTPException(status_code=400, detail="No fields to update")

    count = transaction_service.bulk_update_transactions(db, body.ids, **kwargs)

    # Auto-create rules per vendor when category is set via bulk update
    if body.category_id is not None:
        txns = db.query(Transaction).filter(Transaction.id.in_(body.ids)).all()
        seen_vendors: set[str] = set()
        for txn in txns:
            vendor_lower = txn.vendor.lower()
            if vendor_lower not in seen_vendors:
                seen_vendors.add(vendor_lower)
                classification_service.auto_create_rule(db, txn.vendor, body.category_id)
        # Also mark all as verified
        db.query(Transaction).filter(Transaction.id.in_(body.ids)).update(
            {"is_verified": True}, synchronize_session="fetch"
        )
        db.commit()

    return {"updated": count}
