# Budget shared primitives + dedup + dead code removal

## Parent spec

`docs/specs/2026-05-08-03-budget-page-split.md`

## What to build

Establish the `frontend/src/components/budget/` folder and populate it with
the shared visual primitives and helper modules used across the three
Budget tabs. After this slice, `pages/Budget.tsx` no longer defines:

- `MONTH_NAMES`, `monthKey`, `shortMonth`, `monthLabel`, `allMonthsForYear`,
  `pastAndCurrentMonthsForYear`, `today`, `currentYear`, `currentMonthKey`
  (move to `date-helpers.ts`).
- `tooltipStyle`, `chartColors` (move to `chart-style.ts`).
- `BUCKET_LABEL`, `BUCKET_DESCRIPTION`, `bucketRangeLabel` (move to
  `bucket-copy.ts`).
- `MonthSelector` and the `MonthAnnotation` interface (move to
  `MonthSelector.tsx`).
- `BucketDashboardCard` and its colocated `bucketStatusBadge` (move to
  `BucketDashboardCard.tsx`; the badge becomes file-private).
- `ActualsBucketCard` and its colocated `trackingStatusBadge` (move to
  `ActualsBucketCard.tsx`; the badge becomes file-private).

Drop dead code and dedupe constants:

- Delete `progressColor` (defined at line ~174, no callers).
- Delete `ACTUAL_BUCKET_ORDER` (defined at line ~1262); replace its single
  usage in `ActualVsBudgetView` with the imported `CSP_BUCKETS` from
  `@/api/categories`. Verify the contents are identical before deletion.

The three view components (`HistoricalView`, `SetBudgetView`,
`ActualVsBudgetView`) are still defined inside `Budget.tsx` after this
slice — they're owned by plans 12 / 13 / 14. They consume the new shared
primitives via imports.

Add component tests for the three new shared components: `MonthSelector`,
`BucketDashboardCard`, `ActualsBucketCard`. These are the concrete
testability deliverables of this slice.

## Type

AFK

## Blocked by

None — can start immediately.

## Spec sections addressed

This is a refactor spec without numbered user stories. Sections covered:

- "Solution" — point 1 (co-locate by feature) for the shared primitives only
- "Behavior" → "What `components/budget/` owns" — the three lib files plus
  `MonthSelector`, `BucketDashboardCard`, `ActualsBucketCard`
- "Behavior" → "What's hidden (becomes private)" — `bucketStatusBadge`
  inside `BucketDashboardCard.tsx`, `trackingStatusBadge` inside
  `ActualsBucketCard.tsx`
- "Behavior" → "What's deleted" — `progressColor`, `ACTUAL_BUCKET_ORDER`
- "Testing Strategy" → "New component tests (with literal prop bundles)"
  — all three small-component test scenarios

## Acceptance criteria

- [ ] `frontend/src/components/budget/date-helpers.ts` exists and exports
      `MONTH_NAMES`, `monthKey`, `shortMonth`, `monthLabel`,
      `allMonthsForYear`, `pastAndCurrentMonthsForYear`, `currentYear`,
      `currentMonthKey`. The file has no React imports.
- [ ] `frontend/src/components/budget/chart-style.ts` exists and exports
      `tooltipStyle` and `chartColors`. No React imports.
- [ ] `frontend/src/components/budget/bucket-copy.ts` exists and exports
      `BUCKET_LABEL`, `BUCKET_DESCRIPTION`, `bucketRangeLabel`. Imports
      types from `@/api/categories` and `@/api/csp` only.
- [ ] `frontend/src/components/budget/MonthSelector.tsx` exists, exports
      the `MonthSelector` component and the `MonthAnnotation` interface.
      `currentMonthKey` is imported from `date-helpers.ts`.
- [ ] `frontend/src/components/budget/BucketDashboardCard.tsx` exists,
      exports `BucketDashboardCard` only. `bucketStatusBadge` is defined
      inside the file as a non-exported function.
