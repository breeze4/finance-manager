from datetime import date, datetime

from pydantic import BaseModel


class SubscriptionResponse(BaseModel):
    id: int
    vendor: str
    frequency: str
    subscription_type: str
    amount: float | None = None
    amount_min: float | None = None
    amount_max: float | None = None
    annual_estimate: float
    last_charge_date: date
    category_id: int | None = None
    category_name: str | None = None
    is_active: bool
    detected_at: datetime

    model_config = {"from_attributes": True}


class SubscriptionUpdate(BaseModel):
    is_active: bool | None = None
    category_id: int | None = None


class SubscriptionDetectionResult(BaseModel):
    subscriptions_found: int
    total_active: int


class RemainingSubscription(BaseModel):
    """One row in the remaining-subscriptions list.

    Returned inside ``RemainingSubscriptionsResponse.subscriptions``. The
    Step-1 service helper emits ``Decimal`` for ``expected_amount``; the
    router converts to ``float`` at the wire boundary (same convention as
    the pace router).
    """

    id: int
    vendor: str
    expected_date: date
    expected_amount: float
    category_id: int | None = None
    category_name: str  # "(uncategorized)" when no category linked


class RemainingSubscriptionsResponse(BaseModel):
    """Wire shape for ``GET /api/subscriptions/remaining``.

    ``total`` and ``count`` are reductions over ``subscriptions``. The
    list is reserved for future detail surfacing; v1 frontend only
    displays ``total`` and ``count``. The 204-when-out-of-current-MTD
    branch arrives in plan ``2026-05-08-05`` (range picker) — this slice
    always returns 200.
    """

    total: float
    count: int
    subscriptions: list[RemainingSubscription]
