from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from sqlalchemy.orm import Session


@dataclass
class ForecastLineItem:
    category_id: int | None
    category_name: str
    amount: float
    basis: str  # "seasonal", "subscription", "trend", "average"


@dataclass
class MonthForecast:
    month: int
    status: str  # "actual", "partial", "projected"
    total: float
    line_items: list[ForecastLineItem] = field(default_factory=list)


@dataclass
class ForecastResult:
    year: int
    method: str
    months: list[MonthForecast]
    annual_total: float


@dataclass
class YoYEntry:
    category_id: int | None
    category_name: str
    annual_totals: dict[int, float]  # year -> total


class BaseForecaster(ABC):
    """Abstract interface for forecast engines."""

    @property
    @abstractmethod
    def name(self) -> str:
        ...

    @abstractmethod
    def forecast(self, db: Session, year: int) -> ForecastResult:
        ...
