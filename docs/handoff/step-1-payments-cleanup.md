# Step 1: Payments CC-side list + matcher cleanup

Implements `docs/plans/2026-05-09-01-payments-list-and-cleanup.md`.

## Files deleted

- `backend/app/models/payment_match.py`
- `backend/tests/test_payment_matching.py`

## Files rewritten

- `backend/app/services/payment_service.py` — sole public function `list_cc_payments(db, *, account_id, start_date, end_date)`; matcher / `unmatch` / `list_matches` removed.
- `backend/app/routers/payment_router.py` — single `GET /api/payments` route; `POST /detect` and `DELETE /{match_id}` removed.
- `backend/app/schemas/payment.py` — exports only `PaymentListItem`; `PaymentMatchResponse` and `DetectionResultResponse` removed.
- `frontend/src/api/payments.ts` — `listPayments(params)` only; `detectPayments` and `unmatchPayment` removed.
- `frontend/src/pages/Payments.tsx` — single list with "All CCs" + per-CC selector; matched/unmatched tables and Re-detect button removed.

## Files edited

- `backend/app/models/__init__.py` — drop `PaymentMatch` import + export.
- `backend/app/schemas/__init__.py` — drop `PaymentMatchResponse` / `DetectionResultResponse`, add `PaymentListItem`.
- `backend/app/services/ingestion.py` — remove `from app.services.payment_service import detect_payments`, drop the `detection = detect_payments(self._db)` call site, drop `matches_found` / `total_matches` from `IngestReport`, update module docstring.
- `backend/app/routers/import_router.py` — drop `matches_found` / `total_matches` keys from both response payloads (the only consumers of the dropped `IngestReport` fields).
- `backend/tests/test_models.py` — remove `PaymentMatch` import, the `TestPaymentMatchModel` class, and `payment_matches` from `TestMigrationAppliesCleanly.test_all_tables_created` expected set.

## New migration

- Revision id: `e4b1a92f08c7`
- Filename: `backend/alembic/versions/e4b1a92f08c7_drop_payment_match.py`
- `down_revision`: `d3e91a4f7c52`
- `upgrade()`: `op.drop_table('payment_matches')`
- `downgrade()`: recreates `payment_matches` (id PK, two FKs to `transactions.id`, `matched_at` DateTime with `CURRENT_TIMESTAMP` default) — matches the original schema in `b762a8a2c851_initial_schema.py` exactly.
- Round-tripped locally: `upgrade head` -> `downgrade -1` -> `upgrade head` all succeed.
- Migration is schema-only — `transactions.is_transfer` flags are not touched.

## New `/api/payments` shape

Request:

```
GET /api/payments?account_id=<int>&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
```

All three query params are optional. `account_id` absent means "All CCs". Date bounds are inclusive on `transactions.date`.

Response — array of objects, sorted `date DESC, id DESC`:

```json
[
  {
    "id": 1842,
    "date": "2025-04-15",
    "account_id": 7,
    "account_name": "Chase CC",
    "vendor": "Payment Thank You-Mobile",
    "amount": 1245.32
  },
  {
    "id": 1801,
    "date": "2025-04-02",
    "account_id": 9,
    "account_name": "Amex Gold",
    "vendor": "Online Payment",
    "amount": 312.50
  }
]
```

Filter: `accounts.type = 'credit_card'` AND `transactions.amount > 0`. `amount` is always positive on the wire.

## Import pipeline after the change

`IngestionService.ingest` now does exactly: file-hash dedup -> per-file parse / row-hash dedup / persist / commit. The post-pass `detect_payments(self._db)` call is gone, as are the `matches_found` / `total_matches` fields on `IngestReport`. Newly imported checking-side CC payments are no longer auto-flagged as transfers; users classify them manually via the existing transactions UI (or via the Transfers category, which is `exclude_from_budget=true` after `d3e91a4f7c52`). Existing `is_transfer = true` rows from prior matcher runs are preserved as-is.

## Tests added / replaced

- Deleted `backend/tests/test_payment_matching.py` (matcher-centric).
- Added `backend/tests/test_payment_router.py` covering the new shape:
  - single CC account returns positives only (negatives + zeros excluded);
  - multi-CC aggregation when no `account_id` filter;
  - `account_id` narrows correctly;
  - non-credit-card accounts excluded;
  - inclusive date range at both edges;
  - `start_date` only / `end_date` only;
  - empty result when no CC accounts;
  - response schema is exactly `{id, date, account_id, account_name, vendor, amount}`;
  - `is_transfer = true` flags preserved (smoke check);
  - stable sort `date DESC, id DESC` within same date.
- `backend/tests/test_models.py`: dropped the `TestPaymentMatchModel` class and `payment_matches` from `test_all_tables_created` expected tables.

## Gate results

- `cd backend && uv run ruff check .` -> pass
- `cd backend && uv run ruff format --check .` -> pass (after auto-formatting the three new/rewritten files)
- `cd backend && uv run pytest -q` -> 548 passed
- `cd frontend && npm run build` -> succeeds (1 unrelated chunk-size warning)
- `cd frontend && npm test -- --run` -> 344 passed across 24 test files
- `alembic upgrade head` / `downgrade -1` / `upgrade head` round-trip -> all succeed

## Judgment calls / surprises

- Worktree was forked from a stale main (`8a30ddc`, 15 commits behind tip). The plan/spec/migration `d3e91a4f7c52` only existed on tip. Did `git reset --hard main` to align (no worktree-only commits to lose) before starting work; verified via `git log main..HEAD` empty before reset.
- `IngestReport.matches_found` / `total_matches` had two consumers beyond `ingestion.py`: `import_router.py`'s two response payloads. Dropped from the response since they're meaningless after matcher removal. The frontend `useImportFiles` consumer (`frontend/src/api/imports.ts`, etc.) does not reference these keys.
- Frontend `PaymentListItem` deliberately keeps snake_case to mirror the wire (same convention the previous `EmbeddedTransaction` used). Step 6 owns the camelCase canonical `Transaction` shape; we don't preempt it here.
- `formatCurrency(amount)` is called with no extra args per the plan; precision tweak (0 decimals on this page) lands in step 4.
- The page-level account selector reads `listAccounts(false)` and filters client-side to `type === "credit_card"` — same pattern other pages use rather than introducing a server-side filter.
