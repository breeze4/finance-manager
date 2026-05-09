# Orchestration Prompt: Payments + Budget Tweaks + Currency

## Project context

- Working directory: `/home/breeze/dev/finance-analyzer`
- Specs:
  - `docs/specs/2026-05-08-04-payments-redesign.md`
  - `docs/specs/2026-05-08-05-budget-tweaks.md`
  - `docs/specs/2026-05-08-06-currency-zero-decimal.md`
- Plans:
  - `docs/plans/2026-05-09-01-payments-list-and-cleanup.md`
  - `docs/plans/2026-05-09-02-payments-chart.md`
  - `docs/plans/2026-05-09-03-budget-subnav-routing.md`
  - `docs/plans/2026-05-09-04-budget-stacked-area-chart.md`
  - `docs/plans/2026-05-09-05-budget-historical-editing.md`
  - `docs/plans/2026-05-09-06-currency-zero-decimal.md`
- Handoff directory: `docs/handoff/` (create if needed)

### Build/test/lint commands

- `$BACKEND_LINT`: `(cd backend && uv run ruff check . && uv run ruff format --check .)`
- `$BACKEND_TEST`: `(cd backend && uv run pytest -q)`
- `$FRONTEND_BUILD`: `(cd frontend && npm run build)`
- `$FRONTEND_TEST`: `(cd frontend && npm test -- --run)`
- `$ALL_GATE`: `$BACKEND_LINT && $BACKEND_TEST && $FRONTEND_BUILD && $FRONTEND_TEST`
- Migrations: `(cd backend && uv run alembic upgrade head)` after merging Step 1 (drops `payment_match`).

## Orchestrator responsibilities

You actively manage context between agents. Before launching each step:

1. Read the files listed under "Context sources" and inline the relevant sections into the agent's "Context" field.
2. If a previous step completed, read `docs/handoff/step-N-<slug>.md` and use it to populate "Prior step context."
3. Launch parallel waves with `isolation: "worktree"`. After all parallel agents in a wave finish, merge their worktrees into `main` in dependency-safe order, then run the gate before launching the next wave.
4. If two parallel agents in the same wave declare overlapping file ownership, STOP and report — the plans were not designed for parallel execution despite passing this prompt's safety review.
5. Do not auto-fix gate failures. Stop and report.

## Execution plan

Six steps across two waves. Wave 1 has four parallel-safe steps; Wave 2 has two parallel-safe steps that depend on Wave 1 outputs.

```
Wave 1 (parallel):  Step 1 (Payments cleanup)   Step 2 (Budget routing)   Step 3 (Budget chart)   Step 4 (Currency)
                          ↓                                                       ↓
Gate (build + test + lint)
                          ↓                                                       ↓
Wave 2 (parallel):  Step 5 (Payments chart)                          Step 6 (Budget editing)
                          ↓                                                       ↓
Gate (build + test + lint)
```

### Wave 1

#### Step 1 — Payments: drop matching, redefine list endpoint, replace UI

**Plan**: `docs/plans/2026-05-09-01-payments-list-and-cleanup.md`

**Agent briefing**:
- **Context sources** (orchestrator reads these): `docs/specs/2026-05-08-04-payments-redesign.md`, `backend/app/routers/payment_router.py`, `backend/app/services/payment_service.py`, `backend/app/models/payment_match.py`, `frontend/src/pages/Payments.tsx`, `frontend/src/api/payments.ts`, `backend/alembic/versions/` (most recent file)
- **Read first**: `docs/plans/2026-05-09-01-payments-list-and-cleanup.md`
- **Context**: <orchestrator pastes the parent spec's "Behavior" section, the most recent alembic migration as a pattern exemplar, the current `payment_router.py` for context on what to gut, and the existing `Payments.tsx` so the agent knows what UI to replace>
- **Owns**: per plan's "Owns" list. Specifically: `backend/app/models/payment_match.py` (delete), `backend/app/services/payment_service.py`, `backend/app/routers/payment_router.py`, `backend/app/schemas/payment*.py`, new alembic migration, the import-pipeline file that calls the auto-matcher, `frontend/src/pages/Payments.tsx`, `frontend/src/api/payments.ts`, `backend/tests/` payment-related tests.
- **Must not touch**: `frontend/src/components/budget/`, `frontend/src/lib/format.ts`, anything in `frontend/src/components/payments/` for chart components (Step 5 owns that), `transactions.is_transfer` values (preserve as-is).
- **MUST follow the pattern in**: most recent alembic migration under `backend/alembic/versions/` for the new "drop payment_match" migration. Match existing router/service idioms in adjacent files.
- **Do not**:
  - Do not add the `/api/payments/series` endpoint — that is Step 5's responsibility.
  - Do not add a charts-vs-payments chart component — that is Step 5's responsibility.
  - Do not modify `formatCurrency` defaults — that is Step 4's responsibility.
