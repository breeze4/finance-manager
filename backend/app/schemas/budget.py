from datetime import datetime

from pydantic import BaseModel


class CategoryHistoricalStatsResponse(BaseModel):
    category_id: int
    category_name: str
    monthly_average: float
    monthly_median: float
    monthly_min: float
    monthly_max: float
    std_dev: float
    coefficient_of_variation: float
    confidence_interval_low: float
    confidence_interval_high: float
    trend: str
    seasonal_months: list[int]
    months_of_data: int
    monthly_totals: dict[str, float]


class BudgetSetRequest(BaseModel):
    monthly_amount: float
    rollover_mode: bool = False


class MonthlyOverrideRequest(BaseModel):
    amount: float


class MonthlyOverrideResponse(BaseModel):
    month: int
    amount: float

    model_config = {"from_attributes": True}


class BudgetResponse(BaseModel):
    id: int
    category_id: int
    category_name: str | None = None
    year: int
    monthly_amount: float
    rollover_mode: bool
    monthly_overrides: list[MonthlyOverrideResponse]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ActualVsBudgetEntry(BaseModel):
    category_id: int
    category_name: str
    month: int
    budget_target: float
    actual_spend: float
    difference: float
    percentage: float
    csp_bucket: str | None = None
    is_pre_tax: bool = False


class MonthlyRollup(BaseModel):
    month: int
    total_budgeted: float
    total_actual: float
    difference: float
    percentage: float


class ActualVsBudgetResponse(BaseModel):
    entries: list[ActualVsBudgetEntry]
    monthly_rollups: list[MonthlyRollup]


class BudgetSuggestionResponse(BaseModel):
    category_id: int
    category_name: str
    baseline_monthly: float
    monthly_suggestions: dict[int, float]
    basis: str
