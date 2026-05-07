# Step 5 handoff — Accounts foundation

Step 5 lands the `accounts` table, the FK rewrite on `transactions`, the
`/api/accounts` REST contract, and the `Accounts` CRUD page. This handoff
captures the load-bearing details that step 6 (balance snapshots) and
step 7 (net worth chart) need.

## `Account` model

`backend/app/models/account.py`:

```
id: int (pk)
name: str (unique, not null)
type: SQLAlchemy Enum("checking","savings","credit_card","brokerage","retirement","asset", name="accounttype")
institution: str | None
is_archived: bool (default False)
created_at: datetime (server_default=func.now())
updated_at: datetime (server_default=func.now(), onupdate=func.now())
transactions: relationship -> Transaction.account (back_populates)
```

`Transaction` now has `account_id: int` FK (not-null) and a
`relationship("Account", back_populates="transactions")` on the back side.
The original `account: str` column and `ix_transactions_account` index
have been dropped; the new index is `ix_transactions_account_id`.

## Alembic migration

- Revision: `a3f1c2b8d4e5`
- File: `backend/alembic/versions/a3f1c2b8d4e5_accounts_and_transaction_fk.py`
- Down-revision: `6111fd0f67c9` (mortgage scenarios)
- Bulk-insert payload (verbatim):

```python
[
    {"name": "Chase CC",      "type": "credit_card", "institution": "Chase", "is_archived": False},
    {"name": "BECU Checking", "type": "checking",    "institution": "BECU",  "is_archived": False},
]
```

Migration aborts with `RuntimeError("Cannot backfill account_id for N transaction(s); unmatched account strings: [...]")` if any existing
transaction's `account` string fails to match a seeded row. Tested in
`backend/tests/test_account_migration.py`.

### "Chase CC" vs "Chase CC 7397"

The original spec/plan said to seed "Chase CC 7397". I overrode this to
"Chase CC" because:

- `backend/app/parsers/chase_cc.py` emits `account="Chase CC"` (no digits)
- `backend/app/parsers/becu_checking.py` emits `account="BECU Checking"`

So real transaction rows contain those strings. Seeding "Chase CC 7397"
would have caused the migration to abort because no transaction's
`account` would match. The `institution` and `type` columns were kept as
`Chase / credit_card` and `BECU / checking` per the spec.

## `AccountResponse` Pydantic shape

`backend/app/schemas/account.py`:

```python
class AccountType(StrEnum):
    checking, savings, credit_card, brokerage, retirement, asset

class AccountResponse(BaseModel):
    id: int
    name: str
    type: AccountType
    institution: str | None
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

class AccountCreate(BaseModel):
    name: str
    type: AccountType
    institution: str | None = None

class AccountUpdate(BaseModel):
    name: str | None = None
    type: AccountType | None = None
    institution: str | None = None
```

Frontend mirror: `frontend/src/api/accounts.ts` exports the same shape
plus `ACCOUNT_TYPES: AccountType[]` for dropdowns.

## `/api/transactions` query param change

The list endpoint's account filter is now `account_id: int | None`
(was `account: str | None`). The response body's transaction shape now
includes both `account_id: int` and `account_name: str` (replacing the
old `account: str`):

```
GET /api/transactions?account_id=42
```

`transaction_service.list_transactions` and the sort-key allowlist were
updated to match.

## `_resolve_account_id` helper in `import_service.py`

Signature: `_resolve_account_id(db, account_name: str, parser, account_cache: dict[str,int]) -> int`

- Looks up by `Account.name == account_name`.
- On miss, auto-creates an `Account` row with `(type, institution)`
  pulled from `_PARSER_ACCOUNT_DEFAULTS` keyed off
  `parser.__class__.__name__`. Defaults to `("asset", None)` for
  unrecognised parser classes. Logs a warning when auto-creating.
- Calls `db.flush()` to populate the id without committing.
- Caches per-import call in `account_cache`.

Step 6's snapshot upsert helper can mirror this pattern (resolve by
account id from the page UI, no string lookup needed).

## New `tests/conftest.py` fixtures

```python
chase_cc_account  -> Account row "Chase CC"      / credit_card / Chase
becu_account      -> Account row "BECU Checking" / checking    / BECU
get_or_create_account(db, name, *, type="asset", institution=None) -> Account
```

`get_or_create_account` is exported as a module-level function (not a
fixture) so per-file `_make_txn` helpers can call it without re-plumbing
fixtures. Step 6 can use the same helper when a test needs a balance
snapshot tied to a non-default account.

## Sidebar nav-item

Appended at the bottom of `navItems` in `frontend/src/components/AppSidebar.tsx`:

```
{ title: "Accounts", url: "/accounts", icon: Wallet }
```

(Imported from `lucide-react`. `Home` is still claimed by Mortgage.)
Step 6 should add the Net Worth entry following the same shape; the
current convention puts it near the top (after "Overview"), but that's
step 6's call.

## API endpoints summary

```
GET    /api/accounts?include_archived=false
POST   /api/accounts                  -> 201
PATCH  /api/accounts/{id}             -> 200
POST   /api/accounts/{id}/archive     -> 204
DELETE /api/accounts/{id}             -> 204 (or 409 if linked transactions)
```

## Test counts

- Backend: 285 passing (was 267 at start of step 5; +18 = migration tests + accounts API tests)
- Frontend: 281 passing (no regression)

Lint clean (`make lint`), build clean (`cd frontend && npm run build`).

## New UI primitives

`frontend/src/components/ui/table.tsx` was added (Table, TableHeader,
TableBody, TableRow, TableHead, TableCell). It's a trimmed copy of the
mockup version with no extra dependencies. Step 6 can reuse it for the
SnapshotBatchModal and step 7 for any tabular Net Worth breakdown.

## Things step 6/7 should know

- `Account` rows that step 6's `BalanceSnapshot` FKs into already exist
  for the two real-world accounts after the migration runs. Tests using
  the `chase_cc_account` / `becu_account` fixtures will see that.
- `Account.is_archived` already exists; step 6/7 should respect it when
  filtering snapshots / aggregating net worth.
- The frontend's `listAccounts(includeArchived=false)` is what step 6's
  SnapshotBatchModal should call to populate its account picker.
- `AccountFormModal` is a reusable create/edit dialog — step 6 doesn't
  need to duplicate it.
- `_resolve_account_id` is exported only as `_`-prefixed in the import
  service; if step 6 wants to call it from a snapshot-import path, lift
  the leading underscore or duplicate the pattern.
