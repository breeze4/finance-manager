# Accounts Foundation

## Parent spec

`docs/specs/2026-05-06-02-balance-snapshots.md`

## What to build

Promote "account" from a freeform string on `transactions` to a first-class `accounts` table. End-to-end vertical slice: model + migration (with hardcoded backfill of the two existing strings + transactions FK rewrite), CRUD API, frontend Accounts page with new/edit/archive/delete actions, sidebar entry. After this lands the existing CSV transaction import path continues to work; new transaction imports look up `account_id` by string with auto-create fallback.

This plan does NOT touch balance snapshots, net worth, or the Net Worth page — those live in plans 06 and 07.

## Type

AFK

## Blocked by

None — can start immediately.

## User stories addressed

From the parent spec:

- §"Data Model — accounts" — single accounts table, fields name/type/institution/is_archived
- §"Data Model — transactions (migrated)" — transaction.account string → account_id FK
- §"Backend — Alembic migration" — hardcoded two-row backfill, FK rewrite
- §"Backend — Existing transaction import_service" — string lookup + auto-create
- §"API — /accounts endpoints" — list, create, patch, archive, delete
- §"Frontend — Accounts page"
- §"Frontend — Sidebar" — add "Accounts" entry
- §"Resolved Decisions" — hardcoded backfill (Chase CC 7397 → credit_card / Chase; BECU Checking → checking / BECU)

## Acceptance criteria

