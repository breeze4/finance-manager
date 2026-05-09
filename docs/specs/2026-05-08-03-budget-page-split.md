# Budget Page Split — Extract Views, Shared Primitives, and Variance View-Model

## Problem

The Budget page is a single file at ~1,679 lines containing three independent
tab feature areas (Historical, Set Budget, Actual vs Budget) plus their support
components, plus shared visual primitives, plus all data fetching for the page.
Concretely:

- The default-export `Budget` page owns six queries, four mutations, and one
  piece of UI state (`actualSelectedMonth`), and threads everything down as
  props.
- Three view components (157 / 339 / 184 lines) are presentational but live in
  the same file.
- Two sub-components (`BudgetVarianceChart` 216 lines, `CategoryDrilldown` 78
  lines) are buried inside the file.
- Module-scope shared primitives (`MonthSelector`, `BUCKET_LABEL`,
  `BUCKET_DESCRIPTION`, `BucketDashboardCard`, `bucketStatusBadge`,
  `ActualsBucketCard`, `trackingStatusBadge`, `bucketRangeLabel`, the date
  helpers `MONTH_NAMES` / `monthKey` / `shortMonth` / `monthLabel` /
  `allMonthsForYear` / `pastAndCurrentMonthsForYear`, plus chart styling
  `tooltipStyle` / `chartColors`) are only reachable by living in this file.
- A duplicate ordered-bucket constant exists: imported `CSP_BUCKETS` from the
  categories API module versus a file-local `ACTUAL_BUCKET_ORDER`. Same data,
  two names.
- `progressColor` is dead code.
- `NetIncomeEditor` is rendered in two places (inside `SetBudgetView` and
  again in the zero-budget fallback path).
- The Actual-vs-Budget view contains the most bug-prone transforms in the
  page: `actualByCatMonth` map construction, `rowsWithBucket` building,
  `rowsByBucket` grouping, `buildMonthAnnotations`-equivalent inline logic.
  These are the spots where a wrong number on screen comes from a transform
  bug, not a render bug. Today they are tested only indirectly through whatever
  manual smoke-testing the page receives.

The page works correctly. The cost is editability and AI-assist reliability:
edits past ~1k lines drift, find-in-page becomes the primary navigation tool,
and the variance-row math is impossible to unit-test in isolation.

## Solution

Split the page along two axes simultaneously:

1. **Co-locate by feature.** Pull each tab's view component into its own file
   under a new `components/budget/` folder, matching the existing
   `pages/Overview.tsx` + `components/overview/` pattern. Pull the shared
   primitives (`MonthSelector`, bucket cards, bucket badges, date helpers,
   chart styling) into sibling files in the same folder.

2. **Extract pure-function transforms for the Actual-vs-Budget tab only.**
   The bug-prone transforms in this tab become pure functions in a sibling
   `actualVsBudgetViewModel.ts` file, with unit tests against literal data
   fixtures. The other two tabs (Historical, Set Budget) do not earn this
   ceremony — their transforms are simple, and component-level tests with
   fixture props give equivalent coverage.

`Budget.tsx` continues to own all queries, all mutations, and the
`actualSelectedMonth` state. The three view components remain pure
presentational (props in, JSX + local UI state out, callbacks for mutations).

This is the lowest-risk shape that captures the testability win where it
actually matters.

## Data Flow

After the split:

1. `Budget.tsx` (the default export) fires the same six `useQuery` calls and
   defines the same four `useMutation` callbacks. Mutation `onSuccess`
   continues to invalidate the same three query-key prefixes (`["budget"]`,
   `["csp", "planning", currentMonthKey]`, `["csp", "actuals",
   actualSelectedMonth]`).
2. `Budget.tsx` renders Radix `<Tabs defaultValue="actual">` and dispatches
   data + mutation callbacks to one of three view components per tab.
3. `HistoricalView` and `SetBudgetView` receive their data as props, hold their
   own local UI state (collapsed buckets, drafts, selected month-or-all), and
   render via shared primitives.
4. `ActualVsBudgetView` receives its raw data as props, calls pure
   view-model functions (`buildVarianceRows`, `groupRowsByBucket`,
   `buildMonthAnnotations`, `buildBucketSections`) to produce render-ready
   data, then renders. The view-model functions live in a sibling file and
   are unit-tested directly.
5. `CategoryDrilldown` continues to own its `["transactions",
   "for-budget-drilldown", ...]` query and continues to be lazy-mounted by
   `BudgetVarianceChart` only when its row is expanded.

No backend wire shape changes. No URL changes. No new state owners.

## Behavior

### What `Budget.tsx` (the page) owns after the split

