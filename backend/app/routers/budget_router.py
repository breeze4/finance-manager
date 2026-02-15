from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.budget import (
    ActualVsBudgetResponse,
    BudgetResponse,
    BudgetSetRequest,
    BudgetSuggestionResponse,
    CategoryHistoricalStatsResponse,
    MonthlyOverrideRequest,
    MonthlyOverrideResponse,
)
from app.services import budget_service

router = APIRouter(prefix="/api/budget", tags=["budget"])


def _budget_to_response(b) -> BudgetResponse:
    return BudgetResponse(
        id=b.id,
        category_id=b.category_id,
        category_name=b.category.name if b.category else None,
        year=b.year,
        monthly_amount=b.monthly_amount,
        rollover_mode=b.rollover_mode,
        monthly_overrides=[
            MonthlyOverrideResponse(month=o.month, amount=o.amount)
            for o in b.monthly_overrides
        ],
        created_at=b.created_at,
        updated_at=b.updated_at,
    )


@router.get("/historical", response_model=list[CategoryHistoricalStatsResponse])
def get_historical_analysis(
    year: int | None = Query(None),
    db: Session = Depends(get_db),
):
    stats = budget_service.get_historical_analysis(db, year=year)
    return [
        CategoryHistoricalStatsResponse(
            category_id=s.category_id,
            category_name=s.category_name,
            monthly_average=s.monthly_average,
            monthly_median=s.monthly_median,
            monthly_min=s.monthly_min,
            monthly_max=s.monthly_max,
            std_dev=s.std_dev,
            coefficient_of_variation=s.coefficient_of_variation,
            confidence_interval_low=s.confidence_interval_low,
            confidence_interval_high=s.confidence_interval_high,
            trend=s.trend,
            seasonal_months=s.seasonal_months,
            months_of_data=s.months_of_data,
            monthly_totals=s.monthly_totals,
        )
        for s in stats
    ]


@router.get("", response_model=list[BudgetResponse])
def list_budgets(
    year: int = Query(...),
    db: Session = Depends(get_db),
):
    budgets = budget_service.list_budgets(db, year=year)
    return [_budget_to_response(b) for b in budgets]


@router.put("/{category_id}/{year}", response_model=BudgetResponse)
def set_budget(
    category_id: int,
    year: int,
    body: BudgetSetRequest,
    db: Session = Depends(get_db),
):
    budget = budget_service.set_budget(
        db,
        category_id=category_id,
        year=year,
        monthly_amount=body.monthly_amount,
        rollover_mode=body.rollover_mode,
    )
    # Re-fetch with relationships loaded.
    budgets = budget_service.list_budgets(db, year=year)
    found = [b for b in budgets if b.id == budget.id]
    return _budget_to_response(found[0])


@router.put("/{category_id}/{year}/{month}", response_model=MonthlyOverrideResponse)
def set_monthly_override(
    category_id: int,
    year: int,
    month: int,
    body: MonthlyOverrideRequest,
    db: Session = Depends(get_db),
):
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Month must be 1-12")
    override = budget_service.set_monthly_override(
        db,
        category_id=category_id,
        year=year,
        month=month,
        amount=body.amount,
    )
    if override is None:
        raise HTTPException(status_code=404, detail="Budget not found for this category/year")
    return MonthlyOverrideResponse(month=override.month, amount=override.amount)


@router.delete("/{category_id}/{year}/{month}", status_code=204)
def delete_monthly_override(
    category_id: int,
    year: int,
    month: int,
    db: Session = Depends(get_db),
):
    deleted = budget_service.delete_monthly_override(
        db, category_id=category_id, year=year, month=month,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Override not found")


@router.get("/suggestions/{year}", response_model=list[BudgetSuggestionResponse])
def get_budget_suggestions(
    year: int,
    db: Session = Depends(get_db),
):
    suggestions = budget_service.get_budget_suggestions(db, year=year)
    return suggestions


@router.get("/actual/{year}", response_model=ActualVsBudgetResponse)
def get_actual_vs_budget(
    year: int,
    db: Session = Depends(get_db),
):
    result = budget_service.get_actual_vs_budget(db, year=year)
    return result
