# Orchestration Prompt: Overview Dashboard Redesign

## Project context

- Working directory: `.`
- Research: none (spec backed by in-conversation research)
- Spec: `docs/specs/2026-05-08-01-overview-redesign.md`
- Plans: `docs/plans/2026-05-08-{01..05}-overview-*.md`
- Build: `cd frontend && npm run build` (frontend type-check + bundle; no
  backend build step)
- Test: `make test && (cd frontend && npm test -- --run)`
- Lint: `make lint` (backend ruff; no frontend lint configured)
- Handoff directory: `docs/handoff/` (create if it doesn't exist)
- All five plans are AFK. No HITL checkpoints in this orchestration.

## Orchestrator responsibilities

You are actively managing context between agents. Before launching each
step:

1. Read the files listed under "Context sources" and inline the relevant
   sections (not whole files) in the agent's "Context" field.
2. If a previous step completed, read its handoff file from
   `docs/handoff/` and use it to fill in what changed.
3. Always remind the agent: "Stay within your plan's scope. If you see an
   improvement that belongs to a later step, leave it."

## Execution plan

The plans run **serially**. The four post-foundation slices (steps 2–4)
each modify `frontend/src/pages/Overview.tsx` for a non-overlapping
section, but the file is shared, so parallelizing risks merge conflicts
without enough time savings to justify worktree juggling. Step 5 modifies
nearly every file from steps 1–4 to wire in the range picker and the
second response mode, so it is strictly last.

### Step 1 — Pace foundation (backend services + endpoint + headline + bucket cards)

**Plan**: `docs/plans/2026-05-08-01-overview-pace-foundation.md`

**Agent briefing**:
- **Context sources** (orchestrator reads these and inlines what's
  relevant):
  - `docs/specs/2026-05-08-01-overview-redesign.md` (the "Behavior →
    Pace mode" section, the "Modules" section, and "Resolved Decisions")
  - `backend/app/services/csp_rollup_service.py` (sibling pattern)
  - `backend/app/routers/stats_router.py` (where the new endpoint goes)
  - `backend/app/schemas/stats.py` (where new schemas go)
  - `backend/app/services/budget_service.py` (effective-budget helper to
    reuse — verify the function name)
  - `backend/app/services/subscription_service.py` (read-only consumer)
  - `backend/tests/test_csp_rollup_service.py` (test pattern)
  - `backend/tests/test_stats_api.py` (endpoint integration test
    pattern)
  - `frontend/src/api/csp.ts` (narrow API client pattern)
  - `frontend/src/pages/Budget.tsx` (Set Budget tab — bucket card visual
    language to mirror)
- **Read first**: `docs/plans/2026-05-08-01-overview-pace-foundation.md`
- **Context**: <orchestrator pastes pace pseudocode from spec, the exact
  shape expected for `MonthlyPaceResponse`, and the
  `csp_rollup_service.py` aggregation skeleton>
- **Owns**: see plan's Owns section. In particular: new files
  `pace_service.py`, `subscription_due_service.py`,
  `test_pace_service.py`, `test_subscription_due_service.py`,
  `api/overview.ts`, `components/overview/PaceHeadline.tsx`,
  `components/overview/BucketCard.tsx`. Modifies: `schemas/stats.py`,
  `routers/stats_router.py`, `tests/test_stats_api.py`,
  `pages/Overview.tsx`.
- **Must not touch**: see plan's "Must not touch". Especially
  `csp_rollup_service.py` (sibling, not extension), `budget_service.py`
  (read-only), the existing `get_summary` / `get_monthly_stats`
  functions, all other pages.
- **MUST follow the pattern in**:
  - `backend/app/services/csp_rollup_service.py` for the service module
    structure.
  - `backend/app/routers/stats_router.py` for the new endpoint.
- **Follow the pattern in**:
  - `backend/tests/test_csp_rollup_service.py` for service tests.
  - `frontend/src/api/csp.ts` for the API client.
  - The Budget Set Budget tab section for bucket card styling.
- **Do not**: add the range picker, the trend chart, the
  subscriptions-remaining card, the top-movers table, the recent-txns
  list, or the actual-vs-budget mode — those are Steps 2–5.
- **If unclear, stop**: if the effective-budget helper in
  `budget_service.py` doesn't have the shape the plan assumes, ask
  before extracting or duplicating.
- **Handoff**: Write `docs/handoff/step-1-overview-pace-foundation.md`
  listing every file created or modified (with one-line summaries), the
  exact shape of `MonthlyPaceResponse` as emitted (field names + types),
  the `compute_monthly_pace` and `subscriptions_already_hit` /
  `subscriptions_remaining` signatures, and any deviations from the
  plan.

**Stay within your plan's scope. If you see an improvement that belongs
to a later step, leave it.**

**Gate**: `make test && (cd frontend && npm test -- --run) && (cd
frontend && npm run build)`

### Interface gate after Step 1

Before launching Step 2, verify the following on disk:

- `backend/app/schemas/stats.py` exports `MonthlyPaceResponse` with at
  least these fields: `mode: Literal["pace", "actual_vs_budget"]`,
  `headline: PaceHeadline`, `buckets: list[BucketPaceRollup]`,
  `categories: list[CategoryPaceRow]`.
- `CategoryPaceRow` includes: `category_id`, `category_name`, `bucket`
  (optional, nullable for Uncategorized), `actual_mtd`, `expected_mtd`,
  `full_budget`.
- `BucketPaceRollup` includes: `bucket`, `actual`, `expected`, `budget`,
  `categories: list[CategoryPaceRow]`.
- `pace_service.compute_monthly_pace(db, date_from, date_to)` exists
  with the documented signature.
- `subscription_due_service.subscriptions_remaining(db, date_from,
  date_to)` exists and returns the documented shape.

If any field is missing or named differently, stop and reconcile before
launching Step 2 — every later step branches on `mode` and reads
`categories[]`.

### Step 2 — Top movers + recent transactions

**Plan**: `docs/plans/2026-05-08-02-overview-top-movers-and-recent-txns.md`

**Agent briefing**:
- **Context sources**:
  - `docs/handoff/step-1-overview-pace-foundation.md` (authoritative on
    response shape)
  - `frontend/src/pages/Subscriptions.tsx` (table + badge styling)
  - `frontend/src/pages/Transactions.tsx` (date / vendor / amount /
    category-badge row layout, color rules)
  - The Overview.tsx state from Step 1 (read it now)
- **Read first**:
  `docs/plans/2026-05-08-02-overview-top-movers-and-recent-txns.md`
- **Context**: <orchestrator pastes the post-Step-1 Overview.tsx layout
  and the exact `MonthlyPaceResponse.categories[]` shape from the
  handoff>
- **Owns**:
  - `frontend/src/components/overview/TopMoversTable.tsx` (new)
  - `frontend/src/components/overview/RecentTransactionsList.tsx` (new)
  - `frontend/src/components/overview/__tests__/` (new component tests)
  - `frontend/src/pages/Overview.tsx` (append two sections below the
    bucket cards; do not modify the headline or bucket card sections)
- **Must not touch**:
  - All backend code (`backend/**`).
  - `frontend/src/api/overview.ts` (final from Step 1).
  - `frontend/src/components/overview/PaceHeadline.tsx` and
    `BucketCard.tsx` (Step 1 components).
  - `frontend/src/api/transactions.ts` (existing endpoint client).
- **Follow the pattern in**:
  - `frontend/src/pages/Subscriptions.tsx` for the top-movers table cell
    layout.
  - `frontend/src/pages/Transactions.tsx` for the recent-transactions
    row layout (date format, amount color, category badge).
- **Prior step context**: Step 1 produced
  `MonthlyPaceResponse.categories[]` containing every category with its
  `bucket`, `actual_mtd`, `expected_mtd`, `full_budget`. Top movers
  sorts that array client-side by `|actual_mtd - expected_mtd|`. Recent
  transactions calls the existing `listTransactions` from
  `frontend/src/api/transactions.ts`. Trust the handoff over this
  description.
- **Do not**: add a backend endpoint, a range picker, a trend chart, or
  the subs-remaining card — those are Steps 3–5. Do not modify the
  `categories[]` server-side ordering; do the sort on the client.
- **Handoff**: Write
  `docs/handoff/step-2-overview-top-movers-and-recent-txns.md` listing
  the new components, the section order in Overview.tsx, and any
  cross-section coupling that will matter for Step 5.

**Stay within your plan's scope.**

**Gate**: `make test && (cd frontend && npm test -- --run) && (cd
frontend && npm run build)`

### Step 3 — Spending trend chart

**Plan**: `docs/plans/2026-05-08-03-overview-spending-trend-chart.md`

**Agent briefing**:
- **Context sources**:
  - `docs/handoff/step-1-overview-pace-foundation.md`
  - `docs/handoff/step-2-overview-top-movers-and-recent-txns.md`
  - `backend/app/services/stats_service.py` (extend, not replace)
  - `backend/app/services/budget_service.py` (effective-budget helper)
  - `backend/app/routers/stats_router.py`
  - `backend/app/schemas/stats.py`
  - `backend/tests/test_stats_api.py`
  - `frontend/src/components/NetWorthChart.tsx` (Recharts pattern)
  - The Overview.tsx state from Step 2
- **Read first**: `docs/plans/2026-05-08-03-overview-spending-trend-chart.md`
- **Context**: <orchestrator pastes the existing `get_monthly_stats`
  shape and the `NetWorthChart` rendering style>
- **Owns**: see plan's Owns. New: `SpendingTrendChart.tsx`,
  potentially `tests/test_stats_service.py` (check first if the file
  exists; if not, create it). Modifies: `stats_service.py` (add
  `get_spending_trend`), `schemas/stats.py` (add
  `SpendingTrendResponse` and `TrendMonth`), `stats_router.py` (add
  endpoint), `tests/test_stats_api.py`, `pages/Overview.tsx` (insert
  chart section), `api/overview.ts` (add `getSpendingTrend`).
- **Must not touch**: `pace_service.py`,
  `subscription_due_service.py` (Step 1), all components from Steps 1
  and 2.
- **Follow the pattern in**:
  - `stats_service.get_monthly_stats` for the per-month group-by SQL
    pattern.
  - `NetWorthChart.tsx` for the two-series Recharts component (themed
    tooltip, no animation).
- **Prior step context**: Step 1 added the pace endpoint and Step 2
  added top-movers and recent-txns sections. The Overview.tsx now has
  bucket cards (Step 1), top movers, recent transactions (Step 2).
  Insert the trend chart section per the section order documented in
  the Step 2 handoff.
- **Do not**: change the pace endpoint, alter Step 1 / Step 2
  components, add range-picker logic to the new endpoint (it accepts
  date params now but is hardcoded to "last 6 months ending today" by
  the page until Step 5).
- **Handoff**: Write
  `docs/handoff/step-3-overview-spending-trend-chart.md` listing the
  new endpoint shape, the chart component's props, and the Overview
  section order.

**Stay within your plan's scope.**

**Gate**: `make test && (cd frontend && npm test -- --run) && (cd
frontend && npm run build)`

### Step 4 — Subscriptions remaining card

**Plan**: `docs/plans/2026-05-08-04-overview-subscriptions-remaining.md`

**Agent briefing**:
- **Context sources**:
  - `docs/handoff/step-1-overview-pace-foundation.md` (authoritative on
    `subscription_due_service.subscriptions_remaining` signature)
  - `docs/handoff/step-3-overview-spending-trend-chart.md`
  - `backend/app/routers/subscription_router.py`
  - `backend/app/schemas/subscription.py`
  - `backend/tests/test_subscriptions.py`
  - `frontend/src/api/subscriptions.ts`
  - The Overview.tsx state from Step 3
- **Read first**:
  `docs/plans/2026-05-08-04-overview-subscriptions-remaining.md`
- **Context**: <orchestrator pastes the
  `subscription_due_service.subscriptions_remaining` signature from
  Step 1's handoff and the existing `subscription_router.py` endpoint
  patterns>
- **Owns**: see plan's Owns. New: `RecurringRemainingCard.tsx`.
  Modifies: `subscription_router.py` (add `remaining` endpoint),
  `subscription.py` schemas (add response), `test_subscriptions.py`
  (add integration test), `api/subscriptions.ts` (add
  `getRemainingSubscriptions`), `Overview.tsx` (insert card section).
- **Must not touch**: `subscription_due_service.py` (Step 1 final),
  `subscription_service.py` (read-only), Step 1/2/3 components.
- **MUST follow the pattern in**: `subscription_router.py` itself —
  add the new endpoint alongside the existing list/detect/update
  endpoints.
- **Follow the pattern in**: `tests/test_subscriptions.py` for the
  integration test.
- **Prior step context**: Step 1 produced
  `subscription_due_service.subscriptions_remaining(db, date_from,
  date_to)` returning `{total, count, subscriptions[]}`. This step
  wraps it in an HTTP endpoint. The 204-when-out-of-range logic is
  Step 5; for now the endpoint always returns 200 (the page only
  calls it for current MTD).
- **Do not**: add the 204 branch (Step 5), add a range picker, modify
  `subscription_due_service.py`.
- **Handoff**: Write
  `docs/handoff/step-4-overview-subscriptions-remaining.md` listing the
  new endpoint shape and the Overview section order.

**Stay within your plan's scope.**

**Gate**: `make test && (cd frontend && npm test -- --run) && (cd
frontend && npm run build)`

### Step 5 — Range picker + actual-vs-budget mode

**Plan**:
`docs/plans/2026-05-08-05-overview-range-picker-and-actual-vs-budget-mode.md`

**Agent briefing**:
- **Context sources**:
  - All four prior handoff files in `docs/handoff/`
  - `docs/specs/2026-05-08-01-overview-redesign.md` (Behavior →
    actual-vs-budget mode + Range picker presets)
  - `backend/app/services/csp_rollup_service.py` (dual-mode pattern:
    `get_planning_rollup` vs `get_actuals_rollup`)
  - `backend/tests/test_csp_rollup_service.py` (dual-mode tests)
  - `frontend/src/hooks/useGlobalFilters.tsx` (existing global filter
    hook style)
  - `frontend/src/components/DateRangePicker.tsx` (REUSE — do not roll
    a new one)
- **Read first**:
  `docs/plans/2026-05-08-05-overview-range-picker-and-actual-vs-budget-mode.md`
- **Context**: <orchestrator pastes the dual-mode skeleton from
  csp_rollup_service.py, the useSearchParams pattern for URL
  persistence, and the spec's preset → range mapping table>
- **Owns**: see plan's Owns. Significant: extends
  `pace_service.py` (actual-vs-budget mode branch), drops the 400 guard
  in `stats_router.py`, adds 204 branch in `subscription_router.py`,
  new `useOverviewRange.ts` hook, new `RangePicker.tsx`, modifies
  every Overview component to accept range, modifies `Overview.tsx` to
  pipe range into every section.
- **Must not touch**: `budget_service.py`,
  `subscription_due_service.py` (already correct from Step 1),
  `stats_service.get_spending_trend` (already accepts range; verify
  only).
- **Follow the pattern in**:
  - `csp_rollup_service.py` for the dual-mode service pattern.
  - `useGlobalFilters.tsx` for hook structure (state + setter +
    presets shape).
  - `DateRangePicker.tsx` — reuse it directly inside the picker for
    custom-range entry.
- **Prior step context**: Steps 1–4 built every Overview section
  hardcoded to current MTD. This step adds the picker and re-anchors
  every section. The pace endpoint contract was designed in Step 1 to
  carry `mode = "pace" | "actual_vs_budget"`; only the
  actual-vs-budget branch is missing in pace_service. Trust the
  handoff files for exact shapes.
- **Do not**: alter the pace-mode branch logic from Step 1; do not
  touch `subscription_due_service.subscriptions_remaining` (the helper
  already handles arbitrary ranges); do not refactor any Step 1–4
  component beyond what the plan calls for.
- **If unclear, stop**: the preset → range mapping is exact in the
  plan's Implementation notes. If a preset's date math is ambiguous,
  re-read; do not guess. Pace-mode discriminator is exact:
  `date_from == first-of-current-month AND date_to >= today`. No fuzzy
  alignment.
- **Handoff**: Write
  `docs/handoff/step-5-overview-range-picker-and-actual-vs-budget-mode.md`
  listing every file modified, the URL contract, and any deviations
  from the plan.

**Stay within your plan's scope. (This is the last step — no later
slices to defer to.)**

**Gate**: `make test && (cd frontend && npm test -- --run) && (cd
frontend && npm run build) && make lint`

## Completion criteria

- All five plan files' acceptance criteria met (re-read each plan and
  confirm).
- `make test && (cd frontend && npm test -- --run) && (cd frontend &&
  npm run build) && make lint` all pass.
- The five handoff files exist in `docs/handoff/`.
- Manual smoke-test on dev server (`make dev`): load `/`, verify
  headline + bucket cards (with inline drill-down) + top movers +
  recent transactions + trend chart + subs-remaining card all render
  for current MTD; cycle through all seven range presets and verify
  each section re-anchors correctly; verify the URL updates as the
  picker changes; verify `?range=ytd` deep-link restores the YTD view.
- No Overview-specific judgment calls from the spec remain unresolved
  (all five were resolved during the grill).

## Rollback notes

If a step's gate fails, stop. Do not auto-fix. Report which gate
failed, with the exact stderr/stdout, and ask before proceeding. The
existing `/api/stats/summary` and `/api/stats/monthly` endpoints stay
alive throughout for other pages; reverting any single step is a `git
revert` of that step's commits without backend regressions.