- All six `useQuery` calls (`["budget", { year }]`, `["budget", "historical"]`,
  `["budget", "actual", { year }]`, `["categories"]`, `["csp", "planning",
  currentMonthKey]`, `["csp", "actuals", actualSelectedMonth]`).
- All four `useMutation` definitions (set-baseline, set-monthly-override,
  delete-monthly-override, suggest).
- The `actualSelectedMonth` `useState`.
- The Radix `<Tabs>` shell and the conditional rendering of empty-state hints.
- `NetIncomeEditor` rendered exactly once (above the conditional) so the
  zero-budget fallback no longer needs a parallel render.

### What `components/budget/` owns after the split

- One file per view component (`HistoricalView`, `SetBudgetView`,
  `ActualVsBudgetView`).
- One file each for the two sub-components (`BudgetVarianceChart`,
  `CategoryDrilldown`).
- One file per shared visual primitive that's reused or independently
  testable (`MonthSelector`, `BucketDashboardCard`, `ActualsBucketCard`).
- Three small lib files for primitives that are constants, helpers, or
  one-line-each functions: `bucket-copy.ts` (`BUCKET_LABEL`,
  `BUCKET_DESCRIPTION`, `bucketRangeLabel`), `date-helpers.ts` (`MONTH_NAMES`,
  `monthKey`, `shortMonth`, `monthLabel`, `allMonthsForYear`,
  `pastAndCurrentMonthsForYear`, `currentYear`, `currentMonthKey`),
  `chart-style.ts` (`tooltipStyle`, `chartColors`).
- One pure-function module for the Actual-vs-Budget transforms:
  `actualVsBudgetViewModel.ts` exporting `buildVarianceRows`,
  `groupRowsByBucket`, `buildMonthAnnotations`, `buildBucketSections`, the
  shared `VarianceRow` / `RowsByBucket` / `BucketSection` types, and any
  helpers used inside those (e.g. `mapToZonePosition`).

### What's hidden (becomes private)

- `bucketStatusBadge` lives inside `BucketDashboardCard.tsx` (only consumer).
- `trackingStatusBadge` lives inside `ActualsBucketCard.tsx` (only consumer).
- `trendIcon` lives inside `HistoricalView.tsx`.
- `mapToZonePosition` and `getTierColors` move with `BudgetVarianceChart` (or
  into the view-model file if that ends up cleaner — judgment call).
- `MonthAnnotation` interface lives next to `MonthSelector`.

### What's deleted

- `progressColor` (dead code).
- `ACTUAL_BUCKET_ORDER` (replaced everywhere by `CSP_BUCKETS` from the
  categories API module).
- The duplicate `<NetIncomeEditor />` render in the zero-budget fallback path.

### What `ActualVsBudgetView` looks like after the split

The view component receives raw data as props (`budgets`, `actual`,
`actualsRollup`, `selectedMonth`, `onSelectedMonthChange`, plus a
`categoryById` map if needed). At the top of its render:

```
const annotations = buildMonthAnnotations(...);
const sections = buildBucketSections(
  groupRowsByBucket(buildVarianceRows(...)),
  actualsRollup,
);
```

Then the JSX iterates `sections` and renders one bucket card group per
section. The view component stays as a React component; only the transforms
move out.

### Caller migration / public-import boundary

There are no external consumers of any internal symbols of `Budget.tsx`
today (it is a route-level page, not a library). The migration is internal.

## Dependency Strategy

**In-process. React + TypeScript + Vite. No new runtime deps.**

The `actualVsBudgetViewModel.ts` module is pure: no React imports, no API
imports, no hooks. It accepts data shapes already defined in `@/api/budget`
and `@/api/csp` (e.g. `BudgetState`, `ActualVsBudgetResult`, `ActualsRollup`)
and the `CategoryResponse` type from `@/api/categories`. Its outputs are
plain TypeScript types co-defined in the same file.

The view components are React components but accept all data as props; no
hooks except for local UI state (`useState`, `useMemo`). They are renderable
in component tests with literal fixture props.

`Budget.tsx` is the only file that talks to React Query.

## Testing Strategy

### New unit tests (against pure functions in `actualVsBudgetViewModel.ts`)

Concrete cases to write:

- **`buildVarianceRows` — rollover-mode with override.** Budget with
  `rolloverMode: true`, baseline `300`, server-returned `budgetTarget` for
  the month `350`, server-returned `actualSpend` `200`. Asserts `budget=350`,
  `baseBudget=300`, `carryover=50`, `actual=200`, `pct = round(200/350*100)`,
  `remaining=150`.
