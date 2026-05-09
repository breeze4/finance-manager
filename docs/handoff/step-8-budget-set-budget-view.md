# Step 8 — SetBudgetView extraction + NetIncomeEditor dedup

## Result

`SetBudgetView` (the CSP planning surface) and its `SetBudgetViewProps`
interface moved out of `pages/Budget.tsx` into
`components/budget/SetBudgetView.tsx`. The duplicate `<NetIncomeEditor />`
render was eliminated: it now renders exactly once in `pages/Budget.tsx`,
hoisted directly above the `hasBudgets ? <SetBudgetView/> : <SuggestSeedHint/>`
conditional inside `<TabsContent value="set">`. Build green;
23 test files / 336 tests pass.

## New file

`frontend/src/components/budget/SetBudgetView.tsx`

### Exports

- `SetBudgetView({ year, budgets, stats, categories, rollup, onSetBaseline,
  onSetOverride, onClearOverride, onSuggest, isSuggestPending }: SetBudgetViewProps)`
  — named export. Renders (1) optional CSP-denominator hint, (2) NULL-bucket
  warning banner, (3) four bucket dashboard cards, (4) sticky month-selector +
  Suggest button, (5) bucket-grouped category table with inline-editable
  baselines / override badges / rollover toggles.

### Internal (non-exported)

- State hooks: `selectedMonth`, `drafts` (`Record<string, number>`,
  keyed `${categoryId}-${scope}`), `collapsedBuckets` (`Set<CspBucket>`).
- `useMemo` derivations: `categoryById`, `budgetsByBucket`.
- Helpers: `driverKey`, `draftValue`, `commitBaseline`, `commitOverride`
  (preserves `parseInt(monthKeyStr.split("-")[1], 10)`), `toggleBucket`,
  `denominatorTooltip`, `renderRow`.

### Imports

- `useMemo`, `useState` from react.
- lucide-react: `AlertTriangle, ChevronDown, ChevronRight, Lock, RefreshCw, X`.
- `Link` from react-router-dom.
- `Badge`, `Button` from `@/components/ui/...`.
- `BudgetEntry, BudgetState, CategoryHistoricalStats` (types) from `@/api/budget`.
- `CSP_BUCKETS, CategoryResponse, CspBucket` from `@/api/categories`.
- `PlanningRollup` (type) from `@/api/csp`.
- `formatCurrency` from `@/lib/format`.
- `BucketDashboardCard` from `./BucketDashboardCard`.
- `BUCKET_DESCRIPTION, BUCKET_LABEL` from `./bucket-copy`.
- `allMonthsForYear, currentMonthKey, currentYear, shortMonth` from `./date-helpers`.
- `MonthSelector` from `./MonthSelector`.

`NetIncomeEditor` is intentionally NOT imported here — the page hoists it.

## `pages/Budget.tsx` changes

### Deleted blocks (post-Step-7 line numbers from the original file)

| Block | Lines (post-Step-7 file) |
| --- | --- |
| `// ─── Set Budget View (CSP planning surface) ───` separator | 109 |
| `interface SetBudgetViewProps { ... }` | 111–122 |
| `function SetBudgetView({ ... }) { ... }` body | 124–463 |

Total deletion within the page: ~356 lines (separator + props interface +
component body + trailing blank line).

### Deleted imports

- react: none (still need `Fragment`, `useMemo`, `useState`).
- lucide-react: `AlertTriangle`, `ChevronDown`, `Lock`, `X`.
  Kept: `ArrowDown, ArrowUp, ChevronRight, RefreshCw` — still used inside
  `BudgetVarianceChart` (Step 9 owns).
- `Link` from react-router-dom — only used by `SetBudgetView`'s NULL-bucket
  banner.
- `Badge` from `@/components/ui/badge` — only used inside `SetBudgetView`.
- From `@/api/budget`: `type BudgetEntry`, `type BudgetSuggestion` (the
  latter was already unused). Kept `BudgetState`, `CategoryHistoricalStats`.
- From `@/components/budget/bucket-copy`: `BUCKET_DESCRIPTION` (kept `BUCKET_LABEL`,
  used by `ActualVsBudgetView`).
- From `@/components/budget/date-helpers`: `allMonthsForYear`, `shortMonth`.
  Kept `currentMonthKey, currentYear, monthKey, monthLabel,
  pastAndCurrentMonthsForYear`.
- `BucketDashboardCard` import line removed (only used by `SetBudgetView`).

### Added import

```ts
import { SetBudgetView } from "@/components/budget/SetBudgetView";
```

Inserted in alphabetical position between the `MonthSelector` block and
the `formatCurrency` import.

### Restructured `<TabsContent value="set">`

Before (post-Step-7 sketch):

```tsx
<TabsContent value="set" className="space-y-6">
  {suggestMutation.error && <ErrorBanner />}
  {hasBudgets ? (
    <SetBudgetView ... />              // contained its own <NetIncomeEditor />
  ) : (
    <div className="space-y-6">
      <NetIncomeEditor />              // duplicate render
      <div className="space-y-3">
        <p>No budgets set yet…</p>
        <Button>Suggest Budgets</Button>
      </div>
    </div>
  )}
</TabsContent>
```

After:

```tsx
<TabsContent value="set" className="space-y-6">
  {suggestMutation.error && <ErrorBanner />}
  <NetIncomeEditor />                  // single canonical render
  {hasBudgets ? (
    <SetBudgetView ... />              // no longer renders NetIncomeEditor
  ) : (
    <div className="space-y-3">
      <p>No budgets set yet…</p>
      <Button>Suggest Budgets</Button>
    </div>
  )}
</TabsContent>
```

The render position is visually identical to before — `NetIncomeEditor`
was the very first child of `SetBudgetView`'s JSX, so hoisting it one
level up still places it above the four bucket dashboard cards. The
Suggest-error banner stays where it was (still the first child of
`<TabsContent value="set">`).

## Verification

```
$ grep -c "<NetIncomeEditor" frontend/src/pages/Budget.tsx
1
$ grep -c "<NetIncomeEditor" frontend/src/components/budget/SetBudgetView.tsx
0
```

## Gate

```
cd frontend && npm run build && npm run test -- --run
```

- `npm run build`: passed (tsc + vite build, 4.60s).
- `npm run test -- --run`: 23 files / 336 tests passed.

## Deviations from plan

None. The plan called for keeping `BudgetSuggestion` import — but a grep
shows it was already unused at the page level (only the call to
`getSuggestions` returns the type, which is not annotated explicitly).
Removed alongside `BudgetEntry` to keep the import block clean. No
behavioral impact.

## Out-of-scope reminders for Step 9

- `ActualVsBudgetView`, `BudgetVarianceChart`, `CategoryDrilldown`,
  `mapToZonePosition`, `getTierColors`, `VarianceRow` are still inline
  in `pages/Budget.tsx`.
- `Fragment` and `useMemo` remain imported because `BudgetVarianceChart`
  / `ActualVsBudgetView` still use them. Step 9 will remove the
  remaining inline blocks; if those are the only consumers, those
  imports drop too.
