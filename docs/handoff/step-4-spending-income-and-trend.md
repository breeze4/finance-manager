# Step 4 handoff — `spending.income_total` + finish `stats_service` migration

## Plan

`docs/plans/2026-05-08-09-spending-income-and-trend.md`

## What landed

### New public function — `spending.income_total`

Signature:

```python
def income_total(db: Session, period: Period, *, exclude_pre_tax: bool = False) -> Decimal
```

- Inflow-side mirror of `range_total`: filters `Transaction.amount > 0`,
  applies the structural filter unconditionally via the existing
  `_apply_structural_filter` helper, and bounds by `[period.start,
  period.end]` inclusive.
- Returns a non-negative `Decimal` (zero when no rows match).
- `exclude_pre_tax` is included for signature symmetry with the outflow
  functions; pre-tax categories are a spending concept, so it is
  effectively a no-op for typical income transactions. No current caller
  passes it.

### `stats_service.get_summary` rewrite

New body shape (replaces the three inline queries plus structural filter
plumbing):

1. `period = Period.range(date_from or date.min, date_to or date.max)` —
   matches today's "skip filter when None" behavior since the spending
   functions then bound on the period; the unbounded sentinels effectively
   no-op.
2. `total_spending = spending.range_total(db, period)`.
3. `total_income = spending.income_total(db, period)`.
4. `savings_rate` computed from those two `Decimal`s (zero when income is
   zero); rounded to 4 decimals for the response.
5. `transaction_count` — single inline `COUNT(Transaction.id)` query
   (see below).
6. `top_categories` derived from `spending.by_category(db, period)`:
   sort by `Decimal` value descending, take top 10, resolve names via one
   `Category.id.in_(...)` query, fall back to the literal
   `"Uncategorized"` for the `None` key. Percentages computed against
   `total_spending`.
7. Response keys, types, and rounding match the prior implementation
   (verified by `test_stats_service` and `test_stats_api`).

### `stats_service.get_spending_trend` actuals migration

The inline `db.query(Transaction).filter(...).join(Category, ...)
.with_entities(...).group_by(extract("year"), extract("month")).all()`
block (and its row-to-dict post-process) was replaced by:

```python
period = Period.range(date_from, date_to)
actual_by_month = spending.by_year_month(db, period, exclude_pre_tax=True)
```

The downstream `expected_by_month` loop (which uses
`BudgetTarget.with_overrides(...).effective(year, month)`) is untouched —
it was already migrated in Step 2.

## Inline query that remains and why

`stats_service.get_summary` keeps a single inline COUNT query:

```python
transaction_count = (
    db.query(func.count(Transaction.id))
    .filter(
        Transaction.is_transfer.is_(False),
        not_excluded_from_budget(),
        Transaction.date >= period.start,
        Transaction.date <= period.end,
    )
    .scalar()
    or 0
)
```

There is no `spending.count` function in scope, and adding one purely
for this single caller does not earn its keep yet. The structural filter
is duplicated here at one site. Per the plan's "Implementation notes",
flag for a future `spending.count` if more callers emerge.

## Self-verification

- `stats_service.get_summary` — no `db.query(Transaction).filter(...)`
  for spending math. The only `Transaction` reference is the COUNT query
  above (no sign filter on it; that's the documented behavior preserved
  from before).
- `stats_service.get_spending_trend` — no inline
  `extract("year", ...)` / `extract("month", ...)` group-by remains.
  Both `extract` and the actuals `db.query(Transaction)` block are gone
  from the file (`grep -n "extract" app/services/stats_service.py`
  returns nothing).

## Tests added

Four tests added in a new `TestIncomeTotal` class in
`backend/tests/test_spending_queries.py`:

1. `test_structural_filter_drops_transfers` — transfer not counted.
2. `test_only_positive_amounts_counted` — outflow not counted.
3. `test_period_boundaries_inclusive` — start and end day inclusive,
   one day past `period.end` excluded.
4. `test_uncategorized_inflows_counted` — `category_id IS NULL` row
   contributes to the total.

## Gate

```
cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check .
```

- `pytest`: 548 passed.
- `ruff check`: All checks passed.
- `ruff format --check`: 110 files already formatted.

## Files touched

- `backend/app/services/spending.py` — added `income_total`.
- `backend/app/services/stats_service.py` — rewrote `get_summary`;
  replaced the actuals fetch in `get_spending_trend`.
- `backend/tests/test_spending_queries.py` — added `TestIncomeTotal`
  (4 tests).

## Hand-off to Step 5

`stats_service` is now fully migrated. Next plan
(`2026-05-08-10`) owns `BudgetTarget.with_rollover` and
`budget_service.get_actual_vs_budget`, both untouched here.
