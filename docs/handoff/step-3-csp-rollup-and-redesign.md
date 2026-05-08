# Step 3 Handoff — CSP Rollup Service and Set Budget Redesign

## Backend

### Module

`backend/app/services/csp_rollup_service.py` — new file.

### Public function signature

```python
def get_planning_rollup(db: Session, month_yyyymm: int) -> PlanningRollup
```

`month_yyyymm` is the integer YYYYMM form used by the net-income service
(`net_income_service.parse_yyyymm_string("2026-05")` → `202605`).

The numerator math intentionally uses **`Budget.monthly_amount`
baselines only** — overrides and rollover are excluded. This is the
spec requirement so the dashboard reflects the user's plan, not the
in-flight state of any single month.

### `BucketRollup` shape (verbatim)

```python
@dataclass
class BucketRollup:
    bucket: str                       # "fixed" | "investments" | "savings" | "guilt_free"
    numerator: Decimal                # sum of category baselines (incl. pre-tax) in this bucket
    denominator: Decimal              # net_income + pre_tax_total — same on every record
    percentage: Decimal               # numerator / denominator * 100, rounded to 1 decimal; 0 if no net income
    ramit_min: Decimal                # lower range bound, in percent
    ramit_max: Decimal | None         # upper range bound, or None for Investments
    status: str                       # "under" | "in-range" | "over"
    is_open_ended_over: bool          # True only for Investments when over its 10% floor
```

### `PlanningRollup` shape

```python
@dataclass
class PlanningRollup:
    month_yyyymm: int
    denominator: Decimal              # take_home + pre_tax_total, or just pre_tax_total if no net income
    take_home: Decimal | None         # None if no net-income period covers the month
    pre_tax_total: Decimal            # sum of pre-tax category baselines (frontend tooltip composition)
    buckets: list[BucketRollup]       # exactly 4 records, in canonical order: fixed, investments, savings, guilt_free
    unbucketed_categories: list[dict] # [{id, name}, ...] — spending categories with NULL csp_bucket
    has_net_income: bool              # True iff take_home is not None
```

### NULL-bucket policy

A spending category goes into `unbucketed_categories` iff:
- `exclude_from_budget=False`,
- `csp_bucket IS NULL`,
- `name NOT IN ("Income", "Transfers", "Uncategorized")`.

The hardcoded exclusion set is the user-approved list from
Step 1's data migration (`4810a336d8d4_seed_csp_buckets`). Constant:
`_INTENTIONALLY_NULL_BUCKET_NAMES` in `csp_rollup_service.py`.

### Range classifier (hardcoded constants)

| Bucket       | Min  | Max  | Notes                                      |
|--------------|------|------|--------------------------------------------|
| fixed        | 50%  | 60%  | strict `<` / `>` for under/over            |
| investments  | 10%  | None | open-ended; `>` 10% sets `is_open_ended_over=True` |
| savings      | 5%   | 10%  |                                            |
| guilt_free   | 20%  | 35%  |                                            |

Boundary values are **in-range** (50%, 60%, 10%, etc.).

### Router

`backend/app/routers/csp_router.py` (new), registered in `app/main.py`
via one import (`csp_router`) and one `app.include_router(csp_router.router)`.

- **Path**: `GET /api/csp/rollup`
- **Query params**:
  - `month` (required) — `YYYY-MM` string, parsed via `net_income_service.parse_yyyymm_string`. Returns 400 on malformed input.
  - `mode` (optional, default `"planning"`) — currently only `"planning"` is implemented.
- **Status codes**:
  - `200` — `mode=planning`, returns the rollup.
  - `400` — malformed month, or unknown mode (anything other than `planning` or `actuals`).
  - `501` — `mode=actuals` (Slice 4 will replace this branch with a real dispatch into `csp_rollup_service.get_actuals_rollup`).

The handler is structured as `if mode == "planning": ...` then `if mode == "actuals": raise 501`. Slice 4's edit is a one-line change: replace the 501 with the actuals dispatch.

### Tests

`backend/tests/test_csp_rollup_service.py` — new file, 23 cases:
- empty DB shape (4 buckets, all zero)
- basic rollup math
- pre-tax inflates denominator and bucket numerator
- excluded categories invisible
- unbucketed user category appears in warning, doesn't contribute to numerators
- intentionally-NULL categories (Income/Transfers/Uncategorized) suppressed from warning
- Fixed range classifier (5 boundary cases)
- Investments open-ended-over (4 cases)
- Savings range (4 cases)
- Guilt-Free range (4 cases)
- missing net income → percentages 0, status under
- empty bucket → 0% under
- router smoke (planning, actuals 501, unknown mode 400, malformed month 400)

## Frontend

### New file

`frontend/src/api/csp.ts` — types and fetch function. Snake_case at the
wire boundary (matches `categories.ts`; no adapter layer).

Exports:

```ts
type CspMode = "planning" | "actuals";
type BucketStatus = "under" | "in-range" | "over";

interface BucketRollup {
  bucket: CspBucket;
  numerator: number;
  denominator: number;
  percentage: number;
  ramit_min: number;
  ramit_max: number | null;
  status: BucketStatus;
  is_open_ended_over: boolean;
}

interface UnbucketedCategory { id: number; name: string; }

interface PlanningRollup {
  month: string;             // "YYYY-MM"
  mode: CspMode;
  month_yyyymm: number;
  denominator: number;
  take_home: number | null;
  pre_tax_total: number;
  has_net_income: boolean;
  buckets: BucketRollup[];   // always 4, canonical order
  unbucketed_categories: UnbucketedCategory[];
}

function getPlanningRollup(month: string): Promise<PlanningRollup>
```

