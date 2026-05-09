# Step 9 — ActualVsBudgetView + view-model + sub-components extraction

Plan: `docs/plans/2026-05-08-14-budget-actual-vs-budget-view.md`
Spec: `docs/specs/2026-05-08-03-budget-page-split.md`

This step finishes the `pages/Budget.tsx` page-split refactor. The
Actual-vs-Budget tab is now extracted into four files in
`frontend/src/components/budget/`, with the math/transform layer split
out as a pure-function view-model that is unit-tested independently.

## New files and exports

### `frontend/src/components/budget/actualVsBudgetViewModel.ts`

Pure-function view-model. No React, hooks, JSX, recharts, or react-query
imports.

Exports:
- Types: `VarianceRow`, `RowsByBucket`, `BucketSection`
- Functions:
  - `buildActualByCatMonth(actual: ActualVsBudgetResult): Map<string, ActualVsBudgetEntry>`
  - `buildVarianceRows(budgets, actualByCatMonth, selectedMonth: string, selectedMonthInt: number)`
  - `groupRowsByBucket(rowsWithBucket): RowsByBucket`
  - `buildMonthAnnotations(availableMonths, monthlyRollups): Record<string, MonthAnnotation>`
  - `buildBucketSections(rowsByBucket, actualsRollup): BucketSection[]`

Note on `buildVarianceRows` signature: takes both the `"YYYY-MM"` string
(used to look up overrides on `BudgetEntry.monthlyOverrides`) and the
numeric month (used to look up actuals entries — backend keys those by
month integer). The plan's signature called for just the int; in
practice the override lookup needs the year context, so both are
threaded through. Today's caller does the parse:

```ts
const selectedMonthInt = parseInt(selectedMonth.split("-")[1], 10);
```

### `frontend/src/components/budget/CategoryDrilldown.tsx`

Exports:
- `CategoryDrilldown` — per-row transaction list, lazy-mounted by
  `BudgetVarianceChart` only when a row is expanded. Fires its own
  `["transactions", "for-budget-drilldown", { categoryId, monthKeyStr }]`
  query (key shape preserved from pre-refactor).

### `frontend/src/components/budget/BudgetVarianceChart.tsx`

Exports:
- `BudgetVarianceChart` — variance bar chart for one bucket's category
  rows. Owns `expanded`, `sortCol`, `sortDir` state.

Non-exported helpers (file-private, per resolved judgment call):
- `mapToZonePosition(budgetPct: number): number`
- `getTierColors(pct: number)`
- Types: `SortColumn`, `SortDir`

### `frontend/src/components/budget/ActualVsBudgetView.tsx`

Exports:
- `ActualVsBudgetView` — tab body. Calls the view-model functions
  directly in the render body (no `useMemo` — these transforms are
  cheap and re-running on each render is correct).

### `frontend/src/components/budget/__tests__/actualVsBudgetViewModel.test.ts`

8 tests covering the eight cases enumerated in the plan:

1. `buildVarianceRows` — rollover-mode budget, server-applied carryover
   surfaces as `carryover` while `baseBudget` reflects the baseline.
2. `buildVarianceRows` — explicit override, no rollover. `baseBudget` and
   `budget` both equal the override; `carryover` is 0.
3. `buildVarianceRows` — actuals miss. `actual=0`, `remaining=baseline`,
   `pct=0` (no `NaN`).
4. `groupRowsByBucket` — null bucket → `other`; valid buckets → group.
5. `groupRowsByBucket` — preserves canonical bucket order regardless of
   input order.
6. `buildMonthAnnotations` — only emits annotations for months present
   in `monthlyRollups`.
7. `buildMonthAnnotations` — three sample percentages exercise the
   under/near/over color buckets. Sign string assertion notes that
   `diff = totalActual - totalBudgeted`, so an under-budget month has
   diff < 0 → "-", and an over-budget month has diff > 0 → "+".
8. `buildBucketSections` — buckets with no rows are omitted; sections
   carry `totalBudget` and `totalActual` sums.

Test #1 deviation note: the spec's idealized version assumed
`baseBudget=300, carryover=50` with both an override at 350 AND a
baseline of 300. Today's code does
`monthlyOverrides[selectedMonth] ?? baselineMonthly`, so an override of
350 makes `baseBudget=350` and `carryover=0`. To preserve the spec's
intent (carryover surfacing), the test fixture omits the override and
sets `rolloverMode: true` with the server returning
`budgetTarget=350` (i.e. baseline + carryover). This matches today's
behavior byte-for-byte.

## Deleted blocks from `pages/Budget.tsx`

Pre-Step-9 `Budget.tsx` was 854 lines. Deleted:

- Lines 96–143: `// ─── Actual vs Budget View ───` section comment +
  `mapToZonePosition`, `SortColumn`, `SortDir`, `VarianceRow`,
  `getTierColors`.
- Lines 145–222: `CategoryDrilldown`.
- Lines 224–440: `BudgetVarianceChart`.
- Lines 442–636: `ActualVsBudgetViewProps` + `ActualVsBudgetView`.

Combined: a single contiguous block from the first section comment to
just before `// ─── Main page` was deleted, then the new
`ActualVsBudgetView` import was added to the import list.

Imports dropped from `Budget.tsx`:
- `Fragment, useMemo` from `react` (not needed without the moved code).
- `ArrowDown, ArrowUp, ChevronRight, RefreshCw` from `lucide-react`.
- `Card, CardContent, CardHeader, CardTitle` from
  `@/components/ui/card`.
- `listTransactions, type Transaction` from `@/api/transactions`.
- `ActualsBucketCard` from `@/components/budget/ActualsBucketCard`.
- `BUCKET_LABEL` from `@/components/budget/bucket-copy`.
- `MonthSelector, MonthAnnotation` from
  `@/components/budget/MonthSelector`.
- `monthLabel` from `@/components/budget/date-helpers`.
- `CSP_BUCKETS, type CspBucket` from `@/api/categories`.
- `formatCurrency` from `@/lib/format`.

## Final line count

`frontend/src/pages/Budget.tsx`: **290 lines** total. The file leads
with a 35-line header docblock that is preserved as-is per the plan
("only the imports and the removed Actual-vs-Budget block change").
The page body itself (line 36 onward) is ~255 lines, in the spec's
~210-line ballpark; the docblock is the dominant leftover.

## Test count

`frontend/src/components/budget/__tests__/actualVsBudgetViewModel.test.ts`:
8 tests, all passing.

Full suite: 24 test files, 344 tests passing.

## Build gate

`cd frontend && npm run build && npm run test -- --run` — both pass.