- **`buildVarianceRows` — explicit override no rollover.** Budget with
  `rolloverMode: false`, baseline `300`, override `{"2026-03": 500}`,
  queried for March. Asserts `baseBudget=500`, `budget=500`, `carryover=0`.
- **`buildVarianceRows` — actuals miss.** Category has a budget but no
  spending in the queried month. Asserts `actual=0`, `remaining=baseline`,
  `pct=0` and no `NaN` (the production code today divides through with no
  guard inside the inline transform).
- **`groupRowsByBucket` — null-bucket category.** A row whose category has
  `csp_bucket=null` lands in `other`, not in any of the four `groups`.
- **`groupRowsByBucket` — bucket order preserved.** With rows in mixed
  bucket order, the result preserves canonical bucket order
  (`fixed`/`investments`/`savings`/`guilt_free`).
- **`buildMonthAnnotations` — partial year.** Available months
  `["2026-01","2026-02","2026-03"]` but `monthlyRollups` only contains Jan
  and Feb. Asserts annotations only for Jan and Feb; March is absent.
- **`buildMonthAnnotations` — color thresholds.** Three sample percentages
  exercise the three color buckets (under-budget, near-budget, over-budget).
  Pin the exact color strings the production code returns.
- **`buildBucketSections` — empty sections suppressed.** When a bucket has no
  rows, that bucket's section is omitted from the result so the view doesn't
  render an empty card.

### New component tests (with literal prop bundles)

These verify rendering correctness against fixture data, without any
network or `QueryClient`:

- **`MonthSelector` annotation rendering.** Render with a known months/
  annotations prop pair; assert annotation pct/delta text is present on the
  correct buttons, the green dot lights only on the current-month key, the
  selected button has the active variant.
- **`BucketDashboardCard` status branches.** Three renders covering
  `is_open_ended_over=true` (over (ok)), `status="over"` (destructive
  styling), `status="under"` (yellow styling). Pin badge text and accent
  classes.
- **`ActualsBucketCard` delta sign.** Two renders: `actual > planned`
  produces `+X.X pts`, `actual < planned` produces unsigned negative;
  tracking-status badge text matches the input.

These tests are run alongside the existing Mortgage / CoastFire / Categories
tests using the existing Vitest + React Testing Library setup.

### Tests not added

- No tests of `Budget.tsx` itself. It is data-fetching plus prop threading;
  testing it requires a `QueryClientProvider`, an `MSW`-style mock layer, and
  a router. Not in scope for this refactor — would be a future addition.
- No tests of `HistoricalView` or `SetBudgetView` transforms. Their
  data-shaping is simple enough that component tests with fixture props
  cover the regressions worth covering. The view-model split is reserved for
  the one tab where pure-function tests genuinely beat component tests.

### Test environment needs

Already in place: Vitest, React Testing Library, jsdom, the existing
component-test conventions in `frontend/src/pages/__tests__/` and
`frontend/src/hooks/__tests__/`. No new infrastructure.

## Out of Scope

- Migrating `Budget.tsx` to per-view hooks (Design B). Each tab will continue
  to receive data as props from the page-level fetch.
- Sub-routing each tab as `/budget/historical` etc. (Design C). The page
  continues to use Radix `<Tabs>`.
- Splitting `SetBudgetView` further (its bucket-table render is ~115 lines
  and could become `SetBudgetBucketTable` + `SetBudgetRow`). Defer until the
  inline form genuinely becomes painful; it works today and isn't blocking
  edits.
- Lifting `actualSelectedMonth` to the URL. Stays as page-component state.
- Any backend changes. The wire shape, query keys, and invalidation
  semantics are preserved exactly.
- Restructuring sidebar navigation. The single `/budget` link stays.
- Tests of `Budget.tsx` itself, `HistoricalView`, or `SetBudgetView`
  rendering. Only the `actualVsBudgetViewModel` pure functions and the three
  small shared visual primitives get tests in this spec's scope.

## Judgment Calls

- [x] **Helper home for `mapToZonePosition` and `getTierColors`.**
  - Resolution: **stay with `BudgetVarianceChart`**. Colocation with sole
    consumer; simplest. Tested indirectly via component tests of the chart.

- [x] **Folder layout.**
  - Resolution: **flat — matches existing `components/overview/`**. All
    files live at `components/budget/*` directly.

- [x] **Page location.**
  - Resolution: **`pages/Budget.tsx` stays flat**. Matches Overview
    pattern. The view-model file lives in `components/budget/` like every
    other Budget primitive.

- [x] **Mutation hook.**
  - Resolution: **leave the four mutations inline in `Budget.tsx`**.
    Matches Design A's "data fetching stays in the page" rule strictly.
