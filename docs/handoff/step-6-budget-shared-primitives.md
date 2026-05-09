# Step 6 — Budget shared primitives + dedup

Plan: `docs/plans/2026-05-08-11-budget-shared-primitives.md`.

Establishes `frontend/src/components/budget/` and moves the shared
visuals, copy strings, and helpers out of `pages/Budget.tsx`. The three
view components (`HistoricalView`, `SetBudgetView`, `ActualVsBudgetView`)
remain inline in `Budget.tsx` and consume the new modules via imports —
their extractions are owned by Steps 7 / 8 / 9.

## New files and their exports

- `frontend/src/components/budget/date-helpers.ts`
  - `MONTH_NAMES` (string[])
  - `today` (Date), `currentYear` (number), `currentMonthKey` (string)
    — module-scope, computed at import time
  - `monthKey(year, monthIdx1)`, `shortMonth(m)`, `monthLabel(m)`,
    `allMonthsForYear(year)`, `pastAndCurrentMonthsForYear(year)`
  - No React imports.
- `frontend/src/components/budget/chart-style.ts`
  - `tooltipStyle` (recharts Tooltip props)
  - `chartColors` (string[])
  - `progressColor` deleted — no callers.
- `frontend/src/components/budget/bucket-copy.ts`
  - `BUCKET_LABEL: Record<CspBucket, string>`
  - `BUCKET_DESCRIPTION: Record<CspBucket, string>`
  - `bucketRangeLabel(b: BucketRollup): string`
  - Imports `CspBucket` from `@/api/categories` and `BucketRollup` from
    `@/api/csp` only.
- `frontend/src/components/budget/MonthSelector.tsx`
  - `MonthSelector` component (named export)
  - `MonthAnnotation` interface (named export)
  - Imports `currentMonthKey` and `shortMonth` from `./date-helpers`.
- `frontend/src/components/budget/BucketDashboardCard.tsx`
  - `BucketDashboardCard` component (named export)
  - `bucketStatusBadge` is colocated and **not** exported (file-private).
  - Imports `BUCKET_LABEL` and `bucketRangeLabel` from `./bucket-copy`.
- `frontend/src/components/budget/ActualsBucketCard.tsx`
  - `ActualsBucketCard` component (named export)
  - `trackingStatusBadge` is colocated and **not** exported.
  - Imports `BUCKET_LABEL` from `./bucket-copy`.

## Deleted blocks in `pages/Budget.tsx`

Line ranges below refer to the **pre-refactor** file.

- Date-helpers + module-scope constants (lines ~107–152): `MONTH_NAMES`,
  `today`, `currentYear`, `currentMonthKey`, `monthKey`, `shortMonth`,
  `monthLabel`, `allMonthsForYear`, `pastAndCurrentMonthsForYear`.
- Chart constants (lines ~156–172): `tooltipStyle`, `chartColors`.
- `progressColor` (lines ~174–178) — fully deleted, no replacement.
- `MonthAnnotation` interface and `MonthSelector` component (lines
  ~182–247).
- `BUCKET_LABEL`, `BUCKET_DESCRIPTION`, `bucketRangeLabel`,
  `bucketStatusBadge`, `BucketDashboardCard` (lines ~418–486).
- `trackingStatusBadge`, `ActualsBucketCard` (lines ~494–559).
- `ACTUAL_BUCKET_ORDER` (line ~1262) — deleted; the single iteration
  site inside `ActualVsBudgetView` (~line 1374) was retargeted to
  `CSP_BUCKETS` (already imported from `@/api/categories`). Verified
  identical contents (`["fixed", "investments", "savings", "guilt_free"]`).
- `CheckCircle2` and the `BucketRollup` / `TrackingStatus` named
  imports were removed from the lucide and `@/api/csp` import lines —
  they're no longer referenced inside `Budget.tsx`.

Imports added at the top of `Budget.tsx`:

- `ActualsBucketCard` from `@/components/budget/ActualsBucketCard`
- `BucketDashboardCard` from `@/components/budget/BucketDashboardCard`
- `BUCKET_DESCRIPTION`, `BUCKET_LABEL` from `@/components/budget/bucket-copy`
- `chartColors`, `tooltipStyle` from `@/components/budget/chart-style`
- `MONTH_NAMES`, `allMonthsForYear`, `currentMonthKey`, `currentYear`,
  `monthKey`, `monthLabel`, `pastAndCurrentMonthsForYear`, `shortMonth`
  from `@/components/budget/date-helpers`
- `MonthSelector`, `type MonthAnnotation` from
  `@/components/budget/MonthSelector`

## New tests

`frontend/src/components/budget/__tests__/`:

- `MonthSelector.test.tsx` — 6 tests:
  1. Renders all 12 month buttons.
  2. Selected month uses the `bg-primary` class; non-selected use
     `border-input`.
  3. `onChange` fires with the correct month key when a button is
     clicked.
  4. Annotations render only on the annotated month.
  5. The green-dot indicator only lights for `currentMonthKey`.
  6. `showAll` renders an "All" button that fires `onChange("all")`.
- `BucketDashboardCard.test.tsx` — 6 tests:
  1. `status="under"` → "under" badge with yellow border class.
  2. `status="over"` + `is_open_ended_over=false` → "over" badge with
     destructive border class.
  3. `is_open_ended_over=true` → "over (ok)" badge with success border.
  4. Closed range header renders as `"Range: 50–60%"`.
  5. Open-ended range header renders as `"Range: ≥10%"`.
  6. Percentage and currency-formatted numerator both render.
- `ActualsBucketCard.test.tsx` — 6 tests:
  1. `actual > planned` renders `+5.3 pts`.
  2. `actual < planned` renders `-3.0 pts` (no leading `+`).
  3. `tracking_status="on-track"` → "on track" badge.
  4. `tracking_status="over-plan"` → "over plan" badge.
  5. `tracking_status="under-plan"` → "under plan" badge.
  6. Header renders `target X.X% · actual Y.Y%`.

Total new tests: **18**. Repo-wide vitest summary after this step:
**23 files, 336 passing**.

## Verification

- `grep -rn "progressColor\|ACTUAL_BUCKET_ORDER" frontend/src/` → no
  hits.
- `<NetIncomeEditor />` count in `pages/Budget.tsx` is **2** (unchanged
  from pre-refactor). Step 8 (`SetBudgetView` extraction) owns the
  dedup.
- `npm run build` clean.
- `npm run test -- --run` clean (336/336).

## Handoff to the next slices

- Step 7 (`HistoricalView`) imports `MONTH_NAMES`, `shortMonth`,
  `tooltipStyle`, `chartColors` from the new modules.
- Step 8 (`SetBudgetView`) imports `BUCKET_LABEL`,
  `BUCKET_DESCRIPTION`, `BucketDashboardCard`, `MonthSelector`,
  `allMonthsForYear`, `currentMonthKey`, `currentYear`.
- Step 9 (`ActualVsBudgetView`) imports `ActualsBucketCard`,
  `BUCKET_LABEL`, `MonthSelector`, `MonthAnnotation`,
  `pastAndCurrentMonthsForYear`, `currentMonthKey`, `monthLabel`, plus
  `CSP_BUCKETS` from `@/api/categories` for the bucket-iteration order.
