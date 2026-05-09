# Budget: Past-Year Baseline Editing in Historical

## Parent spec

`docs/specs/2026-05-08-05-budget-tweaks.md`

## What to build

End-to-end vertical slice that lets the user fix wrong `monthly_amount` baselines on past-year budgets from the Historical sub-view. The editor used by Set Budget is extracted into a shared component that accepts a `pastYearMode` flag — when set, per-month overrides and `rollover_mode` are disabled, only `monthly_amount` is editable. HistoricalView gains a click-to-edit affordance per past year/category that invokes this editor in a transient panel (not its own route). The backend update endpoint's past-year guard on `monthly_amount` is lifted; per-month override writes for past months remain rejected.

## Type

AFK

## Blocked by

None hard. Can land independently of plans `2026-05-09-03` and `2026-05-09-04`. (If `2026-05-09-03` lands first, this plan's HistoricalView changes apply at `/budget/historical`; if not, they apply wherever HistoricalView is currently mounted. No code conflict either way.)

## User stories addressed

- User story 4
- User story 5
- User story 6

## Acceptance criteria

- [ ] Backend: `PUT /api/budget/...` (whichever endpoint updates a budget) accepts `monthly_amount` updates for past-year `budgets` rows
- [ ] Backend: same endpoint still rejects per-month override writes for past months (unchanged behavior)
- [ ] Backend: backend boundary tests cover both — past-year `monthly_amount` write succeeds, past-month override write returns a 4xx
- [ ] Frontend: a shared editor component is extracted from `SetBudgetView.tsx`; `SetBudgetView` and `HistoricalView` both render it
- [ ] Shared editor accepts a `pastYearMode: boolean` prop (or equivalent); when true, per-month override inputs and `rollover_mode` toggle are disabled/hidden; `monthly_amount` remains editable
- [ ] HistoricalView shows a click-to-edit affordance per past year/category (e.g., a pencil icon next to each row, or a year-level Edit button)
- [ ] Clicking edit replaces the chart+stats area (or shows alongside) with the shared editor in `pastYearMode`
- [ ] Save calls the backend update endpoint, then returns to view mode; the chart and stats re-fetch
- [ ] Cancel discards changes and returns to view mode
- [ ] After a successful past-year edit, Actual-vs-Budget for the affected past months reflects the new baseline
- [ ] Component test: shared editor in `pastYearMode` disables override + rollover inputs and leaves `monthly_amount` editable
- [ ] Type-check, lint, frontend type-check + build all pass

## Owns

- `backend/app/routers/budget_router.py` — the update endpoint handler (just the past-year guard logic on `monthly_amount`)
- `backend/app/services/budget_service.py` — same update path
- `backend/tests/` — boundary tests for past-year `monthly_amount` write + past-month override rejection
- `frontend/src/components/budget/SetBudgetView.tsx` — extract the editor into a shared component; consume the shared component
- `frontend/src/components/budget/SharedBudgetEditor.tsx` (new) — extracted editor with `pastYearMode` support
- `frontend/src/components/budget/HistoricalView.tsx` — add click-to-edit affordance + edit-panel host (do **not** touch the chart JSX from plan `2026-05-09-04`)
- Tests for the shared editor

## Must not touch

- The chart JSX inside HistoricalView — owned by plan `2026-05-09-04`
- Routing structure — owned by plan `2026-05-09-03`
- `rollover_mode` semantics or storage — read-only here; not changing
- `budget_monthly_overrides` table — guards stay; no schema change
- Currency formatter — owned by plan `2026-05-09-06`

## Defines interfaces

- `SharedBudgetEditor` component props (especially `pastYearMode`) — only consumed within this plan's surface area
- The lifted past-year guard on `monthly_amount` updates — internal to backend; no client-visible contract change beyond "this used to fail, now it succeeds"

## Pattern exemplar

- **MUST follow the pattern in**: `frontend/src/components/budget/SetBudgetView.tsx` — the existing editor IS the exemplar; the new shared component is `SetBudgetView`'s form logic factored out.
- **Follow the pattern in**: `backend/app/routers/budget_router.py` for the endpoint handler shape; `backend/tests/` for boundary-test idioms (look for existing budget-router tests).

## Tasks

- [ ] Backend: locate the past-year guard in budget update path; identify the exact condition that rejects past-year writes
- [ ] Backend: lift the guard for `monthly_amount` only; keep override/rollover guards intact
- [ ] Backend: add boundary tests — past-year `monthly_amount` PUT returns 200 + persists; past-month override PUT returns 4xx
- [ ] Frontend: read `SetBudgetView.tsx` end-to-end; identify the editor form sub-tree that needs extracting
- [ ] Frontend: create `SharedBudgetEditor.tsx`; move the form sub-tree there; expose props for: `categoryId`, `year`, `initialValues`, `onSave`, `onCancel`, `pastYearMode`
- [ ] Frontend: in `pastYearMode`, render override inputs as read-only/disabled; same for rollover toggle
- [ ] Frontend: `SetBudgetView` renders `<SharedBudgetEditor pastYearMode={false} ... />` for current/future
- [ ] Frontend: in `HistoricalView`, add a click-to-edit affordance per category (or per year — pick whichever maps better to the editor's scope of "one budget row at a time")
- [ ] Frontend: clicking edit toggles a panel that mounts `<SharedBudgetEditor pastYearMode ... />`; on save/cancel, dismiss the panel and re-fetch historical analysis
- [ ] Frontend: write a component test asserting `pastYearMode` disables override + rollover inputs and leaves `monthly_amount` editable
- [ ] Run backend tests, frontend type-check, frontend build

## Implementation notes

- **Edit scope**: the editor edits a single `(category, year)` budget row at a time. If HistoricalView shows multiple categories per year, the click-to-edit affordance is per-row.
- **Re-fetch on save**: HistoricalView's underlying data comes from `/api/budget/historical`. After save, refetch so the chart/stats reflect the new baseline.
- **No audit trail**: past-year edits overwrite the previous `monthly_amount`. No history table; no "what was the budget on date X" query. (Out of scope per spec.)
- **Set Budget side-effect check**: after extraction, manually verify Set Budget still saves correctly (current/future months, with overrides and rollover working). The shared editor must not regress the existing path.
- **Currency precision**: editor inputs accept whole-dollar input. Display values via the centralized formatter (will pick up 0-decimal default once plan `2026-05-09-06` lands).