- [ ] `frontend/src/components/budget/ActualsBucketCard.tsx` exists,
      exports `ActualsBucketCard` only. `trackingStatusBadge` is defined
      inside the file as a non-exported function.
- [ ] `pages/Budget.tsx` no longer contains any of the symbols listed
      above; all references are imports from the new files.
- [ ] `progressColor` has been deleted; no occurrences remain in
      `pages/Budget.tsx` or anywhere under `frontend/src/`.
- [ ] `ACTUAL_BUCKET_ORDER` has been deleted; the iteration over CSP
      buckets in `ActualVsBudgetView` (still inside `Budget.tsx` until plan
      14) uses the imported `CSP_BUCKETS` from `@/api/categories`.
- [ ] Component tests in
      `frontend/src/components/budget/__tests__/` cover the scenarios
      listed in the Tasks section.
- [ ] `npm run lint`, `npm run typecheck` (or equivalent), and
      `npm run test` (vitest) all pass.
- [ ] Manual smoke check: load the Budget page in the dev server. All
      three tabs render identically to before.

## Owns

- `frontend/src/components/budget/` — new directory.
- `frontend/src/components/budget/date-helpers.ts` — new file.
- `frontend/src/components/budget/chart-style.ts` — new file.
- `frontend/src/components/budget/bucket-copy.ts` — new file.
- `frontend/src/components/budget/MonthSelector.tsx` — new file (carries
  `MonthSelector` and `MonthAnnotation`).
- `frontend/src/components/budget/BucketDashboardCard.tsx` — new file
  (carries `BucketDashboardCard` + private `bucketStatusBadge`).
- `frontend/src/components/budget/ActualsBucketCard.tsx` — new file
  (carries `ActualsBucketCard` + private `trackingStatusBadge`).
- `frontend/src/components/budget/__tests__/MonthSelector.test.tsx` —
  new file.
- `frontend/src/components/budget/__tests__/BucketDashboardCard.test.tsx`
  — new file.
- `frontend/src/components/budget/__tests__/ActualsBucketCard.test.tsx`
  — new file.
- `frontend/src/pages/Budget.tsx` — modified. Specific sections:
  - Delete the date-helpers and constants block (lines ~107–152).
  - Delete `tooltipStyle`, `chartColors` (lines ~156–172).
  - Delete `progressColor` (lines ~174–178).
  - Delete `MonthAnnotation`, `MonthSelector` (lines ~182–247).
  - Delete `BUCKET_LABEL`, `BUCKET_DESCRIPTION`, `bucketRangeLabel`,
    `bucketStatusBadge`, `BucketDashboardCard` (lines ~418–486).
  - Delete `trackingStatusBadge`, `ActualsBucketCard` (lines ~494–559).
  - Delete `ACTUAL_BUCKET_ORDER` (line ~1262); update its single
    consumer site in `ActualVsBudgetView`'s iteration (~line 1430+) to
    use `CSP_BUCKETS`.
  - Add imports at the top for the new files.
- All call sites of the moved symbols inside `Budget.tsx` (the three
  view components and the page-level `Budget` default export). Examples:
  - `MonthSelector` is used inside `SetBudgetView` (line ~786) and
    `ActualVsBudgetView` (line ~1357).
  - `BucketDashboardCard` is used inside `SetBudgetView` (line ~793).
  - `ActualsBucketCard` is used inside `ActualVsBudgetView` (line
    ~1372).
  - `BUCKET_LABEL` / `BUCKET_DESCRIPTION` are used inside
    `SetBudgetView`'s bucket header rendering and the bucket cards.
  - The date helpers are used at module scope (initial month derivation)
    and inside `SetBudgetView` / `ActualVsBudgetView`.

## Must not touch

- `HistoricalView` (lines ~257–414) — owned by plan
  `2026-05-08-12-budget-historical-view.md`.
- `SetBudgetView` (lines ~574–913) — owned by plan
  `2026-05-08-13-budget-set-budget-view.md`.
