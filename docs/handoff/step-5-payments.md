# Step 5 handoff — Payments page (Phase 4 of mockup-page port)

Plan: `docs/plans/2026-05-07-08-port-mockup-pages.md` §Phase 4 (all
checklist items done).

## What landed

- `frontend/src/api/payments.ts` — typed client for the three payment
  endpoints. Snake_case fields preserved at the API boundary.
  `EmbeddedTransaction` is declared locally, NOT imported from
  `./transactions`, so this file does not depend on the not-yet-finalised
  canonical `Transaction` shape that Step 6 will own.
- `frontend/src/pages/Payments.tsx` — replaces the 3-line stub. Summary
  card, Matched Payments table (with per-row Unmatch button), Unmatched
  Candidates table, "Re-detect" button in the page header.

No changes to `App.tsx` (route already in place), `AppSidebar.tsx`,
shared infra, or any other API client / page. `frontend/src/api/transactions.ts`
was read but **not modified** — Step 6 owns that file.

## API endpoints used

| Method   | Path                              | Wrapper                        |
| -------- | --------------------------------- | ------------------------------ |
| `GET`    | `/api/payments`                   | `listPayments()`               |
| `POST`   | `/api/payments/detect`            | `detectPayments()`             |
| `DELETE` | `/api/payments/{match_id}`        | `unmatchPayment(matchId)`      |
| `GET`    | `/api/transactions?is_transfer=false&page_size=200` | `listTransactions(...)` (existing client, unchanged) |

The 204 response from DELETE is handled by `_client.ts:34` (returns
`undefined as T`); `unmatchPayment` is typed `Promise<void>`.

## Unmatched-candidates strategy

Read `backend/app/services/payment_service.py` to determine the
candidate definition. Findings:

- BECU side: `raw_description ILIKE '%CHASE CREDIT CRD%' AND is_transfer = false`
- Chase side: `type = 'Payment' AND is_transfer = false`
- After a successful match, both rows have `is_transfer` flipped to `true`.
- `unmatch` resets `is_transfer = false` on both.

So `is_transfer = false` is a strict **superset** of the unmatched
candidate set, but includes plenty of unrelated transactions. The plan
allowed for two cases; this is the second one — the right narrowing
filter (`raw_description LIKE '%CHASE CREDIT CRD%'` for BECU,
`type = 'Payment'` for Chase) is **not** exposed on the
`/api/transactions` list endpoint today.

Decision: query `listTransactions({ is_transfer: false, page_size: 200 })`
and narrow client-side with two helpers:

```ts
isCheckingCandidate(t) := /CHASE CREDIT CRD/i.test(t.raw_description)
isCcCandidate(t)       := t.type === "Payment"
```

A transaction is shown as a candidate iff either predicate holds AND
the transaction id is not already part of an existing
`PaymentMatchResponse` (the matched-id `Set` is built once in a
`useMemo` over `paymentsQ.data`).

`page_size: 200` is generous — covers a few months of history even on
a busy account, and the post-detect set should normally be tiny (only
unmatched debits/credits remain). If users surface scenarios where 200
is insufficient, the right fix is a backend filter
(`?type=Payment&description_contains=...`) rather than fetching
everything; deferred.

## Mutation invalidation keys

| Mutation             | Keys invalidated                                            |
| -------------------- | ----------------------------------------------------------- |
| `detectPayments`     | `["payments"]`, `["transactions"]` (broad — covers the unmatched-candidates query, whose key starts with `["transactions", ...]`) |
| `unmatchPayment(id)` | `["payments"]`, `["transactions"]`                          |

`["transactions"]` is invalidated as a prefix because detection flips
`is_transfer` on the matched rows, which would change which rows pass
the candidates filter on the next refetch. Same reason applies to
unmatch (which flips them back).

The unmatched list isn't a separate query; it's a `useMemo` over
`paymentsQ.data` (for the matched-id set) and `candidatesQ.data` (for
the transactions page). Invalidating either upstream is enough — no
separate `["payments", "unmatched"]` key.

## Field-shape decisions

This page reads `TransactionResponse` snake_case fields directly:
`vendor`, `amount`, `date`, `account_name`, `raw_description`, `type`,
`is_transfer`, `id`, `category_id`, `category_name`. **No camelCase
adapter is introduced.** Per the orchestrator plan, Step 6 owns that
adapter for the canonical `Transaction` type used by the Transactions
page; introducing one here would risk a divergent shape.

The mockup's `Payment` row had `fromAccount` / `toAccount` strings;
we render `m.checking_transaction.account_name` →
`m.cc_transaction.account_name` directly. The mockup's `payment.amount`
became `Math.abs(m.checking_transaction.amount)` (the BECU side is
negative on the wire — debits are stored as negative, per the schema's
sign convention).

`EmbeddedTransaction` (in `payments.ts`) is a strict subset of
`TransactionResponse` (in `transactions.ts`) — they don't share a
declaration today. When Step 6 finalises the canonical shape and
adapter, this is the natural place to converge: either replace
`EmbeddedTransaction` with the snake-case wire type from `transactions.ts`,
or run the camelCase adapter over the embedded sub-objects.

## Gate result

```
$ cd frontend && npm run build
✓ built in 4.96s

$ cd frontend && npm test -- --run
Test Files  12 passed (12)
     Tests  281 passed (281)
```

281 tests / 12 files — same as the Step 4 baseline. No tests added
this step (page is a thin TanStack-Query wrapper around an already-
typed client; same justification as Subscriptions and Overview).

## Notes / surprises

- The mockup's "Match" button on the Unmatched Candidates table has no
  backend pair — there's no manual-match endpoint, only auto-detect.
  Dropped that column. The "Re-detect" button at the page header is
  the only way to attempt matching; it's idempotent server-side
  (`payment_service.detect_payments` uses `is_transfer == False` as
  its candidate filter, so already-matched rows are skipped).
- Added an "Action" column with a per-row Unmatch button on the matched
  table, since `unmatchPayment` is a documented endpoint and the
  mockup's matched-table had no destructive action exposed. The button
  shows a `…` spinner only on the row whose mutation is in flight
  (gated on `unmatchM.variables === m.id`).
- `match.checking_transaction.amount` is the BECU debit (negative);
  the page calls `Math.abs(...)` to display a positive currency
  figure, consistent with the mockup. The Chase side's amount has the
  opposite sign — they're the same magnitude by definition (that's
  the match criterion in `payment_service.detect_payments:49`).
- The candidates page-size (200) is not tunable from the UI. If a user
  has more than ~200 unmatched debits/credits that contain "CHASE
  CREDIT CRD" or `type='Payment'`, they would need to detect them in
  batches. Realistically this only matters for a first-time large
  import; deferred.
- Loading and error states are consistent with `Subscriptions.tsx`
  (red box for errors, muted box for loading). Same structure on
  purpose — both pages share a single-resource-with-detect shape.
- `formatDate` is imported but only used in two places (the date cell
  in each table). Kept the call sites consistent with the mockup
  rather than inlining `new Date(s).toLocaleDateString()`.
- `useQueryClient`-driven invalidation uses the broad `["transactions"]`
  prefix instead of the specific
  `["transactions", { is_transfer: false, page_size: 200 }]` key —
  cheaper to maintain when Step 6 adds more transaction queries with
  different param shapes; a single `invalidateQueries({ queryKey:
  ["transactions"] })` will hit them all.

## Files touched

- `frontend/src/api/payments.ts` (NEW)
- `frontend/src/pages/Payments.tsx` (REPLACED — was a 3-line stub)
- `docs/handoff/step-5-payments.md` (NEW — this file)
