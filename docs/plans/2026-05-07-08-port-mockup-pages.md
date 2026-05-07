# Port mockup pages into the production frontend

## Context

The `mockup/` directory has fully-built UI for six pages (Overview, Transactions, Subscriptions, Budget, Forecast, Payments) that were never carried over into `frontend/`. Today the production `frontend/` ships only stub placeholders for these routes (3-line `<h1>` components in `frontend/src/pages/`). The four calculator-style pages that *were* ported (Accounts, CoastFire, Mortgage, NetWorth) are wired correctly. Backend endpoints for everything the mockup needs already exist (`/api/stats`, `/api/transactions`, `/api/subscriptions`, `/api/payments`, `/api/forecast`, `/api/budget/*`).

Goal: port each mockup page into `frontend/src/pages/`, replace its `mockData`/`mockBudgetData` imports with TanStack Query against the real backend, add the supporting shadcn primitives and dependencies the production frontend currently lacks, and delete the stubs as each slice lands.

Scope is explicitly the six mockup pages plus shared infra they need. Existing ported pages (Accounts, CoastFire, Mortgage, NetWorth) and `mockup/` itself are not touched. The mockup directory remains as a read-only reference until every slice is in.

## Approach

Vertical slices, smallest-to-largest, so each phase ships a fully working page wired end-to-end. Phase 0–1 are shared infra; phases 2–7 are one page each; phase 8 is cleanup. Order chosen so the biggest page (Budget) lands last, after the patterns are settled.

Each per-page slice:
- Copy the mockup page into `frontend/src/pages/`, keeping its component structure
- Add a typed API client in `frontend/src/api/<resource>.ts` matching the existing pattern in `accounts.ts` (literal `ApiError`, `request<T>` helper, BASE constant)
- Replace mock-data imports with `useQuery` hooks bound to that client
- Adapt camelCase mockup field names to the backend's snake_case in the client layer (don't sprinkle `_` access through component code)
- Remove the corresponding stub from `frontend/src/pages/`