- `ActualVsBudgetView` (lines ~1274–1458) — owned by plan
  `2026-05-08-14-budget-actual-vs-budget-view.md`. (This plan's only
  surgical touch inside that view is replacing `ACTUAL_BUCKET_ORDER` with
  `CSP_BUCKETS` at its iteration site — no other changes.)
- `BudgetVarianceChart` (lines ~1043–1259), `CategoryDrilldown` (lines
  ~964–1041), `mapToZonePosition`, `getTierColors` (lines ~917–962),
  `VarianceRow` interface, `SortColumn`/`SortDir` types — owned by plan
  `2026-05-08-14`.
- The `Budget` default-export component (lines ~1462–1678) — its query
  and mutation definitions, its tab markup, its conditional rendering.
  This plan only adds imports at the top.
- `frontend/src/api/*` — no API changes.
- `frontend/src/components/NetIncomeEditor.tsx` — unchanged.

## Defines interfaces

- `MonthAnnotation` exported from
  `frontend/src/components/budget/MonthSelector.tsx` — consumed by plans
  `2026-05-08-13`, `2026-05-08-14`.
- `currentYear`, `currentMonthKey`, `monthKey`, `shortMonth`,
  `monthLabel`, `allMonthsForYear`, `pastAndCurrentMonthsForYear`,
  `MONTH_NAMES` exported from
  `frontend/src/components/budget/date-helpers.ts` — consumed by plans
  `2026-05-08-12`, `2026-05-08-13`, `2026-05-08-14`.
- `BUCKET_LABEL`, `BUCKET_DESCRIPTION`, `bucketRangeLabel` exported from
  `frontend/src/components/budget/bucket-copy.ts` — consumed by plans
  `2026-05-08-13`, `2026-05-08-14`.
- `tooltipStyle`, `chartColors` exported from
  `frontend/src/components/budget/chart-style.ts` — consumed by plans
  `2026-05-08-12`, `2026-05-08-14`.

## Pattern exemplar

- **MUST follow the pattern in**:
  `frontend/src/components/overview/BucketCard.tsx` and
  `frontend/src/components/overview/RangePicker.tsx` — match file shape
  (top-of-file JSDoc explaining the component's purpose, single-component
  file, default-or-named export, lucide icons, shadcn UI primitives,
  `formatCurrency` import). Do not introduce a new style.
