# spending.income_total + finish stats_service migration

## Parent spec

`docs/specs/2026-05-08-02-spending-math-primitives.md`

## What to build

Add the inflow-side query function to `app/services/spending.py`:

- `income_total(db, period) -> Decimal` — sum of inflow magnitudes
  (`Transaction.amount > 0`) over the period, with the structural filter
  applied. No `exclude_pre_tax` flag (pre-tax is an outflow concept).

Migrate the two remaining `stats_service` callers:

1. `stats_service.get_summary` — currently runs three queries inline (total
   spending, total income, top categories). Replace with a composition of
   `spending.range_total(db, period)`, `spending.income_total(db, period)`,
   and `spending.by_category(db, period)`. Top-categories list is built
   from the `by_category` result (top 10 by Decimal value, descending).
   Response shape preserved exactly.
2. `stats_service.get_spending_trend` — currently builds `actual_by_month`
   via an inline `GROUP BY` and `expected_by_month` via the inline category +
   budget loop. Replace `actual_by_month` with
   `spending.by_year_month(db, period, exclude_pre_tax=True)`. Replace the
   `_effective_monthly_budget` call (already migrated to `BudgetTarget` in
   plan `2026-05-08-07`) — the only change here is the actuals fetch.
   Response shape preserved.

After this slice, `stats_service` no longer contains any inline
`db.query(Transaction).filter(...)` for spending math. The structural
filter is no longer applied at any call site in `stats_service`.

## Type

AFK

## Blocked by

- Blocked by `2026-05-08-07-spending-budget-target.md` —
  `get_spending_trend` uses `BudgetTarget.with_overrides`.
- Blocked by `2026-05-08-08-spending-outflow-functions.md` — uses
  `spending.range_total`, `spending.by_category`, `spending.by_year_month`
  (all added there).

## Spec sections addressed

- "Solution" — point 3 (named spending functions, including
  `income_total` per the resolved judgment call)
- "Behavior" → "Caller migration" — summary endpoint, spending-trend
  endpoint mappings
- "Resolved judgment calls" — `income_total` included in the new module

## Acceptance criteria

- [ ] `app/services/spending.py` exports `income_total(db, period) -> Decimal`.
- [ ] `income_total` applies the structural filter unconditionally and
      `Transaction.amount > 0`; returns the sum as a positive Decimal.
- [ ] `stats_service.get_summary` no longer contains
      `db.query(Transaction).filter(...)`. Its response shape is unchanged
      (verified by `test_stats_service` and `test_stats_api`).
- [ ] `stats_service.get_spending_trend` no longer contains the inline
      `GROUP BY extract(year, ...), extract(month, ...)` query for actuals;
      it uses `spending.by_year_month(db, period, exclude_pre_tax=True)`.
- [ ] `tests/test_spending_queries.py` (added in plan 08) gains an
      `income_total` test class covering: structural filter; sign filter
      (only positive amounts); period boundaries; uncategorized inflows
      counted.
- [ ] Full `pytest` and `ruff` pass.

## Owns

- `backend/app/services/spending.py` — adds `income_total`.
- `backend/app/services/stats_service.py` — rewrites `get_summary` body
  (lines ~11–86) and the actuals-fetch portion of `get_spending_trend`
  (lines ~177–212). The `expected_by_month` loop in `get_spending_trend`
  (lines ~214–242) was already migrated in plan 07; this plan only touches
  the actuals fetch above it.
- `backend/tests/test_spending_queries.py` — adds `income_total` test
  class.

## Must not touch

- `pace_service` — no changes; already migrated.
- `csp_rollup_service` — no changes; already migrated.
- `budget_service.get_actual_vs_budget` — owned by plan `2026-05-08-10`.
- `BudgetTarget.with_rollover` — owned by plan `2026-05-08-10`.
- `Period`, `BudgetTarget`, `range_total`, `by_category`, `by_year_month`,
  `by_category_and_month` — already defined; this plan only consumes them
  and adds `income_total`.
- API router files — no signature changes.

## Defines interfaces

- `spending.income_total` in `backend/app/services/spending.py` — no
  downstream plan depends on this; it's a leaf addition for `get_summary`.

## Pattern exemplar

- **Follow the pattern in**: `backend/app/services/spending.py` (the
  outflow functions added in plan `2026-05-08-08`) — `income_total` is the
  inflow-side mirror.
- **Follow the pattern in**: `backend/tests/test_stats_api.py` for the
  endpoint-level integration tests verifying response shape stays the same.

## Tasks

- [ ] Add `income_total(db, period, *, exclude_pre_tax=False) -> Decimal`
      to `app/services/spending.py`. Mirror `range_total`'s shape but
      filter `Transaction.amount > 0`. Note: `exclude_pre_tax` is included
      in the signature for symmetry but typically irrelevant for income
      (pre-tax categories are spending categories). Default `False`.
- [ ] Add an `income_total` test class to `tests/test_spending_queries.py`:
      structural filter (transfer not counted); sign filter (only `> 0`
      counted, outflows not counted); period boundaries; uncategorized
      inflows still counted.
