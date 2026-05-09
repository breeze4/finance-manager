# Step 3 handoff — `spending.*` outflow functions + first-wave migrations

Plan: `docs/plans/2026-05-08-08-spending-outflow-functions.md`.

## New public surface in `app/services/spending.py`

Four outflow query functions, all sharing one SQL pattern (structural filter
+ `Transaction.amount < 0` + date-range; optional pre-tax exclusion via
outer-join on `Category`):

```python
def range_total(db: Session, period: Period, *, exclude_pre_tax: bool = False) -> Decimal: ...
def by_category(db: Session, period: Period, *, exclude_pre_tax: bool = False) -> dict[int | None, Decimal]: ...
def by_year_month(db: Session, period: Period, *, exclude_pre_tax: bool = False) -> dict[tuple[int, int], Decimal]: ...
def by_category_and_month(db: Session, period: Period, *, exclude_pre_tax: bool = False) -> dict[tuple[int | None, int, int], Decimal]: ...
```

All return positive-magnitude Decimals. Uncategorized rows surface under
key `None` for `by_category` / `by_category_and_month`.

Private helpers (not exported):

- `_apply_structural_filter(query)` — applies
  `Transaction.is_transfer.is_(False)` + `not_excluded_from_budget()`. The
  structural filter is enforced unconditionally; no public parameter
  bypasses it.
- `_apply_pre_tax_exclusion(query)` — outer-joins `Category` and filters
  `Category.is_pre_tax IS FALSE OR Category.id IS NULL` (preserving
  uncategorized rows).
- `_outflow_base(db, period, *, exclude_pre_tax)` — assembles the common
  filtered base query used by all four public functions.

## Deleted helper

- `pace_service._actuals_by_category` — formerly at lines ~444–470 of
  `backend/app/services/pace_service.py`. Materialized every transaction in
  Python and accumulated in a loop. Removed entirely.

## Migration sites

| Caller | Before | After |
|---|---|---|
| `pace_service._compute_pace_mode` (line ~196) | `_actuals_by_category(db, date_from, date_to)` | `spending.by_category(db, Period.range(date_from, date_to))` |
| `pace_service._compute_actual_vs_budget_mode` (line ~308) | `_actuals_by_category(db, date_from, date_to)` | `spending.by_category(db, Period.range(date_from, date_to))` |
| `stats_service.get_monthly_stats` (lines ~89–133) | inline `GROUP BY` SQL with outer-join Category | `spending.by_category_and_month(db, Period.year(year))` plus a Python pass to resolve names + sort |
| `csp_rollup_service.get_actuals_rollup` (lines ~245–263) | `budget_service.get_actual_vs_budget(db, year=year)` then walk `entries` filtered by month | `spending.by_category(db, Period.yyyymm(month_yyyymm))` + pre-tax substitution post-step (see below) |

`csp_rollup_service` no longer imports `budget_service` at all.

## SQL deviation from today's queries

None. The `_outflow_base` query reproduces the exact filter chain used by
`stats_service.get_spending_trend` (today's exemplar):
`is_transfer.is_(False)` + `not_excluded_from_budget()` + `amount < 0` +
`[start, end]` date range, plus the same outer-join + `is_pre_tax IS FALSE
OR Category.id IS NULL` idiom for the pre-tax-exclusion axis. Group-by
columns use `extract("year", date)` / `extract("month", date)` matching the
existing pattern.

## `csp_rollup_service.get_actuals_rollup` second-loop pre-tax substitution

The new code shape:

```python
actuals_by_cat = spending.by_category(db, Period.yyyymm(month_yyyymm))
budgets = db.query(Budget).filter(Budget.year == year).all()
budget_by_cat: dict[int, Budget] = {b.category_id: b for b in budgets}

bucket_numerators: dict[str, Decimal] = {b: Decimal("0") for b in _BUCKET_ORDER}

# First loop: real outflows, with pre-tax substitution if a pre-tax category
# has any tracked spending.
for cat_id, actual in actuals_by_cat.items():
    if cat_id is None:
        continue
    cat = categories.get(cat_id)
    if cat is None or cat.exclude_from_budget:
        continue
    if cat.csp_bucket is None:
        continue
    if cat.is_pre_tax:
        actual = BudgetTarget.with_overrides(budget_by_cat.get(cat_id)).effective(year, month)
    if cat.csp_bucket in bucket_numerators:
        bucket_numerators[cat.csp_bucket] += actual

# Second loop: pre-tax categories with NO transactions still need to
# contribute their planned target. Without this, every pre-tax bucket would
# read 0 in actuals mode.
for cat in categories.values():
    if not cat.is_pre_tax:
        continue
    if cat.exclude_from_budget:
        continue
    if cat.csp_bucket is None:
        continue
    if cat.id in actuals_by_cat:
        continue  # already handled above
    target = BudgetTarget.with_overrides(budget_by_cat.get(cat.id)).effective(year, month)
    if cat.csp_bucket in bucket_numerators:
        bucket_numerators[cat.csp_bucket] += target
```

This preserves today's semantics exactly: every pre-tax category with a
budget contributes its (override-or-baseline) target to its bucket
numerator regardless of whether spending data exists.

## Tests

`backend/tests/test_spending_queries.py` — 11 test cases across 5 test
classes:

- `TestStructuralFilter` (2): transfer never appears; `exclude_from_budget`
  category never appears.
- `TestSignConvention` (3): outflows positive; inflows skipped; uncategorized
  under `None`.
- `TestExcludePreTax` (2): pre-tax dropped when flag set; uncategorized kept.
- `TestPeriodBoundaries` (2): start + end inclusive; one day outside excluded.
- `TestYearBoundaryGroupBy` (2): `by_year_month` and `by_category_and_month`
  split correctly across a year boundary.

## Gate result

- `pytest` — 544 passed (was 533 before; +11 new).
- `ruff check .` — All checks passed.
- `ruff format --check .` — 110 files already formatted.

No other test or source file required modification.
