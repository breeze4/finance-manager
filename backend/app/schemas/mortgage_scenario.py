from datetime import datetime

from pydantic import BaseModel

# Keep field order stable — matches the model column order.


class MortgageScenarioCreate(BaseModel):
    """Payload for creating a new Mortgage scenario.

    `is_active` is intentionally excluded — activation is a separate concern
    handled by `POST /{id}/activate`. New scenarios default to inactive unless
    they are the first row (handled in the service layer).
    """

    name: str
    principal: float
    years_left: float
    interest_rate: float
    monthly_payment: float
    additional_monthly_payment: float
    lump_sum_payment: float
    investment_return_rate: float
    investment_tax_rate: float


class MortgageScenarioUpdate(BaseModel):
    """Partial-update payload. All fields optional. `is_active` is excluded —
    use `POST /{id}/activate` to flip the active row."""

    name: str | None = None
    principal: float | None = None
    years_left: float | None = None
    interest_rate: float | None = None
    monthly_payment: float | None = None
    additional_monthly_payment: float | None = None
    lump_sum_payment: float | None = None
    investment_return_rate: float | None = None
    investment_tax_rate: float | None = None


class MortgageScenarioResponse(BaseModel):
    id: int
    name: str
    is_active: bool
    principal: float
    years_left: float
    interest_rate: float
    monthly_payment: float
    additional_monthly_payment: float
    lump_sum_payment: float
    investment_return_rate: float
    investment_tax_rate: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