- **If unclear, stop**:
  - If the auto-matcher invocation isn't where you expect (not in the obvious import service), grep broadly before touching anything.
  - If existing `is_transfer` setting logic is bundled with the matcher, isolate the deletion to matcher-only code paths.
- **Stay within your plan's scope.** If you see an improvement that belongs to a later step, leave it.
- **Handoff**: Write `docs/handoff/step-1-payments-cleanup.md` listing: files deleted, new migration revision id, new `/api/payments` request/response shape (full JSON example), how the import pipeline now flows without the matcher, and any tests added.

**Worktree**: yes.

#### Step 2 — Budget: convert sub-tabs to URL-routed sub-views

**Plan**: `docs/plans/2026-05-09-03-budget-subnav-routing.md`

**Agent briefing**:
- **Context sources**: `docs/specs/2026-05-08-05-budget-tweaks.md`, `frontend/src/pages/Budget.tsx`, top-level routes file (likely `frontend/src/App.tsx` or `frontend/src/main.tsx`)
- **Read first**: `docs/plans/2026-05-09-03-budget-subnav-routing.md`
- **Context**: <orchestrator pastes the current Budget.tsx so the agent sees how the four sub-views are switched today, and the top-level routes file so they know where to add child routes>
- **Owns**: `frontend/src/pages/Budget.tsx`, the top-level routes file (only the Budget route entry).
- **Must not touch**: `frontend/src/components/budget/HistoricalView.tsx`, `SetBudgetView.tsx`, or any sub-view component bodies. Don't touch backend.
- **MUST follow the pattern in**: existing nested-route style in the project, if any. Otherwise standard React Router v6 idiom: parent `Route` with `<Outlet />`, child routes with `index` for the redirect.
- **Do not**:
  - Do not add the click-to-edit affordance in HistoricalView — that is Step 6's responsibility.
  - Do not change chart code — that is Step 3's responsibility.
- **If unclear, stop**:
  - If the project uses a custom router wrapper, ask before adopting plain React Router idioms.
- **Stay within your plan's scope.**
- **Handoff**: Write `docs/handoff/step-2-budget-routing.md` listing: final route shape, where child routes are declared, what `<NavLink>` styling was used for active state, and any test files updated.

**Worktree**: yes.

#### Step 3 — Budget: stacked area chart in HistoricalView

**Plan**: `docs/plans/2026-05-09-04-budget-stacked-area-chart.md`

**Agent briefing**:
- **Context sources**: `docs/specs/2026-05-08-05-budget-tweaks.md`, `frontend/src/components/budget/HistoricalView.tsx`, `frontend/src/components/budget/chart-style.ts`
- **Read first**: `docs/plans/2026-05-09-04-budget-stacked-area-chart.md`
- **Context**: <orchestrator pastes the current chart JSX block from HistoricalView.tsx so the agent knows exactly the section to swap>
- **Owns**: only the chart-rendering JSX inside `frontend/src/components/budget/HistoricalView.tsx` (the section using Recharts `BarChart`/`Bar`).
- **Must not touch**:
  - Anything else in HistoricalView (stats tables, future click-to-edit affordances).
  - `chart-style.ts` palette.
  - Routing structure (Step 2).
  - Backend.
- **MUST follow the pattern in**: the existing `BarChart` block in `HistoricalView.tsx` — same imports style, same `dataKey`s, same color resolution. Just swap the components to `AreaChart`/`Area`.
- **Do not**:
  - Do not add a click-to-edit affordance — that is Step 6's responsibility.
  - Do not refactor the data-fetching logic.
- **Stay within your plan's scope.**
- **Handoff**: Write `docs/handoff/step-3-budget-chart.md` listing: lines changed in HistoricalView.tsx (range), legend prop used, tooltip/axis formatter used, and the exact chart-section boundary so Step 6's agent knows what NOT to touch.

**Worktree**: yes.

#### Step 4 — Currency: 0-decimal default + Transactions opt-out

**Plan**: `docs/plans/2026-05-09-06-currency-zero-decimal.md`

