from datetime import date
from typing import Literal

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


# ---------------------------------------------------------------------------
# Monthly pace dashboard (Overview redesign — Step 1)
# ---------------------------------------------------------------------------
#
# Wire shape for ``GET /api/stats/monthly-pace``. Step 1 emits ``mode="pace"``
# only — Step 5 adds ``"actual_vs_budget"`` without breaking this contract.


class CategoryPaceRow(BaseModel):
    """One category's pace numbers.

    ``category_id`` and ``bucket`` are ``None`` for the synthetic
    "Uncategorized" row (which represents non-transfer transactions with
    ``category_id IS NULL``). The synthetic row has ``full_budget = 0``
    and ``expected_mtd = 0``.
    """

    category_id: int | None
    category_name: str
    bucket: str | None
    actual_mtd: float
    expected_mtd: float
    full_budget: float


class BucketPaceRollup(BaseModel):
    """One CSP bucket's pace rollup.

    ``categories`` is the list of categories that belong to this bucket only
    (the synthetic Uncategorized row never appears here — it lives in the
    top-level ``categories[]`` with ``bucket=None``).
    """

    bucket: str
    actual: float
    expected: float
    budget: float
    categories: list[CategoryPaceRow]


class PaceHeadline(BaseModel):
    """Top-of-page summary numbers.

    ``variance = actual_total - expected_total``. The frontend chooses the
    copy ("On pace — $X under expected" / "Over pace — $X over expected")
    from the sign of ``variance``.
    """

    actual_total: float
    expected_total: float
    variance: float


class MonthlyPaceResponse(BaseModel):
    """Top-level response for ``/api/stats/monthly-pace``.

    ``buckets`` is fixed-length 4 in canonical order (fixed, investments,
    savings, guilt_free). ``categories`` is the flat list of every category
    included in the math, plus an Uncategorized synthetic row when relevant.
    Step 2 reads ``categories[]``; bucket cards read ``buckets[].categories``.
    """

    mode: Literal["pace", "actual_vs_budget"]
    headline: PaceHeadline
    buckets: list[BucketPaceRollup]
    categories: list[CategoryPaceRow]
    date_from: date
    date_to: date


# ---------------------------------------------------------------------------
# Spending-trend chart (Overview redesign — Step 3)
# ---------------------------------------------------------------------------
#
# Wire shape for ``GET /api/stats/spending-trend``. Two-series per-month
# trend: ``actual`` (sum of non-transfer, non-pre-tax outflows) versus
# ``expected`` (sum of effective monthly budgets for the same set of
# categories, override > baseline). Step 5's range picker reuses this
# endpoint with arbitrary ranges; the URL contract is stable.


class TrendMonth(BaseModel):
    """One calendar-month bar in the spending-trend chart.

    ``month`` is "YYYY-MM" (string) for stable JSON ordering and easy
    Recharts XAxis dataKey usage. ``actual`` is the sum of non-transfer,
    non-pre-tax outflows in that month, abs-summed (positive). ``expected``
    is the sum of effective monthly budgets (override > baseline) for the
    same set of categories for that month.
    """

    month: str
    actual: float
    expected: float


class SpendingTrendResponse(BaseModel):
    """Wire shape for ``GET /api/stats/spending-trend``.

    ``months`` covers every calendar month any of whose days falls in the
    requested range, in chronological order. Empty when the range is empty
    or no months overlap the data.
    """

    date_from: date
    date_to: date
    months: list[TrendMonth]
