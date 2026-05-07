from datetime import datetime
from typing import Literal

from pydantic import BaseModel

# Keep field order stable — matches the model column order so step 4 has a
# clear precedent to mirror.


class CoastFireScenarioCreate(BaseModel):
    """Payload for creating a new Coast FIRE scenario.

    `is_active` is intentionally excluded — activation is a separate concern
    handled by `POST /{id}/activate`. New scenarios default to inactive unless
    they are the first row (handled in the service layer).
    """

    name: str
    current_age: float
    retirement_age: float
    current_savings: float
    expected_return_rate: float
    target_retirement_amount: float
    monthly_expenses: float
    yearly_expenses: float
    withdrawal_rate: float
    inflation_rate: float
    use_real_returns: bool
    last_edited_field: Literal["target", "monthly", "yearly"] = "target"


class CoastFireScenarioUpdate(BaseModel):
    """Partial-update payload. All fields optional. `is_active` is excluded —
    use `POST /{id}/activate` to flip the active row."""

    name: str | None = None
    current_age: float | None = None
    retirement_age: float | None = None
    current_savings: float | None = None
    expected_return_rate: float | None = None
    target_retirement_amount: float | None = None
    monthly_expenses: float | None = None
    yearly_expenses: float | None = None
    withdrawal_rate: float | None = None
    inflation_rate: float | None = None
    use_real_returns: bool | None = None
    last_edited_field: Literal["target", "monthly", "yearly"] | None = None


class CoastFireScenarioResponse(BaseModel):
    id: int
    name: str
    is_active: bool
    current_age: float
    retirement_age: float
    current_savings: float
    expected_return_rate: float
    target_retirement_amount: float
    monthly_expenses: float
    yearly_expenses: float
    withdrawal_rate: float
    inflation_rate: float
    use_real_returns: bool
    last_edited_field: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
