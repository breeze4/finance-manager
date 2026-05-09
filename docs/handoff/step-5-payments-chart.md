# Step 5: Payments charges-vs-payments chart

Implements `docs/plans/2026-05-09-02-payments-chart.md`.

## New endpoint: `GET /api/payments/series`

Request query params (all optional):

```
GET /api/payments/series?account_id=<int>&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
```

`account_id` absent means "All CCs". Date bounds are inclusive on
`transactions.date`. When both bounds are present the response is
zero-filled for every bucket in the span; when one is missing only the
buckets that have activity are returned (no spine to enumerate against).

Response: `PaymentSeriesResponse`

```json
{
  "bucket_size": "month",
  "buckets": [
    { "label": "Jan 2025", "charges_total": 1234.56, "payments_total": 1500.00 },
    { "label": "Feb 2025", "charges_total": 0.00,    "payments_total": 0.00    },
    { "label": "Mar 2025", "charges_total": 456.78,  "payments_total": 500.00  }
  ]
}
```

- `bucket_size` is one of `"month" | "quarter" | "year"`, derived
  backend-side from the requested span (see breakpoints below).
- `label` is pre-formatted on the backend so the frontend does not
  reimplement it: `"Jan 2025"` (month), `"Q1 2025"` (quarter), `"2025"`
  (year).
- `charges_total` is the sum of `|amount|` for negative-amount
  transactions on `credit_card` accounts in that bucket — always a
  non-negative magnitude.
- `payments_total` is the sum of positive-amount transactions on
  `credit_card` accounts (payments + refunds, no special-casing).
- Empty buckets appear with both totals at `0.0`.
- Filter when `account_id` is omitted: every `accounts.type =
  'credit_card'` row contributes; when supplied, only that account.

## Bucket-size breakpoints

In `backend/app/services/payment_service.py::bucket_size_for_range`:

| `(end - start).days` | Bucket size |
| --- | --- |
| `<= 366` | `"month"` |
| `367 .. 1464` | `"quarter"` |
| `> 1464` | `"year"` |

Rationale: 366 covers any 12-month window (incl. one leap day). 4 × 366
= 1464 covers any 4-year window (incl. one leap day). The spec asks for
"≤ ~12 months → month; ~13mo–4y → quarter; ≥5y → year", and these
day-count thresholds make a clean 12-month or 4-year request pick the
smaller bucket while anything beyond rolls over.

When either `start` or `end` is `None`, the deriver returns `"month"`
(safest, finest grain for an indeterminate window — caller is
responsible for supplying both bounds when it cares about the larger
buckets).

## Where the chart is mounted

`frontend/src/pages/Payments.tsx`:

- `seriesQ` (the query hook) at lines 67–82.
- `<ChargesVsPaymentsChart />` rendered at lines 130–135, between the
  count/total summary card (ends ~L128) and the list error/loading/
  table block (starts ~L137). Renders only when `seriesQ.data` exists
  and has at least one bucket.

The list UI itself was not restructured — the chart is purely additive
above it.

## Tests added

- `backend/tests/test_payment_series.py` (new file, 25 tests):
  - `TestBucketSizeForRange` (15 tests, mostly parametrized): every
    breakpoint and just-on-either-side case — `0, 1, 30, 365, 366, 367,
    730, 1463, 1464, 1465, 1825, 3650` days, plus `None` start / `None`
    end / both-`None` defaults.
  - `TestSeriesEndpoint` (10 tests): single CC month bucketing,
    multi-CC aggregation with no `account_id` filter, account filter
    narrows to one card, non-CC accounts excluded, empty buckets
    zero-filled, quarter bucketing across a 2-year range, year
    bucketing across a 6-year range, range edges inclusive at both
    ends, charges magnitude is positive, response schema keys are
    exactly `{bucket_size, buckets}` with `{label, charges_total,
    payments_total}` per bucket.

Existing `backend/tests/test_payment_router.py` (Step 1's file) was not
modified — kept the `GET /api/payments` list tests separate from the
new series tests for symmetry with the router (two endpoints, two test
files).

## Judgment calls

- **SQL approach for quarter buckets**: a single `GROUP BY` on a
  derived expression rather than a CTE or temp table. The expression is
  `strftime('%Y', date) || '-' || cast(((cast(strftime('%m', date) AS
  INTEGER) - 1) / 3) AS INTEGER) + 1` — wrapped via SQLAlchemy's
  `op('||')` for SQLite string concat. **Watch-out**: SQLAlchemy emits
  `/` which SQLite treats as float division by default, so the inner
  division is wrapped in `cast(..., Integer)` to force truncation.
  Without that cast, `month=2` produces a key like `"2024-1.333"`
  instead of `"2024-1"` and zero rows match the spine. There is a test
  (`test_quarter_bucketing`) that pins this behaviour.

- **Bucket label formatting on the backend**: pre-formatted (`"Jan
  2025"`, `"Q1 2025"`, `"2025"`) so the frontend has zero formatting
  logic. The plan called this out explicitly. The SQL key (used only
  for joining the spine to the aggregator) is a separate value
  (`"2025-01"`, `"2025-1"`, `"2025"`) — a `(key, label)` pair carried
  through `_enumerate_buckets`.

- **Color palette**: `hsl(var(--destructive))` for charges,
  `hsl(var(--success))` for payments. Both are existing project tokens
  in `frontend/src/index.css` — chosen over `chart-style.ts`'s
  index-based `chartColors` because that palette is meant for arbitrary
  category indices, not a semantic two-bar pair. Charges-as-red /
  payments-as-green is the obvious mapping for a CC chart.

- **Tooltip styling**: reused `tooltipStyle` from
  `@/components/budget/chart-style` rather than duplicating it — same
  dark-card appearance as the budget HistoricalView chart.

- **Chart visibility while loading / empty**: only renders when
  `seriesQ.data && seriesQ.data.buckets.length > 0`. No loading
  skeleton — the summary card above it is also un-skeletoned, so adding
  one only here would be inconsistent. An empty range or no CC accounts
  cleanly hides the chart and the user sees the existing "No
  credit-card payments in this date range" message from the list.

- **Schema lives in `backend/app/schemas/payment.py`** alongside
  `PaymentListItem` (one file per resource, matching the project
  pattern) rather than a new `payment_series.py`.

## Gate results

- `cd backend && uv run ruff check .` -> pass
- `cd backend && uv run ruff format --check .` -> pass (formatted the
  two new/modified files: `app/services/payment_service.py`,
  `tests/test_payment_series.py`)
- `cd backend && uv run pytest -q` -> 573 passed (was 548 in Step 1; +25
  from this step's new tests)
- `cd frontend && npm run build` -> succeeds (1 unrelated chunk-size
  warning)
- `cd frontend && npm test -- --run` -> 355 passed across 26 test files
  (no new frontend tests; chart is visual-only per spec)

## Surprises / context for downstream

- Worktree was forked from a stale ref (`8a30ddc`, ~17 commits behind
  tip of main). `docs/plans/2026-05-09-02-payments-chart.md`,
  `backend/app/services/payment_service.py` in its post-Step-1 form,
  and `frontend/src/lib/format.ts` with the 0-decimal default all only
  exist on tip. Did `git reset --hard main` to align — no worktree-only
  commits to lose.
- `frontend/src/lib/format.ts` was already at the 0-decimal default
  (Step 4). The chart axes/tooltips therefore render at 0 decimals
  without any per-call `decimals` arg.
- Two distinct `useQuery` keys (`["payments", ...]` and
  `["payments-series", ...]`) — same shape so they invalidate together
  on filter changes but cache independently.
