from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Account, Transaction
from app.schemas.account import AccountCreate, AccountResponse, AccountUpdate

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountResponse])
def list_accounts(include_archived: bool = False, db: Session = Depends(get_db)):
    query = db.query(Account)
    if not include_archived:
        query = query.filter(Account.is_archived.is_(False))
    return query.order_by(Account.name).all()


@router.post("", response_model=AccountResponse, status_code=201)
def create_account(body: AccountCreate, db: Session = Depends(get_db)):
    existing = db.query(Account).filter(Account.name == body.name).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Account name already exists")

    account = Account(
        name=body.name,
        type=body.type.value,
        institution=body.institution,
        is_archived=False,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.patch("/{account_id}", response_model=AccountResponse)
def update_account(account_id: int, body: AccountUpdate, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    if body.name is not None:
        conflict = (
            db.query(Account).filter(Account.name == body.name, Account.id != account_id).first()
        )
        if conflict is not None:
            raise HTTPException(status_code=409, detail="Account name already in use")
        account.name = body.name
    if body.type is not None:
        account.type = body.type.value
    if body.institution is not None:
        account.institution = body.institution

    db.commit()
    db.refresh(account)
    return account


@router.post("/{account_id}/archive", status_code=204)
def archive_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    account.is_archived = True
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    referenced = db.query(Transaction.id).filter(Transaction.account_id == account_id).first()
    if referenced is not None:
        raise HTTPException(
            status_code=409,
            detail="account has linked transactions; archive instead",
        )

    db.delete(account)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
