# Spending Math Primitives — Period, BudgetTarget, Spending Functions

## Problem

Five backend services each hand-roll variants of "spending in a date range,
filtered structurally, grouped by category and/or month, with effective monthly
budget computed alongside." Concretely:

- Effective monthly budget exists in three places with intentional but
  poorly-isolated semantic differences. Two are explicitly self-flagged as
  duplicates of each other (the comment in stats reads "Duplicated from
  pace_service to keep budget_service must-not-touch"). A third lives inside an
  actual-vs-budget loop and adds rollover-carry. A fourth deliberately ignores
  overrides for the planning rollup.
- Month enumeration over a date range exists in two places (one as a private
  helper, one inlined).
- Spending in a range, grouped by category, is implemented five different ways
  across the services. One of them materialises every transaction in Python and
  accumulates in a loop — a known performance smell.
- Period parameters take four shapes across services: `(date_from, date_to,
  today)`, `(date_from, date_to)`, `(year,)`, `(month_yyyymm,)`.

The structural filter rule (`Transaction.is_transfer = false` AND
`not_excluded_from_budget()`) is documented in CLAUDE.md as "Structural, not
per-feature" — but is enforced today only by author discipline at each call
site. Adding a new spending-aware service means rediscovering and re-applying
the rule.

## Solution

Introduce one in-process module that owns three concerns:

1. **`Period`** — a frozen value type for date ranges with named constructors
   (`.month`, `.year`, `.range`, `.yyyymm`) and methods that capture the
   currently-fragmented derived facts (`months_overlapping`, `is_in_progress`,
   `pace_factor`, `days_remaining`).

2. **`BudgetTarget`** — a class with three flavor classmethods exposing the
   three intentional semantics:
   - `BudgetTarget.baseline(budget)` — `monthly_amount` only, no overrides
   - `BudgetTarget.with_overrides(budget)` — override-or-baseline
   - `BudgetTarget.with_rollover(budget, actuals_by_month)` — override-or-
     baseline plus accumulated carry walked sequentially across months
     The flavor lives in the constructor name; `.effective(year, month)` and
     `.effective_over(period)` resolve.

3. **Named spending functions** that wrap one canonical SQL primitive with the
   structural filter baked in:
   - `spending.range_total(db, period, *, exclude_pre_tax=False)`
   - `spending.by_category(db, period, *, exclude_pre_tax=False)`
   - `spending.by_year_month(db, period, *, exclude_pre_tax=False)`
   - `spending.by_category_and_month(db, period, *, exclude_pre_tax=False)`
   - `spending.income_total(db, period)` (inflow side; the only inflow caller
     today is `get_summary`)

The structural filter is applied unconditionally inside the module — no public
parameter disables it. Each function returns a `dict` keyed by the obvious
shape (`category_id` may be `None` for uncategorized) with `Decimal` values
that are positive magnitudes for outflow functions, signed for income.

`exclude_pre_tax` is the one optional axis exposed because exactly two callers
need it (`get_spending_trend`, `get_actual_vs_budget` in its actuals path) and
the alternative — post-fetch filtering by category lookup — is exactly what
those callers do today and is the duplication being removed.

## Data Flow

A typical caller after migration:

1. Construct a `Period` from the caller's natural input shape
   (`Period.month(2026, 5)`, `Period.range(date_from, date_to)`,
   `Period.year(2026)`).
2. Call one of the named `spending.*` functions with `(db, period)` to get a
   typed dict of actuals keyed however the caller needs.
3. For budget-aware callers: load the relevant `Budget` rows, wrap each with
   the appropriate `BudgetTarget` flavor classmethod, and call `.effective` per
   `(year, month)` or `.effective_over(period)` for a range total.
4. Compose results in caller-specific dataclasses (CategoryPace, BucketRollup,
   ActualVsBudgetEntry, etc. stay where they are).

The pace and CSP services keep their bucket-rollup, headline, pace-factor, and
synthetic-uncategorized logic — only their actuals fetches and effective-budget
lookups change. Subscription due-date math and net-income math stay outside
this module.

## Behavior

### What the module owns (responsibilities)

- The single SQL pattern: outflow-or-inflow, in a date range, grouped however
  the caller needs, with the structural filter applied.
- Month enumeration over a range.
- The three effective-budget flavors and the rollover walk.
- The "is this range the in-progress current month?" predicate and pace factor.
- Pre-tax exclusion as an optional axis on spending queries.

### What it hides (implementation details)

- The SQLAlchemy filter expressions (`Transaction.is_transfer.is_(False)`,
  `not_excluded_from_budget()`, `Transaction.amount < 0`).
- The outer-join-on-Category-with-IS-NULL-tolerance idiom used by pre-tax
  filtering.
- The `extract("year"/"month", date)` group-by SQL.
- The override-iteration lookup (`for o in budget.monthly_overrides if
  o.month == month`).
- The rollover-carry sequential walk.
- Sign normalization (callers always see positive Decimals from outflow
  functions; sign is internal).
- `month_yyyymm`-int versus `(year, month)`-tuple arithmetic.

### What it exposes (interface contract)

- `Period` — frozen dataclass with named constructors and pure-method derived
  facts. `Period.range(d1, d2)` requires `d1 <= d2`.
- `BudgetTarget` — class with three classmethod constructors that name their
  flavor. `.effective(year, month) -> Decimal`. `.effective_over(period) ->
  Decimal` sums across the period's months. `with_rollover` requires
  `actuals_by_month: Mapping[int, Decimal]` covering every month the caller
  will resolve.
- `spending.*` functions — top-level, take `(db: Session, period: Period)` plus
  `exclude_pre_tax: bool = False`. Return positive-magnitude `Decimal` values.
  Uncategorized rows surface under key `None` where applicable.

### Caller migration

Each existing caller migrates in one direction with no behavior change. Reference
mapping (responsibilities, not file paths):

- **summary endpoint** (current month / arbitrary range totals) → `range_total`
  + `by_category` + `income_total`.
- **monthly-stats endpoint** (per-month per-category totals for a year) →
  `by_category_and_month` over `Period.year(year)`.
- **spending-trend endpoint** (actual + expected per month over a range, pre-tax
  excluded) → `by_year_month(..., exclude_pre_tax=True)` for actuals; iterate
  `period.months_overlapping()` and sum
  `BudgetTarget.with_overrides(b).effective(y, m)` per non-pre-tax category for
  expected.
- **pace service** actuals fetch → `by_category`. Pace-factor/expected-MTD math
  stays in pace service. `BudgetTarget.with_overrides(...).effective(...)`
  replaces `_effective_budget`.
- **actual-vs-budget endpoint** → `by_category_and_month` for actuals;
  `BudgetTarget.with_rollover(b, actuals_for_b)` when `b.rollover_mode` else
  `BudgetTarget.with_overrides(b)`. Pre-tax substitution logic
  (`actual = effective_budget` for pre-tax categories) stays as a small
  caller-side post-step against `Category.is_pre_tax`.
- **CSP planning rollup** → `BudgetTarget.baseline(b).effective(year, month)`
  per category. No spending query needed (planning rollup uses baselines only).
- **CSP actuals rollup** → `by_category` over `Period.yyyymm(...)`. Pre-tax
  substitution mirrors the actual-vs-budget caller.

After migration, the helpers `_effective_budget`, `_effective_monthly_budget`,
`_months_overlapping`, `_actuals_by_category`, the inline rollover-carry loop
inside the actual-vs-budget endpoint, and the duplicated SQL filter chains
disappear.

## Dependency Strategy

**In-process.** Pure computation plus a single `Session` parameter on the
`spending.*` functions. No ports, no adapters, no abstract base classes.

The `Period` and `BudgetTarget` value types are pure — no `Session`, no I/O,
testable from literal dataclasses.

The `spending.*` functions take `Session` and execute one SQL aggregation each.
Tests use the existing in-memory SQLite fixture from the repo's `conftest.py`.

## Testing Strategy

### New boundary tests

- **`Period`** — table-driven tests for `months_overlapping` (single-month,
  cross-year, year-boundary, leap February), `is_in_progress` (today inside
  range with date_to >= today; today inside range with date_to < today; range
  ending in future with date_from in past), `pace_factor` (start-of-month,
  end-of-month, leap year, mid-month).
- **`BudgetTarget`** — table-driven tests per flavor:
  - `baseline`: returns `monthly_amount` regardless of overrides; returns 0
    for `None` budget.
  - `with_overrides`: returns override when month matches; returns
    `monthly_amount` when no override; returns 0 for `None`.
  - `with_rollover`: carry from prior month's surplus increases the next
    month's effective; deficit carry is honored; year-boundary carries (Dec →
    Jan) follow the documented rule (carry resets per-budget-row, since
    `Budget.year` is per-year — verify and codify).
