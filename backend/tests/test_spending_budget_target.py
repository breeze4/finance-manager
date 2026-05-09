"""Unit tests for ``app.services.spending.BudgetTarget``.

Pure value-type tests — no DB session required. ``Budget`` and
``BudgetMonthlyOverride`` model instances are constructed in-memory and
their ``monthly_overrides`` relationship is populated by direct list
assignment so the resolver can iterate it without an ORM round-trip.
"""

from datetime import date
from decimal import Decimal

import pytest

from app.models import Budget
from app.models.budget import BudgetMonthlyOverride
from app.services.spending import BudgetTarget, Period


def _make_budget(monthly: float, overrides: list[tuple[int, float]] | None = None) -> Budget:
    """Construct an in-memory Budget with optional per-month overrides.

    The ORM relationship ``Budget.monthly_overrides`` is just a list at
    runtime; assigning to it directly is enough for the resolver to walk.
    """
    budget = Budget(category_id=1, year=2026, monthly_amount=monthly)
    budget.monthly_overrides = [
        BudgetMonthlyOverride(month=m, amount=a) for m, a in (overrides or [])
    ]
    return budget


# ---------------------------------------------------------------------------
# baseline flavor
# ---------------------------------------------------------------------------


def test_baseline_returns_monthly_amount_regardless_of_overrides() -> None:
    """``baseline`` must ignore overrides — it's the planning-rollup flavor."""
    budget = _make_budget(500.0, overrides=[(5, 999.0)])
    target = BudgetTarget.baseline(budget)
    assert target.effective(2026, 5) == Decimal("500.0")
    # Other months also see baseline.
    assert target.effective(2026, 1) == Decimal("500.0")


def test_baseline_returns_zero_for_none_budget() -> None:
    """Missing-budget shorthand: zero, not raise."""
    target = BudgetTarget.baseline(None)
    assert target.effective(2026, 5) == Decimal("0")


# ---------------------------------------------------------------------------
# with_overrides flavor
# ---------------------------------------------------------------------------


def test_with_overrides_returns_override_when_month_matches() -> None:
    budget = _make_budget(500.0, overrides=[(5, 750.0)])
    target = BudgetTarget.with_overrides(budget)
    assert target.effective(2026, 5) == Decimal("750.0")


def test_with_overrides_returns_baseline_when_no_override_matches() -> None:
    budget = _make_budget(500.0, overrides=[(5, 750.0)])
    target = BudgetTarget.with_overrides(budget)
    assert target.effective(2026, 6) == Decimal("500.0")


def test_with_overrides_returns_zero_for_none_budget() -> None:
    target = BudgetTarget.with_overrides(None)
    assert target.effective(2026, 5) == Decimal("0")


# ---------------------------------------------------------------------------
# effective_over(period)
# ---------------------------------------------------------------------------


def test_effective_over_sums_with_overrides_across_three_months() -> None:
    """One overridden month plus two baseline months → sum of all three."""
    budget = _make_budget(500.0, overrides=[(5, 750.0)])
    target = BudgetTarget.with_overrides(budget)
    period = Period.range(start=_d(2026, 4, 1), end=_d(2026, 6, 30))
    # April (500) + May (750 override) + June (500) = 1750
    assert target.effective_over(period) == Decimal("1750.0")


def test_effective_over_single_month_equals_effective_for_that_month() -> None:
    budget = _make_budget(500.0, overrides=[(5, 750.0)])
    target = BudgetTarget.with_overrides(budget)
    period = Period.month(2026, 5)
    assert target.effective_over(period) == target.effective(2026, 5)


def test_effective_over_baseline_flavor_sums_baseline_only() -> None:
    """Sanity: baseline flavor never picks up the override even via effective_over."""
    budget = _make_budget(500.0, overrides=[(5, 9999.0)])
    target = BudgetTarget.baseline(budget)
    period = Period.range(start=_d(2026, 4, 1), end=_d(2026, 6, 30))
    assert target.effective_over(period) == Decimal("1500.0")


# ---------------------------------------------------------------------------
# with_rollover flavor
# ---------------------------------------------------------------------------


class TestWithRollover:
    """Rollover flavor: override-or-baseline plus accumulated prior-month carry."""

    def test_january_no_prior_carry_matches_with_overrides(self) -> None:
        """First month has nothing to carry — equals ``with_overrides`` for that month."""
        budget = _make_budget(500.0, overrides=[(5, 750.0)])
        actuals = {m: Decimal("0") for m in range(1, 13)}
        rollover = BudgetTarget.with_rollover(budget, actuals)
        overrides = BudgetTarget.with_overrides(budget)
        assert rollover.effective(2026, 1) == overrides.effective(2026, 1)

    def test_february_with_january_surplus_carries_into_march(self) -> None:
        """Jan target 100, actual 80 → carry 20. March target 100 + 20 carry = 120.

        And Feb's effective is 100 (Jan target) + (Jan target - Jan actual) = 120.
        """
        budget = _make_budget(100.0)
        actuals = {1: Decimal("80")}
        target = BudgetTarget.with_rollover(budget, actuals)
        # Feb: 100 + (100 - 80) = 120
        assert target.effective(2026, 2) == Decimal("120")
        # March: 100 + (100 - 80) + (100 - 0) = 220 (Feb has no actuals → full carry)
        assert target.effective(2026, 3) == Decimal("220")

    def test_february_with_january_deficit_subtracts_from_february(self) -> None:
        """Jan target 100, actual 130 → deficit 30. Feb effective = 100 - 30 = 70."""
        budget = _make_budget(100.0)
        actuals = {1: Decimal("130")}
        target = BudgetTarget.with_rollover(budget, actuals)
        assert target.effective(2026, 2) == Decimal("70")

    def test_override_in_march_plus_carry_from_jan_feb(self) -> None:
        """Override wins for March's baseline-or-override; carry adds on top."""
        budget = _make_budget(100.0, overrides=[(3, 200.0)])
        actuals = {1: Decimal("80"), 2: Decimal("90")}  # Jan +20, Feb +10
        target = BudgetTarget.with_rollover(budget, actuals)
        # March: 200 (override) + (100 - 80) + (100 - 90) = 200 + 30 = 230
        assert target.effective(2026, 3) == Decimal("230")

    def test_year_boundary_raises_value_error(self) -> None:
        """Carry doesn't cross years — asking for the wrong year is an error."""
        budget = _make_budget(100.0)  # year=2026
        target = BudgetTarget.with_rollover(budget, {})
        with pytest.raises(ValueError, match="2026"):
            target.effective(2027, 1)

    def test_empty_actuals_carries_full_cumulative_target(self) -> None:
        """No actuals data → carry equals cumulative target; effective grows monthly."""
        budget = _make_budget(100.0)
        target = BudgetTarget.with_rollover(budget, {})
        # Jan: 100 + 0 = 100
        assert target.effective(2026, 1) == Decimal("100")
        # Feb: 100 + (100 - 0) = 200
        assert target.effective(2026, 2) == Decimal("200")
        # March: 100 + (100 - 0) + (100 - 0) = 300
        assert target.effective(2026, 3) == Decimal("300")
        # Dec: 100 * 12 = 1200
        assert target.effective(2026, 12) == Decimal("1200")

    def test_none_budget_returns_zero(self) -> None:
        """Missing-budget shorthand still applies for the rollover flavor."""
        target = BudgetTarget.with_rollover(None, {})
        assert target.effective(2026, 5) == Decimal("0")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _d(year: int, month: int, day: int):
    """Local ``date`` constructor — keeps the test bodies focused on amounts."""
    return date(year, month, day)
