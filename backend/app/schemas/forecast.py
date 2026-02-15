from pydantic import BaseModel


class ForecastLineItemResponse(BaseModel):
    category_id: int | None
    category_name: str
    amount: float
    basis: str


class MonthForecastResponse(BaseModel):
    month: int
    status: str
    total: float
    line_items: list[ForecastLineItemResponse]


class ForecastResponse(BaseModel):
    year: int
    method: str
    months: list[MonthForecastResponse]
    annual_total: float


class YoYEntryResponse(BaseModel):
    category_id: int | None
    category_name: str
    annual_totals: dict[int, float]


class MethodsResponse(BaseModel):
    methods: list[str]
