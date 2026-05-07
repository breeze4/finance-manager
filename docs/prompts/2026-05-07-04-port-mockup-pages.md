# Orchestration Prompt: Port Mockup Pages to Production Frontend

The `mockup/` directory has six fully-built pages (Overview, Transactions, Subscriptions, Budget, Forecast, Payments) that were never carried into `frontend/`. Today the production frontend ships only 3-line stubs for these routes. Backend endpoints already exist for everything. This prompt runs the nine-phase port end-to-end as a serial chain.

The four already-ported pages (Accounts, CoastFire, Mortgage, NetWorth) are the canonical pattern reference — match their structure for query/mutation/styling. Phases 0–1 establish shared infra; phases 2–7 each port one page; phase 8 is cleanup.

## Project context

- Working directory: `.`
- Plan (single file): `docs/plans/2026-05-07-08-port-mockup-pages.md`
- Spec reference: `docs/SPEC.md` (Budget, Forecast, Subscriptions, Payments, Transactions, Overview sections)
- Read-only UI reference: `mockup/src/` — do **not** modify
- Frontend build: `cd frontend && npm run build`
- Frontend test: `cd frontend && npm test -- --run`
- Backend test (sanity, run if `_client.ts` refactor is suspect): `make test`
- Handoff directory: `docs/handoff/`
- Vite proxy: `/api` → `http://localhost:8000` is already configured

## Orchestrator responsibilities

You are actively managing context between agents. Before launching each step:

1. Read the files listed under "Context sources" and inline relevant sections in the agent's "Context" field.
2. Read the previous step's handoff file and pass forward the key facts (new files, new exports, decisions taken).
3. Run the gate after each step. **Do not** proceed past a failing gate — report and stop.
4. One plan-phase = one agent. No splitting; no combining.
5. Phase 5 (Transactions) and Phase 7 (Budget) each have explicit "judgment calls" called out in the plan that the agent may need to decide — when the agent encounters one, it should resolve and document the decision in its handoff.

## Execution plan (serial, 9 steps)

```
Step 1: Phase 0 — Dependencies + UI primitives        (root, blocks all)
   ↓
Step 2: Phase 1 — Shared infra (format.ts, _client.ts)  (interface gate after)
   ↓
Step 3: Phase 2 — Overview page                         (replaces Home stub, re-routes /)
   ↓
Step 4: Phase 3 — Subscriptions page
   ↓
Step 5: Phase 4 — Payments page
   ↓
Step 6: Phase 5 — Transactions page                     (largest shape adapter)
   ↓
Step 7: Phase 6 — Forecast page
   ↓
Step 8: Phase 7 — Budget page                           (largest port — 1,112-line mockup)
   ↓
Step 9: Phase 8 — Cleanup + final verification
```

**Why serial, not parallel**: per-page slices have disjoint file sets, but (a) `App.tsx` and visual style consistency benefit from sequential learning, (b) the shared `_client.ts` may evolve mid-port if a page surfaces new needs, (c) there are no two pages large enough that parallelizing produces meaningful savings.

All steps are AFK. No HITL checkpoints by default — the user can interrupt at any gate to inspect.

---

## Step 1 — Phase 0: Dependencies + UI primitives

**Plan**: `docs/plans/2026-05-07-08-port-mockup-pages.md` §Phase 0

**Agent briefing**:

- **Context sources** (orchestrator reads these):
  - `frontend/package.json`, `mockup/package.json` (diff the deps)
  - List of UI primitives in `mockup/src/components/ui/` vs `frontend/src/components/ui/`
- **Read first**: plan §Phase 0
- **Context**: orchestrator inlines the dep diff and the primitive list so the agent doesn't re-derive it
- **Owns**:
  - `frontend/package.json`, `frontend/package-lock.json`
  - New files in `frontend/src/components/ui/`: `card.tsx`, `tabs.tsx`, `badge.tsx`, `progress.tsx`, `label.tsx`, `switch.tsx`, `checkbox.tsx`, `popover.tsx`, `scroll-area.tsx`, `collapsible.tsx`, `slider.tsx`, `toast.tsx`, `toaster.tsx`, `sonner.tsx`
  - New file `frontend/src/hooks/use-toast.ts`
