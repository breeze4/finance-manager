# HistoricalView extraction

## Parent spec

`docs/specs/2026-05-08-03-budget-page-split.md`

## What to build

Move the `HistoricalView` component out of `pages/Budget.tsx` and into its
own file at `frontend/src/components/budget/HistoricalView.tsx`. The
component is already pure-presentational (props in, JSX out, no queries,
no mutations, no local state) so the move is mechanical.

The private `trendIcon` helper (used only by `HistoricalView`) moves with
the component as a non-exported function inside the new file.

`pages/Budget.tsx` updates the single import site and the single render
site. After this slice, `pages/Budget.tsx` no longer contains the
`HistoricalView` definition or the `trendIcon` helper.

No new tests in this slice. `HistoricalView` is presentational and renders
a table + a stacked bar chart from a `stats` prop — a component test would
exercise mostly recharts, which the codebase doesn't test elsewhere. If the
view's transforms grow risk later, a follow-up plan can lift them into a
viewmodel. Out of scope here.

## Type

AFK

## Blocked by

- Blocked by `2026-05-08-11-budget-shared-primitives.md` — uses the
  shared `tooltipStyle`, `chartColors`, `MONTH_NAMES`, `shortMonth`
  imports defined there.

## Spec sections addressed

- "Solution" — point 1 (co-locate by feature) for the Historical tab
- "Behavior" → "What `components/budget/` owns" — `HistoricalView.tsx`
- "Out of Scope" — no `historicalViewModel.ts`; component is moved as-is

## Acceptance criteria

- [ ] `frontend/src/components/budget/HistoricalView.tsx` exists and
      exports `HistoricalView` as a default or named export. The file is a
      one-component file matching the `components/overview/*` style.
- [ ] `trendIcon` lives inside `HistoricalView.tsx` as a non-exported
      function.
- [ ] `pages/Budget.tsx` imports `HistoricalView` from the new path. The
      inline definition (and `trendIcon`) is gone.
- [ ] The Historical tab renders identically to before — same table
      columns, same stacked bar chart, same labels.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test` all pass.
- [ ] Manual smoke check: load `/budget`, click Historical tab, confirm
      visual identity.

## Owns

- `frontend/src/components/budget/HistoricalView.tsx` — new file
  (carries `HistoricalView` and private `trendIcon`).
- `frontend/src/pages/Budget.tsx` — modified. Specific sections:
  - Delete `trendIcon` (lines ~251–255).
  - Delete `HistoricalView` (lines ~257–414).
  - Add an import for `HistoricalView` from
    `@/components/budget/HistoricalView`.
  - The single render site of `<HistoricalView stats={stats} />` (inside
    the `<TabsContent value="historical">` block, around line ~1622)
    stays at the same call site; only its source changes.

## Must not touch

- `SetBudgetView` and its sub-components — owned by plan
  `2026-05-08-13`.
- `ActualVsBudgetView`, `BudgetVarianceChart`, `CategoryDrilldown`,
  `mapToZonePosition`, `getTierColors`, `VarianceRow`,
  `actualVsBudgetViewModel` — owned by plan `2026-05-08-14`.
- The `Budget` default-export component's queries, mutations, tab markup,
  and conditional rendering. Only the import line and the line that
  renders `<HistoricalView ...>` are touched.
- All shared primitives in `components/budget/` from plan `2026-05-08-11`
  — those are imported as-is.
- `frontend/src/api/*` — no API changes.

## Defines interfaces

None — `HistoricalView` is a leaf component with one consumer
(`pages/Budget.tsx`).

## Pattern exemplar

- **MUST follow the pattern in**:
  `frontend/src/components/overview/SpendingTrendChart.tsx` — match the
  one-component file shape, top-of-file JSDoc, and import style.
- **Follow the pattern in**:
  `frontend/src/components/budget/MonthSelector.tsx` (created in plan
  `2026-05-08-11`) for the local style of the new directory.

## Tasks

- [ ] Create `frontend/src/components/budget/HistoricalView.tsx`. Top of
      file: short JSDoc explaining the component's purpose (per-category
      historical stats table + stacked-bar trend chart).
- [ ] Move `trendIcon` (lines ~251–255 of `Budget.tsx`) into the new
      file as a non-exported function.
- [ ] Move `HistoricalView` (lines ~257–414) into the new file. Update its
      imports to source `tooltipStyle`, `chartColors`, `MONTH_NAMES`,
      `shortMonth` from the new shared modules created in plan
      `2026-05-08-11`.
- [ ] Confirm the `CategoryHistoricalStats` type is imported from
      `@/api/budget` (already true today; preserve the import).
- [ ] In `Budget.tsx`, delete the moved blocks. Add the import:
      `import HistoricalView from "@/components/budget/HistoricalView";`
      (or named import — match the export style chosen in the new file).
- [ ] Run `npm run lint`, `npm run typecheck`, `npm run test`. Fix any
      unused-import warnings.
- [ ] Smoke check in the dev server: open `/budget`, click the
      Historical tab, confirm visual identity.

## Implementation notes

### `HistoricalView`'s shape today

```ts
function HistoricalView({ stats }: { stats: CategoryHistoricalStats[] }) {
  // top 6 categories by avg drive the trend chart
  const trendCategories = stats.slice(0, 6).map((s) => s.categoryName);
  // ...
  // Renders a <table> and a <BarChart>.
}
```

The transforms (`trendCategories`, `monthSet`, `months`, `chartData`) are
plain `const` assignments inside the render body, not `useMemo`. Preserve
this — moving them to `useMemo` would be a behavior change (recomputation
on every render is the current behavior; the data sizes are small enough
that no `useMemo` is justified).

### Imports to update

After the move, the new file needs:

```ts
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer,
         Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { CategoryHistoricalStats } from "@/api/budget";
import { MONTH_NAMES, shortMonth } from "./date-helpers";
import { chartColors, tooltipStyle } from "./chart-style";
```

Verify each import in the existing file (lines ~36–103 of `Budget.tsx`)
and copy across only the ones `HistoricalView` and `trendIcon` actually
use.

### Render-site preservation

The single call site inside `<TabsContent value="historical">` is:

```tsx
<HistoricalView stats={stats} />
```

(`stats` is locally derived from `historicalQ.data ?? []`.) Do not change
this line beyond what's needed to import from the new path.