Key shape mismatches to resolve in the adapter layer:
- Mockup `Transaction` is camelCase + has `verified: boolean` and `vendor` plain-string; backend uses snake_case + `is_verified`, plus `account_id`/`account_name` split, `category_id`/`category_name` split. Adapter normalises to the mockup shape so component code is unchanged.
- Mockup `BudgetState` keys overrides as `"YYYY-MM"`. Backend stores per-(category, year, month-int). Adapter flattens backend into the mockup-shaped structure for read; on write, splits back to the per-month REST calls.
- Mockup `currentMonth = "2026-02"` is hard-coded. Replace with a derived value (today's year-month) so the page works against any data.
- Mockup `categoryStats` is computed client-side from raw history. Backend `/api/budget/historical` already returns these stats — use the backend version, don't re-compute.

## Phase 0 — Dependencies and UI primitives

Frontend `package.json` is missing many Radix packages and shadcn primitives the mockup pages use. Resolve once at the start so per-page slices don't keep re-touching package.json.

- [ ] Add to `frontend/package.json` dependencies:
  - `@radix-ui/react-tabs`, `@radix-ui/react-progress`, `@radix-ui/react-checkbox`, `@radix-ui/react-popover`, `@radix-ui/react-label`, `@radix-ui/react-switch`, `@radix-ui/react-collapsible`, `@radix-ui/react-scroll-area`, `@radix-ui/react-toast`, `@radix-ui/react-slider`
  - `sonner`, `cmdk`, `date-fns`, `react-day-picker`
- [ ] Run `npm install` in `frontend/`, verify lockfile updates and `npm run build` still succeeds before adding any UI files
- [ ] Copy the following shadcn primitives from `mockup/src/components/ui/` into `frontend/src/components/ui/` (they are unmodified shadcn output and depend only on the deps above):
  - `card.tsx`, `tabs.tsx`, `badge.tsx`, `progress.tsx`, `label.tsx`, `switch.tsx`, `checkbox.tsx`, `popover.tsx`, `scroll-area.tsx`, `collapsible.tsx`, `slider.tsx`, `toast.tsx`, `toaster.tsx`, `sonner.tsx`
- [ ] Copy `mockup/src/hooks/use-toast.ts` into `frontend/src/hooks/`
- [ ] Verify `npm run build` and `npm run test` both pass

Definition of done: deps installed, primitives present, frontend still builds and tests pass with no page changes yet.

## Phase 1 — Shared infrastructure

- [ ] Create `frontend/src/lib/format.ts` with `formatCurrency`, `formatPercent`, `formatDate` matching `mockup/src/lib/format.ts` (verbatim — they're already minimal and correct)
- [ ] Extract the `request<T>`/`ApiError` helper currently duplicated in `frontend/src/api/accounts.ts`, `coastFire.ts`, `mortgage.ts`, `snapshots.ts` into `frontend/src/api/_client.ts` and have those four files re-import from it. This keeps later API clients from copying the same boilerplate. Verify existing pages still work after the refactor.
- [ ] Confirm `vite.config.ts` proxy already routes `/api` → `localhost:8000` (it does — phase is just verification)

Definition of done: `formatCurrency` importable from `@/lib/format`, all four existing API clients build against shared `_client.ts`, no behaviour change for already-ported pages.

## Phase 2 — Overview page

Replaces `frontend/src/pages/Home.tsx`. Backend endpoints: `GET /api/stats/summary`, `GET /api/stats/monthly`, plus `GET /api/transactions?limit=N` for vendor totals if `/api/stats` doesn't already expose them.

- [ ] Audit `/api/stats/summary` and `/api/stats/monthly` against the four cards + four charts the mockup renders. Confirm: total spending, total income, savings rate, txn count, monthly spending bars, category donut, income-vs-expenses bars, top vendors. If "top vendors" is not in `stats_router.py`, decide between (a) computing it client-side from a recent transactions fetch or (b) adding a `/api/stats/top-vendors` endpoint. Pick (a) if the dataset is reasonably small for the global filter range.
- [ ] Create `frontend/src/api/stats.ts` with typed clients for the two endpoints
- [ ] Port `mockup/src/pages/Overview.tsx` to `frontend/src/pages/Overview.tsx`. Replace `transactions` import with TanStack Query calls; keep the chart + card layout identical
- [ ] Update `frontend/src/App.tsx` to route `/` to `Overview` and delete `Home.tsx`
- [ ] Update `frontend/src/components/AppSidebar.tsx` "Overview" label/icon if needed (entry already exists)
- [ ] Manual smoke: load `/`, verify cards show real numbers, charts render without console errors, savings rate sign matches backend convention

Definition of done: `/` shows live stats from the backend; `Home.tsx` removed.

## Phase 3 — Subscriptions page

Backend endpoints: `GET /api/subscriptions`, `POST /api/subscriptions/detect`, `PATCH /api/subscriptions/{id}`. Smaller than Transactions/Budget; good second slice to lock in the per-page pattern.

- [ ] Create `frontend/src/api/subscriptions.ts` typed client
- [ ] Port `mockup/src/pages/Subscriptions.tsx` to `frontend/src/pages/Subscriptions.tsx`. Replace mock data with `useQuery`. Keep the fixed-vs-recurring tab split, summary cards, sparkline trend column.
- [ ] Wire the "detect" action (if present in mockup) to the `POST /detect` endpoint via `useMutation` + query invalidation
- [ ] Delete the stub
- [ ] Manual smoke: page renders, both tabs populate, detect button refreshes the list

Definition of done: subscriptions list driven by the API, including the variable-amount tab and any detection trigger.

## Phase 4 — Payments page

Backend: `GET /api/payments`, `POST /api/payments/detect`, `DELETE /api/payments/{match_id}`. Mockup page is 92 lines — the simplest slice.

- [ ] Create `frontend/src/api/payments.ts`. Note the response embeds full `TransactionResponse` for both sides of the match — the adapter should expose them in the camelCase shape the mockup expects.
- [ ] Port `mockup/src/pages/Payments.tsx`. Wire the matched-payments table + summary card. Wire the unmatched-candidates table by querying `/api/transactions` filtered to `is_transfer=false` candidates (or whatever filter the existing payment service uses — verify before implementing).
- [ ] Wire detect + unmatch as `useMutation` with query invalidation
- [ ] Delete the stub
- [ ] Manual smoke: matched and unmatched tables both populate, unmatch action removes a row

Definition of done: payments view shows real matches and lets the user trigger detection / unmatch.

## Phase 5 — Transactions page

Backend: `GET /api/transactions` (paginated), `PATCH /api/transactions/{id}`, `POST /api/transactions/bulk-update`, plus `GET /api/categories` for the dropdown.

The biggest shape gap. Mockup uses camelCase `Transaction` with `verified`, `rawDescription`, `postDate`, `sourceFile`. Backend gives snake_case + split id/name fields for account/category. Adapter fully normalises to the mockup shape.

- [ ] Create `frontend/src/api/transactions.ts` and `frontend/src/api/categories.ts` typed clients. The transactions client owns the snake-case-to-camelCase adapter.
- [ ] Port `mockup/src/pages/Transactions.tsx`. Hook the table to a paginated query (default 25/page per spec §Transaction List). Keep sort/filter/group controls; the filter state stays client-side except for things the API already filters (date range, account, category, search).
- [ ] Decide where filtering happens. The list endpoint accepts a small set of query params — confirm what those are by reading `transaction_router.py`. Anything not server-supported stays client-side over the current page; this is fine for v1 since pagination is 25/page.
- [ ] Inline category-edit dropdown calls `PATCH /api/transactions/{id}` via `useMutation`; bulk select + assign uses `POST /bulk-update`
- [ ] Wire the expandable row detail's "similar transactions" section. If the backend doesn't expose a "similar by vendor" endpoint, run an extra `GET /api/transactions?vendor=...&limit=4` per expansion.
- [ ] Delete the stub
- [ ] Manual smoke: list paginates, sort/filter/search behave, inline edit persists, bulk edit persists, row expand shows similar transactions

Definition of done: transactions view is the production source of truth for browsing and classifying.

## Phase 6 — Forecast page

Backend: `GET /api/forecast/{year}`, `GET /api/forecast/yoy`, `GET /api/forecast/methods`.

- [ ] Create `frontend/src/api/forecast.ts`
- [ ] Port `mockup/src/pages/Forecast.tsx`. Wire the projection chart (solid for past months, dashed for future), the projection table, the YoY comparison, the recurring-charges list. The forecast endpoint already returns `status` per month ("actual" vs "projected") — drive the line style off that, not a hard-coded current month.
- [ ] If the mockup has a method-picker, populate it from `/api/forecast/methods`
- [ ] Delete the stub
- [ ] Manual smoke: chart renders, future months are dashed, table column for difference colour-codes correctly

Definition of done: forecast page is live against the real forecast service.

## Phase 7 — Budget page

The largest slice (mockup is 1,112 lines). Backend: `GET /api/budget/historical`, `GET /api/budget?year=`, `PUT /api/budget/{cat}/{year}`, `PUT /api/budget/{cat}/{year}/{month}`, `DELETE /api/budget/{cat}/{year}/{month}`, `GET /api/budget/suggestions/{year}`, `GET /api/budget/actual/{year}`.

- [ ] Create `frontend/src/api/budget.ts`. This client owns the adapter that flattens `BudgetResponse[]` (with embedded `monthly_overrides[]`) into the mockup's `BudgetState` shape (`Record<categoryName, BudgetEntry>` with overrides keyed by `"YYYY-MM"`). Writes go through the per-month PUT/DELETE endpoints.
- [ ] Port `mockup/src/pages/Budget.tsx` into `frontend/src/pages/Budget.tsx`. Keep the four-tab structure (Historical, Set Budget, Actual vs Budget, Flex). Each tab gets its own query (`/historical`, `/budget?year`, `/actual/{year}`). The Flex tab's grouping (fixed/flexible/non-monthly) — if backend doesn't classify this server-side, derive client-side from category metadata (verify by reading `budget_service.py` first).
- [ ] Replace `currentMonth = "2026-02"` and `pastMonths`/`allMonths2026` constants with values derived from today's date and the year being viewed
- [ ] Replace the client-side `computeStats` (mockup `mockBudgetData.ts`) with the values from `/api/budget/historical`
- [ ] Wire "Suggest Budgets" to `GET /api/budget/suggestions/{year}` + the per-month PUT mutations on accept
- [ ] Per-category transaction drilldown in Actual-vs-Budget: query `/api/transactions?category_id=&date_from=&date_to=` on row expand
- [ ] Confirm the rollover-mode toggle calls `PUT /api/budget/{cat}/{year}` with `rollover_mode` set, not a separate endpoint
- [ ] Delete the stub
- [ ] Manual smoke for each tab: Historical shows stats and trend chart; Set Budget allows editing baseline + per-month override + rollover toggle, persists across reload; Actual vs Budget renders progress bars and category-row expansion; Flex shows fixed/flex/non-monthly grouping with remaining-amount

Definition of done: budget feature is fully live, all four tabs round-trip through the API.

## Phase 8 — Cleanup

- [ ] Remove any unused stubs left over (`Home.tsx`, etc. — should already be gone after their phases)
- [ ] Sweep `frontend/src/` for any lingering `mockData`/`mockBudgetData` references (there should be none)
- [ ] Update `AppSidebar.tsx` order/labels to match the spec's nav order if it drifted
- [ ] Run `npm run build` and `npm run test`; fix any warnings introduced by the new pages
- [ ] Add a brief review section to this plan covering anything that surprised us during port (so the next page-port has the context)

Definition of done: production frontend has all six mockup pages live against real APIs, no mock-data imports remain, build/tests green.

## Out of scope

- No backend changes unless a phase explicitly calls one out (only candidates: a `top-vendors` endpoint in phase 2, and any missing filter on `/api/transactions` in phase 5 — both decided per-phase, both can be deferred by computing client-side)
- The `mockup/` directory itself stays in place as the styling reference; not touched by this plan
- No changes to the four already-ported pages (Accounts, CoastFire, Mortgage, NetWorth) beyond the phase-1 refactor of `_client.ts`
- No new features beyond what the spec already covers — this is purely porting existing UI to live data

## Review

_Filled in after implementation per `CLAUDE.md` §Task Management._
