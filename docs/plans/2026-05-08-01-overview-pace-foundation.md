# Overview pace foundation: backend + headline + bucket cards

## Parent spec

[`docs/specs/2026-05-08-01-overview-redesign.md`](../specs/2026-05-08-01-overview-redesign.md)

## What to build

The tracer-bullet slice for the Overview redesign. End-to-end:

1. A new `pace_service` that, for the in-progress current month, computes
   per-category pace (actual MTD vs expected MTD) using the linear-by-
   calendar-days formula with subscription-charges-not-yet-hit held out of
   "expected." Pre-tax categories are excluded; uncategorized transactions
   contribute to actual but have zero budget. Rolls categories into CSP
   buckets. Returns headline summary, bucket rollups, per-category detail.
2. A subscription-due helper that determines, for each active subscription,
   whether its expected charge for the current month has already hit (using
   the ±5%/±7-day match rule from the spec).
3. A new endpoint `GET /api/stats/monthly-pace?date_from=&date_to=` that
   wraps `pace_service` for `[first-of-current-month, today]` only. The
   actual-vs-budget mode and arbitrary ranges are out of scope here — they
   land in plan `2026-05-08-05`. The endpoint accepts the params now so
   later plans don't need to change the URL contract; if `date_from !=
   first-of-current-month`, return 400 for the duration of this plan.
4. Rewrite the frontend Overview page end-to-end. Drop the existing three
   queries against `/api/stats/summary`, `/api/stats/monthly`, and
   `/api/transactions`. Replace with a single query against the new pace
   endpoint. Render the on-track headline plus four CSP bucket cards. Each
   card expands inline (accordion) to show its categories with their own
   pace bars.
5. Frontend api client `api/overview.ts` mirrors the response shape.

The page after this slice has only the headline + four bucket cards. The
trend chart, subs-remaining card, top-movers list, recent-transactions list,
and the range picker all land in subsequent slices.

See spec sections "Behavior" (pace mode subsection), "Modules", and
"Resolved Decisions" for math and shape details.

## Type

AFK

## Blocked by

None — can start immediately.

## User stories addressed

User stories 1, 2, 3, 4, 5, 6, 7, 8, 18, 19, 20, 21 from the parent spec.

## Acceptance criteria

- [ ] `pace_service.compute_monthly_pace(db, date_from, date_to)` returns
  the documented response shape for `[first-of-current-month, today]` with
  `mode = "pace"`. For other ranges it raises a clear error (handled by the
  router as 400).
- [ ] Pace formula matches the pseudocode in the spec exactly:
  `expected_mtd = subs_already_hit + max(0, full_budget - subs_due) *
  (elapsed_days / days_in_month)`.
- [ ] Pre-tax categories (`is_pre_tax = true`) are excluded from pace
  computation entirely — they do not appear in any bucket's category list
  and do not contribute to bucket totals or the headline.
- [ ] Uncategorized transactions (non-transfer, `category_id IS NULL`) are
  surfaced as a synthetic "Uncategorized" row with `full_budget = 0`,
  `expected_mtd = 0`, and `actual_mtd = sum of those transactions`. They
  appear in `categories[]` but do not belong to any bucket.
- [ ] Transfers (`is_transfer = true`) and `exclude_from_budget = true`
  categories are excluded from all sums.
- [ ] `subscription_due` correctly identifies whether each active
  subscription has already charged this month using ±5% amount AND within
  ±7 days of the expected charge date (`last_charge_date + frequency`).
- [ ] Endpoint integration test: `GET /api/stats/monthly-pace?date_from=
  <first-of-current-month>&date_to=<today>` returns 200 with the documented
  shape, and `mode = "pace"`. Other ranges return 400.
- [ ] Pace service unit tests cover: linear pace formula with no subs, with
  subs already hit, with subs not yet hit, day 1 of month edge case, last
  day of month edge case, leap-year February, end-of-month override, pre-
  tax exclusion, uncategorized handling, monthly override taking precedence
  over baseline.
- [ ] Subscription-due unit tests cover: weekly / bi-weekly / monthly /
  quarterly / annual frequencies, missing `last_charge_date` defensive
  case, match-window edges (exactly ±5%, exactly 7 days), no-match cases.
- [ ] Frontend Overview shows the pace headline copy ("On pace — $X under
  expected" or "Over pace — $X over expected") driven by the response.
- [ ] Frontend Overview shows the four bucket cards (Fixed, Investments,
  Savings, Guilt-Free) in a fixed grid; cards always render even when
  empty (read "$0 budgeted").
- [ ] Bucket card click expands inline to show categories with per-category
  actual MTD / expected MTD / pace bar.
- [ ] `make test` and `cd frontend && npm test` both pass.
- [ ] `make lint` passes.

## Owns

- `backend/app/services/pace_service.py` — new
- `backend/app/services/subscription_due_service.py` — new (the helper
  module)
- `backend/app/schemas/stats.py` — add `MonthlyPaceResponse`,
  `BucketPaceRollup`, `CategoryPaceRow`, `PaceHeadline` schemas
- `backend/app/routers/stats_router.py` — add the `monthly_pace` endpoint
  (do not modify existing `summary` or `monthly` endpoints)
- `backend/tests/test_pace_service.py` — new
- `backend/tests/test_subscription_due_service.py` — new
- `backend/tests/test_stats_api.py` — extend with monthly-pace integration
  tests
- `frontend/src/api/overview.ts` — new
- `frontend/src/pages/Overview.tsx` — rewrite end-to-end (replace the four
  KPI cards + four charts with headline + bucket cards)
- `frontend/src/components/overview/PaceHeadline.tsx` — new
- `frontend/src/components/overview/BucketCard.tsx` — new (inline accordion
  expansion to show categories)

## Must not touch

- `backend/app/services/csp_rollup_service.py` — Set Budget / CSP planning
  rollup; pace_service is a sibling, not an extension.
- `backend/app/services/budget_service.py` — pace_service consumes the
  effective-budget logic but does not modify it. Reuse, don't refactor.
- `backend/app/services/subscription_service.py` — read-only; the helper
  here uses subscriptions but doesn't change the detection algorithm.
- `backend/app/services/stats_service.py` — `get_summary` / `get_monthly`
  stay alive for other pages. Not modified by this plan.
- `frontend/src/api/stats.ts`, `frontend/src/api/transactions.ts` — other
  pages still consume them; do not change.
- `frontend/src/pages/Budget.tsx` — Set Budget redesign owns CSP planning;
  do not edit.
- Any plan-2 / plan-3 / plan-4 / plan-5 files — owned by those plans.

## Defines interfaces

- `MonthlyPaceResponse` schema in `backend/app/schemas/stats.py` — consumed
  by plan `2026-05-08-02` (top movers + recent txns reads `categories[]`)
  and by plan `2026-05-08-05` (range picker switches `mode` to
  `actual_vs_budget`). The response must include the `mode` discriminator
  field even though only `"pace"` is emitted at this stage; later plans
  add `"actual_vs_budget"` without breaking the contract.
- `pace_service.compute_monthly_pace()` function signature — consumed by
  the endpoint; future range-mode support extends the same function rather
  than adding a parallel one.
- `subscription_due_service.subscriptions_already_hit(db, year_month)` and
  `subscriptions_remaining(db, date_from, date_to)` — the latter is also
  consumed by plan `2026-05-08-04` (subs-remaining endpoint).

## Pattern exemplar

- **MUST follow the pattern in**: `backend/app/services/csp_rollup_service.py`
  — sibling service that aggregates across categories with budget and CSP-
  bucket integration. Match its module structure (top-level pure functions,
  Decimal/float handling, named return dicts mirrored by Pydantic schemas).
- **MUST follow the pattern in**:
  `backend/app/routers/stats_router.py` itself — add the new endpoint
  alongside the existing two. Match the dependency injection + Pydantic
  response_model style.
- **Follow the pattern in**: `backend/tests/test_csp_rollup_service.py` —
  fixture-driven tests with real SQLite, factory functions for transactions
  and budgets. Mirror the structure for `test_pace_service.py`.
- **Follow the pattern in**: `backend/tests/test_stats_api.py` — extend
  with new endpoint integration tests in the existing style.
- **Follow the pattern in**: `frontend/src/api/csp.ts` — narrow API client
  module with one or two functions and a typed response. Mirror its
  structure for `api/overview.ts`.
- **Follow the pattern in**: `frontend/src/pages/Budget.tsx` (the Set
  Budget tab section) — uses `useQuery` with TanStack Query, formats
  currency with `formatCurrency`, renders bucket cards. The visual
  language for bucket cards already exists there; mirror it for the pace
  variant rather than inventing a new style.

## Tasks

- [ ] Add Pydantic schemas (`MonthlyPaceResponse`, `BucketPaceRollup`,
  `CategoryPaceRow`, `PaceHeadline`) to `backend/app/schemas/stats.py`.
  Include the `mode` discriminator field.
- [ ] Implement `subscription_due_service.subscriptions_already_hit(db,
  year_month)` returning `Map<category_id, hit_amount>` based on the ±5% /
  ±7-day rule against active subscriptions and current-month transactions.
- [ ] Implement `pace_service.compute_monthly_pace(db, date_from, date_to)`
  for the pace-mode case only. Reject other ranges with a clear error.
- [ ] Wire up `GET /api/stats/monthly-pace` in `stats_router.py` returning
  400 when `date_from` is not first-of-current-month or `date_to < today`.
- [ ] Write `backend/tests/test_subscription_due_service.py` covering the
  acceptance criteria.
- [ ] Write `backend/tests/test_pace_service.py` covering the acceptance
  criteria.
- [ ] Extend `backend/tests/test_stats_api.py` with a monthly-pace
  integration test (real SQLite fixture).
- [ ] Implement `frontend/src/api/overview.ts` with `getMonthlyPace(range)`
  and TS types mirroring the Pydantic schemas.
- [ ] Build `frontend/src/components/overview/PaceHeadline.tsx` (renders
  the on-track copy + total variance).
- [ ] Build `frontend/src/components/overview/BucketCard.tsx` (header with
  bucket name + actual/expected/budget; accordion expansion to show
  per-category pace rows).
- [ ] Rewrite `frontend/src/pages/Overview.tsx` to render headline + four
  bucket cards using only the new query. Drop the previous queries.
- [ ] Smoke-test against the dev server: load `/`, confirm headline renders,
  bucket cards render, drill-down works.
- [ ] Run `make test`, `cd frontend && npm test`, `make lint`. All green.

## Implementation notes

- The pace pseudocode in the spec is the source of truth. When in doubt,
  re-read `## Behavior > Pace mode`.
- `effective_monthly_budget(category, this_month)` follows the existing
  budget_service convention: month-level override if present, else the
  baseline `monthly_amount`. Reuse the helper rather than re-implementing.
- For the response shape, every category appears in `categories[]` once,
  with its `bucket` field set (or `null` for Uncategorized). Buckets are
  computed by grouping `categories[]` server-side; the frontend gets both
  the flat list and the bucket-grouped rollup.
- The four bucket cards always render in a fixed order: Fixed,
  Investments, Savings, Guilt-Free. An empty bucket shows "$0 budgeted"
  with no pace bar.
- Frontend currency formatting goes through `frontend/src/lib/format.ts`'s
  `formatCurrency`. Don't roll a new one.
