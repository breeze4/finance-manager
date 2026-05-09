# Budget: Sub-Nav Routing

## Parent spec

`docs/specs/2026-05-08-05-budget-tweaks.md`

## What to build

Convert the Budget page's sub-tabs from local component state to URL-routed child views. `/budget` redirects to `/budget/actual`. The four sub-views render at `/budget/historical`, `/budget/set`, `/budget/actual`, `/budget/flex`. Sub-nav uses `<NavLink>` (or equivalent) for active-state. A page refresh on any sub-route preserves the active sub-view. No content changes — purely a routing/wiring change.

## Type

AFK

## Blocked by

None — can start immediately.

## User stories addressed

- User story 2
- User story 3
- User story 7

## Acceptance criteria

- [ ] Direct navigation to `/budget/historical`, `/budget/set`, `/budget/actual`, `/budget/flex` each renders the correct sub-view
- [ ] `/budget` redirects (or index-routes) to `/budget/actual`
- [ ] Refreshing the browser on any sub-route stays on that sub-view (no fallback to a default tab)
- [ ] Sub-nav active state is driven by route, not local state
- [ ] Browser back/forward navigates between sub-views correctly
- [ ] Existing in-page state (e.g., year/month selectors within a sub-view) still works as before
- [ ] No regressions to chart, editor, or actual-vs-budget rendering
- [ ] Type-check, lint, frontend build all pass

## Owns

- `frontend/src/pages/Budget.tsx` — convert to a router outlet host with sub-nav linking to child routes
- Wherever top-level routes are declared (likely `frontend/src/App.tsx` or a `routes.tsx` file) — add the four child routes plus the index redirect
- Sub-nav rendering inside Budget — switch to route-aware navigation

## Must not touch

- `frontend/src/components/budget/HistoricalView.tsx` chart code — owned by plan `2026-05-09-04`
- `frontend/src/components/budget/SetBudgetView.tsx` editor — owned by plan `2026-05-09-05`
- Backend budget router/service — not in this plan's scope
- Any other top-level pages' routing

## Defines interfaces

- The Budget child-route URL contract (`/budget/historical`, `/budget/set`, `/budget/actual`, `/budget/flex`) — consumed by plan `2026-05-09-05` (the historical-edit affordance lives at `/budget/historical`)

## Pattern exemplar

- **Follow the pattern in**: existing top-level routes in `frontend/src/App.tsx` (or wherever `Routes`/`Route` are declared). If the project already nests any child routes, mirror that. If not, this is the first nested route — adopt React Router's standard nested-routes idiom (parent Route has `<Outlet />`; child routes pass `index` for the redirect).
- **Soft reference**: any existing page that uses `<NavLink>` for active styling — match that styling so the sub-nav feels consistent with the sidebar.

## Tasks

- [ ] Inspect current `Budget.tsx` to identify how the four sub-views are conditionally rendered today (likely a `useState`-driven switch)
- [ ] Inspect top-level route declarations to choose the right place to add child routes
- [ ] Refactor `Budget.tsx` to a layout with `<Outlet />` and a sub-nav that uses `<NavLink>` for the four child paths
- [ ] Add child route entries: `historical`, `set`, `actual`, `flex` plus an index route that `<Navigate to="actual" replace>`s
- [ ] Verify sub-nav active class flips based on active route
- [ ] Manually test: refresh on each sub-route, browser back/forward, direct URL navigation
- [ ] Run frontend type-check and build

## Implementation notes

- **Slug naming**: keep slugs simple (`set`, not `set-budget`; `actual`, not `actual-vs-budget`; `flex`, not `flex-budget`). Less typing, equally clear given the page context.
- **Index redirect**: prefer `<Route index element={<Navigate to="actual" replace />} />` over a top-level redirect — keeps the redirect colocated with the Budget routes.
- **Local sub-view state** (e.g., a year selector inside SetBudget): leave as component state for this plan. Promoting that to URL params is out of scope; only top-level sub-nav needs to be routed.
