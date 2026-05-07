# Step 6 handoff — Transactions page (Phase 5 of mockup-page port)

Plan: `docs/plans/2026-05-07-08-port-mockup-pages.md` §Phase 5 (all
checklist items done).

## What landed

- `frontend/src/api/transactions.ts` — REWRITTEN. Now exposes the canonical
  camelCase `Transaction` type plus `listTransactions`, `getTransaction`,
  `updateTransaction`, `bulkUpdateTransactions`. Snake_case wire types
  (`TransactionResponseRaw`, `PaginatedTransactionsRaw`) are private to
  the file; the adapter `toTransaction` is the only place that touches
  them. Old public exports (`TransactionResponse`, `PaginatedTransactions`,
  `ListTransactionsParams` in snake_case) are removed.
- `frontend/src/api/categories.ts` — NEW. `listCategories`,
  `createCategory`, `updateCategory`, `deleteCategory`. Snake_case at the
  API boundary (matches `subscriptions.ts`); the page consumes
  `is_system` / `transaction_count` directly.
- `frontend/src/pages/Transactions.tsx` — REPLACED the 3-line stub. Full
  page with paginated table, search, category filter, inline category
  edit, bulk-assign, expandable detail row with similar-transactions
  query.
- `frontend/src/pages/Overview.tsx` — EDITED. Migrated `is_transfer →
  isTransfer`, `is_transfer/page_size param keys → isTransfer/pageSize`,
  `TransactionResponse → Transaction`. No logic changes.
- `frontend/src/pages/Payments.tsx` — EDITED. Migrated `raw_description →
  rawDescription`, `account_name → account`, param keys
  `is_transfer/page_size → isTransfer/pageSize`, `TransactionResponse →
  Transaction`. PaymentMatchResponse access (`m.checking_transaction.*`)
  stays snake_case — that comes from `payments.ts`, not `transactions.ts`.

No changes to `_client.ts`, `format.ts`, `payments.ts`, or any other API
client / page.

## Public `Transaction` type

CamelCase fields exposed to the rest of the app:

```
id: number
date: string                 // YYYY-MM-DD
vendor: string
rawDescription: string
memo: string                 // null → ""
amount: number
category: string             // category_name; null → ""
categoryId: number | null
account: string              // account_name
accountId: number
type: string | null          // intentionally not narrowed past mockup's union
verified: boolean            // is_verified
isTransfer: boolean
isReviewed: boolean
postDate: string             // post_date; null → date (so formatDate is safe)
sourceFile: string
```

Adapter normalisations: `category_name`/`memo` `null → ""` (mockup's
truthy checks and `.includes` work without guards), `post_date null →
date` (detail panel always has a date to format).

## Adapter strategy

- `toTransaction(raw)` is private to `transactions.ts`. Component code
  never sees snake_case from this client.
- Outbound payloads (`TransactionUpdatePayload`, `BulkUpdatePayload`)
  are camelCase in; the function bodies translate to snake_case bodies
  (`category_id`, `is_verified`, `is_reviewed`) before the fetch.
- `ListTransactionsParams` is camelCase in; URLSearchParams keys are
  the snake_case backend names.
