# spending.* outflow functions + pace/monthly-stats/csp-actuals migration

## Parent spec

`docs/specs/2026-05-08-02-spending-math-primitives.md`

## What to build

Add the four outflow-side `spending.*` query functions to
`app/services/spending.py`:

- `range_total(db, period, *, exclude_pre_tax=False) -> Decimal`
- `by_category(db, period, *, exclude_pre_tax=False) -> dict[int | None, Decimal]`
- `by_year_month(db, period, *, exclude_pre_tax=False) -> dict[tuple[int, int], Decimal]`
- `by_category_and_month(db, period, *, exclude_pre_tax=False) -> dict[tuple[int | None, int, int], Decimal]`

Each function applies the structural filter unconditionally:
`Transaction.is_transfer.is_(False)` AND `not_excluded_from_budget()` AND
`Transaction.amount < 0` (outflow). Each returns positive-magnitude
`Decimal` values. Uncategorized transactions surface under key `None`.
The `exclude_pre_tax=True` path adds an outer-join on `Category` and a
`Category.is_pre_tax IS FALSE OR Category.id IS NULL` filter (preserving
uncategorized rows).

Migrate three callers that fetch outflow actuals today:

1. `pace_service._actuals_by_category` — used by both pace mode and
   actual-vs-budget mode. Today materializes every transaction in Python and
   accumulates in a loop (a known performance smell). Replace both call sites
   with `spending.by_category(db, period)`. Delete the helper.
2. `stats_service.get_monthly_stats` — replace its inline `GROUP BY` query
   with `spending.by_category_and_month(db, Period.year(year))`, then build
   the response dicts from the keyed result. Preserve the existing response
   shape (`list[dict]` with `month`, `category_id`, `category_name`, `total`).
3. `csp_rollup_service.get_actuals_rollup` — replace the
   `budget_service.get_actual_vs_budget` indirection used to compute bucket
   numerators (line ~245 + the `for entry in actual_result.entries` loop at
   ~250–263) with a direct `spending.by_category(db, Period.yyyymm(month_yyyymm))`
   call plus a pre-tax substitution post-step (look up
   `Category.is_pre_tax`; if true, replace the actual with
   `BudgetTarget.with_overrides(budget).effective(year, month)`).

`stats_service.get_summary` (which also uses outflow data, plus inflow), and
`stats_service.get_spending_trend` (which uses `by_year_month` with
`exclude_pre_tax=True`) are NOT migrated here — they're owned by plan
`2026-05-08-09` (which adds `income_total` and finishes the stats migration).

`budget_service.get_actual_vs_budget` is NOT migrated here — it's owned by
plan `2026-05-08-10` (which adds `BudgetTarget.with_rollover`).

## Type

AFK

## Blocked by

- Blocked by `2026-05-08-06-spending-period.md` — needs `Period`.
- The `csp_rollup_service` migration in this plan also requires
  `BudgetTarget.with_overrides`, which lands in plan
  `2026-05-08-07`. Mark this plan as **also blocked by 07** so the
  csp-actuals migration's pre-tax substitution post-step works without
  duplicating override-lookup logic.

## Spec sections addressed

- "Solution" — point 3 (named spending functions)
- "Behavior" → "What the module owns" — single SQL pattern; pre-tax
  exclusion as optional axis
- "Behavior" → "What it hides" — SQLAlchemy filter expressions, sign
  normalization, `extract("year"/"month", ...)` group-by SQL, outer-join
  pre-tax idiom
- "Behavior" → "Caller migration" — pace, monthly-stats, csp-actuals
  mappings
- "Testing Strategy" → `spending.*` boundary-test bullets

## Acceptance criteria

- [ ] `app/services/spending.py` exports `range_total`, `by_category`,
      `by_year_month`, `by_category_and_month` with the signatures above.
- [ ] All four functions apply the structural filter unconditionally; no
      public parameter disables it.
