# Step 2 — Budget sub-nav routing

Wave 1, Step 2 of the Budget-tweaks orchestration. Converts the Budget page's
sub-tabs from local `<Tabs>` state into URL-routed child views so refresh,
back/forward, and deep links all preserve the active sub-view.

## Final route shape

In `frontend/src/App.tsx`:

```tsx
<Route path="/budget" element={<Budget />}>
  <Route index element={<Navigate to="actual" replace />} />
  <Route path="historical" element={<HistoricalTab />} />
  <Route path="set" element={<SetTab />} />
  <Route path="actual" element={<ActualTab />} />
</Route>
```

`/budget` redirects to `/budget/actual`, matching the previous
`<Tabs defaultValue="actual">` behaviour.

## Where child routes are declared

- Route declarations: `frontend/src/App.tsx`, lines 28-46.
- Child route components (`HistoricalTab`, `SetTab`, `ActualTab`): exported
  named exports from `frontend/src/pages/Budget.tsx`. They live alongside the
  default-export `Budget` component (lines ~1660-1830 of that file).

The three views (`HistoricalView`, `SetBudgetView`, `ActualVsBudgetView`)
that each tab renders remain inlined inside `Budget.tsx` — extracting them
into `components/budget/` is owned by Steps 3, 6, etc., per the plan's
"Must not touch" guidance.

## Shared data passed to child routes

Pattern: **outlet context** (`<Outlet context={...} />` +
`useOutletContext()`).

The parent `<Budget>` keeps all data fetching (`useQuery` for budgets,
historical, actual, categories, planning rollup, actuals rollup), all
mutations (`setBaseline`, `setOverride`, `clearOverride`, `suggest`), and
the `actualSelectedMonth` state hoisted at the page level. It then renders
`<Outlet context={outletContext}>`, where `outletContext` is a typed
`BudgetOutletContext` interface bundling:

- query results: `budgets`, `stats`, `categories`, `rollup`, `actual`,
  `actualsRollup`
- year, plus `actualSelectedMonth` + setter
- mutation runners: `setBaseline`, `setOverride`, `clearOverride`, `suggest`
- mutation state: `isSuggestPending`, `suggestError`
- a `hasBudgets` boolean derived once in the parent.

A small `useBudgetContext()` helper wraps `useOutletContext()` with the
`BudgetOutletContext` type so child components don't repeat the generic
parameter.

This preserves the previous fetch-once-per-page behaviour without
prop-drilling, and keeps `actualSelectedMonth` alive when the user
navigates away from `/budget/actual` and back.

## NavLink styling approach

A small `BudgetSubNavLink` component wraps `react-router-dom`'s `NavLink`.
Inactive state uses the same base `TabsTrigger` classes (rounded, padded,
medium-weight text); active state adds `bg-background text-foreground
shadow-sm` — a direct port of the `data-[state=active]:` styles that the
`shadcn/ui` Tabs primitive applied to `TabsTrigger`. The container `<nav>`
mirrors `TabsList` (`grid grid-cols-3` inside a muted-rounded chrome).
Visual parity with the previous tab strip is intentional.

Active-state detection comes from `NavLink`'s `({ isActive }) => …`
className callback — no `useLocation()` checks in the component.

## Flex route

**Not added.** The user's instructions said: add a `flex` route only if a
Flex view component already exists in `components/budget/`. That directory
doesn't exist yet, and there is no Flex tab in `Budget.tsx` today (the
current `<Tabs>` only had `historical`, `set`, `actual`). So only the three
existing tabs are routed. Adding the `flex` route is deferred to whatever
step actually introduces the Flex view component.

## Tests added

`frontend/src/pages/__tests__/Budget.routing.test.tsx` — six cases covering
the acceptance criteria:

1. `/budget` redirects to `/budget/actual` (default view).
2. `/budget/historical` renders the Historical tab content (refresh
   simulated by `MemoryRouter` `initialEntries`).
3. `/budget/set` renders the Set Budget tab content.
4. `/budget/actual` renders the Actual vs Budget tab content.
5. The active sub-nav link gets the `bg-background` active class; inactive
   links don't — i.e. active state is route-driven.
6. Clicking sub-nav links navigates between tabs (covers browser back/
   forward by exercising router-driven view switching).

All fetches are stubbed via `vi.spyOn(globalThis, "fetch")` with empty
payloads matching the snake_case wire shapes in `api/budget.ts`,
`api/csp.ts`, `api/categories.ts`, and `api/net-income.ts`.

## Gate results

- `npm run build` (frontend) — pass
- `npm test -- --run` (frontend) — pass, 324/324 tests
- `uv run ruff check .` (backend) — pass
- `uv run ruff format --check .` (backend) — pass
- `uv run pytest -q` (backend) — pass, 494/494 tests

## Files touched

- `frontend/src/App.tsx` — switched `/budget` to nested routes; imported
  `Navigate` and the three named tab components.
- `frontend/src/pages/Budget.tsx` — replaced `<Tabs>`/`<TabsList>`/
  `<TabsContent>` blocks with a NavLink sub-nav + `<Outlet context={...}>`;
  added `BudgetOutletContext` interface, `useBudgetContext()` helper, and
  named exports `HistoricalTab` / `SetTab` / `ActualTab`. Removed the
  `Tabs` UI import; added `NavLink`, `Outlet`, `useOutletContext`, and
  `cn`.
- `frontend/src/pages/__tests__/Budget.routing.test.tsx` — new test file.