- **`spending.*` functions** — for each public function:
  - Structural filter: a transfer transaction never appears; an
    `exclude_from_budget=true` category transaction never appears.
  - Sign convention: outflows return positive magnitudes; uncategorized rows
    appear under key `None`; income transactions in the date range do not
    appear in outflow functions.
  - `exclude_pre_tax=True` drops pre-tax categories from results; uncategorized
    rows still appear.
  - Period boundaries: a transaction on `date_from` is included; a transaction
    on `date_to` is included; a transaction one day outside is excluded.
  - Group-by correctness: month groupings split correctly across year
    boundaries; the result's keys exactly cover months present in the data
    (not necessarily all months in the period — caller fills gaps).

### Old tests to delete or replace

- Tests that exercise `pace_service._effective_budget` and
  `stats_service._effective_monthly_budget` indirectly through their parent
  service functions stay (those are still boundary tests of the parent
  service). The duplicate-coverage between them collapses to one set of
  `BudgetTarget.with_overrides` tests.
- `_months_overlapping` tests in pace-service tests collapse into `Period`
  tests.
- The pre-tax-exclusion assertions inside `test_stats_service` get a small twin
  inside the new module's `spending.by_year_month(..., exclude_pre_tax=True)`
  test, but the parent service tests continue to assert the integrated
  endpoint behavior.