- [ ] Rewrite `stats_service.get_summary` body:
      - Construct `period = Period.range(date_from, date_to)` (handle the
        `None` cases — see implementation notes).
      - `total_spending = spending.range_total(db, period)`.
      - `total_income = spending.income_total(db, period)`.
      - `by_cat = spending.by_category(db, period)` — produce
        `top_categories` from this dict (top 10 by Decimal, descending,
        with category-name lookup in one query). Uncategorized appears
        under key `None`; resolve to the literal `"Uncategorized"`.
      - `transaction_count`: keep as a single COUNT query — there's no
        `spending.count` function in scope. Acceptable to leave inline OR
        compute via `len(by_cat)` if that's equivalent (it is NOT — count
        is per-transaction, not per-category). Leave the COUNT query
        inline; flag for a future plan.
      - Compute `savings_rate` and round response fields exactly as today.
- [ ] Rewrite `stats_service.get_spending_trend` actuals fetch (lines
      ~177–212):
      ```python
      period = Period.range(date_from, date_to)
      actual_by_month = spending.by_year_month(db, period, exclude_pre_tax=True)
      ```
      Drop the inline `db.query(Transaction).filter(...).join(Category, ...)
      .with_entities(...).group_by(...).all()` block. The downstream
      `expected_by_month` loop already uses `BudgetTarget` (from plan 07);
      no change there.
- [ ] Run `pytest backend/tests/`. Confirm all suites pass without test
      modification (response shapes unchanged).
- [ ] Run `ruff check backend/`. Fix any unused imports.

## Implementation notes

### `get_summary` `None` handling

The current function accepts `date_from: date | None` and `date_to: date | None`.
The new code must construct a `Period` only when both endpoints are present;
when either is None, fall back to a default — but the spec mandates the
structural filter applies unconditionally, so the simplest path is to
require a Period in `spending.*` and compute the period upstream.

**Decision**: in `get_summary`, when either `date_from` or `date_to` is
`None`, use the same defaults as today's inline code: no lower bound (use
`date.min`), no upper bound (use `date.max`). Construct `Period.range(
date_from or date.min, date_to or date.max)`. The
spending functions filter on `Transaction.date >= period.start` and `<=
period.end` so the `date.min`/`date.max` bounds effectively no-op.

Verify: this matches today's behavior where `if date_from is not None: ...`
guards skip adding the filter clause. Either approach yields the same SQL
result set.

### `get_summary` top-categories transformation

Today's inline `category_rows` query returns `(category_id, category_name,
total)` tuples. After migration, `spending.by_category` returns
`dict[int | None, Decimal]` without category names. Resolve names in a
follow-up query:

```python
by_cat = spending.by_category(db, period)
# Sort, take top 10
top_keys = sorted(by_cat.items(), key=lambda kv: kv[1], reverse=True)[:10]
cat_ids = {k for k, _ in top_keys if k is not None}
cat_names = {c.id: c.name for c in
             db.query(Category).filter(Category.id.in_(cat_ids)).all()}
top_categories = []
for cid, total in top_keys:
    name = cat_names.get(cid, "Uncategorized") if cid is not None else "Uncategorized"
    pct = (float(total) / float(total_spending) * 100) if total_spending > 0 else 0.0
    top_categories.append({
        "category_id": cid,
        "category_name": name,
        "total": round(float(total), 2),
        "percentage": round(pct, 1),
    })
```

This produces the same response shape as today.

### Transaction count

`get_summary` returns `transaction_count` — count of in-range non-transfer
non-excluded transactions (no sign filter). The existing implementation:

```python
transaction_count = base.count()
```

where `base` is the structurally-filtered query. There's no
`spending.count(...)` function in scope for this plan, and adding one
purely for one caller doesn't earn its keep yet. Keep the inline count
query, but use the structural filter helper if it's exposed (it's
file-private inside `spending.py`). Inline equivalent:

```python
transaction_count = (
    db.query(func.count(Transaction.id))
    .filter(Transaction.is_transfer.is_(False), not_excluded_from_budget())
    .filter(Transaction.date >= period.start, Transaction.date <= period.end)
    .scalar() or 0
)
```

This duplicates the structural filter at one site — flag in the spec for
a future `spending.count` if more callers emerge. Acceptable trade-off.

### Pre-tax flag on `income_total`

Including `exclude_pre_tax` on `income_total` is purely for signature
symmetry. No current caller uses it. The flag is harmless: pre-tax
categories typically have no income transactions, so the filter is a
no-op. If a code reviewer pushes back on YAGNI grounds, drop the flag —
no migration depends on it.

### `get_spending_trend` — what stays untouched

The `expected_by_month` loop (lines ~214–242) was migrated in plan
`2026-05-08-07` to `BudgetTarget.with_overrides(...).effective(year, month)`.
Do not modify it again here. The only change in this plan is the
`actual_by_month` fetch above it.
