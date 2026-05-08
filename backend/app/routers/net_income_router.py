"""HTTP endpoints for the net-income step-function table and paycheck detection.

Two routers live in this module:

* ``router`` — ``/api/net-income``: GET (effective amount for a month),
  PUT (upsert a period), GET history.
* ``paycheck_router`` — ``/api/paycheck-detection``: GET suggested
  monthly net based on income-transaction history.

Both are registered separately in ``app.main`` so OpenAPI tags stay clean.
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import NetIncomePeriod
from app.schemas.net_income import (
    NetIncomeForMonthResponse,
    NetIncomePeriodResponse,
    NetIncomeSetRequest,
    PaycheckSuggestionResponse,
)
from app.services import net_income_service, paycheck_detection

router = APIRouter(prefix="/api/net-income", tags=["net-income"])
paycheck_router = APIRouter(prefix="/api/paycheck-detection", tags=["paycheck-detection"])


def _period_to_response(row: NetIncomePeriod) -> NetIncomePeriodResponse:
    return NetIncomePeriodResponse(
        id=row.id,
        effective_month=net_income_service.to_yyyymm_string(row.effective_month),
        take_home_amount=float(row.take_home_amount),
        created_at=row.created_at,
    )


@router.get("", response_model=NetIncomeForMonthResponse)
def get_for_month(
    month: str = Query(..., description="Target month, formatted YYYY-MM"),
    db: Session = Depends(get_db),
):
    try:
        month_int = net_income_service.parse_yyyymm_string(month)
    except (ValueError, IndexError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    row = net_income_service.get_period_for_month(db, month_int)
    if row is None:
        return NetIncomeForMonthResponse(month=month, amount=None, from_period=None)
    return NetIncomeForMonthResponse(
        month=month,
        amount=float(row.take_home_amount),
        from_period=_period_to_response(row),
    )


@router.put("", response_model=NetIncomePeriodResponse)
def set_period(
    body: NetIncomeSetRequest,
    db: Session = Depends(get_db),
):
    try:
        effective_int = net_income_service.parse_yyyymm_string(body.effective_month)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    row = net_income_service.set_from_month(
        db,
        effective_month=effective_int,
        take_home_amount=Decimal(str(body.take_home_amount)),
    )
    return _period_to_response(row)


@router.get("/history", response_model=list[NetIncomePeriodResponse])
def get_history(db: Session = Depends(get_db)):
    return [_period_to_response(r) for r in net_income_service.get_history(db)]


@paycheck_router.get("/suggest", response_model=PaycheckSuggestionResponse)
def suggest(db: Session = Depends(get_db)):
    suggested = paycheck_detection.suggest_monthly_net(db)
    return PaycheckSuggestionResponse(
        suggested_monthly_net=float(suggested) if suggested is not None else None,
    )
