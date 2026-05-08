# Step 4 — Overview subscriptions-remaining card

Adds the "recurring still expected this month" card below the spending
trend chart, plus the HTTP endpoint that backs it. The endpoint thinly
wraps the Step-1 `subscriptions_remaining` helper — no service code was
modified.

## 1. Files created / modified

### Created
- `frontend/src/components/overview/RecurringRemainingCard.tsx` — dumb
  presentation card. Loading state, empty-state ("No recurring charges
  expected this month", no link), populated state (formatted total +
  count + `<Link to="/subscriptions">view all</Link>`).
- `frontend/src/components/overview/__tests__/RecurringRemainingCard.test.tsx`
  — 4 render-asserts tests covering loading, empty, populated, and the
  singular-vs-plural copy.

### Modified
- `backend/app/schemas/subscription.py` — added `RemainingSubscription`
  and `RemainingSubscriptionsResponse`. Existing schemas untouched.
- `backend/app/routers/subscription_router.py` — added
  `GET /api/subscriptions/remaining`. Existing endpoints untouched.
  Route order: `GET ""`, `GET "/remaining"`, `POST "/detect"`,
  `PATCH "/{subscription_id}"`.
- `backend/tests/test_subscriptions.py` — added a `_make_sub` helper at
  module scope and a `TestRemainingEndpoint` class with 5 tests
  (200-shape, total/count math, ±5%/±7-day exclusion, inactive
  exclusion, uncategorized labelling).
- `frontend/src/api/subscriptions.ts` — appended
  `RemainingSubscription`, `RemainingSubscriptionsResponse`,
  `getRemainingSubscriptions(...)`. Existing exports untouched.
- `frontend/src/pages/Overview.tsx` — added a `remainingQ` TanStack
  Query and mounted `<RecurringRemainingCard>` between the
  spending-trend `<Card>` and `<TopMoversTable>`.

Must-not-touch list was respected: no edits to
`subscription_due_service.py`, `subscription_service.py`,
`pace_service.py`, `stats_service.py`, `PaceHeadline.tsx`,
`BucketCard.tsx`, `SpendingTrendChart.tsx`, `TopMoversTable.tsx`, or
`RecentTransactionsList.tsx`.

## 2. Endpoint contract

```
GET /api/subscriptions/remaining?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
response_model: RemainingSubscriptionsResponse

200 OK with body:
{
  "total": 94.50,
  "count": 3,
  "subscriptions": [
    {
      "id": 7,
      "vendor": "Netflix",
      "expected_date": "2026-05-12",
      "expected_amount": 15.99,
      "category_id": 5,
      "category_name": "Entertainment"
    },
    ...
  ]
}
```

- `total` and `count` are reductions over `subscriptions`. Decimal money
  fields are converted to `float` at the wire boundary (matches the
  pace-router convention).
- `subscriptions[]` is reserved for future detail surfacing; v1
  frontend only displays `total` and `count`.
- `category_name` is `"(uncategorized)"` when `category_id` is null.
- Inactive subscriptions are always excluded.
- A subscription is excluded from the list when a non-transfer
  transaction in the requested range matches by ±5% amount / ±7 day
  date (per Step 1's `_find_match`).
- **Always 200 in this slice.** Any range — including ranges that don't
  overlap the current month — returns 200 with whatever
  `subscriptions_remaining` produces (often `{total: 0, count: 0,
  subscriptions: []}`). Step 5 will add a 204 branch for ranges that
  aren't current-MTD.

## 3. Frontend client function

```typescript
export function getRemainingSubscriptions(args: {
  dateFrom: string;
  dateTo: string;
}): Promise<RemainingSubscriptionsResponse>;
```

Snake_case query params (`date_from`, `date_to`) on the wire;
camelCase on the caller side. Mirrors the `getMonthlyPace` /
`getSpendingTrend` style in `api/overview.ts`.

## 4. Section order in Overview.tsx after this step

Top-to-bottom, inside the `<div className="space-y-6">` parent:

1. `<PaceHeadline ... />` (Step 1, frozen)
2. Four-column `<BucketCard>` grid in canonical order — fixed,
   investments, savings, guilt_free (Step 1, frozen)
3. `<Card>` containing `<SpendingTrendChart>` (Step 3, frozen)
4. **`<RecurringRemainingCard>` — new this step**
5. `<TopMoversTable>` (Step 2, frozen)
6. `<RecentTransactionsList>` (Step 2, frozen)

The card is full-width within the same `space-y-6` parent — same shape
as the trend-chart `<Card>` above it.

## 5. Query key shape

```ts
queryKey: ["overview", "subs-remaining", { dateFrom, dateTo }]
queryFn:  getRemainingSubscriptions({ dateFrom, dateTo })
```

`dateFrom` / `dateTo` are the same MTD values that drive `paceQ`
(first-of-current-month → today). The picker comes in Step 5.

## 6. What Step 5 needs to change

- **Backend (router):** add the 204 branch — when the requested
  `date_from` / `date_to` is not exactly first-of-current-month →
  today, return `204 No Content` instead of 200. Don't touch
  `subscription_due_service.subscriptions_remaining` (the helper takes
  arbitrary ranges by design — the gate lives in the HTTP layer, same
  pattern as `pace_service`'s 400 gate today).
- **Frontend (Overview.tsx):** when `remainingQ.data === undefined`
  *because of a 204* (not because of `isLoading`), hide the card.
  `request<T>()` in `_client.ts` already returns `undefined` on 204 —
  so `remainingQ.data` will be `undefined` post-fetch when the server
  returns 204. Distinguish "loading" vs "204'd" via
  `!remainingQ.isLoading && remainingQ.data === undefined`.
- **Re-key all four queries when the picker range changes.** All four
  queries (`paceQ`, `trendQ`, `remainingQ`, plus the new range source)
  embed `{ dateFrom, dateTo }` in their query key tuples — TanStack
  Query will re-fetch automatically once the picker swaps the values
  in. The pace and remaining queries today both use the MTD
  `dateFrom`/`dateTo`; Step 5 will collapse them onto a single picker.
- **Component is dumb.** `RecurringRemainingCard` props are `total`,
  `count`, `loading`. No range awareness. Hiding behaviour belongs in
  the parent (Overview.tsx).

## 7. Smoke test status

Not run — verified via test gates only:

- `make test` → 476 passed (was 471, +5 remaining-endpoint tests).
- `cd frontend && npm test -- --run` → 302 passed (was 298, +4 card
  tests).
- `cd frontend && npm run build` → clean.
- `make lint` → clean.

Worth a manual eyeball once Step 5 lands and the page has the picker
plus the conditional 204 hiding.

## 8. Deviations

None.
