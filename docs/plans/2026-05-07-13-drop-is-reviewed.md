# Drop `is_reviewed` from the data model

## Why

`is_reviewed` was meant as an independent "the user has eyeballed this row"
flag — distinct from the category and from `is_verified`. In practice it has
turned into a confusing third state that no UI surface actually drives:

- The Transactions page badge labelled "X unclassified" actually counted
  rows where `is_reviewed=false`, even though most of those rows already
  had a category auto-assigned by the Chase parser at import.
- There is no review-only UI; the only way to flip the flag is to
  re-pick a category from the dropdown, which makes confirming an already
  correct auto-classification clunky.
- Decision (user, this conversation): "if there's a category assigned,
  it should be reviewed" — collapse the two concepts. A row needs the
  user's attention iff `category_id IS NULL`.

Out of scope for this plan:
- The 13 rows the Chase parser maps to the `Uncategorized` category will
  no longer count as "needs attention" after this change. That is fine
  for now; the user can find them by filtering on category=Uncategorized.
- `is_verified` stays. It is a different concept ("category confirmed
  via payment match" etc.) and the Transactions table still renders a
  column for it.

## Scope of change

### Backend

- [ ] Alembic migration: drop `is_reviewed` column from `transactions`.
      New revision file under `backend/alembic/versions/`.
- [ ] `app/models/transaction.py`: remove the column.
- [ ] `app/schemas/transaction.py`: remove `is_reviewed` from
      `TransactionResponse`, `TransactionUpdate`, `BulkUpdate`.
- [ ] `app/services/transaction_service.py`: remove the `is_reviewed`
      filter param from `list_transactions`, the kwarg from
      `update_transaction` / `bulk_update`, and the column writes.
- [ ] `app/routers/transaction_router.py`: drop the `is_reviewed` query
      param, the response field, and the body-field plumbing in PATCH +
      bulk-update.
- [ ] `app/routers/transaction_router.py`: add a new query param
      `is_uncategorized: bool | None` to `GET /api/transactions` so the
      frontend can ask for "category_id IS NULL" rows. Keep naming
      consistent with the existing `is_verified` / `is_transfer` flags.
- [ ] `app/services/transaction_service.py`: implement the
      `is_uncategorized` filter (translates to
      `Transaction.category_id.is_(None)` / `is_not(None)`).
- [ ] `app/routers/payment_router.py`: drop `is_reviewed` from the
      response payload it builds.
- [ ] `backend/tests/test_models.py`: drop the `is_reviewed` assertion.
- [ ] `backend/tests/test_account_migration.py`: drop `is_reviewed` from
      the raw INSERTs (these tests build a fixture DB by hand).
- [ ] Run pytest, fix any other test fallout.

### Frontend

- [ ] `frontend/src/api/transactions.ts`: remove `isReviewed` from the
      public `Transaction` shape, `ListTransactionsParams`,
      `TransactionUpdatePayload`, `BulkUpdatePayload`, the wire type,
      the adapter, and the URL serializer. Add `isUncategorized?: boolean`
      to `ListTransactionsParams` and serialize it as `is_uncategorized`.
- [ ] `frontend/src/pages/Transactions.tsx`:
  - `categoryQueryParam(UNCLASSIFIED)` → returns
    `{ isUncategorized: true }` instead of `{ isReviewed: false }`.
  - Unclassified-count side query → query with
    `{ isUncategorized: true, pageSize: 1 }` instead of
    `{ isReviewed: false }`.
  - `updateM`: drop the implicit `isReviewed: categoryId != null`.
  - `bulkM`: drop `isReviewed: true`.
- [ ] Run `tsc --noEmit`; fix anything else that referenced the field.

### Docs

- [ ] `docs/SPEC.md`:
  - Remove the `is_reviewed` bullet from the transactions field list
    (line 54).
  - Remove the "Reviewed marking" bullet from the Classification UI
    section (line 92).
  - Adjust the "Filter-driven workflow" bullet (line 91) so it reads
    "Filter unclassified transactions…" — no longer "or unverified".

## Verification

- [ ] `cd backend && pytest` passes.
- [ ] `cd frontend && npx tsc --noEmit` clean.
- [ ] Manual: start dev server, load Transactions page, confirm:
  - Badge still shows a count and clicking it filters to uncategorised
    rows (now `category_id IS NULL`, expected ~130).
  - Filtering by a real category still works.
  - Setting a category on a row makes it disappear from the
    Unclassified filter.
  - Bulk-assign still works.
- [ ] `sqlite3 data/finance.db "PRAGMA table_info(transactions);"` no
      longer lists `is_reviewed`.

## Notes

- Backup at `data/finance.db.bak.20260507-151829` already exists from
  earlier work; the migration is destructive (drops a column) but
  reversible via the backup.
- No data migration required — dropping the column loses information
  but the user has explicitly said they don't want that information
  any more.

## Review

Implemented in one pass:

- Alembic revision `7e2c1a9d4f8b` (parents `61d1164fa063`) drops the
  column via `batch_alter_table` and has a downgrade that recreates it
  with `server_default 0`.
- Backend model / schemas / service / routers all stripped of
  `is_reviewed`. Service grew an `is_uncategorized: bool | None` filter
  that translates to `category_id IS / IS NOT NULL`. Router exposes the
  same param.
- Frontend `Transaction`, `ListTransactionsParams`,
  `TransactionUpdatePayload`, `BulkUpdatePayload`, the wire type, and
  the URL serializer all lost `isReviewed`; gained `isUncategorized` on
  the list params side. `Transactions.tsx` now sends
  `{ isUncategorized: true }` for the unclassified filter and the
  side-query that drives the badge count.
- `docs/SPEC.md` updated: dropped the `is_reviewed` field bullet and
  the "Reviewed marking" workflow bullet, rewrote the "Filter-driven
  workflow" bullet so it defines unclassified as `category_id IS NULL`.
- `backend/tests/test_account_migration.py` left alone — its INSERTs
  target the historical `a3f1c2b8d4e5` revision where `is_reviewed`
  still existed; touching them would have falsified the migration test.
- `backend/tests/test_models.py` lost the `is_reviewed` assertion.

Verification:

- `pytest backend/tests`: 336 passed.
- `tsc --noEmit` (frontend): clean.
- `PRAGMA table_info(transactions)` confirms column gone.
- Database after migration: 118 rows with `category_id IS NULL` —
  these become the new "needs attention" set the Transactions page
  unclassified badge surfaces.

Deferred (not part of this plan, but worth noting):

- The Chase parser still maps "Professional Services" → Uncategorized
  category (`backend/app/parsers/chase_cc.py:33`). Those 13 rows are no
  longer in the unclassified queue. Earlier in the conversation I
  flagged remapping it to Bills & Utilities; user has not decided.
- The `is_verified` column is still present and still has no UI that
  drives it. That is a separate clean-up.
