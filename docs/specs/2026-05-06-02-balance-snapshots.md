# Balance Snapshots & Net Worth Tracking

Add net-worth-over-time tracking to Finance Analyzer. Users record account balances on whatever cadence they like — no automation, no aggregation services, no CSV imports for v1 — and the app shows a single line chart of net worth over time plus a table of latest balance per account.

This change also promotes "account" from a freeform string on transactions to a first-class model, which both balance snapshots and (existing) transactions reference by foreign key.

## Goals

- Per-account balance snapshots, manually entered, dated, replaceable.
- Single-page net-worth view: line chart over time + latest-balance table per account.
- First-class `accounts` table consumed by both balance snapshots and existing transactions.
- Sign convention: type-driven aggregation — `credit_card` subtracts, everything else adds. Stored balances are always positive.
- Preserve all existing transaction behavior.

## Non-Goals (V1)

- No CSV ingestion of any kind for snapshots — manual entry only. (Institution-native CSV import was scoped, then explicitly cut.)
- No per-position holdings storage (just summed balance per account).
- No liabilities other than credit cards (no `loan`, `mortgage`, or `other_liability` types).
- No editing or deleting individual snapshots from the UI — re-entry replaces.
- No charts beyond the single net-worth line — no breakdowns, no per-account history drill-down.
- No multi-currency.

## Data Model

### accounts (new)

Single table for every account known to the app — checking, credit cards, brokerages, retirement, asset catch-alls.

Fields:
- `id` (PK)
- `name` (string, e.g. "Chase CC 7397", "Vanguard Brokerage", "Primary House")
- `type` (enum: `checking`, `savings`, `credit_card`, `brokerage`, `retirement`, `asset`)
- `institution` (string, nullable; e.g. "Chase", "Vanguard", "BECU")
- `is_archived` (bool, default false)
- `created_at`, `updated_at`

The `type=asset` value is a freeform catch-all whose descriptor lives in `name` ("Primary House", "2019 Camry", "BTC wallet"). Cash on hand is folded into `checking`/`savings`.

No `csv_format` or `external_id` fields — both were planned for CSV ingestion which is out of scope. They will be added when CSV import is reintroduced.

### balance_snapshots (new)

Fields:
- `id` (PK)
- `account_id` (FK → accounts, NOT NULL)
- `as_of_date` (date)
- `balance` (numeric, always positive — sign comes from `accounts.type` at aggregation time)
- `source` (enum: `manual` for v1; reserved values for future CSV-driven sources)
- `notes` (string, nullable)
- `created_at`, `updated_at`

Constraint: `UNIQUE (account_id, as_of_date)`. Re-entering for the same account/date upserts (replace semantics, see Same-Day Duplicates).

### transactions (migrated)

`Transaction.account` (currently freeform string) becomes `account_id` (FK → accounts, NOT NULL after backfill). All existing query paths, indexes, and aggregations that touch the `account` string are rewritten to use `account_id` and join on `accounts.name` for display where needed.

## Backend

### Alembic migration

A single Alembic migration handles, in order:

1. Create `accounts` table.
2. Hardcoded backfill — insert two rows for the only account strings that exist today:
   - `("Chase CC 7397", credit_card, "Chase")`
   - `("BECU Checking", checking, "BECU")`
   Heuristic detection and nullable-then-fill alternatives were considered and rejected; only two strings exist.
3. Add `account_id` column to `transactions`, populate by string match against the just-created accounts, drop the old `account` string column, rename `ix_transactions_account` → `ix_transactions_account_id`.
4. Create `balance_snapshots` table with the unique constraint.

The migration is one-way (no clean downgrade for the string-drop step).

### Existing transaction import_service

`import_service.import_file` is updated: when persisting each `RawTransaction`, it looks up the matching `accounts` row by string equality on `account.name`. If no match exists, it auto-creates a row with `type` guessed from the parser class (`ChaseCcParser` → `credit_card`, `BecuCheckingParser` → `checking`) and `institution` set to the parser's known institution. This keeps the existing CSV drop pipeline working without manual setup for new transaction sources.

### Net worth aggregation (`net_worth_service`, new)

Pure given a list of snapshots.

Rules:
- For a date range `[start, end]`, generate a daily series.
- Per account, last-value-carry-forward: on date D, account A's contribution = the most recent snapshot for A where `as_of_date <= D`. Accounts with no prior snapshot contribute 0 on date D.
- Sign at aggregation: subtract `balance` for `type = credit_card`; add for all other types.
- Net worth on date D = sum across all non-archived accounts.
- Date range default when not specified: from the earliest snapshot's date to today.

The latest-balance endpoint skips the daily expansion: per non-archived account, return the most recent snapshot row.

### API endpoints (new)

- `GET /accounts?include_archived=false` — list
- `POST /accounts` — create
- `PATCH /accounts/{id}` — edit
- `POST /accounts/{id}/archive` — soft-archive
- `DELETE /accounts/{id}` — hard delete; cascades to snapshots; UI must confirm
- `POST /snapshots/batch` — body: `{ as_of_date, entries: [{ account_id, balance, notes? }] }`. Upserts each entry; entries with blank/null balance are skipped server-side.
- `GET /net-worth?start_date=&end_date=` — daily time series `[{ date, net_worth }]`
- `GET /net-worth/latest` — per non-archived account: `{ account_id, account_name, account_type, balance, as_of_date }`

## Frontend

The mockup gains two pages and one modal.

### Accounts page

CRUD list of accounts. Columns: name, type, institution, status (active/archived), actions (edit, archive, delete).

