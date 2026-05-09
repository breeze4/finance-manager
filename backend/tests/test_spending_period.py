"""Unit tests for ``app.services.spending.Period``.

Pure value-type tests — no DB fixture. Covers:

  - ``months_overlapping`` for single-month, cross-year, and leap February
  - the four constructors (``range``, ``month``, ``year``, ``yyyymm``) and
    their equivalence relations
  - ``range(d1, d2)`` with ``d1 > d2`` raises ``ValueError``
  - ``is_in_progress`` matrix
  - ``pace_factor`` for first-of-month, mid-month, last-of-month, leap
    February
  - ``days_remaining`` for the today-before/inside/after-end cases
"""

from datetime import date
from decimal import Decimal

import pytest

from app.services.spending import Period

# ---------------------------------------------------------------------------
# months_overlapping
# ---------------------------------------------------------------------------


def test_months_overlapping_single_month() -> None:
    p = Period.range(date(2026, 5, 1), date(2026, 5, 31))
    assert p.months_overlapping() == [(2026, 5)]


def test_months_overlapping_partial_single_month() -> None:
    p = Period.range(date(2026, 5, 8), date(2026, 5, 20))
    assert p.months_overlapping() == [(2026, 5)]


def test_months_overlapping_cross_year() -> None:
    p = Period.range(date(2025, 12, 15), date(2026, 1, 10))
    assert p.months_overlapping() == [(2025, 12), (2026, 1)]


def test_months_overlapping_leap_february() -> None:
    # 2024 is a leap year; ensure Feb 29 is included.
    p = Period.range(date(2024, 2, 1), date(2024, 2, 29))
    assert p.months_overlapping() == [(2024, 2)]


def test_months_overlapping_full_year_chronological() -> None:
    p = Period.year(2026)
    expected = [(2026, m) for m in range(1, 13)]
    assert p.months_overlapping() == expected


# ---------------------------------------------------------------------------
# Constructors and their equivalences
# ---------------------------------------------------------------------------


def test_month_constructor_equivalent_to_range() -> None:
    assert Period.month(2026, 1) == Period.range(date(2026, 1, 1), date(2026, 1, 31))


def test_month_constructor_handles_february_non_leap() -> None:
    assert Period.month(2025, 2) == Period.range(date(2025, 2, 1), date(2025, 2, 28))


def test_month_constructor_handles_february_leap() -> None:
    assert Period.month(2024, 2) == Period.range(date(2024, 2, 1), date(2024, 2, 29))


def test_year_constructor_equivalent_to_jan_dec_range() -> None:
    assert Period.year(2026) == Period.range(date(2026, 1, 1), date(2026, 12, 31))


def test_yyyymm_constructor_equivalent_to_month() -> None:
    assert Period.yyyymm(202605) == Period.month(2026, 5)


def test_yyyymm_constructor_january_padding() -> None:
    # 202601 → year=2026, month=1
    assert Period.yyyymm(202601) == Period.month(2026, 1)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def test_range_rejects_inverted_endpoints() -> None:
    with pytest.raises(ValueError):
        Period.range(date(2026, 5, 10), date(2026, 5, 1))


def test_range_allows_same_day() -> None:
    p = Period.range(date(2026, 5, 8), date(2026, 5, 8))
    assert p.start == p.end == date(2026, 5, 8)
    assert p.months_overlapping() == [(2026, 5)]


def test_period_is_frozen() -> None:
    p = Period.month(2026, 5)
    with pytest.raises(Exception):  # FrozenInstanceError is dataclasses-internal
        p.start = date(2026, 1, 1)  # type: ignore[misc]


# ---------------------------------------------------------------------------
# is_in_progress
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "start, end, today, expected",
    [
        # In-progress current month: start==first-of-today's-month AND end>=today
        (date(2026, 5, 1), date(2026, 5, 31), date(2026, 5, 8), True),
        # end == today (still in progress)
        (date(2026, 5, 1), date(2026, 5, 8), date(2026, 5, 8), True),
        # end after today
        (date(2026, 5, 1), date(2026, 6, 30), date(2026, 5, 8), True),
        # today before start (start is in the future)
        (date(2026, 6, 1), date(2026, 6, 30), date(2026, 5, 8), False),
        # today after end (range is in the past)
        (date(2026, 4, 1), date(2026, 4, 30), date(2026, 5, 8), False),
        # start is not first-of-today's-month (sub-window of current month)
        (date(2026, 5, 2), date(2026, 5, 8), date(2026, 5, 8), False),
        # start is first-of-a-different-month (completed last month)
        (date(2026, 4, 1), date(2026, 5, 8), date(2026, 5, 8), False),
    ],
)
def test_is_in_progress_matrix(start: date, end: date, today: date, expected: bool) -> None:
    assert Period.range(start, end).is_in_progress(today) is expected


# ---------------------------------------------------------------------------
# pace_factor
# ---------------------------------------------------------------------------


def test_pace_factor_first_of_month() -> None:
    p = Period.month(2026, 5)
    # day 1 / 31 days
    assert p.pace_factor(date(2026, 5, 1)) == Decimal(1) / Decimal(31)


def test_pace_factor_mid_month() -> None:
    p = Period.month(2026, 5)
    assert p.pace_factor(date(2026, 5, 15)) == Decimal(15) / Decimal(31)


def test_pace_factor_last_of_month() -> None:
    p = Period.month(2026, 5)
    assert p.pace_factor(date(2026, 5, 31)) == Decimal(1)


def test_pace_factor_leap_february_last_day() -> None:
    p = Period.month(2024, 2)
    assert p.pace_factor(date(2024, 2, 29)) == Decimal(1)


def test_pace_factor_leap_february_mid() -> None:
    p = Period.month(2024, 2)
    assert p.pace_factor(date(2024, 2, 15)) == Decimal(15) / Decimal(29)


def test_pace_factor_non_leap_february_last_day() -> None:
    p = Period.month(2025, 2)
    assert p.pace_factor(date(2025, 2, 28)) == Decimal(1)


# ---------------------------------------------------------------------------
# days_remaining
# ---------------------------------------------------------------------------


def test_days_remaining_today_inside_range() -> None:
    p = Period.range(date(2026, 5, 1), date(2026, 5, 31))
    # today=May 8 → 8..31 inclusive = 24 days
    assert p.days_remaining(date(2026, 5, 8)) == 24


def test_days_remaining_today_before_start() -> None:
    p = Period.range(date(2026, 5, 1), date(2026, 5, 31))
    # today before start → full range
    assert p.days_remaining(date(2026, 4, 20)) == 31


def test_days_remaining_today_after_end() -> None:
    p = Period.range(date(2026, 5, 1), date(2026, 5, 31))
    assert p.days_remaining(date(2026, 6, 1)) == 0


def test_days_remaining_today_equals_end() -> None:
    p = Period.range(date(2026, 5, 1), date(2026, 5, 31))
    assert p.days_remaining(date(2026, 5, 31)) == 1
