# Step 7 — HistoricalView extraction

## Result

`HistoricalView` and its private `trendIcon` helper moved out of
`pages/Budget.tsx` into `components/budget/HistoricalView.tsx`. Build
green; 23 test files / 336 tests pass.

## New file

`frontend/src/components/budget/HistoricalView.tsx` (202 lines)

### Exports

- `HistoricalView({ stats }: { stats: CategoryHistoricalStats[] })` —
  named export. Renders the per-category stats table plus the
  stacked-bar trend chart for the top 6 categories by average.

### Private helpers

- `trendIcon(t: CategoryHistoricalStats["trend"])` — non-exported.
  Returns `<TrendingUp />` / `<TrendingDown />` / `<ArrowRight />`
  based on the trend direction.

### Imports

Pulls only what `HistoricalView` + `trendIcon` actually need:

- recharts: `Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis`
- lucide-react: `ArrowRight, TrendingDown, TrendingUp`
- `Badge` from `@/components/ui/badge`
- `Card, CardContent, CardHeader, CardTitle` from `@/components/ui/card`
- `formatCurrency` from `@/lib/format`
- `type CategoryHistoricalStats` from `@/api/budget`
- `MONTH_NAMES, shortMonth` from `./date-helpers`
- `chartColors, tooltipStyle` from `./chart-style`

The transforms (`trendCategories`, `monthSet`, `months`, `chartData`)
remain plain `const` assignments inside the render body — preserved
existing behavior, no `useMemo` introduced.

## `pages/Budget.tsx` changes (post-Step-6 line numbers)

Pre-edit length: 1407 lines. Post-edit length: **1225 lines** (-182).

### Deleted blocks

| Block | Lines (pre-edit, post-Step-6) |
| --- | --- |
| `// ─── Historical View ───` separator comment | 123 |
| `trendIcon` helper | 125–129 |
| `HistoricalView` component | 131–288 |

(Total deletion: ~166 lines of component + helper + separator.)

### Deleted imports (lucide-react)

- `ArrowRight`
- `TrendingDown`
- `TrendingUp`

### Deleted imports (recharts — full block dropped)

- `Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis`

  No remaining recharts use in `Budget.tsx` after extraction.

### Deleted imports (budget primitives)

- `chartColors, tooltipStyle` from `@/components/budget/chart-style` —
  the entire `chart-style` import line was removed (no remaining
  consumers in `Budget.tsx`).
- `MONTH_NAMES` removed from the `@/components/budget/date-helpers`
  named-import block. The other date-helper exports
  (`allMonthsForYear`, `currentMonthKey`, `currentYear`, `monthKey`,
  `monthLabel`, `pastAndCurrentMonthsForYear`, `shortMonth`) remain.

### Added import

```ts
import { HistoricalView } from "@/components/budget/HistoricalView";
```

Inserted in alphabetical position between the `date-helpers` import
and the `MonthSelector` import.

### Render-site preservation

The single call inside `<TabsContent value="historical">` is unchanged:

```tsx
<HistoricalView stats={stats} />
```

Only the source of the `HistoricalView` symbol changed (now from
`@/components/budget/HistoricalView` instead of an inline definition).

## Gate

```
cd frontend && npm run build && npm run test -- --run
```

- `npm run build`: passed (tsc + vite build, 4.58s).
- `npm run test -- --run`: 23 files / 336 tests passed.

## Deviations from plan

None. Followed the plan as written:

- One-component file shape matching `components/overview/SpendingTrendChart.tsx`.
- Top-of-file JSDoc explaining the component's purpose.
- `trendIcon` kept private inside the new file.
- Transforms left as plain `const` (no `useMemo`).
- Imports trimmed to only what `HistoricalView` + `trendIcon` use.
- No new tests (out of scope per spec).
- `Budget` default-export component's queries, mutations, state, tab
  markup, and conditional rendering untouched.

## Out-of-scope reminders for next steps

- `SetBudgetView` is still inline in `Budget.tsx` — Step 8.
- `ActualVsBudgetView`, `BudgetVarianceChart`, `CategoryDrilldown`,
  `mapToZonePosition`, `getTierColors`, `VarianceRow` are still inline
  — Step 9.
