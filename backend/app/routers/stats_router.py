from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.stats import MonthlyStatsResponse, SummaryResponse
from app.services import stats_service

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/summary", response_model=SummaryResponse)
def get_summary(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
):
    return stats_service.get_summary(db, date_from=date_from, date_to=date_to)


@router.get("/monthly", response_model=MonthlyStatsResponse)
def get_monthly(
    year: int = Query(..., ge=2000, le=2100),
    category_id: int | None = None,
    db: Session = Depends(get_db),
):
    months = stats_service.get_monthly_stats(db, year=year, category_id=category_id)
    return MonthlyStatsResponse(year=year, months=months)