- **Must not touch**: any `frontend/src/pages/*.tsx`, any existing `frontend/src/api/*.ts`, any existing `frontend/src/components/*.tsx` outside `ui/`
- **MUST follow the pattern**: copy primitive files **byte-for-byte** from `mockup/src/components/ui/` — they are unmodified shadcn output. Do not "improve" them.
- **Do not**: bump versions of any existing dep (additive only); do not add deps not listed in the plan
- **If unclear, stop**: if `npm install` produces peer-dep warnings the existing setup didn't have, report before continuing
- **Handoff**: write `docs/handoff/step-1-deps-and-primitives.md` listing exact deps added, exact files created, and any peer-dep notes

**Gate**: `cd frontend && npm run build && npm test -- --run`

---

## Step 2 — Phase 1: Shared infrastructure

**Plan**: `docs/plans/2026-05-07-08-port-mockup-pages.md` §Phase 1

**Agent briefing**:

- **Context sources**: `docs/handoff/step-1-deps-and-primitives.md`; `mockup/src/lib/format.ts`; `frontend/src/api/accounts.ts`, `coastFire.ts`, `mortgage.ts`, `snapshots.ts` (the four files duplicating `request<T>`/`ApiError`)
- **Read first**: plan §Phase 1
- **Context**: orchestrator inlines the `request<T>`/`ApiError` block from `accounts.ts` plus the contents of `mockup/src/lib/format.ts`
- **Owns**:
  - New `frontend/src/lib/format.ts`
  - New `frontend/src/api/_client.ts` (extracted helper)
  - Edits to `frontend/src/api/accounts.ts`, `coastFire.ts`, `mortgage.ts`, `snapshots.ts` to import from `_client.ts`
- **Must not touch**: pages, components, vite config, hooks
- **MUST follow the pattern in** `frontend/src/api/accounts.ts` — `_client.ts` should expose **exactly** what those four files currently inline (`ApiError` class + `request<T>` function); no signature changes, no added options
- **Do not**: rename `ApiError` or `request`; do not change the call sites' behaviour
- **Handoff**: write `docs/handoff/step-2-shared-infra.md` listing the exported names from `_client.ts` and `format.ts`, and confirming all four existing API clients still build

**Interface gate** (block step 3 if either fails):
- `grep -E "^export (function|class) (ApiError|request)" frontend/src/api/_client.ts` returns both names
- `grep -E "^export function (formatCurrency|formatPercent|formatDate)" frontend/src/lib/format.ts` returns all three

**Gate**: `cd frontend && npm run build && npm test -- --run`

---

## Step 3 — Phase 2: Overview page

**Plan**: `docs/plans/2026-05-07-08-port-mockup-pages.md` §Phase 2

**Agent briefing**:

- **Context sources**: `docs/handoff/step-2-shared-infra.md`; `mockup/src/pages/Overview.tsx`; `backend/app/routers/stats_router.py`; `backend/app/schemas/stats.py`; `frontend/src/pages/NetWorth.tsx` (closest existing pattern using TanStack Query + Recharts)
- **Read first**: plan §Phase 2
- **Context**: orchestrator inlines `mockup/src/pages/Overview.tsx`, the two stats endpoints, and a 40-line excerpt from `NetWorth.tsx` showing the `useQuery` + chart pattern
- **Owns**:
  - New `frontend/src/api/stats.ts`
  - New `frontend/src/pages/Overview.tsx`
  - Edits to `frontend/src/App.tsx` (route `/` to `Overview`, drop `Home` import)
  - Delete `frontend/src/pages/Home.tsx`
- **Must not touch**: `AppSidebar.tsx` (Overview entry already exists), any other page, `_client.ts` or `format.ts`
- **MUST follow the pattern in** `frontend/src/api/accounts.ts` (uses `_client.ts` from step 2) for the new `stats.ts`
- **Judgment call** (plan flags this): if `/api/stats/summary` does not return top-vendors, prefer computing client-side from a recent `/api/transactions` fetch over adding a new endpoint. Document the decision in the handoff.
- **Do not**: change route paths other than `/`; do not modify other stub pages — those are later steps
- **Handoff**: `docs/handoff/step-3-overview.md` — record API endpoints used, the top-vendors decision, any backend gaps observed

**Gate**: `cd frontend && npm run build && npm test -- --run`

---

## Step 4 — Phase 3: Subscriptions page

**Plan**: `docs/plans/2026-05-07-08-port-mockup-pages.md` §Phase 3

**Agent briefing**:

- **Context sources**: `docs/handoff/step-3-overview.md`; `mockup/src/pages/Subscriptions.tsx`; `backend/app/routers/subscription_router.py`; `backend/app/schemas/subscription.py`; `frontend/src/pages/Overview.tsx` (just-completed pattern)
- **Read first**: plan §Phase 3
- **Owns**:
  - New `frontend/src/api/subscriptions.ts`
  - New `frontend/src/pages/Subscriptions.tsx` (replaces stub)
