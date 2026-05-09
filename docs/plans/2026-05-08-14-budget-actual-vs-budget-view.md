# ActualVsBudgetView + view-model + sub-components extraction

## Parent spec

`docs/specs/2026-05-08-03-budget-page-split.md`

## What to build

Move the entire Actual-vs-Budget tab out of `pages/Budget.tsx` and split it
along the two axes the spec calls for:

1. **Component co-location** — three sub-components move to their own
   files in `frontend/src/components/budget/`:
   - `CategoryDrilldown.tsx` (carries the lazy-mounted
     `["transactions", "for-budget-drilldown", ...]` query exactly as
     today).
   - `BudgetVarianceChart.tsx` (carries `mapToZonePosition`,
     `getTierColors`, the `SortColumn` / `SortDir` types, the local
     `expanded` / `sortCol` / `sortDir` state, and the rendering of one
     bucket's variance chart with row drilldown).
   - `ActualVsBudgetView.tsx` (the tab-level component itself,
     consuming the view-model functions defined below).

2. **Pure-function view-model** — `actualVsBudgetViewModel.ts` exports
   the four pure transforms named in the spec, plus the `VarianceRow`,
   `RowsByBucket`, and `BucketSection` types:
   - `buildVarianceRows(budgets, actualByCatMonth, selectedMonthInt)
     -> Array<{ row: VarianceRow; bucket: CspBucket | null }>`
   - `groupRowsByBucket(rowsWithBucket) -> RowsByBucket`
   - `buildMonthAnnotations(availableMonths, monthlyRollups)
     -> Record<string, MonthAnnotation>`
   - `buildBucketSections(rowsByBucket, actualsRollup) -> BucketSection[]`
   - Plus `buildActualByCatMonth(actual)` (which today is the `useMemo`
     building the `Map<string, Entry>` lookup).
   - Plus any small derived helper used inside the above (e.g. the
     month-key-string-to-int conversion for `selectedMonth`).
   The file has no React imports.

3. **Unit tests for the view-model** — `actualVsBudgetViewModel.test.ts`
   covers the eight cases enumerated in the spec's "New unit tests"
   section. These are the testability deliverables of this slice.

After this slice:

- `pages/Budget.tsx` is at or near its target ~210 lines (still owns the
  six queries, the four mutations, the `actualSelectedMonth` state, the
  Radix `<Tabs>` shell, and the conditional rendering of the empty
  state).
- `actualSelectedMonth` continues to live in `Budget.tsx` (per spec —
  not lifted).
- `CategoryDrilldown` continues to be lazy-mounted by
  `BudgetVarianceChart` only when its row is expanded.
- `mapToZonePosition` and `getTierColors` are file-private inside
  `BudgetVarianceChart.tsx` (resolved judgment call: stay with the
  chart).

## Type

AFK

## Blocked by

- Blocked by `2026-05-08-11-budget-shared-primitives.md` — uses
  `MonthSelector`, `ActualsBucketCard`, `BUCKET_LABEL`, the date helpers,
  and `MonthAnnotation`.

(Slices 12 and 13 are not blockers — this slice's edits to `Budget.tsx`
only delete the Actual-vs-Budget block, which is independent of the
Historical and Set Budget blocks.)

## Spec sections addressed

- "Solution" — point 1 (co-locate by feature) for the Actual-vs-Budget
  tab, AND point 2 (extract pure-function transforms for this tab only)
- "Behavior" → "What `components/budget/` owns" — `ActualVsBudgetView.tsx`,
  `BudgetVarianceChart.tsx`, `CategoryDrilldown.tsx`,
  `actualVsBudgetViewModel.ts`
- "Behavior" → "What `ActualVsBudgetView` looks like after the split"
- "Testing Strategy" → "New unit tests (against pure functions in
  `actualVsBudgetViewModel.ts`)" — all eight cases
- "Resolved judgment calls" — helper home (`mapToZonePosition` and
  `getTierColors` stay with the chart)

## Acceptance criteria

