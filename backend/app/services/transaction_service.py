from datetime import date

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import Transaction


def list_transactions(
    db: Session,
    *,
    account_id: int | None = None,
    category_id: int | None = None,
    vendor: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    amount_min: float | None = None,
    amount_max: float | None = None,
    is_verified: bool | None = None,
    is_uncategorized: bool | None = None,
    is_transfer: bool | None = None,
    search: str | None = None,
    sort_by: str = "date",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[Transaction], int]:
    """List transactions with filtering, sorting, and pagination.

    Returns (items, total_count).
    """
    query = db.query(Transaction)

    if account_id is not None:
        query = query.filter(Transaction.account_id == account_id)
    if category_id is not None:
        query = query.filter(Transaction.category_id == category_id)
    if vendor is not None:
        query = query.filter(Transaction.vendor.ilike(f"%{vendor}%"))
    if date_from is not None:
        query = query.filter(Transaction.date >= date_from)
    if date_to is not None:
        query = query.filter(Transaction.date <= date_to)
    if amount_min is not None:
        query = query.filter(Transaction.amount >= amount_min)
    if amount_max is not None:
        query = query.filter(Transaction.amount <= amount_max)
    if is_verified is not None:
        query = query.filter(Transaction.is_verified == is_verified)
    if is_uncategorized is not None:
        if is_uncategorized:
            query = query.filter(Transaction.category_id.is_(None))
        else:
            query = query.filter(Transaction.category_id.is_not(None))
    if is_transfer is not None:
        query = query.filter(Transaction.is_transfer == is_transfer)
    if search is not None:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Transaction.vendor.ilike(pattern),
                Transaction.raw_description.ilike(pattern),
            )
        )

    total = query.count()

    # Sorting
    allowed_sort_columns = {
        "date": Transaction.date,
        "amount": Transaction.amount,
        "vendor": Transaction.vendor,
        "category_id": Transaction.category_id,
        "account_id": Transaction.account_id,
    }
    sort_col = allowed_sort_columns.get(sort_by, Transaction.date)
    if sort_dir == "asc":
        query = query.order_by(sort_col.asc())
    else:
        query = query.order_by(sort_col.desc())

    # Secondary sort by id for stable ordering
    query = query.order_by(Transaction.id.desc())

    # Pagination
    offset = (page - 1) * page_size
    items = query.offset(offset).limit(page_size).all()

    return items, total


def get_transaction(db: Session, transaction_id: int) -> Transaction | None:
    return db.query(Transaction).filter(Transaction.id == transaction_id).first()


def update_transaction(
    db: Session,
    transaction_id: int,
    *,
    category_id: int | None = ...,
    is_verified: bool | None = ...,
    vendor: str | None = ...,
    memo: str | None = ...,
) -> Transaction | None:
    """Update a transaction's mutable fields. Sentinel ... means 'not provided'."""
    txn = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if txn is None:
        return None

    if category_id is not ...:
        txn.category_id = category_id
    if is_verified is not ...:
        txn.is_verified = is_verified
    if vendor is not ...:
        txn.vendor = vendor
    if memo is not ...:
        txn.memo = memo

    db.commit()
    db.refresh(txn)
    return txn


def bulk_update_transactions(
    db: Session,
    ids: list[int],
    *,
    category_id: int | None = ...,
    is_verified: bool | None = ...,
) -> int:
    """Bulk update transactions. Returns count of updated rows."""
    query = db.query(Transaction).filter(Transaction.id.in_(ids))

    updates = {}
    if category_id is not ...:
        updates["category_id"] = category_id
    if is_verified is not ...:
        updates["is_verified"] = is_verified

    if not updates:
        return 0

    count = query.update(updates, synchronize_session="fetch")
    db.commit()
    return count


def get_category_name(txn: Transaction) -> str | None:
    """Get category name from a transaction's relationship."""
    if txn.category:
        return txn.category.name
    return None
