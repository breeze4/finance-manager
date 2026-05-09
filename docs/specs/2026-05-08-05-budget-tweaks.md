# Budget Page Tweaks

## Problem Statement

Three friction points on the Budget page:

1. **Spending-by-category chart** is a stacked vertical bar chart with no persistent legend. It's hard to tell which color corresponds to which category at a glance, and the bar form makes it harder to read trends across months than a continuous shape would.
2. **Past-year baselines are locked.** The user has noticed that some past-year `monthly_amount` values are wrong (mistakes made earlier), and those wrong baselines are now distorting the historical analyses and Actual-vs-Budget reports. There's no UI to fix them.
3. **Sub-tab state is lost on refresh.** Budget's sub-views (Historical, Set Budget, Actual vs Budget, Flex Budget) are tab-only state — refreshing the page drops the user back to the default tab. This violates the project-wide rule that any in-page sub-navigation must be URL-routed.

## Solution

Three tightly-related changes:

1. **Chart**: convert Spending-by-category from stacked bar to stacked area, with the legend always visible. Keep top-6-categories + "Other" bucketing and the existing time window.
2. **Historical editing**: in the Historical sub-view, click-to-edit on a past year/month invokes the editor (the same component the Set Budget tab uses). Only the year-level `monthly_amount` baseline is editable for past years; per-month overrides remain locked, as does `rollover_mode`. Save returns to the analytical view.
3. **Routes**: each sub-view becomes a child route. `/budget` redirects to `/budget/actual`. Sub-routes: `/budget/historical`, `/budget/set`, `/budget/actual`, `/budget/flex`. Edit mode within Historical stays as transient component state (not its own route).

## User Stories

1. As a user, I want the spending-by-category chart to render as stacked area with a persistent legend, so that I can track category trends over time without losing track of which color is which.
2. As a user, I want to refresh the Budget page on the Set Budget tab and stay on Set Budget, so that I don't lose my place every time I reload.
3. As a user, I want each Budget sub-view to have its own URL, so that I can bookmark specific views, share a URL with myself across devices, and rely on browser back/forward.
4. As a user, I want to fix wrong `monthly_amount` baselines on past years from the Historical view, so that historical analyses and Actual-vs-Budget reports reflect what I actually intended to budget.
5. As a user, I want past-year edits to apply retroactively to Actual-vs-Budget displays, so that fixing the budget actually fixes the report.
6. As a user, I want past per-month overrides to stay locked so that I don't accidentally rewrite months I've reconciled — only the baseline `monthly_amount` should unlock.
7. As a user, I want to land on Actual-vs-Budget when I navigate to /budget, so that the most actionable view is the default.

## Data Flow

1. **Routing**: top-level `BudgetPage` component declares child routes for `historical`, `set`, `actual`, `flex`. The page's sub-nav becomes `<NavLink>`s pointing at those routes. `/budget` index redirects to `/budget/actual`.
2. **Historical view (default mode)**: fetches historical analysis (existing `getHistorical()` endpoint), renders the new stacked-area chart and the per-category statistics. Each category row exposes a click-to-edit affordance against the year-baseline. A small per-year edit affordance also exists (e.g., a year header button).
3. **Historical view (edit mode)**: clicking edit toggles a transient panel that mounts the shared budget editor with `year` set to the chosen past year and `monthly_amount` editable. Save calls the existing budget-update endpoint; cancel returns to view mode without changes.
4. **Backend update path**: the existing budget-update endpoint must accept updates for past-year rows. If currently guarded against past-year writes, the guard is removed (or scoped to `monthly_amount` only). Per-month override writes for past months remain rejected.
5. **Chart redesign**: the `HistoricalView` chart component swaps its Recharts `<BarChart>` for `<AreaChart>` with stacked `<Area>` series. The legend prop is set to always-visible. Color mapping comes from the existing `chart-style.ts` palette.

## Behavior

- **Routes**:
  - `/budget` → 302/redirect → `/budget/actual`
  - `/budget/historical`, `/budget/set`, `/budget/actual`, `/budget/flex` each render their respective sub-view.
  - Sub-nav reflects the active route via `<NavLink>` active state, not local component state.
  - Direct navigation to a sub-route loads the Budget page with that tab active.
