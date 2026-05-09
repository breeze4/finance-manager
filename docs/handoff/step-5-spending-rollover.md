# Step 5 — `BudgetTarget.with_rollover` + `actual_vs_budget` migration

Closes plan `docs/plans/2026-05-08-10-spending-rollover-and-actual-vs-budget.md`. Last step of bundle 1 (backend spending-math primitives).

## What changed

### `app/services/spending.py`

- Added `Mapping` import (`collections.abc`).
- `BudgetTarget` gained a third private slot, `_actuals_by_month: Mapping[int, Decimal] | None`, defaulting to `None`. The constructor now accepts it as a third optional argument.
- New classmethod:

  ```
  BudgetTarget.with_rollover(
      budget: Budget | None,
      actuals_by_month: Mapping[int, Decimal],
  ) -> BudgetTarget
  ```

  Sets `_apply_overrides=True` AND populates `_actuals_by_month`. Docstring documents the year-boundary semantics: the walk only covers Jan..Dec of `budget.year`; carry from December does not propagate.

- Refactored the override-or-baseline lookup into a private helper, `BudgetTarget._lookup_override_or_baseline(month) -> Decimal`, used by both `effective` branches.

- `BudgetTarget.effective(year, month)` now branches:
  - `_budget is None` → `Decimal("0")`.
  - `_actuals_by_month is None` → `_lookup_override_or_baseline(month)` (baseline + with_overrides flavors, unchanged behavior).
  - Otherwise (rollover flavor): if `year != _budget.year`, raise `ValueError`; else walk months `1..month-1`, accumulating `carry += target_m - actual_m`, and return `_lookup_override_or_baseline(month) + carry`.

### `app/services/budget_service.py`

- Imports added: `from decimal import Decimal`, `from app.services import spending`, `from app.services.spending import BudgetTarget, Period`.
- `get_actual_vs_budget(db, *, year)` rewritten:
  - Single up-front fetch: `actuals = spending.by_category_and_month(db, Period.year(year))`.
  - Per-budget construction: build `actuals_by_month = {m: actuals.get((budget.category_id, year, m), Decimal("0")) for m in range(1, 13)}`.
  - Pre-tax categories pre-fill `actuals_by_month[m] = with_overrides(budget).effective(year, m)` so the rollover walk produces zero carry — this preserves today's `test_pretax_with_rollover_mode_carries_zero_surplus` contract (carry was previously computed against the pre-tax-substituted actual; this is the equivalent now-explicit shape).
  - Pick `BudgetTarget.with_rollover(budget, actuals_by_month)` when `budget.rollover_mode`, else `BudgetTarget.with_overrides(budget)`.
  - Per-month: `target_amount = float(target.effective(year, month))`. `actual = round(target_amount, 2)` for pre-tax, else `round(float(actuals_by_month[month]), 2)`.
  - Inline `db.query(Transaction).filter(...)` for `actual_rows`, the `actual_map` dict, and the `rollover_carry` accumulator are deleted.
  - Response shape (`ActualVsBudgetResult` with `entries: list[ActualVsBudgetEntry]` and `monthly_rollups: list[MonthlyRollup]`) and rounding/float-coercion match today exactly.

The historical-analysis half of `budget_service.py` (`get_historical_analysis`, `_compute_trend`, `_detect_seasonal_months`, `get_budget_suggestions`, the related dataclasses) is unchanged — out of scope per the plan.

### `tests/test_spending_budget_target.py`

Added `pytest` import and a `TestWithRollover` class with seven tests:
- `test_january_no_prior_carry_matches_with_overrides` — January equals `with_overrides(budget).effective(year, 1)`.
- `test_february_with_january_surplus_carries_into_march` — Jan target 100, actual 80 → Feb is 120, March is 220.
- `test_february_with_january_deficit_subtracts_from_february` — Jan target 100, actual 130 → Feb is 70.
- `test_override_in_march_plus_carry_from_jan_feb` — March override 200 plus 30 carry from Jan/Feb = 230.
- `test_year_boundary_raises_value_error` — `effective(2027, 1)` on a `budget.year=2026` row raises `ValueError`.
- `test_empty_actuals_carries_full_cumulative_target` — `actuals_by_month={}` → effective grows linearly, Dec = 1200 for a 100/mo budget.
- `test_none_budget_returns_zero` — missing-budget shorthand still applies.

`test_rollover_budgets.py` (the regression contract) and `test_budget_pretax_actuals.py` pass without modification.

## Gate results

```
cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check .
```

- pytest: 555 passed.
- ruff check: All checks passed.
- ruff format --check: 110 files already formatted.

## Final sweep grep

```
$ grep -rn "_effective_budget\b\|_effective_monthly_budget\b\|_actuals_by_category\b\|_months_overlapping\b" backend/app/services/
backend/app/services/spending.py:79:        Matches the semantics of the former ``pace_service._months_overlapping``.
```

Single hit is a docstring referring to the former name — no live code uses it.

```
$ grep -n "db.query(Transaction).filter" backend/app/services/pace_service.py backend/app/services/stats_service.py backend/app/services/budget_service.py backend/app/services/csp_rollup_service.py
backend/app/services/budget_service.py:43:    base = db.query(Transaction).filter(
```

The remaining hit is inside `get_historical_analysis`, which is explicitly OUT OF SCOPE for bundle 1 (it doesn't deal in spending-math primitives). `pace_service`, `stats_service`, `csp_rollup_service`, and `budget_service.get_actual_vs_budget` are clean.

```
$ grep -rn "_baseline\b" backend/app/services/
backend/app/services/spending.py:200:    def _lookup_override_or_baseline(self, month: int) -> Decimal:
backend/app/services/spending.py:225:            return self._lookup_override_or_baseline(month)
backend/app/services/spending.py:232:            target_m = self._lookup_override_or_baseline(m)
backend/app/services/spending.py:235:        return self._lookup_override_or_baseline(month) + carry
```

All hits are the new `_lookup_override_or_baseline` private helper — not the deleted free-standing `_baseline` helper.

## Notable

- `stats_service.get_summary` still has one inline `db.query(func.count(Transaction.id)).filter(...)` for `transaction_count` (line 33). This is acceptable per Step 4's plan resolution: transaction-count isn't a spending-math primitive, so it doesn't belong in `spending.py`. The structural-filter invariant holds because `not_excluded_from_budget()` is applied locally there too.
- Pre-tax + rollover: I had to pre-fill `actuals_by_month` with the override-or-baseline value so the rollover walk produces zero carry. The previous implementation got this implicitly via the `if is_pre_tax: actual = target` substitution feeding back into `rollover_carry = target - actual = 0`. The new shape makes this explicit at the construction site.

## Bundle 1 status

After this slice, the spec's full migration is complete:
- `_effective_budget`, `_effective_monthly_budget`, `_baseline` (the old free-standing one), `_actuals_by_category`, `_months_overlapping` are all gone from service code.
- The structural filter is applied at exactly one point: `spending._apply_structural_filter`.
- `pace_service`, `stats_service`, `csp_rollup_service`, and `budget_service.get_actual_vs_budget` no longer construct `db.query(Transaction).filter(...)` for spending math.
- `BudgetTarget` has all three flavors (`baseline`, `with_overrides`, `with_rollover`) and the four+one outflow/income functions all live in `spending.py`.