`CspBucket` is reused from `frontend/src/api/categories.ts` so the
type union stays in one place.

### Query keys

- `["budget", { year }]` — existing
- `["budget", "historical"]` — existing
- `["budget", "actual", { year }]` — existing
- `["categories"]` — new fetch for csp_bucket / is_pre_tax per category
- `["csp", "planning", monthKey]` — new for the planning rollup (monthKey is the current `YYYY-MM`)

`invalidateBudget` in `Budget.tsx` invalidates **both** `["budget"]`
and `["csp", "planning", currentMonthKey]` so bucket cards refresh
live as the user edits baselines.

### `Budget.tsx` regions modified

| Region | Before | After |
|---|---|---|
| File header docblock (line 1–22) | "Four tabs … Flex" | rewritten to describe the three-tab CSP layout |
| Imports (lines 35–72) | added `AlertTriangle`, `CheckCircle2`, `ChevronDown` from lucide; added `Link` from `react-router-dom`; added `categories.ts` and `csp.ts` imports |  |
| `SetBudgetView` (was at line 398) | flat per-category table with month selector | rewritten as CSP planning surface — net-income block, NULL-bucket warning banner, four bucket dashboard cards, bucket-grouped collapsible category sections; new `BucketDashboardCard` helper, `BUCKET_LABEL` and `BUCKET_DESCRIPTION` constants, `bucketRangeLabel`, `bucketStatusBadge`. Component now takes `categories: CategoryResponse[]` and `rollup: PlanningRollup \| undefined`. |
| `FlexBucket` type (was line 1074) | declared | **deleted** |
| `FlexItem` interface (was line 1076) | declared | **deleted** |
| `classifyBucket` function (was line 1091) | declared | **deleted** |
| `FlexView` function (was line 1098) | declared | **deleted** |
| Tabs list (was line 1334–1339) | 4 triggers, `grid-cols-4` | 3 triggers (`historical`, `set`, `actual`), `grid-cols-3` |
| `<TabsContent value="set">` body | `<NetIncomeEditor />` + `<SetBudgetView ...>` | `<SetBudgetView ...>` only — `NetIncomeEditor` is now mounted inside `SetBudgetView`'s top section. The empty-state branch (no budgets yet) still renders `<NetIncomeEditor />` directly so the user can still set net income before seeding budgets. |
| `<TabsContent value="flex">` (was line 1403–1411) | rendered `<FlexView>` | **deleted** |
| `defaultValue="actual"` on the `<Tabs>` | unchanged — the existing default was already `actual`, no-op | unchanged |
| Main page `useQuery` block | + `categoriesQ` (`["categories"]`, `listCategories`) and `rollupQ` (`["csp", "planning", currentMonthKey]`, `getPlanningRollup(currentMonthKey)`); `invalidateBudget` now also invalidates the rollup key |  |

`progressColor` (line ~143) is still in use by `ActualVsBudgetView` — kept.
`Lock` and `RefreshCw` icons still used by the rollover toggle — kept.

### NULL-bucket warning banner placement

Rendered as the **second** child of `SetBudgetView` (right after the
net-income block, before the bucket dashboard cards). Single yellow
banner listing the affected category names with a "Fix in Categories"
link to `/categories`. Hidden when `unbucketed_categories.length === 0`.
No per-row inline warnings.

### Net income / denominator tooltip

Below the `<NetIncomeEditor />` block, a small muted line shows
"CSP denominator: $X (take-home + $Y pre-tax)" when net income is set
and `pre_tax_total > 0`. The full composition string is also exposed
via the `title` attribute (native browser tooltip) — kept simple to
avoid pulling in the Radix tooltip primitive for one location.

## Test counts

- **Backend**: 398 passed (369 + 29 new from `test_csp_rollup_service.py`).
- **Frontend tests**: 286 passed (unchanged — no new test files this slice; manual smoke recommended).
- **Frontend build**: succeeds, 1016 KB bundle.

## Deferred / not done

- Manual smoke test of the redesigned Set Budget tab against the live
  backend — recommended before merging, but not part of the automated
  gate. The plan calls for end-to-end verification that inline edits
  update bucket cards live; the query-key invalidation wiring is in
  place for this to work.
- Pre-tax actuals math and the Actual vs Budget tab redesign — owned
  by Step 4 (`docs/plans/2026-05-07-17-pretax-actuals-and-actual-vs-budget-csp.md`).
- The CSP rollup endpoint's `mode=actuals` branch returns 501 by
  design. Step 4 will replace that branch with a real dispatch into a
  new `get_actuals_rollup` function in the same service module.

## Key constants for Step 4

- The router handler at `csp_router.py` is structured as
  `if mode == "planning": ... if mode == "actuals": raise 501`. Step 4
  replaces the 501 line with `return _actuals_to_response(...)`.
- The intentionally-NULL exclusion list lives in `_INTENTIONALLY_NULL_BUCKET_NAMES`
  in `csp_rollup_service.py`. Reuse it for the actuals path so the
  warning surface stays consistent.
- Pre-tax categories already include their baseline in both numerator
  and denominator for the planning rollup. Step 4 must extend
  `budget_service` to compute "actual_for_planning := budget" for
  pre-tax categories (i.e., synthetic actual equal to the planned
  baseline) so they don't appear as 0% spent in the actuals view.
