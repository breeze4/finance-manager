# Overview subscriptions-remaining card

## Parent spec

[`docs/specs/2026-05-08-01-overview-redesign.md`](../specs/2026-05-08-01-overview-redesign.md)

## What to build

Add the "recurring still expected this month" card to the Overview:

1. Backend: new endpoint `GET /api/subscriptions/remaining?date_from=
   &date_to=` that wraps the `subscription_due_service.subscriptions_
   remaining(db, date_from, date_to)` helper from plan
   `2026-05-08-01`. For this plan, only the in-progress current month
   case is supported — the 204-when-out-of-range behavior arrives in plan
   `2026-05-08-05`.
2. Frontend: `RecurringRemainingCard` component showing one number
   ("Recurring still expected this month: $X") plus the count, with a
   click-through navigating to the Subscriptions page.

See spec sections "Behavior" (Subscriptions remaining), "Resolved
Decisions" (subscriptions section).

## Type

AFK

## Blocked by

- Blocked by `2026-05-08-01-overview-pace-foundation.md` — depends on
  `subscription_due_service.subscriptions_remaining()` defined in that
  plan; also Overview page exists from plan 1.

## User stories addressed

User story 11 from the parent spec.

## Acceptance criteria

- [ ] `GET /api/subscriptions/remaining?date_from=<first-of-current-month>
  &date_to=<today>` returns 200 with `{total, count, subscriptions: []}`
  (subscriptions array is reserved for future detail; can be empty for v1).
- [ ] `total` equals the sum of active-subscription amounts whose next
  expected charge falls within the range AND has not yet matched a
  transaction (using the ±5%/±7-day rule from plan 1).
- [ ] `count` equals the number of subscriptions contributing to `total`.
- [ ] Endpoint integration test verifies the documented shape and
  computation against a SQLite fixture with seeded subs and transactions.
- [ ] Frontend card renders the formatted total, the count ("3
  subscriptions, $94.50"), and a click-through link/button to the
  Subscriptions page (`/subscriptions`).
- [ ] If `total` is 0, the card reads "No recurring charges expected
  this month" with no link.
- [ ] `make test` and `cd frontend && npm test` both pass.
- [ ] `make lint` passes.

## Owns

- `backend/app/routers/subscription_router.py` — add the `remaining`
  endpoint; do not alter existing endpoints
- `backend/app/schemas/subscription.py` — add `RemainingSubscriptionsResponse`
  schema (verify exact filename; could also be inlined in the router file
  if other schemas in this module live there)
- `backend/tests/test_subscriptions.py` — extend with remaining endpoint
  integration test
- `frontend/src/api/subscriptions.ts` — add `getRemainingSubscriptions
  (range)`
- `frontend/src/components/overview/RecurringRemainingCard.tsx` — new
- `frontend/src/pages/Overview.tsx` — insert the card section; do not
  modify sections owned by plans 1–3.

## Must not touch

- `backend/app/services/subscription_due_service.py` — owned by plan 1.
  This plan only calls `subscriptions_remaining()`; do not modify it.
- `backend/app/services/subscription_service.py` — read-only.
- All previously-built Overview components (PaceHeadline, BucketCard,
  TopMoversTable, RecentTransactionsList, SpendingTrendChart) — owned by
  plans 1–3.

## Defines interfaces

- `RemainingSubscriptionsResponse` schema — consumed by plan `2026-05-08-05`
  (range picker), which calls the same endpoint and expects 204 outside
  current-MTD.

## Pattern exemplar

- **MUST follow the pattern in**:
  `backend/app/routers/subscription_router.py` itself — add the new
  endpoint alongside the existing list/detect/update endpoints. Match the
  dependency injection + Pydantic response_model style.
- **Follow the pattern in**: `backend/tests/test_subscriptions.py` —
  match the fixture + assertion style for the integration test.
- **Follow the pattern in**: `frontend/src/api/subscriptions.ts` — add
  the new fetch function alongside existing ones.
- **Follow the pattern in**: existing card components in
  `frontend/src/pages/Overview.tsx` (post-plan-1) — single-statistic
  display in a Card shell; mirror the typography and spacing.

## Tasks

- [ ] Add `RemainingSubscriptionsResponse` Pydantic schema (in
  `schemas/subscription.py` or inline per the existing file's style).
- [ ] Wire `GET /api/subscriptions/remaining` in
  `subscription_router.py` calling
  `subscription_due_service.subscriptions_remaining(db, date_from,
  date_to)`.
- [ ] Extend `backend/tests/test_subscriptions.py` with a remaining
  endpoint integration test.
- [ ] Add `getRemainingSubscriptions(range)` to
  `frontend/src/api/subscriptions.ts`.
- [ ] Build `RecurringRemainingCard.tsx` — a single-statistic Card with
  click-through to `/subscriptions`.
- [ ] Insert the card section into `Overview.tsx`, positioned per the
  page's section order (after the trend chart from plan 3).
- [ ] Smoke-test against dev server.
- [ ] Run `make test`, `cd frontend && npm test`, `make lint`.