- [ ] `frontend/src/components/budget/CategoryDrilldown.tsx` exists and
      exports `CategoryDrilldown`. The component continues to fire its
      own `useQuery` with key
      `["transactions", "for-budget-drilldown", { categoryId, monthKeyStr }]`
      and is rendered only when its parent `<BudgetVarianceChart>` row is
      expanded.
- [ ] `frontend/src/components/budget/BudgetVarianceChart.tsx` exists and
      exports `BudgetVarianceChart`. It carries `mapToZonePosition` and
      `getTierColors` as non-exported helpers. The `expanded`, `sortCol`,
      and `sortDir` `useState` hooks live inside it.
- [ ] `frontend/src/components/budget/actualVsBudgetViewModel.ts` exists
      and exports `buildVarianceRows`, `groupRowsByBucket`,
      `buildMonthAnnotations`, `buildBucketSections`,
      `buildActualByCatMonth`, plus the `VarianceRow`, `RowsByBucket`,
      `BucketSection` types. The file has no React imports.
- [ ] `frontend/src/components/budget/ActualVsBudgetView.tsx` exists and
      exports `ActualVsBudgetView`. Its render body uses the view-model
      functions; no direct `Map`-building or grouping logic remains
      inside the component.
- [ ] `frontend/src/components/budget/__tests__/actualVsBudgetViewModel.test.ts`
      exists and passes the eight cases enumerated in the spec.
- [ ] `pages/Budget.tsx` no longer contains the
      `mapToZonePosition`, `getTierColors`, `SortColumn`, `SortDir`,
      `VarianceRow` interface, `CategoryDrilldown`, `BudgetVarianceChart`,
      `ActualVsBudgetViewProps` interface, or `ActualVsBudgetView`
      definitions. The single render site inside
      `<TabsContent value="actual">` (around line ~1665) imports
      `ActualVsBudgetView` from the new path.
