# Step 1 handoff — `Period` value type + `months_overlapping` migration

Plan: `docs/plans/2026-05-08-06-spending-period.md`
Spec: `docs/specs/2026-05-08-02-spending-math-primitives.md`

## What landed

New file `backend/app/services/spending.py` containing only `Period`. `BudgetTarget`
and the `spending.*` query functions are still pending future plans (the module
docstring records the upcoming shape).

Two existing month-walk call sites migrated onto `Period.range(...).months_overlapping()`:

- `pace_service._compute_actual_vs_budget_mode`
- `stats_service.get_spending_trend`

`pace_service._months_overlapping` deleted. `pace_service._compute_pace_mode`'s
inline pace-factor math also migrated (see "Pace-mode decision" below).

## Public API surface — `app.services.spending`

```python
@dataclass(frozen=True)
class Period:
    start: date
    end: date

    # Constructors (all funnel through `range`, which enforces start <= end)
    @classmethod
    def range(cls, start: date, end: date) -> "Period": ...
    @classmethod
    def month(cls, year: int, month: int) -> "Period": ...
    @classmethod
    def year(cls, year: int) -> "Period": ...
    @classmethod
    def yyyymm(cls, yyyymm: int) -> "Period": ...

    # Derived facts
    def months_overlapping(self) -> list[tuple[int, int]]: ...
    def is_in_progress(self, today: date) -> bool: ...
    def pace_factor(self, today: date) -> Decimal: ...
    def days_remaining(self, today: date) -> int: ...
```

`Period.range` raises `ValueError` if `start > end`. The dataclass is frozen,
so attribute reassignment raises `dataclasses.FrozenInstanceError`.

## Lines deleted

### `backend/app/services/pace_service.py`

- The `from calendar import monthrange` import (now lives in `spending.py`).
- The `_months_overlapping` helper definition (the previous lines ~378–395):

  ```python
  def _months_overlapping(date_from: date, date_to: date) -> list[tuple[int, int]]:
      """Every ``(year, month)`` such that the calendar month overlaps the range. ..."""
      months: list[tuple[int, int]] = []
      if date_from > date_to:
          return months
      y, m = date_from.year, date_from.month
      end_y, end_m = date_to.year, date_to.month
      while (y, m) <= (end_y, end_m):
          months.append((y, m))
          if m == 12:
              y, m = y + 1, 1
          else:
              m += 1
      return months
  ```

- The inline pace-factor block at the top of `_compute_pace_mode`:

  ```python
  days_in_month = monthrange(year, month)[1]
  elapsed_days = date_to.day  # inclusive of today
  pace_factor = Decimal(elapsed_days) / Decimal(days_in_month)
  ```

  replaced with `pace_factor = Period.range(date_from, date_to).pace_factor(date_to)`
  (preserving the `year`, `month` locals used downstream for budget loading and sub queries).

- The `_compute_actual_vs_budget_mode` call site changed from
  `months = _months_overlapping(date_from, date_to)` to
  `months = Period.range(date_from, date_to).months_overlapping()`.

### `backend/app/services/stats_service.py`

The previous lines ~163–172 in `get_spending_trend`:

```python
months: list[tuple[int, int]] = []
if date_from <= date_to:
    y, m = date_from.year, date_from.month
    end_y, end_m = date_to.year, date_to.month
    while (y, m) <= (end_y, end_m):
        months.append((y, m))
        if m == 12:
            y, m = y + 1, 1
        else:
            m += 1
```

replaced with

```python
if date_from > date_to:
    return []
months = Period.range(date_from, date_to).months_overlapping()
```

The previous code returned an empty trend for inverted ranges by leaving `months`
empty and short-circuiting; the new code keeps that contract by guarding before
constructing the `Period` (which would otherwise raise `ValueError`).

## Pace-mode decision

The plan permits migrating `_compute_pace_mode`'s local pace-factor math onto
`Period.pace_factor` if the diff is mechanical. **Migrated.** It collapsed three
lines (`days_in_month`, `elapsed_days`, `pace_factor`) into one. `date_to`
doubles as "today" in pace mode (the in-progress-current-month invariant
enforced by `_is_pace_range`), so the call is
`Period.range(date_from, date_to).pace_factor(date_to)`. The `year`/`month`
locals stayed because they're still used downstream for budget loading and
subscription queries — out of scope for this slice.

## New tests

`backend/tests/test_spending_period.py` — **31 cases**, all pure (no DB fixture):

- 5 `months_overlapping` cases (single-month, partial-single-month, cross-year,
  leap February, full-year chronological)
- 6 constructor-equivalence cases (covers `month`, `year`, `yyyymm`, plus
  February leap and non-leap, plus January padding for `yyyymm(202601)`)
- 3 validation cases (`range` rejects inverted endpoints, allows same-day,
  frozen dataclass)
- 7 `is_in_progress` parametrized cases (today inside, today equals end, end
  after today, today before start, today after end, sub-window of current
  month, completed last month)
- 6 `pace_factor` cases (first/mid/last-of-month, leap-February last day and
  mid, non-leap February last day)
- 4 `days_remaining` cases (today inside, before start, after end, equals end)

## Gate

```
cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check .
```

Result: **525 passed**, ruff check clean, ruff format clean.
