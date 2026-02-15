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
