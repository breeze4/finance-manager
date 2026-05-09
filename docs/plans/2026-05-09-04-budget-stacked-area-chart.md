# Budget: Spending-by-Category Stacked Area Chart

## Parent spec

`docs/specs/2026-05-08-05-budget-tweaks.md`

## What to build

Replace the stacked-bar Spending-by-Category chart in HistoricalView with a stacked-area chart and ensure the legend is always visible. Top-6-categories + "Other" bucketing and the existing time window are unchanged. Same data source, same colors, same months — purely a visualization swap.

## Type

AFK

## Blocked by

None — can start immediately.

## User stories addressed

- User story 1

## Acceptance criteria

- [ ] HistoricalView's spending-by-category chart renders as a stacked area chart instead of stacked bars
- [ ] Legend is always visible (not collapsed, not togglable)
- [ ] Color mapping (one color per category) matches today's bar chart — uses the same `chart-style.ts` palette
- [ ] Top-6-categories + "Other" bucketing logic is unchanged
- [ ] Existing time window (months shown on the axis) is unchanged
- [ ] Tooltip on hover shows month and per-category values formatted as currency at 0 decimals
- [ ] No regressions to other parts of HistoricalView (stats tables, etc.)
- [ ] Type-check, lint, frontend build all pass

## Owns

- `frontend/src/components/budget/HistoricalView.tsx` — chart-rendering JSX only (the section that uses Recharts `BarChart`/`Bar`)

## Must not touch

- `frontend/src/components/budget/HistoricalView.tsx` editing affordances — owned by plan `2026-05-09-05`
- `frontend/src/components/budget/SetBudgetView.tsx` — owned by plan `2026-05-09-05`
- `frontend/src/components/budget/chart-style.ts` palette — leave as-is
- Routing — owned by plan `2026-05-09-03`
- Backend `/api/budget/historical` — no changes; the data shape is unchanged

## Defines interfaces

None.

## Pattern exemplar

- **Follow the pattern in**: same file (`HistoricalView.tsx`) — the existing `<BarChart>`/`<Bar stackId="a">` structure. The Recharts API for stacked area is symmetric: `<AreaChart>` + `<Area stackId="a">`.
- **Soft reference**: any other Recharts chart in the codebase that uses an `<AreaChart>` if one exists; otherwise consult the Recharts docs idiom.

## Tasks

- [ ] Locate the chart JSX inside `HistoricalView.tsx`
- [ ] Replace `BarChart` with `AreaChart` and `Bar` with `Area`; preserve `stackId` so series stack
- [ ] Set `<Legend />` so it's always rendered (no `iconType` toggling, no conditional rendering)
- [ ] Configure axis tick formatting and tooltip formatter to render currency at 0 decimals
- [ ] Verify category-to-color mapping is unchanged (same color per category as before)
- [ ] Smoke-test: load `/budget/historical` (or the current default tab pre-routing), confirm chart renders as stacked area with persistent legend
- [ ] Run frontend type-check and build

## Implementation notes

- **No curve smoothing**: use Recharts default (`type="linear"` or omit). Don't introduce `monotone` or other curves — keeps it close to the bar shape semantically.
- **Stack order**: keep the same series order as today (largest-to-smallest or alphabetical, whichever the bar chart uses).
- **Empty-month handling**: if the data already includes zero-value months for empty periods, the stacked area handles them naturally. If not, this is a non-issue since we're not changing the data shape.
