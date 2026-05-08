"""Pydantic schemas for the net-income step-function endpoints.

The model stores ``effective_month`` as an integer ``YYYYMM`` for fast,
total-orderable lookups. The HTTP boundary speaks ``"YYYY-MM"`` strings —
nicer for frontends and humans. Conversion happens here / in the router.

Amounts cross the wire as ``float`` to match the budget endpoints
(`backend/app/schemas/budget.py`). The model column itself is
``Numeric(12, 2)`` so we keep DB-side precision; we only relax to float at
the API boundary.
"""

from datetime import datetime

from pydantic import BaseModel, Field, field_validator


def _validate_year_month(value: str) -> str:
    """Validate a ``"YYYY-MM"`` string. Raises ValueError if malformed."""
    if not isinstance(value, str) or len(value) != 7 or value[4] != "-":
        raise ValueError("month must be formatted YYYY-MM")
    year_str, month_str = value.split("-")
    if not year_str.isdigit() or not month_str.isdigit():
        raise ValueError("month must be formatted YYYY-MM")
    year = int(year_str)
    month = int(month_str)
    if year < 1900 or year > 9999:
        raise ValueError("year out of range")
    if month < 1 or month > 12:
        raise ValueError("month must be 1-12")
    return value


class NetIncomePeriodResponse(BaseModel):
    """One row from the ``net_income_periods`` table."""

    id: int
    effective_month: str  # "YYYY-MM" (derived from the YYYYMM int)
    take_home_amount: float
    created_at: datetime

    model_config = {"from_attributes": False}


class NetIncomeSetRequest(BaseModel):
    """Upsert payload for ``PUT /api/net-income``."""

    effective_month: str = Field(..., description="Effective month as YYYY-MM")
    take_home_amount: float

    @field_validator("effective_month")
    @classmethod
    def _check_month(cls, v: str) -> str:
        return _validate_year_month(v)


class NetIncomeForMonthResponse(BaseModel):
    """Result of ``GET /api/net-income?month=YYYY-MM``.

    ``amount`` is the effective net income for the requested month, or
    ``null`` if no period row applies. ``from_period`` is the row that
    supplied the value (so the UI can show ``"Set in 2026-03"``), or
    ``null`` if there is no applicable row.
    """

    month: str
    amount: float | None
    from_period: NetIncomePeriodResponse | None


class PaycheckSuggestionResponse(BaseModel):
    """Result of ``GET /api/paycheck-detection/suggest``."""

    suggested_monthly_net: float | None