- [ ] The Actual-vs-Budget tab renders identically to before — same
      month selector with annotations, same partial-month notice, same
      bucket cards, same per-bucket variance charts, same row-expansion
      drilldown. Numbers shown for any given input must match the
      pre-refactor implementation byte-for-byte.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test` all pass.
- [ ] Manual smoke check: open `/budget`, click Actual vs Budget tab.
      Click a month button; verify the rollup updates. Expand a
      category row; verify drilldown query fires once and the
      transactions appear. Sort by Pct; verify rows reorder. Click an
      empty bucket section; verify it's omitted from the render (per
      `buildBucketSections` filtering).

## Owns

- `frontend/src/components/budget/CategoryDrilldown.tsx` — new file.
- `frontend/src/components/budget/BudgetVarianceChart.tsx` — new file
  (carries `BudgetVarianceChart`, `mapToZonePosition`, `getTierColors`,
  `SortColumn`, `SortDir`).
- `frontend/src/components/budget/actualVsBudgetViewModel.ts` — new
  file (carries the pure transforms and the `VarianceRow`,
  `RowsByBucket`, `BucketSection` types).
- `frontend/src/components/budget/ActualVsBudgetView.tsx` — new file
  (carries `ActualVsBudgetView` and the `ActualVsBudgetViewProps`
  interface).
- `frontend/src/components/budget/__tests__/actualVsBudgetViewModel.test.ts`
  — new file.
- `frontend/src/pages/Budget.tsx` — modified. Specific sections:
  - Delete `mapToZonePosition` (lines ~917–924).
  - Delete `SortColumn`, `SortDir` types (lines ~926–927).
  - Delete `VarianceRow` interface (lines ~929–939).
  - Delete `getTierColors` (lines ~941–962).
  - Delete `CategoryDrilldown` (lines ~964–1041).
  - Delete `BudgetVarianceChart` (lines ~1043–1259).
  - Delete `ActualVsBudgetViewProps` (lines ~1264–1272).
  - Delete `ActualVsBudgetView` (lines ~1274–1458).
  - Add an import for `ActualVsBudgetView` from
    `@/components/budget/ActualVsBudgetView`.
  - The single render site of
    `<ActualVsBudgetView year={year} budgets={budgets} ... />` (around
    line ~1665) keeps the same call signature; only its source changes.

## Must not touch

- `HistoricalView` — extracted by plan `2026-05-08-12`.
- `SetBudgetView` — extracted by plan `2026-05-08-13`.
- `frontend/src/components/NetIncomeEditor.tsx` — used as-is.
- The `Budget` default-export component's queries, mutations, the
  `useQueryClient()` setup, the four `useMutation` calls, the
  `actualSelectedMonth` state and its setter, the tab markup, the
  conditional rendering of the empty state. Only the imports and the
  removed Actual-vs-Budget block change.
- All shared primitives in `components/budget/` from plan
  `2026-05-08-11` — imported as-is.
- `frontend/src/api/*` — no API changes.
- `frontend/src/api/transactions.ts` — `CategoryDrilldown` continues to
  call `listTransactions` with the same parameters.

## Defines interfaces

- `VarianceRow`, `RowsByBucket`, `BucketSection` types in
  `frontend/src/components/budget/actualVsBudgetViewModel.ts` — consumed
  internally by `ActualVsBudgetView` and `BudgetVarianceChart`. No
  external plan depends on them.
- The pure functions `buildVarianceRows`, `groupRowsByBucket`,
  `buildMonthAnnotations`, `buildBucketSections`,
  `buildActualByCatMonth` — consumed by `ActualVsBudgetView`. No
  external plan depends on them.

## Pattern exemplar

- **MUST follow the pattern in**:
  `frontend/src/lib/math/__tests__/coastFire.test.ts` and other tests
  in that directory — the pure-function-test style for
  `actualVsBudgetViewModel.test.ts` (vitest, plain TS imports, no React,
  literal-data fixtures, `describe`/`it`/`expect` with `approxEqual`-style
  helpers if floating-point comparisons are needed).
- **MUST follow the pattern in**:
  `frontend/src/components/overview/SpendingTrendChart.tsx` and
  `frontend/src/components/overview/BucketCard.tsx` for the
  component-file shape of the new TSX files.
- **Follow the pattern in**:
  `frontend/src/components/budget/HistoricalView.tsx` (created in plan
  `2026-05-08-12`) and
  `frontend/src/components/budget/SetBudgetView.tsx` (created in plan
  `2026-05-08-13`) for local directory style consistency.

## Tasks

- [ ] Create `actualVsBudgetViewModel.ts`. Move out of `Budget.tsx`:
      `VarianceRow` (lines ~929–939). Define new types
      `RowsByBucket = { groups: Record<CspBucket, VarianceRow[]>; other: VarianceRow[] }`
      and `BucketSection = { bucket: CspBucket; rollup: BucketRollup | undefined; rows: VarianceRow[]; totalBudget: number; totalActual: number }`.
- [ ] Implement `buildActualByCatMonth(actual: ActualVsBudgetResult): Map<string, ActualVsBudgetResult["entries"][number]>`.
      Today this lives as a `useMemo` inside `ActualVsBudgetView` (around
      lines ~1286–1295). Move the body into the pure function. Key shape:
      `${entry.categoryId}-${entry.month}`.
- [ ] Implement `buildVarianceRows(budgets, actualByCatMonth, selectedMonth: number): Array<{ row: VarianceRow; bucket: CspBucket | null }>`.
      Today this lives as a `useMemo` inside `ActualVsBudgetView` (around
      lines ~1297–1322). Move the body. The function takes a numeric
      `selectedMonth` (1–12) — caller converts the `"YYYY-MM"` key.
- [ ] Implement `groupRowsByBucket(rowsWithBucket): RowsByBucket`.
      Today inline (around lines ~1324–1335). Preserve canonical bucket
      order (`fixed` / `investments` / `savings` / `guilt_free`).
      Null-bucket rows go to `other`.
- [ ] Implement `buildMonthAnnotations(availableMonths: string[], monthlyRollups: ActualVsBudgetResult["monthlyRollups"]): Record<string, MonthAnnotation>`.
      Today inline (around lines ~1337–1348). Preserve the color-
      threshold logic exactly. Empty rollup entries produce no annotation
      for that month.
- [ ] Implement `buildBucketSections(rowsByBucket: RowsByBucket, actualsRollup: ActualsRollup | undefined): BucketSection[]`.
      Today this assembly is split between the bucket iteration in the
      JSX (lines ~1390–1430) and inline computations. Lift it as a pure
      function. Empty bucket sections are omitted.
- [ ] Write `__tests__/actualVsBudgetViewModel.test.ts` covering the
      eight cases from the spec:
      1. Rollover-mode budget with override (March ovrd 350, baseline 300,
         actual 200) → `budget=350, baseBudget=300, carryover=50, actual=200, pct=round(200/350*100), remaining=150`.
         Note: this assumes the backend already returns
         `actual_vs_budget` with rollover-applied targets. The view-model
         is reading what the backend gives it, not re-computing rollover.
         Adjust the assertion if the existing implementation diverges —
         match today's behavior, not the spec's idealized version.
      2. Explicit override no rollover (override `{"2026-03": 500}`,
         baseline 300, March query) → `baseBudget=500, budget=500,
         carryover=0`.
      3. Actuals miss (no entry for category/month) → `actual=0,
         remaining=baseline, pct=0` (assert no `NaN`).
      4. `groupRowsByBucket`: a row with `csp_bucket=null` lands in
         `other`; rows with each valid `CspBucket` land in their bucket
         group.
      5. `groupRowsByBucket`: rows in mixed input order; result preserves
         canonical bucket order in iteration.
      6. `buildMonthAnnotations`: `availableMonths=["2026-01","2026-02","2026-03"]`,
         `monthlyRollups` contains only Jan and Feb. Result has Jan and
         Feb annotations; March is absent.
      7. `buildMonthAnnotations`: three sample percentages exercise the
         three color buckets (under/near/over). Pin the exact color
         strings the production code returns.
      8. `buildBucketSections`: when a bucket has no rows, that section
         is omitted from the result.
- [ ] Create `CategoryDrilldown.tsx`. Move the component (lines
      ~964–1041) into the new file. Preserve the
      `["transactions", "for-budget-drilldown", { categoryId, monthKeyStr }]`
      query key exactly. Keep `listTransactions` import from
      `@/api/transactions`.
- [ ] Create `BudgetVarianceChart.tsx`. Move:
      - `mapToZonePosition` (lines ~917–924) as a non-exported helper.
      - `getTierColors` (lines ~941–962) as a non-exported helper.
      - `SortColumn`, `SortDir` types (lines ~926–927) as
        non-exported types.
      - The `BudgetVarianceChart` component (lines ~1043–1259)
        including its `expanded`, `sortCol`, `sortDir` `useState`
        hooks.
      - Import `CategoryDrilldown` from `./CategoryDrilldown` (lazy
        rendering inside expanded rows preserved).
- [ ] Create `ActualVsBudgetView.tsx`. Move:
      - The `ActualVsBudgetViewProps` interface (lines ~1264–1272).
      - The `ActualVsBudgetView` component (lines ~1274–1458).
      Replace the inline `useMemo` blocks with calls to the view-model
      functions. The component still owns no extra state — all UI state
      it had (the variance chart's expanded/sort) lives inside
      `BudgetVarianceChart`.
- [ ] In `Budget.tsx`:
      - Delete the moved blocks listed in the **Owns** section.
      - Add `import { ActualVsBudgetView } from "@/components/budget/ActualVsBudgetView";`.
      - Verify the render site at `<TabsContent value="actual">` uses
        the imported component with the same prop set.
- [ ] Run `grep -n "VarianceRow\|mapToZonePosition\|getTierColors\|BudgetVarianceChart\|CategoryDrilldown\|ActualVsBudgetView" frontend/src/pages/Budget.tsx`.
      The only hit should be the import line and the JSX usage.
- [ ] Run `npm run test`. All view-model tests pass; existing tests
      remain green.
- [ ] Run `npm run lint`, `npm run typecheck`. Fix any unused imports
      remaining in `Budget.tsx` (likely some lucide icons, possibly
      `Link` from `react-router-dom` if it's only used inside the moved
      blocks).
- [ ] Smoke check: dev server, `/budget`, Actual vs Budget tab. Run
      through the full interaction surface — month selection, sort
      toggling, row expansion, drilldown loading. Confirm visual
      identity to pre-refactor.

## Implementation notes

### Resolved judgment call: helpers stay with the chart

Per the spec, `mapToZonePosition` and `getTierColors` move into
`BudgetVarianceChart.tsx` as non-exported helpers. They are NOT lifted
into the view-model, NOT lifted into `chart-style.ts`. The justification
recorded in the spec: colocation with sole consumer; tested indirectly
via component tests of the chart.

If a future contributor wants to unit-test these (e.g. for tier-color
threshold regressions), they can be exported privately and tested via a
`@internal` named export — out of scope for this plan.

### View-model purity

The view-model file must NOT import:

- React, hooks, JSX
- `@/api/_client` (network)
- `@tanstack/react-query`
- recharts

It MAY import:

- TypeScript types from `@/api/budget`, `@/api/csp`, `@/api/categories`
- `formatCurrency` from `@/lib/format` if needed for derived strings
- `MonthAnnotation` type from `@/components/budget/MonthSelector`
- Standard library helpers

Verify via grep after the move:

```
grep -n "import" frontend/src/components/budget/actualVsBudgetViewModel.ts
```

The output should show only type imports and pure-helper imports. If a
React-only import appears, the function in question still has a UI
concern — pull it back into the component.

### `selectedMonth` numeric vs string

`buildVarianceRows` takes `selectedMonth: number` (1–12). The view
component holds `selectedMonth: string` (e.g. `"2026-05"`). The
component converts via:

```ts
const selectedMonthInt = parseInt(selectedMonth.split("-")[1], 10);
```

Match today's parsing exactly — there's no validation in the existing
code, so don't add any here either.

### Test-fixture style

For `__tests__/actualVsBudgetViewModel.test.ts`, build literal fixtures:

```ts
const budgets: BudgetState = {
  101: {
    categoryId: 101,
    categoryName: "Groceries",
    baselineMonthly: 300,
    rolloverMode: false,
    monthlyOverrides: { "2026-03": 500 },
  },
  // ...
};
const actual: ActualVsBudgetResult = {
  entries: [
    { categoryId: 101, categoryName: "Groceries", month: 3, budgetTarget: 500, actualSpend: 200, ... },
  ],
  monthlyRollups: [...],
};
```

Match the actual TypeScript shapes exported from `@/api/budget` and
`@/api/csp`. Do not invent fields.

### Expected failure paths

If the existing `BudgetState` / `ActualVsBudgetResult` shapes have
required fields that aren't relevant to a given test, set them to
sensible defaults rather than `null!`. The view-model functions should
not crash on nominal data.

### Render-site preservation

The single call site inside `<TabsContent value="actual">` is:

```tsx
<ActualVsBudgetView
  year={year}
  budgets={budgets}
  actual={actual}
  actualsRollup={actualsRollup}
  selectedMonth={actualSelectedMonth}
  onSelectedMonthChange={setActualSelectedMonth}
/>
```

(Around line ~1665 of today's file.) Do not change this line beyond the
import path.

### Dropping unused imports in `Budget.tsx`

After this plan plus plans 12 and 13, `Budget.tsx` no longer references:

- recharts components (BarChart, etc.) — moved to HistoricalView and
  BudgetVarianceChart
- `Link` from `react-router-dom` (used inside ActualVsBudgetView's
  unbucketed warning)
- Many lucide icons (Trophy, Lock, etc.)
- `useMemo`, `Fragment`

Verify with `npm run lint --fix` that all imports are necessary. The
final `Budget.tsx` should target ~210 lines (per the spec).
