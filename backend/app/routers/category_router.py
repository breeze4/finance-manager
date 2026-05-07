from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, Transaction
from app.schemas.category import CategoryCreate, CategoryResponse, CategoryUpdate

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryResponse])
def list_categories(db: Session = Depends(get_db)):
    rows = (
        db.query(Category, func.count(Transaction.id).label("txn_count"))
        .outerjoin(Transaction, Transaction.category_id == Category.id)
        .group_by(Category.id)
        .order_by(Category.name)
        .all()
    )
    return [
        CategoryResponse(
            id=cat.id,
            name=cat.name,
            is_system=cat.is_system,
            transaction_count=count,
        )
        for cat, count in rows
    ]


@router.post("", response_model=CategoryResponse, status_code=201)
def create_category(body: CategoryCreate, db: Session = Depends(get_db)):
    existing = db.query(Category).filter(Category.name == body.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="Category already exists")

    cat = Category(name=body.name, is_system=False)
    db.add(cat)
    db.commit()
    db.refresh(cat)

    count = db.query(func.count(Transaction.id)).filter(Transaction.category_id == cat.id).scalar()
    return CategoryResponse(
        id=cat.id, name=cat.name, is_system=cat.is_system, transaction_count=count
    )


@router.patch("/{category_id}", response_model=CategoryResponse)
def update_category(category_id: int, body: CategoryUpdate, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if cat is None:
        raise HTTPException(status_code=404, detail="Category not found")

    # Check name uniqueness
    conflict = (
        db.query(Category).filter(Category.name == body.name, Category.id != category_id).first()
    )
    if conflict:
        raise HTTPException(status_code=409, detail="Category name already in use")

    cat.name = body.name
    db.commit()
    db.refresh(cat)

    count = db.query(func.count(Transaction.id)).filter(Transaction.category_id == cat.id).scalar()
    return CategoryResponse(
        id=cat.id, name=cat.name, is_system=cat.is_system, transaction_count=count
    )


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: int, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if cat is None:
        raise HTTPException(status_code=404, detail="Category not found")

    txn_count = (
        db.query(func.count(Transaction.id)).filter(Transaction.category_id == category_id).scalar()
    )
    if txn_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete: {txn_count} transactions reference this category",
        )

    db.delete(cat)
    db.commit()
