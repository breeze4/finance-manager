# BudgetTarget (baseline + with_overrides) + planning rollup migration

## Parent spec

`docs/specs/2026-05-08-02-spending-math-primitives.md`

## What to build

Add `BudgetTarget` to the `app/services/spending.py` module with two of its
three flavor classmethods: `baseline(budget)` and `with_overrides(budget)`.
Each returns a `BudgetTarget` instance carrying the resolution semantics
inside it. Resolve via `.effective(year, month) -> Decimal` and
`.effective_over(period: Period) -> Decimal`. The third flavor
(`with_rollover`) is added in plan `2026-05-08-10`.

Migrate three call sites that currently re-implement override-or-baseline
lookup:

- `pace_service._effective_budget` (private helper, used in pace mode and
  actual-vs-budget mode) → delete; replace callers with
  `BudgetTarget.with_overrides(budget).effective(year, month)`.
- `stats_service._effective_monthly_budget` (the explicit duplicate) →
  delete; replace its single call site in `get_spending_trend` with
  `BudgetTarget.with_overrides(budget).effective(year, month)`.
- `csp_rollup_service._baseline` → delete; replace with
  `BudgetTarget.baseline(budget).effective(year, month)`.

The CSP planning rollup (`csp_rollup_service.get_planning_rollup`) is
fully migrated as part of this slice — it's the only caller using
`baseline`-flavor semantics, and migrating it proves the abstraction.

## Type

AFK

## Blocked by

- Blocked by `2026-05-08-06-spending-period.md` — `BudgetTarget.effective_over`
  takes a `Period`.

## Spec sections addressed

- "Solution" — point 2 (`BudgetTarget` class with three flavor classmethods)
- "Behavior" → "What it hides" — override-iteration lookup
- "Behavior" → "Caller migration" — pace, stats spending-trend, csp planning
  rollup mappings
- "Testing Strategy" → `BudgetTarget` bullets for `baseline` and
  `with_overrides`

## Acceptance criteria

- [ ] `app/services/spending.py` exports `BudgetTarget` with classmethods
      `baseline(budget: Budget | None) -> BudgetTarget` and
      `with_overrides(budget: Budget | None) -> BudgetTarget`, plus instance
      methods `effective(year: int, month: int) -> Decimal` and
      `effective_over(period: Period) -> Decimal`.
- [ ] `pace_service._effective_budget` is deleted; both pace-mode and
      actual-vs-budget-mode call sites use
      `BudgetTarget.with_overrides(budget).effective(year, month)`.
- [ ] `stats_service._effective_monthly_budget` is deleted; the call site
      in `get_spending_trend` uses
      `BudgetTarget.with_overrides(budget).effective(year, month)`.
- [ ] `csp_rollup_service._baseline` is deleted; `get_planning_rollup`
      uses `BudgetTarget.baseline(budget).effective(year, month)` for each
      category baseline including the pre-tax sum loop.
- [ ] `csp_rollup_service.get_actuals_rollup`'s pre-tax-total loop (lines
      ~272–280) also uses `BudgetTarget.baseline(...)` for the pre-tax
      baseline sum (it currently calls `_baseline` for this).
- [ ] `tests/test_spending_budget_target.py` exists with the cases listed
      below.
- [ ] Existing `test_pace_service`, `test_stats_service`,
      `test_csp_rollup_service` suites pass without modification.

## Owns

- `backend/app/services/spending.py` — adds `BudgetTarget`, its two
  classmethods, and instance methods. `Period` is already present from
  plan `2026-05-08-06`; do not modify `Period`.
- `backend/app/services/pace_service.py` — replaces `_effective_budget`
  call sites at the two locations in `_compute_pace_mode` (line ~210) and
  `_compute_actual_vs_budget_mode` (line ~326), then deletes the helper
  (lines ~431–441).
- `backend/app/services/stats_service.py` — replaces the
  `_effective_monthly_budget` call inside `get_spending_trend` (line ~241),
  then deletes the helper (lines ~259–271).
- `backend/app/services/csp_rollup_service.py` — replaces all `_baseline`
  call sites (line ~183 in `get_planning_rollup`, line ~280 in
  `get_actuals_rollup`'s pre-tax-total loop), then deletes the helper
  (lines ~331–335).
- `backend/tests/test_spending_budget_target.py` — new file, unit tests
  for `BudgetTarget` baseline + with_overrides flavors.

## Must not touch

- `BudgetTarget.with_rollover` and the rollover walk — owned by plan
  `2026-05-08-10`.
- `budget_service.get_actual_vs_budget` — owned by plan `2026-05-08-10`
  (its inline override + rollover loop is replaced there).
- `pace_service._actuals_by_category` — owned by plan `2026-05-08-08`.
- `stats_service.get_summary` and `stats_service.get_monthly_stats` —
  owned by plan `2026-05-08-08` and `2026-05-08-09`.
- `csp_rollup_service.get_actuals_rollup`'s actuals-fetch loop (lines
  ~250–263) — owned by plan `2026-05-08-08`.
- `Period` — already defined; this plan only consumes it.

