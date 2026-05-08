# Overview top movers + recent transactions

## Parent spec

[`docs/specs/2026-05-08-01-overview-redesign.md`](../specs/2026-05-08-01-overview-redesign.md)

## What to build

Two small UI-only sections appended to the Overview page after the bucket
cards:

1. **Top movers**: a table ranking categories by absolute variance from
   expected pace, top 10 rows. Source data is the `categories[]` array
   already returned by the pace endpoint from plan `2026-05-08-01`. No new
   backend work — the frontend sorts and slices client-side.
2. **Recent transactions**: a list of the last 10 non-transfer transactions
   across all accounts, with category badge. Source data is the existing
   `GET /api/transactions` endpoint with appropriate query params.

Both sections render unconditionally for current-MTD; the range-aware
behavior arrives in plan `2026-05-08-05`.

See spec sections "Behavior" (top movers row count, recent transactions
shape) and "Resolved Decisions".

## Type

AFK

## Blocked by

- Blocked by `2026-05-08-01-overview-pace-foundation.md` — the top-movers
  table consumes `MonthlyPaceResponse.categories[]` defined there, and the
  recent-transactions section is appended to the Overview page after the
  bucket cards land.

## User stories addressed

User stories 9, 12 from the parent spec.

## Acceptance criteria

- [ ] Top-movers table ranks categories by `|actual_mtd - expected_mtd|`
  descending, top 10 rows.
- [ ] Each top-movers row shows: category name, bucket badge (or
  "Uncategorized" if `bucket` is null), actual MTD, expected MTD, variance
  with sign (positive = over, negative = under), and a small directional
  indicator.
- [ ] Pre-tax categories never appear in top movers (already excluded by
  the pace endpoint per plan 1).
- [ ] If fewer than 10 categories have non-zero variance, the table shows
  only those rows.
- [ ] Recent transactions list shows up to 10 rows from `GET
  /api/transactions?is_transfer=false&page_size=10&sort_by=date&sort_dir=
  desc`, ordered by date descending.
- [ ] Each row shows: date, vendor, amount (color-coded red for outflows,
  green for inflows), category badge.
- [ ] Light component renders pass: top-movers renders with a stub
  pace response; recent-transactions renders with a stub transactions
  response.
- [ ] `make test` and `cd frontend && npm test` both pass.
- [ ] `make lint` passes.

## Owns

- `frontend/src/components/overview/TopMoversTable.tsx` — new
- `frontend/src/components/overview/RecentTransactionsList.tsx` — new
- `frontend/src/pages/Overview.tsx` — append sections below the four
  bucket cards; do not modify the headline or bucket cards built in plan 1.

## Must not touch

- `backend/**` — no backend changes in this plan.
- `frontend/src/api/overview.ts` — the pace endpoint client is final from
  plan 1. Only consume it.
- `frontend/src/components/overview/PaceHeadline.tsx`,
  `BucketCard.tsx` — owned by plan 1; do not alter their behavior.
- `frontend/src/api/transactions.ts` — already exposes
  `listTransactions`; do not change its signature.

## Defines interfaces

None — this plan only consumes existing interfaces (`MonthlyPaceResponse`
from plan 1; `Transaction` and `listTransactions` from the existing
transactions API).

## Pattern exemplar

- **Follow the pattern in**: `frontend/src/pages/Subscriptions.tsx` — it
  shows tabular displays of vendor + amount + category badge in a similar
  visual style. Mirror the cell layout and color conventions.
- **Follow the pattern in**:
  `frontend/src/pages/Transactions.tsx` — for the recent-transactions row
  layout (date, vendor, amount, category). It already follows the spec's
  color rules (red expenses, green income) and has the date/category-
  badge formatting.

## Tasks

- [ ] Build `TopMoversTable.tsx`. Props: `categories: CategoryPaceRow[]`.
  Sort by `Math.abs(actual_mtd - expected_mtd)` descending, slice top 10,
  render rows.
- [ ] Build `RecentTransactionsList.tsx`. Inside the component, run a
  TanStack Query against `listTransactions({is_transfer: false, page: 1,
  page_size: 10, sort_by: "date", sort_dir: "desc"})`. Render rows.
- [ ] Append both components to `Overview.tsx` below the four bucket
  cards. Each section gets its own `Card` shell with a CardTitle.
- [ ] Add lightweight component tests for each (snapshot or render-asserts
  with stubbed data) under
  `frontend/src/components/overview/__tests__/`.
- [ ] Smoke-test in browser: confirm top movers list looks right, recent
  transactions list looks right, scrolling/layout.
- [ ] Run `make test`, `cd frontend && npm test`, `make lint`.
