from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, Transaction
from app.schemas.forecast import (
    ForecastResponse,
    MethodsResponse,
    YoYEntryResponse,
)
from app.services.category_filters import not_excluded_from_budget
from app.services.forecast.registry import available_methods, get_forecaster

router = APIRouter(prefix="/api/forecast", tags=["forecast"])


@router.get("/methods", response_model=MethodsResponse)
def list_methods():
    return MethodsResponse(methods=available_methods())


@router.get("/yoy", response_model=list[YoYEntryResponse])
def year_over_year(db: Session = Depends(get_db)):
    """Per-category annual spending totals by year."""
    rows = (
        db.query(Transaction)
        .filter(
            Transaction.is_transfer.is_(False),
            not_excluded_from_budget(),
            Transaction.amount < 0,
        )
        .join(Category, Transaction.category_id == Category.id, isouter=True)
        .with_entities(
            Transaction.category_id,
            func.coalesce(Category.name, "Uncategorized").label("category_name"),
            extract("year", Transaction.date).label("yr"),
            func.sum(Transaction.amount).label("total"),
        )
        .group_by(
            Transaction.category_id,
            extract("year", Transaction.date),
        )
        .all()
    )

    # Group by category.
    cat_years: dict[tuple[int | None, str], dict[int, float]] = defaultdict(dict)
    for row in rows:
        key = (row.category_id, row.category_name)
        cat_years[key][int(row.yr)] = round(abs(row.total), 2)

    results = []
    for (cat_id, cat_name), annual_totals in cat_years.items():
        results.append(
            YoYEntryResponse(
                category_id=cat_id,
                category_name=cat_name,
                annual_totals=annual_totals,
            )
        )

    # Sort by highest total across all years.
    results.sort(
        key=lambda r: sum(r.annual_totals.values()),
        reverse=True,
    )
    return results


@router.get("/{year}", response_model=ForecastResponse)
def get_forecast(
    year: int,
    method: str = Query("simple"),
    db: Session = Depends(get_db),
):
    forecaster = get_forecaster(method)
    result = forecaster.forecast(db, year)
    return result