- [ ] All four functions return positive-magnitude Decimals for outflows;
      uncategorized rows appear under key `None` for `by_category` /
      `by_category_and_month`.
- [ ] `exclude_pre_tax=True` drops pre-tax categories from results;
      uncategorized rows still appear.
- [ ] `pace_service._actuals_by_category` is deleted; both pace-mode and
      actual-vs-budget-mode call sites use `spending.by_category(db, period)`.
- [ ] `stats_service.get_monthly_stats` uses
      `spending.by_category_and_month(db, Period.year(year))` and produces
      the same response shape as before (verified by existing
      `test_stats_service` and `test_stats_api` suites).
- [ ] `csp_rollup_service.get_actuals_rollup` no longer calls
      `budget_service.get_actual_vs_budget` for its bucket numerators. It
      uses `spending.by_category` for the actuals fetch and applies pre-tax
      substitution as a post-step against `Category.is_pre_tax`.
      `test_csp_rollup_service` passes without modification.
- [ ] `tests/test_spending_queries.py` exists with at least the cases
      enumerated below.
- [ ] Full `pytest` and `ruff` pass.

## Owns

- `backend/app/services/spending.py` — adds four outflow query functions.
  `Period` and `BudgetTarget` are already present; do not modify them.
- `backend/app/services/pace_service.py` — replaces `_actuals_by_category`
  call sites at the two locations (line ~196 in pace mode, line ~308 in
  actual-vs-budget mode), then deletes the helper (lines ~444–470).
- `backend/app/services/stats_service.py` — rewrites `get_monthly_stats`
  body (lines ~89–133) to use `spending.by_category_and_month`. The
  function signature and return shape stay identical.
- `backend/app/services/csp_rollup_service.py` — rewrites the bucket-numerator
  computation in `get_actuals_rollup` (lines ~245–263) to use
  `spending.by_category` plus a pre-tax substitution loop. Removes the
  `budget_service.get_actual_vs_budget` call. The pre-tax-total loop
  (lines ~272–280, already migrated to `BudgetTarget.baseline` in plan 07)
  stays.
- `backend/tests/test_spending_queries.py` — new file, unit tests for the
  four `spending.*` functions.

## Must not touch

- `stats_service.get_summary` — owned by plan `2026-05-08-09`.
- `stats_service.get_spending_trend` — owned by plan `2026-05-08-09`
  (its actuals path uses `by_year_month` + `exclude_pre_tax`).
- `budget_service.get_actual_vs_budget` — owned by plan `2026-05-08-10`.
- `BudgetTarget.with_rollover` — added in plan `2026-05-08-10`.
- The `Budget`, `BudgetMonthlyOverride`, `Category`, `Transaction` ORM
  models. No schema changes.
- API router files in `backend/app/routers/` — no signature changes;
  this plan is service-internal.

## Defines interfaces

- `spending.range_total`, `spending.by_category`, `spending.by_year_month`,
  `spending.by_category_and_month` in `backend/app/services/spending.py` —
  consumed by plans `2026-05-08-09`, `2026-05-08-10`.

## Pattern exemplar

- **Follow the pattern in**: `backend/app/services/stats_service.py`
  (current `get_spending_trend` for the year+month group-by SQL pattern;
  current `get_summary` for the `is_transfer.is_(False)` +
  `not_excluded_from_budget()` filter chain).
- **Follow the pattern in**: `backend/tests/test_stats_service.py` for the
  service-test conventions (`_seed_categories` helper, `_make_txn` helper,
  `db: Session` fixture from conftest).

## Tasks

- [ ] Add a private `_apply_structural_filter(query)` helper inside
      `spending.py` that applies `Transaction.is_transfer.is_(False)` and
      `not_excluded_from_budget()`. Use this from all four functions.
- [ ] Implement `range_total(db, period, *, exclude_pre_tax=False)` —
      single `SUM(amount)` over the structural filter + `amount < 0` +
      date range; pre-tax filter via outer-join when flag is set; return
      `abs(Decimal(...))`.
