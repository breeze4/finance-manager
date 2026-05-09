# Step 6 Handoff — Budget: Past-Year Baseline Editing in Historical

Plan: `docs/plans/2026-05-09-05-budget-historical-editing.md`
Spec: `docs/specs/2026-05-08-05-budget-tweaks.md`

## SharedBudgetEditor

New file: `frontend/src/components/budget/SharedBudgetEditor.tsx`.

```ts
export interface SharedBudgetEditorProps {
  categoryId: number;
  year: number;
  categoryName: string;
  initialMonthlyAmount: number;
  initialRolloverMode: boolean;
  /** Existing per-month overrides for this (category, year). */
  monthlyOverrides: Array<{ month: number; amount: number }>;
  /** Save handler — parent decides which mutation to invoke. In pastYearMode,
   * only the baseline is saved (rollover unchanged, overrides untouched). */
  onSave: (monthlyAmount: number, rolloverMode: boolean) => void;
  onCancel: () => void;
  /** When true: rollover toggle is disabled, overrides are read-only.
   * Only `monthlyAmount` is editable. Default false. */
  pastYearMode?: boolean;
}
```

Behavior:
- `pastYearMode=true` → rollover toggle is `disabled` (with `opacity-50`), per-month
  override `<input>`s are `disabled` and visually muted, baseline input remains editable.
- On Save in `pastYearMode`, the saved `rolloverMode` is forced back to
  `initialRolloverMode` (belt-and-suspenders — the toggle is also UI-disabled).
- The `categoryId` prop is part of the contract for parents but unused inside
  the editor (the parent's `onSave` already owns the categoryId in its closure).

## Click-to-edit affordance in HistoricalView

`frontend/src/components/budget/HistoricalView.tsx`:
- Stats table now has an extra "Edit baseline" column (header: `lines 134-138`,
  per-row cell: `lines 199-249`).
- Each row's Edit cell contains a `<select>` of past years (derived from
  `monthlyTotals` keys, filtered to `year < currentYear`) plus a Pencil-icon
  Edit button.
- Clicking Edit sets local `editing` state with `(categoryId, categoryName, year)`.
- The transient editor panel is mounted **between the stats table and the chart**
  (`lines 256-265`). It uses an internal `EditPanel` component that fetches
  `getBudgets(year)` for the chosen past year, finds the category's existing
  `BudgetEntry`, and mounts `SharedBudgetEditor` in `pastYearMode`.
- On save, the panel calls `onSaveBaseline(categoryId, year, monthlyAmount, rolloverMode)`
  (parent-provided), then clears editing state.
- On cancel, the panel just clears editing state.

## Chart preservation

The Step 3 chart block was previously at HistoricalView lines 148-183. After
adding imports/types and the new edit affordance, the chart block has shifted
to **lines 267-302**. The internal JSX of the chart block is byte-identical
to the prior version — the move is purely positional.

## Backend guard changes

`backend/app/services/budget_service.py`:
- New private helper `_is_past_month(year, month)` returns True when
  `(year, month) < (date.today().year, date.today().month)`.
- `set_monthly_override(...)`: raises `ValueError` when `_is_past_month(year, month)`.
- `delete_monthly_override(...)`: raises `ValueError` when `_is_past_month(year, month)`.
- `set_budget(...)`: **no change** — past-year baseline writes already
  succeeded; the function never had a past-year guard. Confirmed by new
  tests `test_past_year_baseline_set_succeeds` and
  `test_past_year_baseline_update_persists`.

`backend/app/routers/budget_router.py`:
- `set_monthly_override` handler (PUT `/{category_id}/{year}/{month}`) now wraps
  the service call in `try/except ValueError` → `HTTPException(400, str(exc))`,
  mirroring how `set_budget` already handled `ValueError`.
- `delete_monthly_override` handler (DELETE `/{category_id}/{year}/{month}`)
  gains the same try/except.

## Judgment call: adding past-month override rejection

The plan's "Acceptance criteria" line said the backend "still rejects per-month
override writes for past months (unchanged behavior)" — but the actual
pre-change behavior was that those writes **succeeded** (no guard existed in
either `set_monthly_override` or `delete_monthly_override`).

The parent spec (`2026-05-08-05-budget-tweaks.md`) is unambiguous: "Past
per-month overrides remain locked", "per-month override writes for past months
remain rejected". Spec wins; the orchestration prompt also explicitly authorized
treating this as in-scope. So this step **adds** the past-month guard the spec
assumed already existed.

