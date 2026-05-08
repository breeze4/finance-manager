from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.subscription import (
    RemainingSubscription,
    RemainingSubscriptionsResponse,
    SubscriptionDetectionResult,
    SubscriptionResponse,
    SubscriptionUpdate,
)
from app.services import subscription_due_service, subscription_service

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])


def _sub_to_response(sub) -> SubscriptionResponse:
    return SubscriptionResponse(
        id=sub.id,
        vendor=sub.vendor,
        frequency=sub.frequency,
        subscription_type=sub.subscription_type,
        amount=sub.amount,
        amount_min=sub.amount_min,
        amount_max=sub.amount_max,
        annual_estimate=sub.annual_estimate,
        last_charge_date=sub.last_charge_date,
        category_id=sub.category_id,
        category_name=sub.category.name if sub.category else None,
        is_active=sub.is_active,
        detected_at=sub.detected_at,
    )


@router.get("", response_model=list[SubscriptionResponse])
def list_subscriptions(db: Session = Depends(get_db)):
    subs = subscription_service.list_subscriptions(db)
    return [_sub_to_response(s) for s in subs]


@router.get("/remaining", response_model=RemainingSubscriptionsResponse)
def get_remaining(
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: Session = Depends(get_db),
):
    """Active subscriptions expected in [date_from, date_to] not yet matched.

    Returns 204 No Content when the range isn't the in-progress current
    month (``date_from != first-of-current-month`` OR ``date_to <
    today``) — "subscriptions remaining" is meaningful only for pace
    mode, per the spec. Otherwise wraps
    ``subscription_due_service.subscriptions_remaining`` and returns the
    documented 200 shape. Decimal money fields are converted to ``float``
    at the wire boundary.
    """
    today = date.today()
    expected_first = date(today.year, today.month, 1)
    if not (date_from == expected_first and date_to >= today):
        return Response(status_code=204)

    result = subscription_due_service.subscriptions_remaining(db, date_from, date_to)
    return RemainingSubscriptionsResponse(
        total=float(result["total"]),
        count=result["count"],
        subscriptions=[
            RemainingSubscription(
                id=row["id"],
                vendor=row["vendor"],
                expected_date=row["expected_date"],
                expected_amount=float(row["expected_amount"]),
                category_id=row["category_id"],
                category_name=row["category_name"],
            )
            for row in result["subscriptions"]
        ],
    )


@router.post("/detect", response_model=SubscriptionDetectionResult)
def detect_subscriptions(db: Session = Depends(get_db)):
    result = subscription_service.detect_subscriptions(db)
    return result


@router.patch("/{subscription_id}", response_model=SubscriptionResponse)
def update_subscription(
    subscription_id: int,
    body: SubscriptionUpdate,
    db: Session = Depends(get_db),
):
    sub = subscription_service.update_subscription(
        db,
        subscription_id,
        is_active=body.is_active,
        category_id=body.category_id,
    )
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return _sub_to_response(sub)