- [ ] Implement `by_category(db, period, *, exclude_pre_tax=False)` —
      `GROUP BY category_id`, return positive-magnitude Decimals keyed by
      `category_id` (None for uncategorized).
- [ ] Implement `by_year_month(db, period, *, exclude_pre_tax=False)` —
      `GROUP BY extract(year, date), extract(month, date)`, return Decimals
      keyed by `(year, month)`.
- [ ] Implement `by_category_and_month(db, period, *, exclude_pre_tax=False)`
      — `GROUP BY category_id, extract(year, date), extract(month, date)`,
      return Decimals keyed by `(category_id | None, year, month)`.
- [ ] Write `tests/test_spending_queries.py` with cases for each function:
      - Structural filter: a transfer transaction never appears; an
        `exclude_from_budget=true` category transaction never appears.
      - Sign convention: outflows return positive magnitudes; income
        transactions in the date range do not appear in outflow functions;
        uncategorized rows under key `None`.
      - `exclude_pre_tax=True` drops pre-tax categories; uncategorized
        rows still appear.
      - Period boundaries: a transaction on `period.start` is included; on
        `period.end` is included; one day outside is excluded.
      - Group-by: a `Period.range` crossing a year boundary correctly
        splits months in `by_year_month` and `by_category_and_month`.
- [ ] Migrate `pace_service._compute_pace_mode` (line ~196):
      `_actuals_by_category(db, date_from, date_to)` →
      `spending.by_category(db, Period.range(date_from, date_to))`.
- [ ] Migrate `pace_service._compute_actual_vs_budget_mode` (line ~308):
      same replacement.
- [ ] Delete `pace_service._actuals_by_category` (lines ~444–470).
- [ ] Rewrite `stats_service.get_monthly_stats` (lines ~89–133): build a
      `Period.year(year)`, call `spending.by_category_and_month`, then map
      the keyed result back to the response list. If `category_id` is
      provided, filter the result dict by that key after the call (or
      pass it through; see implementation notes).
- [ ] Rewrite `csp_rollup_service.get_actuals_rollup` bucket numerators
      (lines ~245–263): replace the `budget_service.get_actual_vs_budget`
      call with `spending.by_category(db, Period.yyyymm(month_yyyymm))`.
      For each `(category_id, actual)` in the result, look up the
      Category; if `cat.is_pre_tax`, substitute `actual` with
      `BudgetTarget.with_overrides(budget_by_cat.get(cat.id)).effective(year, month)`;
      otherwise use `actual` as-is. Add to bucket numerator if
      `cat.csp_bucket` is set.
- [ ] Drop the now-unused `from app.services import budget_service` import
      in `csp_rollup_service` if no other lines reference it. (The
      `_baseline` removal in plan 07 likely already broke this import; double
      check.)
- [ ] Run `pytest backend/tests/`. Confirm all suites pass.
- [ ] Run `ruff check backend/`. Fix any unused-import warnings.

## Implementation notes

### `_apply_structural_filter` shape

```python
def _apply_structural_filter(query):
    return query.filter(
        Transaction.is_transfer.is_(False),
        not_excluded_from_budget(),
    )
```

### Pre-tax exclusion idiom (matches today's `get_spending_trend`)

```python
if exclude_pre_tax:
    q = q.join(Category, Transaction.category_id == Category.id, isouter=True)
    q = q.filter(or_(Category.is_pre_tax.is_(False), Category.id.is_(None)))
```

### `pace_service._actuals_by_category` callers

Today:

```python
actuals_by_cat = _actuals_by_category(db, date_from, date_to)
uncategorized_actual = actuals_by_cat.pop(None, Decimal("0"))
```

After migration:

```python
actuals_by_cat = spending.by_category(db, Period.range(date_from, date_to))
uncategorized_actual = actuals_by_cat.pop(None, Decimal("0"))
```

The `.pop(None, ...)` line is preserved — the new function also returns
uncategorized rows under key `None`.