- `id: number` (not the mockup's `string`) — backend ids are integers
  and mutation routes expect numeric path params. `Set<string>` in the
  mockup became `Set<number>` for `selectedRows`.

## Server-supported filters

Read from `backend/app/routers/transaction_router.py`. Server accepts:
`account_id`, `category_id`, `vendor`, `date_from`, `date_to`,
`amount_min`, `amount_max`, `is_verified`, `is_reviewed`, `is_transfer`,
`search`, `sort_by`, `sort_dir`, `page`, `page_size` (max 200).

This page wires:
- `search` → server (full-text on vendor/raw_description/memo)
- category filter → server `category_id` (and `is_reviewed=false` for
  the special "Unclassified" option)
- pagination → server (`page=1..N`, `page_size=25`)
- sort → fixed `date desc` for v1

The "unclassified count" badge is computed client-side over the current
page only (label says "N unclassified on page" to be honest about
that). A true global count would need either a separate
`?is_reviewed=false` count query or a backend stats field; deferred.

The mockup's "free-text search on memo" works via the server `search`
param (the backend already covers vendor + raw_description + memo).

## Similar-transactions strategy

Per-row expand triggers a child `<SimilarTransactions vendor={t.vendor}
excludeId={t.id} />` component, which runs an extra
`useQuery(["transactions", "similar", vendor], () =>
listTransactions({ vendor, pageSize: 5 }))`. Exclude the source row
client-side (vendor filter on the server isn't a "WHERE id != ?"
filter). Fetch 5, show up to 4.

Reasons for the extra-query approach (rather than reusing the page
list):
- Page list is sorted by date desc for the whole table; "similar by
  vendor" for an old row would otherwise need a client-side scan of
  unbounded history.
- Vendor filter is server-supported (`?vendor=...`), so it's cheap
  and the result is keyed by vendor — re-expanding the same vendor
  hits the cache.
- Keeps page query payload small (25 rows).

## Mutation invalidation keys

| Mutation                  | Keys invalidated                                    |
| ------------------------- | --------------------------------------------------- |
| `updateTransaction`       | `["transactions"]` (broad prefix)                   |
| `bulkUpdateTransactions`  | `["transactions"]` (broad prefix); also clears `selectedRows` |

The broad `["transactions"]` prefix matches `["transactions", "list",
…]`, `["transactions", "similar", …]`, `["transactions", "for-top-vendors",
…]` (Overview), and `["transactions", { is_transfer: false, page_size:
200 }]` (Payments candidates). Same convention as Step 5.

`["categories"]` is NOT invalidated by these mutations — category
counts are stale until the next refetch, but no user-visible feature
reads `transaction_count` from the categories list today.

## Overview / Payments call-site changes

Overview (`frontend/src/pages/Overview.tsx`):
- Type rename: `TransactionResponse → Transaction` (1 import + 2 helper
  signatures).
- Field renames: `t.is_transfer → t.isTransfer` (2 sites, in
  `buildMonthlyIncome` and `buildVendorTotals`).
- Param renames: `is_transfer → isTransfer`, `page_size → pageSize` in
  the `listTransactions` call inside `txnsQ.queryFn`.

No logic, layout, or query-key changes. Query key still serialises the
old snake_case shape for stability with cached entries.

Payments (`frontend/src/pages/Payments.tsx`):
- Type rename: `TransactionResponse → Transaction` (1 import + 2 helper
  signatures: `isCheckingCandidate`, `isCcCandidate`).
- Field renames on `listTransactions` results: `t.raw_description →
  t.rawDescription` (×2), `t.account_name → t.account` (×1).
- Param renames: `is_transfer → isTransfer`, `page_size → pageSize` in
  the `listTransactions` call inside `candidatesQ.queryFn`.

`PaymentMatchResponse` access (`m.checking_transaction.account_name`,
`m.cc_transaction.account_name`, `m.checking_transaction.amount`,
`m.checking_transaction.date`, `m.checking_transaction.id`,
`m.cc_transaction.id`) stays snake_case. That sub-shape comes from
`payments.ts`, which intentionally keeps a local `EmbeddedTransaction`
type per Step 5's decision.

## Gate result

```
$ cd frontend && npm run build
✓ built in 4.90s

$ cd frontend && npm test -- --run
Test Files  12 passed (12)
     Tests  281 passed (281)
```

281/281, same as Step 5 baseline. No tests added — page is a thin
TanStack-Query wrapper around the typed client, same justification as
Subscriptions / Overview / Payments.

## Notes / surprises

- `Transaction.type` typed as `string | null` rather than the mockup's
  `"Sale" | "Payment" | "Return"` union. The backend column is a free
  string (`type` in `transactions` table) with no DB-level enum
  constraint; narrowing risks a runtime type error on legacy rows. The
  detail panel renders `t.type ?? "—"` to handle the null.
- The mockup's category filter included a hard-coded list of 17 names
  (`mockup/src/data/mockData.ts`). In the real app, `/api/categories`
  drives the dropdown. The "Unclassified" option is special-cased: it
  doesn't map to a `category_id`, but to `is_reviewed=false` (which is
  the closest server filter — `category_id IS NULL` isn't a documented
  query param). For rows that have a category but were marked unreviewed
  by the user, this overshoots; for rows with no category, this matches
  the historical convention because the backend's auto-categoriser
  flips `is_reviewed=true` when it assigns a category. Acceptable for
  v1 — true `category_id IS NULL` filtering would need a backend
  change.
- Inline category edit also flips `is_reviewed=true` (so the row
  immediately drops out of the Unclassified filter). Setting category
  back to "Unclassified" (categoryId=null) does NOT flip `is_reviewed`
  back, since users explicitly returning a row to the bucket presumably
  still want it in their review list.
- The mockup wrapped each row + detail row in a JSX fragment with no
  `key` (a React warning); switched to `<Fragment key={t.id}>` plus
  inner rows without keys to silence the warning.
- Bulk-assign UI: the dropdown auto-fires on selection (no separate
  "Apply" button). Same UX as the mockup's row-level dropdown. Selected
  rows are cleared after a successful bulk update.
- The "verified" check column is read-only here. The mockup had no
  toggle and the backend `PATCH` does accept `is_verified`, but
  spec'ing the verify-flow UX is out of scope for this slice.
- Pagination is server-driven: `total / pageSize` gives `totalPages`.
  Clicking next/prev advances `filters.page` and re-runs the query.
  Search and category changes reset to page 1.
- A query-key invalidation broadly hits all `["transactions", ...]`
  caches — including unrelated pages' queries — but TanStack Query is
  fine with this and refetches happen lazily on next observation.

## Files touched

- `frontend/src/api/transactions.ts` (REWRITTEN)
- `frontend/src/api/categories.ts` (NEW)
- `frontend/src/pages/Transactions.tsx` (REPLACED — was 3-line stub)
- `frontend/src/pages/Overview.tsx` (EDITED — camelCase migration)
- `frontend/src/pages/Payments.tsx` (EDITED — camelCase migration)
- `docs/handoff/step-6-transactions.md` (NEW — this file)
