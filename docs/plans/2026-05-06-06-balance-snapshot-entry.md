# Balance Snapshot Entry

## Parent spec

`docs/specs/2026-05-06-02-balance-snapshots.md`

## What to build

Manual balance entry, end-to-end. After this lands, the user can open the new **Net Worth** page, click "Snapshot today," fill in dollar amounts for whichever active accounts they care to, and save. The page also shows a table of the latest balance per account. No chart yet (that's plan 07).

This plan introduces the `balance_snapshots` table, the batch-upsert API, the latest-balances API, and the Net Worth page in its table-only form.

## Type

AFK

## Blocked by

- Blocked by `2026-05-06-05-accounts-foundation.md` (needs the `accounts` table to exist as the FK target, and the Accounts page so the user can create accounts before snapshotting them)

## User stories addressed

From the parent spec:

- §"Data Model — balance_snapshots" — table, fields, unique constraint
- §"Same-Day Duplicates" — replace via upsert, no edit/delete UI
- §"API — POST /snapshots/batch" — batch entry endpoint
- §"API — GET /net-worth/latest" — latest-balance table data
- §"Frontend — Net Worth page" (table portion only — chart is plan 07)
- §"Frontend — Batch entry modal"
- §"Frontend — Sidebar" — add "Net Worth" entry
- §"Testing — test_snapshot_batch_api"

## Acceptance criteria

- [x] `balance_snapshots` table exists with columns: id, account_id (FK→accounts, NOT NULL), as_of_date, balance, source, notes (nullable), created_at, updated_at
- [x] `UNIQUE (account_id, as_of_date)` constraint enforced
- [x] `source` is constrained to the enum `manual` for v1 (forward-compatible — additional values can be added later without migration if the column is a plain string with a CHECK; using `sa.Enum` is also fine)
- [x] `POST /api/snapshots/batch` with body `{ as_of_date: "YYYY-MM-DD", entries: [{ account_id, balance, notes? }, ...] }` upserts all entries; entries with null/missing balance are skipped server-side; replays of the same (account_id, as_of_date) overwrite the previous balance
- [x] `POST /api/snapshots/batch` rejects: invalid `account_id`, archived account, negative balance (returns 400)
- [x] `GET /api/net-worth/latest` returns one row per non-archived account: `{ account_id, account_name, account_type, balance, as_of_date }` — sorted by account name. Accounts with no snapshots are still listed with `balance: null`, `as_of_date: null`
- [x] Frontend `NetWorth` page exists at `/net-worth`; sidebar entry routes to it (placed near the top, after Overview, per `docs/SPEC.md` page order)
- [x] Page renders the latest-balance table: account name, type badge, latest balance (formatted with type-driven sign for display — credit_card shown with leading "−"; others positive), as-of date or em-dash if no snapshot
- [x] Page has a "Snapshot today" button that opens the batch entry modal
- [x] Batch entry modal: date picker defaulting to today (editable for backdating), one row per active account showing name + a dollar input. Hint text under each input: `last: $X on YYYY-MM-DD` if a previous snapshot exists; absent otherwise. Inputs left blank are not submitted. Save calls `POST /api/snapshots/batch` and closes on success. Validation: positive numbers only
- [x] Saving and reopening the page reflects the new balances in the table
- [x] Re-saving for the same date overwrites the prior values
- [x] Snapshot batch API test passes
- [x] All prior tests still pass

## Owns

Backend:

- `backend/app/models/balance_snapshot.py` — new `BalanceSnapshot` model
- `backend/app/models/__init__.py` — export `BalanceSnapshot`
- `backend/alembic/versions/<hash>_balance_snapshots.py` — new migration (create table + unique constraint + indexes)
- `backend/app/schemas/balance_snapshot.py` — `SnapshotBatchEntry`, `SnapshotBatchRequest`, `LatestBalanceResponse`
- `backend/app/services/snapshot_service.py` — new service module: `upsert_batch(db, as_of_date, entries) -> int` (count written) and `get_latest_balances(db) -> list[LatestBalanceResponse]`
- `backend/app/routers/snapshots_router.py` — new router with `POST /batch` and `GET /net-worth/latest` (note: `/net-worth/latest` is the route inside this router; the time-series `/net-worth?start&end` is added in plan 07 — this plan must structure the router so adding it later is a one-function append, NOT a separate router)
- `backend/app/main.py` — register the snapshots router
- `backend/tests/test_snapshot_batch_api.py` — new

Frontend:

- `frontend/src/api/snapshots.ts` — new client (`postSnapshotBatch`, `getLatestBalances` — leave room to add `getNetWorthSeries` in plan 07)
- `frontend/src/pages/NetWorth.tsx` — new page (table only)
- `frontend/src/components/SnapshotBatchModal.tsx` — new
- `frontend/src/components/AppSidebar.tsx` — add "Net Worth" entry
- `frontend/src/App.tsx` — register `/net-worth` route

## Must not touch

- `backend/app/models/account.py`, `backend/app/models/transaction.py`, `backend/app/routers/account_router.py` — owned by plan `2026-05-06-05-accounts-foundation.md`
- `backend/app/services/net_worth_service.py` — owned by plan `2026-05-06-07-net-worth-chart.md`
- The `GET /api/net-worth?start_date=&end_date=` time-series endpoint and the chart on the Net Worth page — owned by plan `07`
- `frontend/src/pages/Accounts.tsx` and `frontend/src/components/AccountFormModal.tsx` — owned by plan `05`
- `mockup/`, legacy plans

## Defines interfaces

- `BalanceSnapshot` model + table — consumed by plan `07`'s `net_worth_service` aggregation
- `/api/snapshots/batch` API contract — consumed by the frontend batch modal in this plan
- `/api/net-worth/latest` API contract — consumed by the frontend latest-balance table in this plan; plan `07` does NOT modify it
- `SnapshotBatchEntry` and `SnapshotBatchRequest` Pydantic schemas — frontend types mirror these
- `snapshots_router` (the router itself) — plan `07` adds one route to it, must not refactor its structure

## Pattern exemplar

- **MUST follow the pattern in**: `backend/app/models/transaction.py` — for the FK + relationship pattern (`account_id` + `account: Mapped["Account"] = relationship(...)`)
- **MUST follow the pattern in**: `backend/app/routers/category_router.py` — for the FastAPI router shape
- **MUST follow the pattern in**: `backend/app/schemas/category.py` — for the Pydantic schema layout (`from_attributes` config)
- **MUST follow the pattern in**: `backend/alembic/versions/b762a8a2c851_initial_schema.py` — Alembic migration style, particularly for unique constraints
- **MUST follow the pattern in**: `backend/tests/test_transaction_api.py` — for FastAPI TestClient usage and sqlite fixture flow
- **Follow the pattern in**: `mockup/src/pages/Overview.tsx` — for the dashboard-style "card with table" layout (the latest-balance table will look similar to a summary card)
- **Follow the pattern in**: `frontend/src/components/calculators/MathTooltip.tsx` (for shadcn modal-trigger style) and any existing modal in `frontend/src/components/ui/dialog.tsx` consumer — for the SnapshotBatchModal
- **Follow the pattern in**: `frontend/src/components/AppSidebar.tsx` — same conventions as the Accounts entry from plan `05`

## Tasks

Backend:

- [x] Create `models/balance_snapshot.py` with FK to `accounts.id`, `as_of_date: date`, `balance: float`, `source: str` (default `"manual"`, CHECK-constrained), `notes: str | None`, timestamps; unique constraint on `(account_id, as_of_date)`
- [x] Add to `models/__init__.py`
- [x] Generate the Alembic migration. Use `op.create_table` with `sa.UniqueConstraint('account_id', 'as_of_date', name='uq_balance_snapshots_account_date')`. Add an index on `account_id` for fast latest-per-account queries
- [x] Create `schemas/balance_snapshot.py`:
   - `SnapshotBatchEntry { account_id: int, balance: float | None, notes: str | None }`
   - `SnapshotBatchRequest { as_of_date: date, entries: list[SnapshotBatchEntry] }`
   - `LatestBalanceResponse { account_id: int, account_name: str, account_type: str, balance: float | None, as_of_date: date | None }`
- [x] Create `services/snapshot_service.py` with:
   - `upsert_batch(db, as_of_date, entries)` — for each non-null-balance entry, validate the account exists + is not archived + balance >= 0, then upsert. Use SQLAlchemy `insert(...).on_conflict_do_update(...)` (sqlite dialect) or a query-then-update fallback. Return the count of written rows.
   - `get_latest_balances(db)` — left-outer-join `accounts` to a subquery that picks the max `as_of_date` per `account_id`, filter `is_archived = false`. Return ordered by name.
- [x] Create `routers/snapshots_router.py` with two routes mounted at `/api`:
   - `POST /api/snapshots/batch` — calls `upsert_batch`, returns `{ written: int }`. Returns 400 with details on validation errors.
   - `GET /api/net-worth/latest` — calls `get_latest_balances`. (The future `GET /api/net-worth?start_date=&end_date=` route will be added by plan 07 in the same file.)
- [x] Register the router in `main.py`
- [x] Write `tests/test_snapshot_batch_api.py`:
   - Happy path: create two accounts, POST a batch with both, assert two rows created
   - Replace: POST again same date with different balances; assert rows updated, count still 2
   - Skip blanks: POST with one entry blank, assert only one row created
   - Invalid account_id → 400
   - Archived account → 400
   - Negative balance → 400
   - `GET /api/net-worth/latest` returns rows for both accounts after the above

Frontend:

- [x] Add `frontend/src/api/snapshots.ts`:
   - `postSnapshotBatch(asOfDate, entries) -> { written }` 
   - `getLatestBalances() -> LatestBalance[]`
- [x] Add `frontend/src/components/SnapshotBatchModal.tsx`:
   - Props: `open`, `onClose`, `accounts: AccountResponse[]`
   - State: `asOfDate` (default today, ISO string), per-account `balance` strings keyed by account_id
   - Layout: shadcn `Dialog` with `DialogContent`; date input at top; vertical list of rows (label = account name + small type badge; right side = `$` prefix + numeric input). Below each input: `<span class="text-xs text-muted-foreground">last: $X on Y</span>` if `lastBalance` prop has data
   - On Save: filter out blank entries, parse as numbers, POST, close on success, surface server validation errors inline
- [x] Add `frontend/src/pages/NetWorth.tsx`:
   - Fetch accounts (active only) and latest balances on mount via React Query
   - Top section: heading + "Snapshot today" button
   - Latest-balance table: shadcn `Table` with columns Account, Type, Balance, As of. Format balances with type-driven sign for display: `credit_card` → leading `−$X,XXX.XX`, others → `$X,XXX.XX`. As-of column shows date or `—`
   - "Snapshot today" button opens `SnapshotBatchModal`. After save, invalidate the latest-balances query so the table refreshes
- [x] Register the route in `App.tsx`: `<Route path="/net-worth" element={<NetWorth />} />`
- [x] Add the sidebar entry in `AppSidebar.tsx`: "Net Worth" near the top, after Overview/Home (icon: `TrendingUp` or `LineChart` from lucide-react)
- [x] `npm run build` passes; manual smoke test: create two accounts via the Accounts page, snapshot both, see them in the table; re-snapshot one, see updated value

## Implementation notes

**Sign formatting is display-only**. Storage is always positive. The frontend formatter checks `account_type === "credit_card"` and prepends `−`. Do NOT compute net worth here — that's plan 07.

**Latest balances for accounts with no snapshots**: include the row with null balance/date so the user sees "yes, this account exists, no snapshot yet." Display as `—`.

**Upsert in sqlite**: SQLAlchemy 2.x has `sqlite_insert(...).on_conflict_do_update(index_elements=['account_id', 'as_of_date'], set_=dict(balance=..., source=..., notes=..., updated_at=func.now()))`. Use this — don't roll your own delete-then-insert.

**Why no `Snapshot today` opens with pre-filled values**: the spec is explicit — pre-filling risks accidentally re-saving stale numbers. Show the prior value as hint text; user must type to commit.

**Forward-compatibility for plan 07**: keep the snapshots router structured so plan 07's added route slots in cleanly. Specifically: don't put `/net-worth/latest` and `/net-worth` (time-series) in different routers — they belong together.
