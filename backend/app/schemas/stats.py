from pydantic import BaseModel


class CategorySummary(BaseModel):
    category_id: int | None
    category_name: str
    total: float
    percentage: float


class SummaryResponse(BaseModel):
    total_spending: float
    total_income: float
    savings_rate: float
    transaction_count: int
    top_categories: list[CategorySummary]


class MonthlyCategorySpending(BaseModel):
    month: int
    category_id: int | None
    category_name: str
    total: float


class MonthlyStatsResponse(BaseModel):
    year: int
    months: list[MonthlyCategorySpending]