- **Chart**:
  - Stacked area chart, top-6 categories + "Other".
  - Legend always rendered; not togglable off.
  - Same time window as today (no scope change).
  - Default Recharts behavior for tooltips, smoothing, and axis formatting (no exotic curve smoothing). Currency on tooltip/axis renders at 0 decimals per the currency spec.
- **Historical edit mode**:
  - Click a past year's baseline → editor panel replaces the chart+stats area for that interaction.
  - Editor reuses the same component used by the Set Budget tab. Behavior differences for past years: only `monthly_amount` is editable; per-month overrides are read-only/disabled; `rollover_mode` is read-only/disabled.
  - Save → update via existing endpoint → return to view mode → analytics re-fetch.
  - Cancel → discard changes → return to view mode.
- **Existing data**: no schema changes. Budgets table already supports per-year rows with `monthly_amount` and per-month overrides; we're just lifting a write-side restriction on the year-baseline for past years.

## Modules

- **Budget routes** (frontend): top-level `BudgetPage` becomes a router outlet host with four child routes plus an index redirect.
  - Role: **defines** the URL contract for the page.
  - Test: yes — basic route-rendering tests, plus a refresh-preserves-tab assertion.
- **Stacked-area spending chart** (frontend): replaces the existing stacked-bar implementation in HistoricalView.
  - Role: **consumes** the historical-analysis endpoint shape (unchanged).
  - Test: no — visual.
- **Shared budget editor** (frontend): factor the existing Set Budget editor into a component that accepts a year and a "past-year-mode" flag. Past-year mode disables override and rollover edits.
  - Role: **defines** the shared editor contract; **consumes** the budget-update endpoint.
  - Test: yes — component test for past-year-mode disabling the right inputs.
- **Historical view edit affordance** (frontend): the click-to-edit invocation and the panel host inside HistoricalView.
  - Role: **consumes** the shared editor.
  - Test: no — light wrapper.
- **Budget update endpoint** (backend): lift the past-year guard on `monthly_amount`. Keep per-month override writes guarded for past months.
  - Role: **defines** the write contract.
  - Test: yes — boundary test that past-year `monthly_amount` updates succeed; past-month override writes still 4xx.

## Resolved Decisions

- **Historical sub-view IS the editor's home for past years** — chosen over moving past-year edits into Set Budget. Set Budget stays forward-looking; Historical owns "look at and fix" for past data.
- **Click-to-edit is transient component state, not a route** — chosen to avoid bloating the route tree. Sub-nav rule applies to top-level sub-views, not transient editor panels.
- **Editor is shared between Set Budget and Historical edit mode** — chosen over duplicating the form for code-deduplication and consistency.
- **Only `monthly_amount` unlocks for past years** — chosen over also unlocking per-month overrides and rollover state. The user explicitly scoped the edit surface to baselines only; opening overrides is a separate decision.
- **Chart: stacked area with always-visible legend, top-6 + Other, no smoothing tweaks** — minimum-change scope.
- **Default route `/budget` → `/budget/actual`** — chosen because Actual-vs-Budget is the most actionable view at-a-glance.

## Testing Decisions

- Budget update endpoint: backend boundary test confirming past-year `monthly_amount` writes succeed and past-month override writes are still rejected.
- Shared editor component: a light component test that past-year mode disables override/rollover inputs and leaves `monthly_amount` editable.
- Routing: a smoke test verifying that direct navigation to each sub-route renders the correct sub-view, and that `/budget` redirects to `/budget/actual`.
- Frontend chart and click-to-edit flow: agent-browser smoke check, no automated component tests.

## Out of Scope

- Editing per-month overrides for past months.
- Changing `rollover_mode` for past years.
- Carrying retroactive baseline edits forward into a derived "snapshot of what the budget was at the time" — past-year edits overwrite the original value; there's no audit trail.
- Reorganizing the Flex Budget tab or any non-Historical sub-view's content.
- Currency precision concerns (handled in the parallel currency spec).
