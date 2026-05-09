# Step 3 Handoff — Budget: Stacked Area Chart

Plan: `docs/plans/2026-05-09-04-budget-stacked-area-chart.md`
Spec: `docs/specs/2026-05-08-05-budget-tweaks.md`

## Chart section line range (post-change)

`frontend/src/components/budget/HistoricalView.tsx` lines **148–183** (the
`{chartData.length > 0 && trendCategories.length > 0 && (...)}` block, ending
with the closing `)}` on line 183).

Step 6 (click-to-edit affordance) MUST NOT modify lines 148–183. Step 6's
edit affordance belongs against the per-category rows in the stats table
above the chart (lines 99–143) or in a year-header outside both blocks.

## Imports

- Removed from `recharts`: `Bar`, `BarChart`, `LabelList`
- Added from `recharts`: `Area`, `AreaChart`, `Legend`
- Unchanged from `recharts`: `CartesianGrid`, `ResponsiveContainer`,
  `Tooltip`, `XAxis`, `YAxis`
- All other imports (`lucide-react`, `Badge`, Card primitives,
  `formatCurrency`, types, `MONTH_NAMES`, `shortMonth`, `chartColors`,
  `tooltipStyle`) untouched.

## Legend

`<Legend />` with default props — Recharts renders horizontal legend at the
top by default. No `iconType` prop, no conditional rendering, no toggle.
Always visible, as required.

## Formatters

- **Tooltip**: `formatter={(v: number) => formatCurrency(v)}` (unchanged
  from prior bar-chart version). Currency precision is owned by
  `lib/format.ts`; 0-decimal default lands in Step 4.
- **YAxis**: added `tickFormatter={(v: number) => formatCurrency(v)}`. Same
  `formatCurrency` call so axis ticks track tooltip precision.
- **XAxis**: unchanged (still `dataKey="month"` with `shortMonth`-derived
  month labels).

## Chart geometry

- `<AreaChart>` margin omitted (was `margin={{ right: 110 }}` to make room
  for the per-bar `LabelList` trailing label, which is no longer needed
  because the `<Legend />` carries category identity).
- Each `<Area>` carries `stroke={chartColors[i % chartColors.length]}` so
  the outline matches the fill. No `type` prop — defaults to `linear` per
  the plan ("no smoothing").
- `isAnimationActive={false}`, `stackId="spending"`, `dataKey={cat}`
  preserved.

## Stack order / color mapping

Unchanged. `trendCategories = stats.slice(0, 6).map((s) => s.categoryName)`
still drives both the iteration order and the palette index
(`chartColors[i % chartColors.length]`), so each category keeps its prior
color. `chart-style.ts` was not modified.

## Misc edits

- Updated module docstring: "stacked-bar chart" -> "stacked-area chart"
  (lines 4-7). Cosmetic, kept in scope because the file's own
  documentation describes the chart that just changed.

## Gate results

- `cd frontend && npm run build` -> pass (vite build succeeded; same
  bundle warnings as before, no new errors)
- `cd frontend && npm test -- --run` -> pass (24 files, 344 tests)
- `cd backend && uv run ruff check . && uv run ruff format --check .` ->
  pass

## Surprises

- Worktree was forked before the Budget split landed on main; the
  `frontend/src/components/budget/` directory and the plan/spec files
  themselves did not exist in the worktree's HEAD. Resolved by merging
  `main` into the worktree branch (clean merge, no conflicts) before
  editing.