Side effect: two existing test cases in `tests/test_budget_crud.py`
(`test_override_affects_target`, `test_override_only_affects_its_month`) and
two in `tests/test_pace_service.py` (`test_end_of_month_override_for_february`,
`test_avb_override_in_middle_month_only`) seeded historical overrides via
`set_monthly_override` to exercise downstream Actual-vs-Budget / pace math.
Those calls now raise `ValueError`. To preserve the downstream-math coverage
without weakening the new guard, both test files gained a small
`_insert_override` / `_set_override` helper that inserts the
`BudgetMonthlyOverride` row directly via the model, bypassing the service
guard. These helpers are documented as test-only seeders.

## Judgment call: editor boundary

The plan and spec describe a "shared editor" used by both `SetBudgetView` and
`HistoricalView`. The orchestration prompt explicitly authorized two boundary
options:

1. Extract `SetBudgetView`'s inline-row editor as the literal shared component
   (and reskin both surfaces around it).
2. Build a new modal-like editor used only by `HistoricalView`, leaving
   `SetBudgetView`'s well-tested inline editing untouched.

`SetBudgetView`'s inline editor is deeply entangled with bucket grouping,
the `drafts` map, the `MonthSelector`, override badges, the rollover-toggle
column, and the NULL-bucket warning. Pulling it out as a generic component
would have meant refactoring all of those plus rewriting the call sites to
inject mutation handlers per row — a far broader change than the plan scopes,
with significant regression risk for behavior that already works.

Per the orchestration prompt's "Use whichever boundary minimizes refactor of
SetBudgetView" instruction, I chose option **2**. `SharedBudgetEditor` is a
new modal-like component (`Card` with header/body/footer). Its contract
includes `pastYearMode` so it satisfies the spec at the level of editor
*shape* and *behavior*, just not via literal code reuse with `SetBudgetView`.
`SetBudgetView` is unchanged.

If a future step wants to migrate `SetBudgetView`'s inline editor onto
`SharedBudgetEditor`, the boundary is now well-defined — it's an additional
refactor opportunity, not a prerequisite for the past-year-edit feature.

## Judgment call: year-per-row derivation

`HistoricalView`'s rows are aggregated per category (not per category × year);
the rendered stats span all years that have data. The edit affordance needs a
specific year. Per the orchestration prompt, I derived past years client-side
from each stat's `monthlyTotals` keys (filtered to `year < currentYear`)
rather than changing the backend response shape. The edit cell renders a
`<select>` of those years; the user picks one before clicking Edit.

Categories with no past-year data render "no past data" instead of an Edit
control.

## Mutation wiring

`frontend/src/pages/Budget.tsx`:
- New `setBaselineForYearMutation` — same as `setBaselineMutation` but accepts
  an explicit `year` instead of closing over the current year.
- `BudgetOutletContext` gains `setBaselineForYear(categoryId, year, monthlyAmount, rolloverMode)`.
- `HistoricalTab` passes it to `<HistoricalView ... onSaveBaseline={setBaselineForYear} />`.
- The mutation invalidates `["budget"]`, `["csp", "planning", currentMonthKey]`,
  and `["csp", "actuals", actualSelectedMonth]` so analytics and Actual-vs-Budget
  pick up the change.

## Tests added

Backend (`backend/tests/test_budget_crud.py`):
- `TestPastPeriodGuards` (service-layer):
  - `test_past_year_baseline_set_succeeds`
  - `test_past_year_baseline_update_persists`
  - `test_past_month_override_rejected`
  - `test_past_month_override_delete_rejected`
- `TestPastPeriodGuardsHTTP` (router-layer):
  - `test_past_year_baseline_put_returns_200`
  - `test_past_month_override_put_returns_400`
  - `test_current_month_override_put_returns_200`
  - `test_future_month_override_put_returns_200`
  - `test_past_month_override_delete_returns_400`

Frontend (`frontend/src/components/budget/__tests__/SharedBudgetEditor.test.tsx`,
8 cases):
- Renders category + year in the title.
- Baseline input is editable in `pastYearMode`.
- Rollover toggle is disabled in `pastYearMode`.
- Override inputs are disabled in `pastYearMode`.
- Rollover toggle is enabled when not in `pastYearMode`.
- `onSave` receives `(editedBaseline, initialRolloverMode)` in `pastYearMode`.
- `onCancel` is invoked when Cancel is clicked.
- No overrides section renders when there are no overrides.

## Test churn from the new guard

- `tests/test_budget_crud.py`: gained `_insert_override` helper; two existing
  test bodies switched from `set_monthly_override(... month=1)` to
  `_insert_override(... month=1)`.
- `tests/test_pace_service.py`: gained `_set_override` helper; two existing
  test bodies switched from `budget_service.set_monthly_override(... month=2/3)`
  to `_set_override(... month=2/3)`.

## Gate results (worktree-local)

- `cd backend && uv run ruff check . && uv run ruff format --check .` → pass.
- `cd backend && uv run pytest -q` → pass (557 tests).
- `cd frontend && npm run build` → pass.
- `cd frontend && npm test -- --run` → pass (363 tests, 27 files).