- **MUST follow the pattern in**:
  `frontend/src/pages/__tests__/Categories.test.tsx` for the new
  component-test files (vitest + React Testing Library, `render`/
  `screen.getByText`/`fireEvent.click` style, no `QueryClientProvider`
  unless the component fetches data — these three don't).

## Tasks

- [ ] Create the `frontend/src/components/budget/` directory.
- [ ] Create `date-helpers.ts`. Move the date-helpers block out of
      `Budget.tsx`. Export everything that current call sites import. Note:
      `today`, `currentYear`, `currentMonthKey` were module-level constants
      computed at import time. Re-export them as such (the new file
      computes them at its own import time). Verify no test relies on
      mocking `Date`.
- [ ] Create `chart-style.ts`. Move `tooltipStyle` and `chartColors`.
      Skip `progressColor` — delete it instead.
- [ ] Create `bucket-copy.ts`. Move `BUCKET_LABEL`, `BUCKET_DESCRIPTION`,
      `bucketRangeLabel`. Import types from `@/api/categories` and
      `@/api/csp` only (no React).
- [ ] Create `MonthSelector.tsx`. Move the `MonthAnnotation` interface
      and the component. Replace its inline reference to `currentMonthKey`
      with an import from `./date-helpers`. Replace its inline `shortMonth`
      reference with an import from `./date-helpers`.
- [ ] Create `BucketDashboardCard.tsx`. Move the `bucketStatusBadge`
      function (un-exported) and the `BucketDashboardCard` component
      (exported). Import `BUCKET_LABEL` and `bucketRangeLabel` from
      `./bucket-copy`.
- [ ] Create `ActualsBucketCard.tsx`. Move `trackingStatusBadge`
      (un-exported) and `ActualsBucketCard` (exported). Import
      `BUCKET_LABEL` from `./bucket-copy`.
- [ ] In `Budget.tsx`: delete the moved blocks listed in the **Owns**
      section. Add imports for the new files at the top.
- [ ] Replace `ACTUAL_BUCKET_ORDER` usage inside `ActualVsBudgetView`
      with `CSP_BUCKETS` (already imported from `@/api/categories`).
      Delete `ACTUAL_BUCKET_ORDER`. Verify the iteration order is
      preserved — `CSP_BUCKETS` and `ACTUAL_BUCKET_ORDER` should contain
      the four buckets in the same order; if not, this slice is a
      behavior change and must be flagged.
- [ ] Run `grep -n "progressColor\|ACTUAL_BUCKET_ORDER" frontend/src/`.
      Should return zero hits after.
- [ ] Write `__tests__/MonthSelector.test.tsx` covering: renders all
      months as buttons; selected button has active variant class; passing
      `annotations={...}` for one month renders the pct + delta text on
      that button only; `currentMonthKey` lights the green-dot indicator;
      `showAll` prop renders an "All" button.
- [ ] Write `__tests__/BucketDashboardCard.test.tsx` covering: render
      with `b.status="under"` shows the under (yellow) badge; render with
      `b.status="over"` and `b.is_open_ended_over=false` shows over
      (destructive); render with `b.is_open_ended_over=true` shows over
      (ok) (success); the `bucketRangeLabel` text appears in the header;
      the percentage and `numerator` (formatted as currency) both render.
- [ ] Write `__tests__/ActualsBucketCard.test.tsx` covering:
      `actual > planned` displays a `+X.X pts` delta; `actual < planned`
      displays the negative delta unsigned (no `+` prefix); the
      `trackingStatusBadge` text matches the `tracking_status` prop value;
      `target X.X% · actual Y.Y%` line appears in the header.
- [ ] Run `npm run test` from `frontend/`. All new tests pass; no
      existing tests broken.
- [ ] Run `npm run lint` and `npm run typecheck`. Fix any unused-import
      warnings or missing-type errors.
- [ ] Smoke check in the dev server: `npm run dev` from `frontend/`,
      load the Budget page, click through all three tabs, confirm visual
      identity to pre-refactor state.

## Implementation notes

### Module-scope constants in `date-helpers.ts`

`Budget.tsx` today computes `today`, `currentYear`, and `currentMonthKey`
at module-import time (line ~122–124):

```ts
const today = new Date();
const currentYear = today.getFullYear();
const currentMonthKey = `${currentYear}-${String(today.getMonth() + 1).padStart(2, "0")}`;
```

Move this block verbatim into `date-helpers.ts` and export each constant.
Call sites import `currentYear` and `currentMonthKey` directly — they are
not functions. The existing tests don't mock `Date`, so module-import-time
evaluation is fine.

### `bucketStatusBadge` and `trackingStatusBadge` privacy

Today both functions are module-private inside `Budget.tsx` (no `export`)
and are called only by `BucketDashboardCard` and `ActualsBucketCard`
respectively. Move each badge into the matching component's file as a
non-exported function. The card component is the only public symbol.

### `CSP_BUCKETS` vs `ACTUAL_BUCKET_ORDER` parity check

Today:

```ts
// @/api/categories
export const CSP_BUCKETS: readonly CspBucket[] = ["fixed", "investments", "savings", "guilt_free"];

// inside Budget.tsx, line ~1262
const ACTUAL_BUCKET_ORDER: CspBucket[] = ["fixed", "investments", "savings", "guilt_free"];
```

If these diverge, do NOT proceed with the dedup — flag it as a behavior
question. Confirmed identical at the time of spec writing.

### Import paths

Use the project's existing `@/components/budget/...` alias style (via the
`@` path mapping in `tsconfig.app.json`). All new files import shared
types and helpers via `@/...` paths to match the rest of the codebase.

### Test file naming

Tests for components in `components/budget/` go in
`components/budget/__tests__/`. This matches the existing pattern in
`hooks/__tests__/` and `pages/__tests__/`. Do not invent a new
co-location convention.
