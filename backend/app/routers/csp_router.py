"""HTTP endpoints for the Conscious Spending Plan rollup.

Both ``mode=planning`` (Slice 3) and ``mode=actuals`` (Slice 4) are
wired here. The two modes share the same bucket record shape
(``BucketRollupResponse``); only the actuals path populates the
``planned_percentage`` and ``tracking_status`` fields.

Wire format is snake_case; the frontend's ``csp.ts`` mirrors these names.
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import csp_rollup_service, net_income_service

router = APIRouter(prefix="/api/csp", tags=["csp"])


# ---- response shapes --------------------------------------------------------


class BucketRollupResponse(BaseModel):
    bucket: str
    numerator: float
    denominator: float
    percentage: float
    ramit_min: float
    ramit_max: float | None
    status: str
    is_open_ended_over: bool
    # Populated only on the actuals path. The planning path leaves these
    # null so a single response shape can serve both modes.
    planned_percentage: float | None = None
    tracking_status: str | None = None


class UnbucketedCategoryResponse(BaseModel):
    id: int
    name: str


class PlanningRollupResponse(BaseModel):
    month: str  # "YYYY-MM"
    mode: str
    month_yyyymm: int
    denominator: float
    take_home: float | None
    pre_tax_total: float
    has_net_income: bool
    buckets: list[BucketRollupResponse]
    unbucketed_categories: list[UnbucketedCategoryResponse]


class ActualsRollupResponse(BaseModel):
    month: str  # "YYYY-MM"
    mode: str
    month_yyyymm: int
    denominator: float
    take_home: float | None
    pre_tax_total: float
    has_net_income: bool
    buckets: list[BucketRollupResponse]
    unbucketed_categories: list[UnbucketedCategoryResponse]


# ---- handlers --------------------------------------------------------------


def _to_float(value: Decimal | None) -> float | None:
    return float(value) if value is not None else None


def _planning_to_response(
    rollup: csp_rollup_service.PlanningRollup,
    *,
    month_str: str,
) -> PlanningRollupResponse:
    return PlanningRollupResponse(
        month=month_str,
        mode="planning",
        month_yyyymm=rollup.month_yyyymm,
        denominator=float(rollup.denominator),
        take_home=_to_float(rollup.take_home),
        pre_tax_total=float(rollup.pre_tax_total),
        has_net_income=rollup.has_net_income,
        buckets=[
            BucketRollupResponse(
                bucket=b.bucket,
                numerator=float(b.numerator),
                denominator=float(b.denominator),
                percentage=float(b.percentage),
                ramit_min=float(b.ramit_min),
                ramit_max=_to_float(b.ramit_max),
                status=b.status,
                is_open_ended_over=b.is_open_ended_over,
            )
            for b in rollup.buckets
        ],
        unbucketed_categories=[
            UnbucketedCategoryResponse(id=u["id"], name=u["name"])
            for u in rollup.unbucketed_categories
        ],
    )


def _actuals_to_response(
    rollup: csp_rollup_service.ActualsRollup,
    *,
    month_str: str,
) -> ActualsRollupResponse:
    return ActualsRollupResponse(
        month=month_str,
        mode="actuals",
        month_yyyymm=rollup.month_yyyymm,
        denominator=float(rollup.denominator),
        take_home=_to_float(rollup.take_home),
        pre_tax_total=float(rollup.pre_tax_total),
        has_net_income=rollup.has_net_income,
        buckets=[
            BucketRollupResponse(
                bucket=b.bucket,
                numerator=float(b.numerator),
                denominator=float(b.denominator),
                percentage=float(b.percentage),
                ramit_min=float(b.ramit_min),
                ramit_max=_to_float(b.ramit_max),
                status=b.status,
                is_open_ended_over=b.is_open_ended_over,
                planned_percentage=_to_float(b.planned_percentage),
                tracking_status=b.tracking_status,
            )
            for b in rollup.buckets
        ],
        unbucketed_categories=[
            UnbucketedCategoryResponse(id=u["id"], name=u["name"])
            for u in rollup.unbucketed_categories
        ],
    )


# Drop ``response_model`` so FastAPI accepts either Pydantic class without
# the union-type quirks of ``response_model=Union[...]``.
@router.get("/rollup")
def get_rollup(
    month: str = Query(..., description="Target month, formatted YYYY-MM"),
    mode: str = Query("planning", description="Either 'planning' or 'actuals'"),
    db: Session = Depends(get_db),
):
    try:
        month_int = net_income_service.parse_yyyymm_string(month)
    except (ValueError, IndexError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if mode == "planning":
        rollup = csp_rollup_service.get_planning_rollup(db, month_int)
        return _planning_to_response(rollup, month_str=month)

    if mode == "actuals":
        actuals = csp_rollup_service.get_actuals_rollup(db, month_int)
        return _actuals_to_response(actuals, month_str=month)

    raise HTTPException(status_code=400, detail=f"Unknown mode: {mode!r}")
