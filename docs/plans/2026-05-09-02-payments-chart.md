# Payments: Charges-vs-Payments Bar Chart

## Parent spec

`docs/specs/2026-05-08-04-payments-redesign.md`

## What to build

End-to-end vertical slice adding the side-by-side bar chart above the payments list. Backend gets a pure bucket-size deriver and a new `/api/payments/series` endpoint that aggregates charges (sum of negative magnitudes) and payments (sum of positives) per bucket across `credit_card` accounts. Frontend gets a reusable grouped-bar chart component that renders above the list and is filtered by the same account selector + global date range. Bar grouping (month / quarter / year) is auto-derived backend-side from the active range span.

## Type

AFK

## Blocked by

- Blocked by `2026-05-09-01-payments-list-and-cleanup.md`

## User stories addressed

- User story 2
- User story 3

## Acceptance criteria

- [ ] Pure helper `bucket_size_for_range(start, end) -> "month" | "quarter" | "year"` exists with breakpoints: ≤ ~12 months → `month`; ~13mo–4y → `quarter`; ≥5y → `year`
- [ ] Backend boundary tests cover the deriver at every breakpoint
- [ ] `GET /api/payments/series?account_id=&start=&end=` returns `{ bucket_size, buckets: [{label, charges_total, payments_total}, ...] }`
- [ ] Series endpoint includes empty-period buckets as zero-rows so the time axis is continuous
- [ ] Charges magnitude is positive in the response (sum of `|amount|` over negatives)
- [ ] Payments total includes returns/refunds (any positive amount on a `credit_card` account)
- [ ] Backend boundary tests cover the series endpoint: single-CC, multi-CC, range edges, "All CCs", per-account filter, range that crosses month/quarter/year breakpoints
- [ ] Frontend Payments page renders the chart above the list, driven by the same account selector and global date range
- [ ] X-axis labels match the bucket size (e.g., "Jan 2026" for month, "Q1 2026" for quarter, "2026" for year)
- [ ] Chart tooltips and Y-axis render at 0 decimals
- [ ] Type-check, lint, frontend build all pass

## Owns

- `backend/app/services/payment_service.py` — add `bucket_size_for_range` (pure helper) and `get_series` (aggregation)
- `backend/app/routers/payment_router.py` — add `GET /api/payments/series` route
- `backend/app/schemas/payment*.py` — add series response schema
- `frontend/src/api/payments.ts` — add `getSeries` client function
- `frontend/src/components/payments/ChargesVsPaymentsChart.tsx` (new) — grouped-bar chart component
- `frontend/src/pages/Payments.tsx` — mount the chart above the list
- `backend/tests/` — add tests for deriver + series endpoint

## Must not touch

- The redefined `GET /api/payments` list endpoint — owned by plan `2026-05-09-01`
- The list UI on the page — owned by plan `2026-05-09-01`
- Account selector logic — already in place from plan `2026-05-09-01`; this plan only consumes it
- `payment_match` cleanup — already done in plan `2026-05-09-01`
- `frontend/src/lib/format.ts` — owned by plan `2026-05-09-06`

## Defines interfaces

- `GET /api/payments/series` response shape — internal to this slice; no downstream consumers in other plans
- `ChargesVsPaymentsChart` component props — internal

## Pattern exemplar

- **Follow the pattern in**: `frontend/src/components/budget/HistoricalView.tsx` for Recharts usage (BarChart with stacked Bars). Adapt for grouped (side-by-side) bars instead of stacked.
- **Follow the pattern in**: `backend/app/routers/payment_router.py` (after plan 01) for new endpoint registration; `backend/app/services/payment_service.py` for service-layer aggregation idioms.
- **Follow the pattern in**: existing chart-using pages like `Overview` for hooking the global date range picker into a chart-fetching component.

## Tasks

- [ ] Backend: write `bucket_size_for_range` helper with table-driven tests (every breakpoint and just-on-either-side cases)
- [ ] Backend: write `get_series` aggregation; SQL-level GROUP BY on bucket-truncated date (e.g., `strftime('%Y-%m', date)` for month, derived for quarter/year)
- [ ] Backend: ensure empty buckets are filled in (don't skip months with no activity)
- [ ] Backend: add `GET /api/payments/series` route + response schema
- [ ] Backend: write boundary tests for the endpoint covering the cases in acceptance criteria
- [ ] Frontend: add `getSeries` to the API client
- [ ] Frontend: build `ChargesVsPaymentsChart` using Recharts grouped `<Bar>` (no `stackId`, two distinct bars per bucket)
- [ ] Frontend: format X-axis labels per bucket size; format Y-axis ticks and tooltips at 0 decimals
- [ ] Frontend: mount the chart in `Payments.tsx`, above the list, filtered by the same account + range
- [ ] Run backend tests, frontend type-check, frontend build

## Implementation notes

- **Bucket size on the wire**: backend returns the chosen bucket size. Frontend doesn't compute it — it just consumes the response. Avoids drift between two implementations.
- **Quarter labels**: format as `Q{1..4} YYYY`. Year labels: `YYYY`. Month labels: short month + year (`Jan 2026`).
- **Returns are bundled with payments** by virtue of "any positive amount on a credit_card account" — no special-casing of `type = 'Return'`.
- **Currency precision**: this plan formats chart axes/tooltips with 0 decimals explicitly even before plan `2026-05-09-06` lands, since the chart is new code.
