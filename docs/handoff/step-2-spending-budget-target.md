# Step 2 handoff — `BudgetTarget` (baseline + with_overrides)

## What landed

`BudgetTarget` lives in `backend/app/services/spending.py` alongside
`Period`. Two of its three planned flavors are exposed; the third
(`with_rollover`) is left for plan `2026-05-08-10`.

## New public surface

```python
class BudgetTarget:
    @classmethod
    def baseline(cls, budget: Budget | None) -> "BudgetTarget": ...
    @classmethod
    def with_overrides(cls, budget: Budget | None) -> "BudgetTarget": ...

    def effective(self, year: int, month: int) -> Decimal: ...
    def effective_over(self, period: Period) -> Decimal: ...
```

Resolution semantics:

- `baseline` ignores overrides; always returns `Budget.monthly_amount`
  (or `Decimal("0")` for `None`).
- `with_overrides` returns the matching `BudgetMonthlyOverride.amount`
  if one exists for `month`, else the baseline; `Decimal("0")` for
  `None`.
- `effective_over(period)` sums `effective(year, month)` across
  `period.months_overlapping()`.

The `year` parameter on `effective` is accepted but unused for these
two flavors — kept for forward compatibility with `with_rollover` (Step
5), which needs it to look up the right `Budget` row.

## Call-site migrations

| File | Old | New |
| --- | --- | --- |
| `pace_service.py` (line 210, in `_compute_pace_mode`) | `_effective_budget(budget_by_cat.get(cat.id), month)` | `BudgetTarget.with_overrides(budget_by_cat.get(cat.id)).effective(year, month)` |
| `pace_service.py` (line 326, in `_compute_actual_vs_budget_mode`) | `_effective_budget(budget_by_cat_year.get((cat.id, year)), month)` | `BudgetTarget.with_overrides(budget_by_cat_year.get((cat.id, year))).effective(year, month)` |
| `stats_service.py` (line 232, in `get_spending_trend`) | `_effective_monthly_budget(budget, month)` | `BudgetTarget.with_overrides(budget).effective(year, month)` |
| `csp_rollup_service.py` (line 184, in `get_planning_rollup`) | `_baseline(budget_by_cat.get(cat.id))` | `BudgetTarget.baseline(budget_by_cat.get(cat.id)).effective(year, month)` |
| `csp_rollup_service.py` (line 280, in `get_actuals_rollup` pre-tax loop) | `_baseline(budget_by_cat.get(cat.id))` | `BudgetTarget.baseline(budget_by_cat.get(cat.id)).effective(year, month)` |

`get_planning_rollup` now also derives `month = month_yyyymm % 100`
locally so the `effective(year, month)` call site has both halves of
the calendar key in scope.

## Helpers deleted

- `backend/app/services/pace_service.py` — `_effective_budget(budget, month) -> Decimal` (was the 11-line `def` block at lines 411–421 in the pre-Step-2 file).
- `backend/app/services/stats_service.py` — `_effective_monthly_budget(budget, month) -> Decimal` (was the 13-line `def` block at lines 250–262 in the pre-Step-2 file).
- `backend/app/services/csp_rollup_service.py` — `_baseline(budget) -> Decimal` (was the 5-line `def` block at lines 331–335 in the pre-Step-2 file).

A pre-flight grep now returns no hits:

```
grep -rn "_effective_budget\b\|_effective_monthly_budget\b\|def _baseline\b" backend/app/services/
```

## Tests

`backend/tests/test_spending_budget_target.py` — **8 test cases**:

1. `test_baseline_returns_monthly_amount_regardless_of_overrides`
2. `test_baseline_returns_zero_for_none_budget`
3. `test_with_overrides_returns_override_when_month_matches`
4. `test_with_overrides_returns_baseline_when_no_override_matches`
5. `test_with_overrides_returns_zero_for_none_budget`
6. `test_effective_over_sums_with_overrides_across_three_months`
7. `test_effective_over_single_month_equals_effective_for_that_month`
8. `test_effective_over_baseline_flavor_sums_baseline_only` — extra
   sanity check the plan didn't list explicitly: confirms
   `effective_over` honors the `baseline` flavor (no override pickup).

Tests run pure in-memory: `Budget` and `BudgetMonthlyOverride` are
constructed without the DB session, since `BudgetTarget` only walks
the `monthly_overrides` list relationship.

## Gate

```
backend $ uv run pytest          # 533 passed
backend $ uv run ruff check .    # All checks passed!
backend $ uv run ruff format --check .   # 109 files already formatted
```

(`stats_service.py` needed one `ruff format` pass after the helper
deletion — applied; format-check now clean.)

## Plan deviations

None of substance. One incidental:

- The plan flagged the `_effective_monthly_budget` deletion as "lines
  ~259–271"; the actual lines in the pre-Step-2 file were 250–262.
  Same block, just slightly earlier offsets. The line drift in the
  plan came from counting the helper's docstring; not a real
  divergence.
- The `get_planning_rollup` migration required deriving `month =
  month_yyyymm % 100` (the function previously only computed `year`).
  This is a one-line addition and is necessary to satisfy the
  `effective(year, month)` signature. Documented above.