- New-account form: name (required), type (dropdown of the enum), institution (free text, optional).
- Archive is the primary destructive action; archived accounts are hidden from the manual-entry form and net-worth aggregation but their historical snapshots are preserved.
- Delete shows a confirmation modal that warns about cascading snapshot loss; intended only for accounts created by mistake.
- Archived accounts are listed in a separate section or behind a "show archived" toggle.

### Net Worth page

Top-level page accessible from the sidebar.

- **Line chart**: x = date (default range = earliest snapshot to today, with a range picker), y = net worth in dollars. Single line, no series breakdown.
- **Latest-balance table** below the chart: account name, type, latest balance (formatted with sign per type for display only — credit cards shown as negative or with a "−" prefix; other types positive), as-of date.
- **"Snapshot today"** button opens the batch entry modal.

### Batch entry modal

- Top: date picker, default today, editable to allow backdating from old statements.
- One row per active (non-archived) account: account name on the left, a dollar-input on the right.
- Hint text under each input: `last: $X on YYYY-MM-DD` if a previous snapshot exists for that account; absent for new accounts.
- Inputs are NOT pre-filled — only the hint is shown. (Pre-filling risks accidentally re-saving a stale number.)
- Inputs left blank are skipped, not stored as zero.
- Save button posts `POST /snapshots/batch` and closes the modal on success.

### Sidebar

Add two new entries to the existing sidebar's page list:
- **Net Worth** — placed near Overview at the top of the navigation.
- **Accounts** — placed in a settings-adjacent position toward the bottom.

## Same-Day Duplicates

Re-entering a balance for the same `(account_id, as_of_date)` overwrites the previous value. This is the only "edit" mechanism in v1 — there is no per-snapshot edit/delete UI. Same rule applies whether the source is manual entry or (future) CSV import.

## Testing

Tests to write, mirroring the existing pytest patterns under `backend/tests/`:

- **`test_net_worth_service`** — synthetic accounts + snapshots covering LVCF behavior across gaps, credit-card sign flip, archived-account exclusion, empty-range and single-day cases.
- **`test_account_migration`** — Alembic migration test: start from the pre-migration schema with sample transaction rows, run the migration, assert both accounts rows are created with correct types/institutions and all transactions have correct `account_id`.
- **`test_snapshot_batch_api`** — `POST /snapshots/batch` happy path, replace-on-conflict for same-date entries, partial-blank entries skipped, invalid `account_id` rejected.
- **`test_accounts_api`** — CRUD smoke tests, archive-vs-delete behavior, cascading delete confirmed at the DB level.

Existing tests that touch `Transaction.account` (`test_transaction_api`, `test_models`, parser/service tests) are updated to assert on `account_id` and joined `account.name` rather than the dropped string column.

## Module Map

Backend, with deep modules called out:

| Module | Role | Test? |
|---|---|---|
| `app/models/account.py` | new — defines `Account` schema | (covered via migration test) |
| `app/models/balance_snapshot.py` | new — defines `BalanceSnapshot` schema | (covered via service tests) |
| `app/models/transaction.py` | modified — `account` string → `account_id` FK | existing tests updated |
| `alembic/versions/<hash>_accounts_and_snapshots.py` | new migration | yes (`test_account_migration`) |
| `app/services/net_worth_service.py` | **deep, pure** — snapshots → time series | yes (`test_net_worth_service`) |
| `app/services/import_service.py` | modified — looks up/creates `account_id` from string | existing tests updated |
| `app/api/accounts.py` | new — CRUD + archive endpoints | yes (`test_accounts_api`) |
| `app/api/snapshots.py` | new — batch entry, latest, time series | yes (`test_snapshot_batch_api`) |

Frontend (`mockup/src/`):

| Module | Role |
|---|---|
| `pages/Accounts.tsx` | new CRUD page |
| `pages/NetWorth.tsx` | new chart + latest-balance table page |
| `components/SnapshotBatchModal.tsx` | new — batch entry form |
| `api/accounts.ts`, `api/snapshots.ts`, `api/netWorth.ts` | new typed API clients |
| sidebar config | add Net Worth + Accounts entries |

## Resolved Decisions

- Single `accounts` table, both snapshots and transactions reference by FK.
- Type enum: `checking, savings, credit_card, brokerage, retirement, asset`. `asset` is a freeform catch-all keyed by `name`.
- Liabilities deferred — no `loan`/`mortgage`/`liability` types in v1.
- Sign convention: positive balance, type-driven aggregation.
- CSV ingestion cut entirely from v1 — manual entry only.
- Same-day duplicates: replace via `UNIQUE (account_id, as_of_date)` upsert.
- Manual entry: batch all-accounts form; date picker default today, backdating allowed; last-known shown as hint, not pre-filled.
- Net worth view: bare-minimum — single line chart + latest-balance table; no breakdowns or drill-down.
- Account management: dedicated CRUD page, archive primary, delete with cascade-warning confirmation.
- No per-position holdings storage.
- No edit/delete UI for individual snapshots — re-entry replaces.
- Transaction migration backfill: hardcoded two rows (Chase CC 7397 → credit_card; BECU Checking → checking).

## Future Iterations (Not V1)

- CSV import for snapshots (institution-native holdings exports). Would re-add `csv_format` and `external_id` fields on `accounts`, a `SnapshotParser` ABC, and per-institution parsers (Vanguard, Fidelity NetBenefits, Empower).
- Per-position holdings storage and allocation breakdown.
- Per-account history drill-down view.
- Net-worth breakdown by type (stacked area).
- Liability account types (`loan`, `mortgage`, generic `liability`).
- Per-snapshot edit/delete UI.
- Multi-currency.