- **Must not touch**: `App.tsx`, `_client.ts`, `format.ts`, any other page
- **MUST follow the pattern in** `frontend/src/api/stats.ts` (just created in step 3) and `frontend/src/pages/Overview.tsx` for query wiring
- **Do not**: introduce new top-level deps; do not modify shared infra
- **Handoff**: `docs/handoff/step-4-subscriptions.md` — record endpoint usage, mutation invalidation key, any field-name mismatches with the mockup shape

**Gate**: `cd frontend && npm run build && npm test -- --run`

---

## Step 5 — Phase 4: Payments page

**Plan**: `docs/plans/2026-05-07-08-port-mockup-pages.md` §Phase 4

**Agent briefing**:

- **Context sources**: `docs/handoff/step-4-subscriptions.md`; `mockup/src/pages/Payments.tsx`; `backend/app/routers/payment_router.py`; `backend/app/schemas/payment.py`; the just-completed `frontend/src/api/subscriptions.ts`
- **Read first**: plan §Phase 4
- **Owns**:
  - New `frontend/src/api/payments.ts`
  - New `frontend/src/pages/Payments.tsx` (replaces stub)
- **Must not touch**: anything outside the two new files
- **MUST follow the pattern in** the just-created subscriptions/overview API clients and pages
- **Note**: payment match responses embed full `TransactionResponse` for both sides — handle the snake-case shape locally; transactions page (step 6) will own the shared adapter
- **Handoff**: `docs/handoff/step-5-payments.md` — endpoints used, any unmatched-candidates query strategy

**Gate**: `cd frontend && npm run build && npm test -- --run`

---

## Step 6 — Phase 5: Transactions page

**Plan**: `docs/plans/2026-05-07-08-port-mockup-pages.md` §Phase 5

**Agent briefing**:

- **Context sources**: `docs/handoff/step-5-payments.md`; `mockup/src/pages/Transactions.tsx`; `mockup/src/data/mockData.ts` (the camelCase `Transaction` shape the mockup component expects); `backend/app/routers/transaction_router.py`; `backend/app/routers/category_router.py`; `backend/app/schemas/transaction.py`; `backend/app/schemas/category.py`
- **Read first**: plan §Phase 5
- **Owns**:
  - New `frontend/src/api/transactions.ts` — **owns the snake_case → camelCase adapter** for the rest of the app
  - New `frontend/src/api/categories.ts`
  - New `frontend/src/pages/Transactions.tsx` (replaces stub)
- **Must not touch**: existing API clients, `_client.ts`, payments page (already used local snake-case access)
- **MUST follow the pattern in** the existing API clients for `request<T>` usage; for the **adapter**, expose a public `Transaction` type matching the mockup shape (camelCase + flat `verified`/`vendor`/`category`) and convert in the client functions, never in component code
- **Judgment calls** (plan flags these): (a) which filters are server-supported vs client-side — read `transaction_router.py` first; (b) "similar transactions" expansion strategy — extra query vs added endpoint. Default to extra query unless cost is obviously bad
- **Do not**: change the mockup's component interfaces or props; the adapter must keep them unchanged
- **Handoff**: `docs/handoff/step-6-transactions.md` — record the adapter's public types, server-supported filters, the similar-transactions strategy

**Gate**: `cd frontend && npm run build && npm test -- --run`

---

## Step 7 — Phase 6: Forecast page

**Plan**: `docs/plans/2026-05-07-08-port-mockup-pages.md` §Phase 6

**Agent briefing**:

- **Context sources**: `docs/handoff/step-6-transactions.md`; `mockup/src/pages/Forecast.tsx`; `backend/app/routers/forecast_router.py`; `backend/app/schemas/forecast.py`
- **Read first**: plan §Phase 6
- **Owns**:
  - New `frontend/src/api/forecast.ts`
  - New `frontend/src/pages/Forecast.tsx` (replaces stub)
- **Must not touch**: prior pages, prior API clients, `App.tsx`
- **MUST follow the pattern in** existing API clients and pages
- **Important**: the forecast endpoint returns `status` per month (`actual` vs `projected`) — drive the chart's solid-vs-dashed line off `status`, **not** off a hard-coded current month like the mockup does
- **Handoff**: `docs/handoff/step-7-forecast.md`

**Gate**: `cd frontend && npm run build && npm test -- --run`

---

## Step 8 — Phase 7: Budget page