### Test environment

The codebase already uses an in-memory SQLite session fixture. No new
infrastructure needed.

## Out of Scope

- Migrating subscription detection or paycheck detection to use these
  primitives. Those services have their own period semantics
  (frequency-based, not range-based) and are not in this bundle.
- Any change to the existing `Budget` / `BudgetMonthlyOverride` schema.
  This spec does not introduce envelope-balance tracking, save-by-date
  targets, or YNAB-style assignment semantics. The model remains baseline +
  per-month-override + per-category rollover-flag.
- Forecast service migration. Its computation uses historical-analysis
  outputs, not raw spending queries; if anything moves it would be a separate
  spec.
- Net-worth and snapshot services — they don't touch transaction-spending
  math.
- Frontend changes. This is a backend-only refactor; API response shapes do
  not change.
- New endpoints or new caller-visible features. The user-visible surface is
  unchanged after migration.

## Judgment Calls

- [x] **Module location and name**: `app/services/spending.py` flat, or a
      package?
  - Resolution: **flat module `app/services/spending.py`**. Every public
    symbol in one import; matches `stats_service` / `budget_service` style.

- [x] **Rollover year boundary**: drop or chain across years?
  - Resolution: **drop carry at year boundary**. `with_rollover` walks
    Jan–Dec of one `Budget` row only. December surplus is lost if no
    `Budget` row exists for January of the next year. Matches today's
    implicit behavior in `budget_service.get_actual_vs_budget`. Verify
    against `test_rollover_budgets` during implementation.

- [x] **`income_total` scope**: include in module or leave external?
  - Resolution: **include `income_total` in the module**. Symmetric with
    outflow functions; one structural-filter contract. `get_summary`
    migrates to it.

- [x] **`Period.pace_factor` location**: on `Period` or in `pace_service`?
  - Resolution: **on `Period` as a method**. Clean derived fact; testable
    in isolation.