### `stats_service.get_monthly_stats` — preserving response shape

The existing function returns:

```
[{"month": int, "category_id": int|None, "category_name": str, "total": float}, ...]
```

After migration, the body becomes (sketch):

```python
period = Period.year(year)
keyed = spending.by_category_and_month(db, period)
# keyed: dict[(category_id|None, year, month), Decimal]
if category_id is not None:
    keyed = {k: v for k, v in keyed.items() if k[0] == category_id}
# Resolve category names in one query.
cat_ids = {k[0] for k in keyed.keys() if k[0] is not None}
cats = {c.id: c.name for c in db.query(Category).filter(Category.id.in_(cat_ids)).all()}
return [
    {
        "month": m,
        "category_id": cid,
        "category_name": cats.get(cid, "Uncategorized") if cid is not None else "Uncategorized",
        "total": round(float(total), 2),
    }
    for (cid, _y, m), total in sorted(keyed.items(), key=lambda kv: (kv[0][2], -float(kv[1])))
]
```

The sort matches the existing `order_by` (month asc, then most-negative
first → which here means largest magnitude first, descending).

### `csp_rollup_service.get_actuals_rollup` bucket-numerator rewrite

Today (sketch):

```python
actual_result = budget_service.get_actual_vs_budget(db, year=year)
for entry in actual_result.entries:
    if entry.month != month: continue
    cat = categories.get(entry.category_id)
    if cat is None or cat.exclude_from_budget: continue
    if cat.csp_bucket is None: continue
    if cat.csp_bucket in bucket_numerators:
        bucket_numerators[cat.csp_bucket] += Decimal(str(entry.actual_spend))
```

After migration:

```python
period = Period.yyyymm(month_yyyymm)
year, month = month_yyyymm // 100, month_yyyymm % 100
actuals_by_cat = spending.by_category(db, period)  # dict[int|None, Decimal]
budgets = db.query(Budget).filter(Budget.year == year).all()
budget_by_cat = {b.category_id: b for b in budgets}
for cat_id, actual in actuals_by_cat.items():
    if cat_id is None: continue          # uncategorized never goes into a bucket
    cat = categories.get(cat_id)
    if cat is None or cat.exclude_from_budget: continue
    if cat.csp_bucket is None: continue
    if cat.is_pre_tax:
        # pre-tax substitution: use the effective target as "actual"
        actual = BudgetTarget.with_overrides(budget_by_cat.get(cat_id)).effective(year, month)
    if cat.csp_bucket in bucket_numerators:
        bucket_numerators[cat.csp_bucket] += actual
```

Important: this loop only sees categories with non-zero spending OR pre-tax
categories with overrides. But pre-tax categories typically have NO
spending (the money never lands in tracked accounts), so they won't appear
in `actuals_by_cat`. The current implementation handles this because
`get_actual_vs_budget` synthesizes pre-tax actuals. **The new code must
also iterate `categories.values()` for pre-tax categories not present in
`actuals_by_cat`** to add their substituted target. Add a second loop:

```python
for cat in categories.values():
    if not cat.is_pre_tax: continue
    if cat.exclude_from_budget: continue
    if cat.csp_bucket is None: continue
    if cat.id in actuals_by_cat: continue  # already handled above
    target = BudgetTarget.with_overrides(budget_by_cat.get(cat.id)).effective(year, month)
    if cat.csp_bucket in bucket_numerators:
        bucket_numerators[cat.csp_bucket] += target
```

This preserves today's semantics exactly: every pre-tax category with a
budget contributes its target to its bucket numerator regardless of
whether spending data exists for it.

### `stats_service.get_monthly_stats` — note about `category_id` filter

The original function applies `category_id is not None` filter inside the
SQL. After migration, the filter happens after `spending.by_category_and_month`
returns. For typical category counts (~20) this is fine. If a future
profiler shows it matters, push the filter into a `category_ids` parameter
on `spending.by_category_and_month`. Not in scope for this plan.