**Plan**: `docs/plans/2026-05-07-08-port-mockup-pages.md` §Phase 7

This is the largest port (1,112-line mockup). Allow more reading time before writing.

**Agent briefing**:

- **Context sources**: `docs/handoff/step-7-forecast.md`; `mockup/src/pages/Budget.tsx` (full); `mockup/src/data/mockBudgetData.ts` (for the `BudgetState` / `BudgetEntry` / `categoryStats` shapes the page expects); `backend/app/routers/budget_router.py`; `backend/app/schemas/budget.py`; `backend/app/services/budget_service.py` (read enough to know whether Flex grouping is server-side)
- **Read first**: plan §Phase 7
- **Owns**:
  - New `frontend/src/api/budget.ts` — **owns the adapter** that flattens backend `BudgetResponse[]` (with `monthly_overrides[]` of `{month: int, amount: float}`) into the mockup's `BudgetState` (overrides keyed by `"YYYY-MM"`); writes go through the per-month `PUT`/`DELETE` endpoints
  - New `frontend/src/pages/Budget.tsx` (replaces stub) — keeps the four tabs (Historical, Set Budget, Actual vs Budget, Flex)
- **Must not touch**: `transactions.ts` (read-only consume), `categories.ts` (read-only consume), all prior pages, `_client.ts`, `format.ts`
- **MUST follow the pattern in** `frontend/src/api/transactions.ts` (step 6's adapter pattern — adapter owns shape conversion, components stay in mockup-shape)
- **Drop client-side compute** — replace the mockup's `mockBudgetData.ts` `computeStats` with values from `/api/budget/historical`. Replace hard-coded `currentMonth = "2026-02"` with derived (today). Replace hard-coded month arrays with values derived from the year being viewed.
- **Judgment call**: Flex tab grouping (fixed/flexible/non-monthly) — verify whether `budget_service.py` exposes this server-side. If yes, consume; if no, derive client-side from category metadata. Document the decision.
- **Do not**: re-implement the suggestion algorithm — call `/api/budget/suggestions/{year}`. Do not implement rollover math client-side — the actual-vs-budget endpoint already provides effective budget per category-month; trust it.
- **Handoff**: `docs/handoff/step-8-budget.md` — adapter type definitions, Flex grouping decision, list of mutations and their query-invalidation keys, anything that surprised the agent

**Gate**: `cd frontend && npm run build && npm test -- --run`

---

## Step 9 — Phase 8: Cleanup + final verification

**Plan**: `docs/plans/2026-05-07-08-port-mockup-pages.md` §Phase 8

**Agent briefing**:

- **Context sources**: all eight prior handoffs (`docs/handoff/step-{1..8}-*.md`)
- **Read first**: plan §Phase 8
- **Owns**: `docs/plans/2026-05-07-08-port-mockup-pages.md` (Review section), any small follow-ups discovered (label drift in `AppSidebar.tsx`, etc.). No new substantive features.
- **Must not touch**: `mockup/` (stays as reference)
- **Tasks**:
  - `grep -r "mockData\|mockBudgetData" frontend/src/` returns zero hits
  - `frontend/src/pages/` no longer contains `Home.tsx`; all six target pages exist as full implementations (≥100 lines each)
  - Run `cd frontend && npm run build && npm test -- --run` clean
  - Spot-check `AppSidebar.tsx` order matches `SPEC.md` §Navigation
  - Append a Review section to the plan summarising any port surprises (esp. anything that should inform future ports)
- **Handoff**: `docs/handoff/step-9-cleanup.md` with the final-verification grep results and build output summary

**Gate**: `cd frontend && npm run build && npm test -- --run`

---

## Interface gates

- [ ] After **step 2**: `frontend/src/api/_client.ts` exports `ApiError` and `request`; `frontend/src/lib/format.ts` exports `formatCurrency`, `formatPercent`, `formatDate`. All four pre-existing API clients (`accounts.ts`, `coastFire.ts`, `mortgage.ts`, `snapshots.ts`) import from `_client.ts`.

## HITL checkpoints

None by default. The user may interrupt at any gate. Recommended manual smoke after step 8 (Budget) before declaring done — load `/budget` and walk all four tabs.

## Completion criteria

- All 9 steps complete, each handoff present in `docs/handoff/`
- `cd frontend && npm run build && npm test -- --run` green
- `grep -r "mockData\|mockBudgetData" frontend/src/` empty
- All 10 routes in `App.tsx` resolve to a non-stub page
- Plan file's Review section is filled in