**Agent briefing**:
- **Context sources**: `docs/specs/2026-05-08-06-currency-zero-decimal.md`, `frontend/src/lib/format.ts`, `frontend/src/lib/math/mathFormatters.ts`, `frontend/src/pages/Transactions.tsx`, `frontend/src/components/NetWorthChart.tsx`, `frontend/src/components/SnapshotBatchModal.tsx`
- **Read first**: `docs/plans/2026-05-09-06-currency-zero-decimal.md`
- **Context**: <orchestrator pastes current `formatCurrency` from both helpers, the Transactions amount cell, and the two known ad-hoc formatter sites>
- **Owns**: `frontend/src/lib/format.ts`, `frontend/src/pages/Transactions.tsx` (amount cell only), `frontend/src/components/NetWorthChart.tsx`, `frontend/src/components/SnapshotBatchModal.tsx`. Plus a new test file for `formatCurrency`.
- **Must not touch**:
  - `frontend/src/lib/math/mathFormatters.ts` (calculator helper — out of bounds).
  - Calculator pages.
  - `frontend/src/pages/Payments.tsx` (Step 1 owns it).
  - `frontend/src/pages/Budget.tsx` or any `frontend/src/components/budget/` files (Steps 2, 3, 6 own them).
- **MUST follow the pattern in**: `frontend/src/lib/format.ts` itself — same `Intl.NumberFormat` construction, just parametrize fraction-digit options.
- **Do not**:
  - Do not change negative-value formatting style.
  - Do not modify form-input handling for currency fields.
  - Do not perform a broad audit beyond the named files; if you find another `toLocaleString` dollar formatter outside scope, flag it in the handoff for follow-up.
- **If unclear, stop**:
  - If a Transactions sub-component (expanded detail row, edit modal) clearly shows exact amounts to the user, treat it as a 2-decimal site by analogy and document the choice.
- **Stay within your plan's scope.**
- **Handoff**: Write `docs/handoff/step-4-currency.md` listing: new `formatCurrency` signature, every site that received `decimals: 2` (with file + symbol), every ad-hoc formatter converted, and any out-of-scope sites flagged for follow-up.

**Worktree**: yes.

#### Wave 1 merge + gate

After all four worktree agents complete:
1. Merge Step 1's worktree first (it changes the most files). Run `cd backend && uv run alembic upgrade head` to apply the drop-`payment_match` migration on local dev DB.
2. Merge Steps 2, 3, 4 in any order — disjoint file sets.
3. Run `$ALL_GATE`. On failure: do not auto-fix. Stop and report which gate broke and surface relevant log lines.

#### Wave 1 interface gate

Before launching Wave 2, verify:
- [ ] `GET /api/payments` returns the new shape: array of `{date, account, vendor, amount}`-like objects (positive amounts only, CC-side). Inspect with `curl` or read the response schema.
- [ ] `formatCurrency(1234.56)` returns `"$1,235"` — confirm by reading `frontend/src/lib/format.ts` and the new test file.
- [ ] HistoricalView's chart renders as stacked area when manually loaded. (Visual confirmation, may defer to a single agent-browser smoke check at the very end.)

### Wave 2

#### Step 5 — Payments: charges-vs-payments chart endpoint + UI

**Plan**: `docs/plans/2026-05-09-02-payments-chart.md`

**Agent briefing**:
- **Context sources**: `docs/handoff/step-1-payments-cleanup.md`, `docs/specs/2026-05-08-04-payments-redesign.md`, `backend/app/routers/payment_router.py` (post-Step-1), `backend/app/services/payment_service.py` (post-Step-1), `frontend/src/pages/Payments.tsx` (post-Step-1), `frontend/src/api/payments.ts` (post-Step-1), `frontend/src/components/budget/HistoricalView.tsx` (for Recharts pattern)
- **Read first**: `docs/plans/2026-05-09-02-payments-chart.md`
- **Context**: <orchestrator pastes Step 1's handoff so the agent knows the new `/api/payments` shape, plus the post-Step-1 Payments.tsx so the agent knows where to mount the chart>
- **Prior step context**: Step 1 dropped the `payment_match` table and rebuilt `/api/payments` as a CC-side list. Trust `docs/handoff/step-1-payments-cleanup.md` over this description.
- **Owns**: `backend/app/services/payment_service.py` (add `bucket_size_for_range` + `get_series`), `backend/app/routers/payment_router.py` (add `/series` route), `backend/app/schemas/payment*.py` (add series schema), `frontend/src/api/payments.ts` (add `getSeries`), `frontend/src/components/payments/ChargesVsPaymentsChart.tsx` (new), `frontend/src/pages/Payments.tsx` (mount chart above list), tests.
- **Must not touch**:
  - The list endpoint (Step 1 already owns its final shape).
  - `frontend/src/lib/format.ts` (Step 4 already changed it).
  - Budget code.
- **Follow the pattern in**: `frontend/src/components/budget/HistoricalView.tsx` for Recharts component import + structure (adapted to grouped — non-stacked — `<Bar>`s). Backend service + router pattern: existing functions in the same files.
- **Do not**:
  - Do not introduce per-page lookback/period UI controls — bucket size derives backend-side from the global date range.