- [x] `accounts` table exists with columns: id, name, type, institution (nullable), is_archived (default false), created_at, updated_at
- [x] `accounts.type` is constrained to the enum: `checking`, `savings`, `credit_card`, `brokerage`, `retirement`, `asset`
- [x] Alembic migration runs forward cleanly on a database containing existing transactions; produces exactly two seeded `accounts` rows. **Names corrected from the spec's "Chase CC 7397" placeholder to "Chase CC" / credit_card / Chase and "BECU Checking" / checking / BECU — these match the strings the existing `ChaseCcParser` and `BecuCheckingParser` actually emit, which is what real DB rows contain.**
- [x] After migration, every existing `transactions` row has a non-null `account_id` matching one of the two seeded accounts; the old `account` string column is gone
- [x] `transactions.account_id` has an index named `ix_transactions_account_id`
- [x] Existing `import_service.import_file` continues to import a Chase CC or BECU CSV without manual setup; if the parser's emitted account string matches an existing `accounts.name`, the row is reused; otherwise a new row is created with type guessed from the parser class (`ChaseCcParser` → credit_card, `BecuCheckingParser` → checking)
- [x] `GET /api/accounts` returns a list; `?include_archived=false` (default) hides archived rows; `?include_archived=true` returns all
- [x] `POST /api/accounts` creates with body `{ name, type, institution? }`, returns 201 + the row
- [x] `PATCH /api/accounts/{id}` edits name/type/institution, returns the updated row
- [x] `POST /api/accounts/{id}/archive` sets `is_archived = true`, returns 204
- [x] `DELETE /api/accounts/{id}` hard-deletes; cascades nothing in this plan (snapshot table doesn't exist yet, but FK behavior on `transactions` should restrict — deletion of an account with transactions returns 409). Returns 204 on success
- [x] Frontend `Accounts` page renders the list, supports new/edit/archive/delete with confirmation modals
- [x] Sidebar shows "Accounts" entry routed to `/accounts`
- [x] All existing backend tests pass after the schema change
- [x] New tests pass: migration test + accounts API test

## Owns

Backend:

- `backend/app/models/account.py` — new `Account` SQLAlchemy model
- `backend/app/models/__init__.py` — export `Account`
- `backend/app/models/transaction.py` — replace `account: str` with `account_id: int` FK; add `account` relationship
- `backend/alembic/versions/<hash>_accounts_and_transaction_fk.py` — new migration (create accounts, seed two rows, add account_id, populate by string match, drop account string, rename index)
- `backend/app/schemas/account.py` — new `AccountCreate`, `AccountUpdate`, `AccountResponse`, `AccountType` enum
- `backend/app/schemas/transaction.py` — `TransactionResponse.account` field becomes `account_id: int` + `account_name: str` (joined for display); `BulkUpdateRequest` if it filters by account is updated to filter by `account_id`
- `backend/app/routers/account_router.py` — new router (`/api/accounts` prefix)
- `backend/app/routers/transaction_router.py` — `_txn_to_response` updated to populate `account_id` + `account_name`; any account-filter query params switched to `account_id`
- `backend/app/main.py` — `app.include_router(account_router.router)`
- `backend/app/services/import_service.py` — `import_file` resolves `account_id` from `RawTransaction.account` (lookup by name; auto-create with type guessed from `parser` class if missing) before constructing `Transaction`
- `backend/app/services/transaction_service.py` — `get_category_name` is fine; if any function filters by account string, switch to FK
- `backend/app/services/stats_service.py`, `app/services/payment_service.py`, `app/services/budget_service.py`, `app/services/forecast_service.py`, `app/services/subscription_service.py` — grep for `.account` field reads; update any string compares to FK lookups
- `backend/tests/test_account_migration.py` — new (Alembic upgrade test against fixture DB with sample transactions)
- `backend/tests/test_accounts_api.py` — new (CRUD smoke + archive + delete behaviors)
- `backend/tests/test_models.py`, `test_transaction_api.py`, `test_import_service.py`, `test_payment_matching.py`, `test_classification.py`, `test_budget_crud.py`, `test_stats_api.py`, `test_subscriptions.py`, `test_rollover_budgets.py`, `test_budget_analysis.py`, `test_budget_suggestions.py`, `test_forecast.py`, `test_parsers.py`, `conftest.py` — update fixtures and any direct `Transaction(account="...")` construction to use `account_id` (or to create the seeded `Account` row first)

Frontend:

- `frontend/src/api/accounts.ts` — new typed client (`listAccounts`, `createAccount`, `updateAccount`, `archiveAccount`, `deleteAccount`)
- `frontend/src/pages/Accounts.tsx` — new CRUD page
- `frontend/src/components/AccountFormModal.tsx` — new (used for both create and edit)
- `frontend/src/components/AppSidebar.tsx` — add "Accounts" entry (icon: `Wallet` or `Landmark` from lucide-react)
- `frontend/src/App.tsx` — register `/accounts` route

## Must not touch

- `backend/app/models/balance_snapshot.py` — owned by plan `2026-05-06-06-balance-snapshot-entry.md`
- `backend/app/routers/snapshots_router.py` — owned by plans `06` and `07`
- `backend/app/services/net_worth_service.py` — owned by plan `2026-05-06-07-net-worth-chart.md`
- `frontend/src/pages/NetWorth.tsx`, `frontend/src/components/SnapshotBatchModal.tsx`, `frontend/src/api/snapshots.ts` — owned by plan `06`
- `mockup/` — legacy, do not modify
- `docs/plans/backend.md`, `docs/plans/frontend.md`, `docs/plans/todo.md`, `docs/plans/spec-backport.md` — legacy plans

## Defines interfaces

These are consumed by plans 06 and 07 — do not break them:

- `Account` model in `backend/app/models/account.py` — fields `id`, `name`, `type` (enum), `institution`, `is_archived`. Consumed by plan `06` (FK target) and plan `07` (aggregation grouping by type).
- `accounts` table in the migration — same.
- `AccountResponse` Pydantic schema in `backend/app/schemas/account.py` — fields `id`, `name`, `type`, `institution`, `is_archived`, `created_at`, `updated_at`. Consumed by plan `06` (`/net-worth/latest` returns embedded account name) and the frontend.
- `transactions.account_id` FK column — consumed throughout the codebase by every existing service.
- `/api/accounts` REST contract — consumed by the frontend in this plan and (read-only) by plan `06`'s SnapshotBatchModal which lists active accounts.

## Pattern exemplar

- **MUST follow the pattern in**: `backend/app/models/category.py` — single-table SQLAlchemy model with Mapped columns, indexes, table_args. Account is a sibling.
- **MUST follow the pattern in**: `backend/app/routers/category_router.py` — list / create (201) / patch / delete (204) shape. Add the archive endpoint as a sibling of the rules-router's `/{rule_id}/apply` extension pattern (POST to a sub-route).
- **MUST follow the pattern in**: `backend/app/schemas/category.py` — Pydantic Create/Update/Response triple, `model_config = {"from_attributes": True}`.
- **MUST follow the pattern in**: `backend/alembic/versions/b762a8a2c851_initial_schema.py` — Alembic table creation style. For data steps (seeding two rows, backfilling FK, dropping old column) use `op.execute(sa.text(...))` and `op.bulk_insert` with explicit table definitions; the existing initial migration shows the table-construction pattern.
- **MUST follow the pattern in**: `backend/tests/test_transaction_api.py` — FastAPI TestClient + sqlite fixture pattern for the accounts API test.
- **Follow the pattern in**: `mockup/src/pages/Transactions.tsx` (only as a layout/style reference) and the existing `frontend/src/pages/CoastFire.tsx` for shadcn page composition. The Accounts page is a CRUD list — most similar to the rules management UI elsewhere (does not yet exist; build from scratch following shadcn `Table` + `Dialog` + `Button` primitives already present in `frontend/src/components/ui/`).
- **Follow the pattern in**: `frontend/src/components/AppSidebar.tsx` — sidebar nav-item conventions; insert the new entry data-driven if the array is structured that way, or add a new `<NavLink>` near the bottom otherwise.

## Tasks

Backend:

- [x] Create `Account` model with type enum (use SQLAlchemy `Enum` constrained to the six values) and unique constraint on `name`
- [x] Add `Account` to `models/__init__.py`
- [x] Create `schemas/account.py` with `AccountType` (str enum), `AccountCreate`, `AccountUpdate`, `AccountResponse`
- [x] Update `models/transaction.py`: drop `account` string column, add `account_id` FK + `account` relationship; rename index
- [x] Update `schemas/transaction.py`: `TransactionResponse` carries `account_id: int` + `account_name: str`; remove the `account: str` field
- [x] Update `routers/transaction_router._txn_to_response` to fill `account_name` from `txn.account.name`
- [x] Grep all services for `.account` field reads and `account=` query filters; switch each to `account_id` / `account.has(name=...)`
- [x] Generate Alembic migration. Hand-edit it so the steps run in this order:
   1. `op.create_table('accounts', ...)` with the type enum + unique-name constraint
   2. `op.bulk_insert` two rows: Chase CC 7397 / credit_card / Chase; BECU Checking / checking / BECU
   3. `op.add_column('transactions', sa.Column('account_id', sa.Integer(), sa.ForeignKey('accounts.id'), nullable=True))`
   4. `op.execute("UPDATE transactions SET account_id = (SELECT id FROM accounts WHERE accounts.name = transactions.account)")`
   5. Assert no rows have null `account_id` (raise if so)
   6. `op.alter_column('transactions', 'account_id', nullable=False)`
   7. `op.drop_index('ix_transactions_account')`, `op.drop_column('transactions', 'account')`
   8. `op.create_index('ix_transactions_account_id', 'transactions', ['account_id'])`
   9. Downgrade is best-effort (recreate column, copy names back, drop FK)
- [x] Update `services/import_service.py`: add `_resolve_account_id(db, raw_account_name, parser)` that returns the FK; auto-creates an Account row with type guessed from `parser.__class__.__name__` mapping (`ChaseCcParser` → credit_card, `BecuCheckingParser` → checking) and institution likewise
- [x] Create `routers/account_router.py` with: `GET /` (with `include_archived` query param), `POST /`, `PATCH /{id}`, `POST /{id}/archive`, `DELETE /{id}` (returns 409 if any transactions reference this account; otherwise hard-delete)
- [x] Register the router in `main.py`
- [x] Write `tests/test_account_migration.py`: spin up an in-memory sqlite, apply the previous migration, insert sample transactions with the two known account strings, run this migration, assert seeded accounts + correct FK on every transaction
- [x] Write `tests/test_accounts_api.py`: list, create, patch, archive, delete (success + 409 with referencing transactions)
- [x] Update existing tests' fixtures (`tests/conftest.py` if it has any `Transaction(account=...)` factory) to seed an Account first and use `account_id`
- [x] Run the full test suite; fix any drift

Frontend:

- [x] Add `frontend/src/api/accounts.ts` with React-Query-friendly fetcher functions
- [x] Add `frontend/src/components/AccountFormModal.tsx` (shadcn `Dialog` with name input, type select, institution input)
- [x] Add `frontend/src/pages/Accounts.tsx`: shadcn `Table` listing accounts; "New account" button opens modal; row actions for Edit, Archive, Delete; Delete uses an `AlertDialog` confirmation that warns about cascading transaction relationships
- [x] Add the route in `App.tsx`: `<Route path="/accounts" element={<Accounts />} />`
- [x] Add the sidebar entry in `AppSidebar.tsx` near the bottom (after Forecast/Payments per the SPEC.md page list)
- [x] Run `npm run build` to confirm no TS errors
- [x] Manually verify in dev: create an account, edit it, archive it, toggle "show archived"

## Implementation notes

**Type enum in SQLAlchemy + Alembic**: use `sa.Enum(*VALUES, name='accounttype')` so SQLite stores it as a string with a CHECK constraint; on Postgres it'd be a real enum. Either is fine for v1 (sqlite is the dev DB).

**Backfill bulk_insert**: define a lightweight `accounts_table = sa.table('accounts', sa.column('name'), sa.column('type'), sa.column('institution'), sa.column('is_archived'), sa.column('created_at'), sa.column('updated_at'))` inside the migration to keep it self-contained — don't import the SQLAlchemy model (which may have evolved by the time someone re-runs).

**Auto-create-on-import safety**: when `import_service` auto-creates an Account, log a warning so it's visible. The two known strings already have rows from the migration, so the warning path only fires on genuinely-new sources (BECU savings someday, etc.).

**409 on delete-with-transactions**: implement by checking `db.query(Transaction).filter_by(account_id=id).first()` before delete; raise `HTTPException(status_code=409, detail="account has linked transactions; archive instead")`.

**Mockup vs frontend**: the user's frontend is `frontend/`, not `mockup/`. The mockup may have its own `Accounts.tsx` someday — irrelevant. All work in this plan goes in `frontend/`.

**Existing transaction tests are the highest-risk update step**. Many tests construct `Transaction(account="Chase CC 7397", ...)` directly. Switch them to either:
1. Pre-create an `Account` row in the test setup and reference its `id`, or
2. Add a fixture `chase_cc_account` / `becu_account` in `conftest.py` that creates them once per test session.

Option 2 is cleaner. Do that.

## Review

Implemented end-to-end. Resolution decisions worth recording:

- Seeded names: "Chase CC" and "BECU Checking" (not the spec's "Chase CC 7397") to match what the parsers emit and therefore what real DB rows contain. The institution+type stay as `Chase / credit_card` and `BECU / checking`.
- Alembic revision: `a3f1c2b8d4e5_accounts_and_transaction_fk.py`, downstream of `6111fd0f67c9` (mortgage scenarios). Migration aborts with `RuntimeError` if any transaction string fails to backfill.
- `Account.type` is encoded as `sa.Enum(*ACCOUNT_TYPES, name="accounttype")` — sqlite stores it as a string with a CHECK constraint, postgres would get a real enum.
- `_resolve_account_id` in `import_service.py` caches per-import-call and `db.flush()`es so newly auto-created accounts get an id without committing the outer transaction. Logs a warning via `logging.getLogger(__name__)` whenever it auto-creates a row.
- New conftest helpers: `chase_cc_account` and `becu_account` fixtures, plus a module-level `get_or_create_account(db, name, *, type, institution)` helper that the existing `_make_txn` factories now route through. This was the cheapest way to update ~14 test files without proliferating fixtures.
- Sidebar uses the `Wallet` icon (lucide-react) for the Accounts entry, appended after Mortgage. `Home` was kept on Mortgage.
- A simple `frontend/src/components/ui/table.tsx` shadcn-style Table primitive was added (no extra deps); cherry-picked from the mockup but trimmed to only the parts the page uses.
- Final test counts: backend 285 (was 267), frontend 281 (unchanged).
