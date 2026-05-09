# Payments: CC-Side List + Drop Matching Infrastructure

## Parent spec

`docs/specs/2026-05-08-04-payments-redesign.md`

## What to build

End-to-end vertical slice replacing the matching-centric Payments page with a CC-side-as-source-of-truth list. The page now shows a list of every positive-amount transaction on a `credit_card` account, scoped by a page-level account selector ("All CCs" by default) and the global date range picker. The matching infrastructure (`payment_match` table, auto-matcher, detect endpoint, matched/unmatched table UIs) is fully removed. Existing `is_transfer = true` flags on transactions are preserved untouched. The chart is **not** built in this plan.

## Type

AFK

## Blocked by

None — can start immediately.

## User stories addressed

- User story 1
- User story 4
- User story 5
- User story 6
- User story 7

## Acceptance criteria

- [ ] `payment_match` table is dropped via alembic migration
- [ ] `payment_match` model file deleted; no Python references remain (grep clean)
- [ ] Auto-matcher is no longer invoked from the import pipeline
- [ ] `POST /api/payments/match` (or `/detect`) endpoint and its handler are deleted
- [ ] `GET /api/payments` now returns CC-side positive-amount transactions with optional `account_id` filter and date range, sorted date desc
- [ ] Existing `is_transfer = true` flags on transactions are unchanged after the migration
- [ ] Frontend Payments page shows: account selector ("All CCs" default + each `credit_card` account), single list of CC payments with date / account / vendor / amount columns
- [ ] Old "Matched payments" and "Unmatched candidates" tables are removed from the page
- [ ] List respects the global date range picker
- [ ] Backend boundary tests cover the new `/api/payments` shape (single CC, multi-CC, range edges, account filter)
- [ ] Alembic up + down migrations round-trip cleanly against the test DB
- [ ] Type-check, lint, frontend build all pass

## Owns

- `backend/app/models/payment_match.py` — DELETE
- `backend/app/models/__init__.py` — remove `PaymentMatch` export
- `backend/app/services/payment_service.py` — remove matcher logic; rewrite list function to return CC-side positive txns
- `backend/app/routers/payment_router.py` — remove `detect`/`match` endpoint; redefine `GET /api/payments`
- `backend/app/schemas/payment*.py` — adjust schemas for new response shape; drop matched-pair schemas
- `backend/alembic/versions/<new>_drop_payment_match.py` — new down-migration that drops the table
- Wherever the import pipeline calls the auto-matcher (likely `backend/app/services/import_service.py` or equivalent) — remove the call
- `frontend/src/pages/Payments.tsx` — replace tables with the new list + account selector
- `frontend/src/api/payments.ts` — adjust client to new endpoint shape; remove `detectPayments`
- `backend/tests/` — update or replace tests touching matcher/detect; add new tests for redefined `/api/payments`

## Must not touch

- `frontend/src/components/budget/` — owned by plans `2026-05-09-03`, `2026-05-09-04`, `2026-05-09-05`
- `frontend/src/lib/format.ts` — owned by plan `2026-05-09-06`
- The not-yet-built `/api/payments/series` endpoint — owned by plan `2026-05-09-02`
- The not-yet-built charges-vs-payments chart component — owned by plan `2026-05-09-02`
- Any transaction with `is_transfer = true` — flags must be preserved as-is

## Defines interfaces

- `GET /api/payments` response shape — consumed by plan `2026-05-09-02` (the chart page reads the same list)
- `payments` API client function in `frontend/src/api/payments.ts` — consumed by plan `2026-05-09-02`

## Pattern exemplar

- **Follow the pattern in**: `backend/app/routers/payment_router.py` (existing structure) and adjacent routers like `backend/app/routers/budget_router.py` — match router style, schema usage, and dependency-injection idioms.
- **MUST follow the pattern in**: most-recent alembic migration under `backend/alembic/versions/` — match migration format, `upgrade`/`downgrade` shape, revision-chaining.

## Tasks

- [ ] Inventory: grep for `payment_match`, `PaymentMatch`, `detectPayments`, `match_payments`, auto-matcher symbol(s) — capture every call site
- [ ] Backend: write alembic migration dropping `payment_match` table; ensure `downgrade` recreates it (preserves the round-trip rule)
- [ ] Backend: remove auto-matcher invocation from import pipeline; delete the matcher service function(s)
- [ ] Backend: rewrite `payment_service` list function to query `transactions` joined to `accounts` where `accounts.type = 'credit_card'` AND `amount > 0`, with `account_id` filter and `start_date`/`end_date` filters
- [ ] Backend: redefine `GET /api/payments` route handler; update response schema
- [ ] Backend: delete the detect/match POST endpoint and its handler
- [ ] Backend: delete `payment_match` model file and registry export
- [ ] Backend: replace existing payment-router tests with tests for the new shape (single-CC, multi-CC, range edges, account filter)
- [ ] Frontend: rewrite `frontend/src/api/payments.ts` to match new endpoint shape; remove detect client
- [ ] Frontend: rewrite `frontend/src/pages/Payments.tsx` with account selector + list (no chart yet)
- [ ] Frontend: ensure list reads global date range picker the same way other pages do (look at `Transactions.tsx` for the pattern)
- [ ] Run alembic upgrade + downgrade end-to-end against test DB; confirm `is_transfer` flags untouched
- [ ] Run backend tests, frontend type-check, frontend build

## Implementation notes

- **Sign of "charges" is preserved**: the list shows only positive amounts (CC payments + returns). Charges (negative amounts on CC) are visible elsewhere via Transactions; not on this page.
- **`is_transfer` preservation**: do NOT include any `UPDATE` on `transactions.is_transfer` in the migration. Only the `payment_match` table goes.
- **Account selector wiring**: fetch `accounts` filtered to `type = 'credit_card'`. "All CCs" is the default option (no `account_id` query param sent).
- **Currency precision on this page**: 0 decimals (the spec calls this out; it's coordinated with plan `2026-05-09-06`, but the helper change there is independent — this plan should call `formatCurrency` with no extra args, picking up whatever default exists).