- **If unclear, stop**:
  - If the SQL idiom for quarter/year truncation in SQLite isn't obvious, ask before guessing — the project uses SQLite and `strftime` patterns are common.
- **Stay within your plan's scope.**
- **Handoff**: Write `docs/handoff/step-5-payments-chart.md` listing: new endpoint URL + response shape (full JSON example), the bucket-size breakpoints used, where the chart component is mounted in the page tree, and tests added.

**Worktree**: yes.

#### Step 6 — Budget: extract shared editor + click-to-edit on past baselines

**Plan**: `docs/plans/2026-05-09-05-budget-historical-editing.md`

**Agent briefing**:
- **Context sources**: `docs/handoff/step-3-budget-chart.md`, `docs/specs/2026-05-08-05-budget-tweaks.md`, `backend/app/routers/budget_router.py`, `backend/app/services/budget_service.py`, `frontend/src/components/budget/SetBudgetView.tsx`, `frontend/src/components/budget/HistoricalView.tsx` (post-Step-3)
- **Read first**: `docs/plans/2026-05-09-05-budget-historical-editing.md`
- **Context**: <orchestrator pastes Step 3's handoff so the agent knows exactly which section of HistoricalView is the chart (do-not-touch) and which area is fair game for adding the edit affordance>
- **Prior step context**: Step 3 swapped HistoricalView's chart from BarChart to stacked AreaChart. Trust `docs/handoff/step-3-budget-chart.md` for the chart's current line range — do not modify those lines.
- **Owns**: `backend/app/routers/budget_router.py` (lift past-year guard on `monthly_amount` only), `backend/app/services/budget_service.py` (same), `frontend/src/components/budget/SetBudgetView.tsx` (extract editor), `frontend/src/components/budget/SharedBudgetEditor.tsx` (new), `frontend/src/components/budget/HistoricalView.tsx` (add click-to-edit affordance + edit-panel host — NOT the chart JSX), backend + frontend tests.
- **Must not touch**:
  - HistoricalView's chart JSX (Step 3's territory; see handoff for line range).
  - Routing structure (Step 2).
  - `budget_monthly_overrides` table or its write guards (still rejected for past months).
  - `rollover_mode` semantics.
  - `frontend/src/lib/format.ts` (Step 4).
- **MUST follow the pattern in**: `frontend/src/components/budget/SetBudgetView.tsx` — the existing editor IS the exemplar; the new shared component is its form logic factored out.
- **Do not**:
  - Do not unlock per-month override writes for past months.
  - Do not unlock `rollover_mode` for past years.
- **If unclear, stop**:
  - If extracting the editor turns into a major refactor of SetBudgetView's surrounding state, stop and ask — there might be a smaller boundary.
- **Stay within your plan's scope.**
- **Handoff**: Write `docs/handoff/step-6-budget-editing.md` listing: new `SharedBudgetEditor` props, where the click-to-edit affordance lives in HistoricalView, the backend guard change (file + diff summary), and tests added.

**Worktree**: yes.

#### Wave 2 merge + gate

After both worktree agents complete:
1. Merge Step 5 first (touches Payments-only files, low conflict risk).
2. Merge Step 6 (touches Budget files; HistoricalView additions should not collide with Step 3's chart section if the agent respected the line-range boundary).
3. Run `$ALL_GATE`.

## Interface gates

- [ ] After Step 1: `GET /api/payments` returns CC-side positive-amount transactions (verify via response schema or a curl). Step 5 depends on this shape.
- [ ] After Step 4: `formatCurrency(amount, decimals?)` exists with `decimals = 0` default. Steps 5 and 6 inherit the new default for any new currency rendering.
- [ ] After Step 3: HistoricalView's chart section is clearly bounded (handoff records the line range). Step 6 must not modify those lines.

## HITL checkpoints

None. All plans are AFK. If any gate fails, stop and report — do not auto-fix.

## Completion criteria

- All six plans' acceptance criteria met.
- `$ALL_GATE` passes after Wave 2 merge.
- Local migration applied: `cd backend && uv run alembic upgrade head` runs cleanly.
- Visual smoke test (manual or agent-browser):
  - Payments page renders the new list and chart, scoped by account selector and global date range.
  - Budget page: refresh on each sub-route preserves the active sub-view; spending-by-category chart renders as stacked area; click-to-edit on a past year baseline opens the editor and saving updates the displayed actuals.
  - Transactions list shows 2-decimal amounts; everywhere else shows 0-decimal.
- All six handoff files present in `docs/handoff/`.