## Defines interfaces

- `BudgetTarget` value type and its classmethods/methods in
  `backend/app/services/spending.py` — consumed by plans
  `2026-05-08-09`, `2026-05-08-10`.

## Pattern exemplar

- **Follow the pattern in**: `backend/app/services/category_filters.py` and
  the new `app/services/spending.py` (from plan `2026-05-08-06`) — keep
  module style consistent.
- **Follow the pattern in**: `backend/tests/test_pace_service.py` for
  test-file conventions (`_seed_categories` helper, `db: Session` parameter,
  Decimal assertions). `BudgetTarget` tests do NOT need a `db` — pass
  `Budget` model instances constructed in-memory (no `db.add`/`commit`).

## Tasks

- [ ] Add `BudgetTarget` class to `app/services/spending.py` with two
      private fields (`_budget: Budget | None`, `_apply_overrides: bool`)
      and the classmethods `baseline` (sets `_apply_overrides=False`) and
      `with_overrides` (sets `True`).
- [ ] Implement `effective(year: int, month: int) -> Decimal`:
      - if `_budget is None`: return `Decimal("0")`.
      - if `_apply_overrides`: search `_budget.monthly_overrides` for the
        matching month; return `Decimal(str(override.amount))` if found
        else `Decimal(str(_budget.monthly_amount))`.
      - else: return `Decimal(str(_budget.monthly_amount))`.
      Note: `year` is accepted for forward-compatibility with `with_rollover`
      (which needs it) but `baseline` and `with_overrides` ignore it. Keep
      the parameter for API uniformity.
- [ ] Implement `effective_over(period: Period) -> Decimal`: sum `effective`
      across `period.months_overlapping()`.
- [ ] Write `tests/test_spending_budget_target.py`:
      - `baseline` returns `monthly_amount` regardless of overrides.
      - `baseline` returns `0` for `None` budget.
      - `with_overrides` returns override when month matches.
      - `with_overrides` returns `monthly_amount` when no override matches.
      - `with_overrides` returns `0` for `None` budget.
      - `effective_over(period)` sums correctly across a 3-month range
        with one month overridden, two months baseline.
      - `effective_over` over an empty-equivalent range (single month)
        equals `effective(year, month)`.
- [ ] Migrate `pace_service._compute_pace_mode` (line ~210):
      `_effective_budget(budget_by_cat.get(cat.id), month)` →
      `BudgetTarget.with_overrides(budget_by_cat.get(cat.id)).effective(year, month)`.
- [ ] Migrate `pace_service._compute_actual_vs_budget_mode` (line ~326):
      same replacement, with the loop's `(year, month)` tuple.
- [ ] Delete `pace_service._effective_budget` (lines ~431–441) and the
      now-unused docstring lines.
- [ ] Migrate `stats_service.get_spending_trend` (line ~241):
      `_effective_monthly_budget(budget, month)` →
      `BudgetTarget.with_overrides(budget).effective(year, month)`.
- [ ] Delete `stats_service._effective_monthly_budget` (lines ~259–271).
- [ ] Migrate `csp_rollup_service.get_planning_rollup` (line ~183):
      `_baseline(budget_by_cat.get(cat.id))` →
      `BudgetTarget.baseline(budget_by_cat.get(cat.id)).effective(year, month)`.
- [ ] Migrate `csp_rollup_service.get_actuals_rollup` pre-tax-total loop
      (line ~280): same replacement.
- [ ] Delete `csp_rollup_service._baseline` (lines ~331–335).
- [ ] Run `pytest backend/tests/`. Confirm all suites pass.
- [ ] Run `ruff check backend/`. Fix any unused-import warnings from the
      deletions.

## Implementation notes

`Budget.monthly_overrides` is a list of `BudgetMonthlyOverride` ORM rows,
each with `month: int` and `amount: float`. The lookup pattern in both
`pace_service._effective_budget` and `stats_service._effective_monthly_budget`
is identical:

```python
for override in budget.monthly_overrides:
    if override.month == month:
        return Decimal(str(override.amount))
return Decimal(str(budget.monthly_amount))
```

`csp_rollup_service._baseline` is even simpler — just
`Decimal(str(budget.monthly_amount))` with a None-guard. Use this as the
implementation of `baseline`-flavor `effective`.

The `year` parameter on `effective` is accepted but unused for these two
flavors. This is intentional: `with_rollover` (added in plan
`2026-05-08-10`) needs `year` to look up the right `Budget` row. Keeping a
uniform signature avoids API churn when the third flavor lands.

For all three migrations: the existing call sites already have a local
`budget` variable from `budget_by_cat.get(cat.id)` or similar — preserve
those locals and just swap the function call.

`csp_rollup_service` has TWO call sites of `_baseline`: line ~183 inside
`get_planning_rollup`'s category loop, and line ~280 inside
`get_actuals_rollup`'s pre-tax-total loop. Migrate both. The actuals-rollup
function as a whole is migrated for its actuals-fetch in plan
`2026-05-08-08`; this plan only touches the pre-tax-total loop within it.
