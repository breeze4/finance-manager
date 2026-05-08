from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.stats import (
    BucketPaceRollup,
    CategoryPaceRow,
    MonthlyPaceResponse,
    MonthlyStatsResponse,
    PaceHeadline,
    SpendingTrendResponse,
    SummaryResponse,
    TrendMonth,
)
from app.services import pace_service, stats_service

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


@router.get("/monthly-pace", response_model=MonthlyPaceResponse)
def get_monthly_pace(
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: Session = Depends(get_db),
):
    """Overview headline for ``[date_from, date_to]``.

    Returns ``mode = "pace"`` when the range is the in-progress current
    month (``date_from = first-of-current-month`` AND ``date_to >=
    today``); ``mode = "actual_vs_budget"`` for every other range. The
    pace_service handles the discriminator; the router only catches
    genuinely invalid ranges (e.g., ``date_to < date_from``) and maps
    those to a 400.
    """
    try:
        result = pace_service.compute_monthly_pace(db, date_from, date_to)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return MonthlyPaceResponse(
        mode=result.mode,
        headline=PaceHeadline(
            actual_total=float(result.headline.actual_total),
            expected_total=float(result.headline.expected_total),
            variance=float(result.headline.variance),
        ),
        buckets=[
            BucketPaceRollup(
                bucket=b.bucket,
                actual=float(b.actual),
                expected=float(b.expected),
                budget=float(b.budget),
                categories=[
                    CategoryPaceRow(
                        category_id=c.category_id,
                        category_name=c.category_name,
                        bucket=c.bucket,
                        actual_mtd=float(c.actual_mtd),
                        expected_mtd=float(c.expected_mtd),
                        full_budget=float(c.full_budget),
                    )
                    for c in b.categories
                ],
            )
            for b in result.buckets
        ],
        categories=[
            CategoryPaceRow(
                category_id=c.category_id,
                category_name=c.category_name,
                bucket=c.bucket,
                actual_mtd=float(c.actual_mtd),
                expected_mtd=float(c.expected_mtd),
                full_budget=float(c.full_budget),
            )
            for c in result.categories
        ],
        date_from=result.date_from,
        date_to=result.date_to,
    )


@router.get("/spending-trend", response_model=SpendingTrendResponse)
def get_spending_trend(
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: Session = Depends(get_db),
):
    """Per-month actual-vs-expected spending trend for the chart.

    Returns one entry per calendar month any of whose days falls in the
    requested range, in chronological order. Honors the standard
    transfer / exclude_from_budget / pre-tax exclusions. Step 3 hardcodes
    the range on the Overview page to "last 6 calendar months ending
    today"; Step 5 widens this via the range picker without changing the
    URL contract.
    """
    months = stats_service.get_spending_trend(db, date_from=date_from, date_to=date_to)
    return SpendingTrendResponse(
        date_from=date_from,
        date_to=date_to,
        months=[TrendMonth(**m) for m in months],
    )
