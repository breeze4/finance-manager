# Net Income Step-Function and Paycheck Detection

## Parent spec

`docs/specs/2026-05-07-02-conscious-spending-plan.md`

## What to build

Add a step-function `net_income_periods` table that stores monthly take-home over time. Add a `net_income_service` that exposes lookup, set, and history operations. Add a `paycheck_detection` service that suggests an initial monthly net income from observed income transactions. Expose all of this via REST endpoints and a frontend net income editor (modal with effective-month picker and detected-paycheck pre-fill).

The editor lands at the top of the existing pre-redesign Set Budget tab as an interim placement. Slice 3 will absorb and reposition it during the full Set Budget redesign.

Step-function semantics: for any month M, the effective net income is the row with the latest `effective_month ≤ M`. Setting a new value for an existing month overwrites that row. A history view lists every entry chronologically.

## Type

AFK

## Blocked by

None — independent of Slice 1 (does not consume `Category.csp_bucket` or `is_pre_tax`).

## User stories addressed

- User story 1 (paycheck-history-based net income suggestion)
- User story 15 (this-month-and-going-forward update semantics)
- User story 16 (history of net income changes)
- User story 17 (tooltip explaining denominator includes pre-tax) — partial; tooltip itself wires up in Slice 3, this slice ensures the data shape supports it

## Acceptance criteria

- [ ] Alembic migration creates `net_income_periods` table with columns `(id, effective_month, take_home_amount, created_at)`. `effective_month` stored as a date or `(year, month)` pair — agent picks the cleaner option for SQLite, but lookups must be efficient and total-orderable.
- [ ] `net_income_service` exposes: `get_for_month(month) -> Decimal | None`, `set_from_month(effective_month, take_home_amount)`, `get_history() -> list[NetIncomePeriod]`. Setting an amount for a month that already has an entry overwrites it.
- [ ] `paycheck_detection` exposes `suggest_monthly_net() -> Decimal | None`. Returns NULL if no recurring income pattern detected. Handles bi-weekly, semi-monthly, and monthly cadences. Excludes one-off income (refunds, gifts) by reusing or sharing logic with `subscription_service.py`'s recurring-pattern detection.
- [ ] REST endpoints: `GET /api/net-income?month=YYYY-MM` (returns effective amount + tooltip composition), `PUT /api/net-income` (writes a new period row), `GET /api/net-income/history`, `GET /api/paycheck-detection/suggest`.
- [ ] Frontend `NetIncomeEditor` component: modal showing detected suggestion (read-only), editable amount input, effective-month picker (defaults to current month), history drilldown.
- [ ] Editor mounted at the top of the existing Set Budget tab in `Budget.tsx` as a static block — not yet integrated into the redesigned dashboard layout.
- [ ] Tests cover: step-function lookup (within range, before any entry, exactly on boundary, with multiple entries), overwrite semantics, history ordering, paycheck detection on bi-weekly/monthly fixtures, paycheck detection returning NULL with insufficient data.
- [ ] Backend test suite passes.

## Owns

- `backend/alembic/versions/<new>_net_income_periods.py` — schema migration
- `backend/app/models/net_income.py` — new model file
- `backend/app/schemas/net_income.py` — new schema file
- `backend/app/services/net_income_service.py` — new service file
- `backend/app/services/paycheck_detection.py` — new service file
- `backend/app/routers/net_income_router.py` — new router file
- `backend/app/main.py` — register the new router (only the registration line, nothing else)
- `backend/tests/test_net_income_service.py` — new test file
- `backend/tests/test_paycheck_detection.py` — new test file
- `frontend/src/api/net-income.ts` — new file
- `frontend/src/components/NetIncomeEditor.tsx` — new component
- `frontend/src/pages/Budget.tsx` — add ONLY the `<NetIncomeEditor />` mount at the top of the Set Budget tab body, no other edits to this file in this slice

## Must not touch

- `backend/app/models/category.py` and `backend/app/schemas/category.py` — owned by `2026-05-07-14`
- `backend/app/services/budget_service.py` — owned by `2026-05-07-17`
- `backend/app/services/csp_rollup_service.py` — owned by `2026-05-07-16` (does not exist yet)
- `frontend/src/pages/Budget.tsx` Set Budget tab redesign and Flex Budget tab removal — owned by `2026-05-07-16`
- `frontend/src/pages/Budget.tsx` Actual vs Budget tab — owned by `2026-05-07-17`
- `backend/app/services/subscription_service.py` — read-only; if shared logic is needed, extract a new helper module rather than modifying

## Defines interfaces

- `net_income_service.get_for_month(month) -> Decimal | None` — consumed by `2026-05-07-16` (rollup denominator) and `2026-05-07-17` (actuals rollup denominator)
- `paycheck_detection.suggest_monthly_net() -> Decimal | None` — consumed by `2026-05-07-16` (Set Budget redesign uses it on first-time setup)
- `GET /api/net-income` and `GET /api/net-income/history` HTTP shape — consumed by frontend in this slice and Slice 3
- Verification gate: net income service unit tests must pass before downstream plans use the lookup

## Pattern exemplar

- **MUST follow the pattern in**: `backend/alembic/versions/a3f1c2b8d4e5_accounts_and_transaction_fk.py` — for creating a new table from scratch (closest exemplar of a fresh-table migration in this repo).
- **Follow the pattern in**: `backend/app/services/subscription_service.py` — for recurring-pattern detection logic; extract or share helpers rather than duplicating.
- **Follow the pattern in**: `backend/app/services/net_worth_service.py` — for service shape and stateless function style.
- **Follow the pattern in**: `backend/app/routers/coast_fire_router.py` — for a small new router with a few endpoints.
- **Follow the pattern in**: `backend/tests/test_net_worth_service.py` — for service test structure with SQLite fixtures.

## Tasks

- [ ] Design the `net_income_periods` table schema; pick the storage shape for `effective_month` (recommend an integer like `year * 100 + month` or a `DATE` constrained to the first of the month — agent picks based on existing patterns in the repo)
- [ ] Write Alembic migration for the new table
- [ ] Implement `net_income_service` with the three documented operations
- [ ] Write unit tests for the service: lookup before any entry, lookup within range, lookup exactly on a boundary, multiple entries, overwrite semantics, history ordering
- [ ] Implement `paycheck_detection` reusing or sharing recurring-pattern logic with `subscription_service.py`
- [ ] Write unit tests for paycheck detection: bi-weekly fixture, monthly fixture, semi-monthly fixture, no-pattern fixture (returns NULL)
- [ ] Build the new router with the four documented endpoints
- [ ] Register the router in `backend/app/main.py`
- [ ] Add API smoke tests for the four endpoints if existing routers have similar smoke tests (see `test_coast_fire_router.py`)
- [ ] Add TypeScript types in `frontend/src/api/net-income.ts`
- [ ] Build `NetIncomeEditor` component with modal, history drilldown, and detected-paycheck pre-fill
- [ ] Mount the editor at the top of the Set Budget tab in `Budget.tsx` (single import + single render line — no other edits)
- [ ] Manual smoke test: set net income, change effective month, view history

## Implementation notes

Step-function lookup behavior (pseudocode):
```
get_for_month(target_month):
  rows = select * from net_income_periods where effective_month <= target_month order by effective_month desc limit 1
  return rows[0].take_home_amount if rows else None
```

Paycheck detection should reuse the recurring-pattern detection that already exists in `subscription_service.py` — investigate whether to extract a shared `recurring_detection.py` module or pass income transactions through the existing detector with a "treat positive amounts as the recurring stream" flag. Default to the lightest reuse that doesn't degrade subscription detection.

The interim mount in `Budget.tsx` should be a single block above the existing tab content, NOT integrated into any tab. This keeps Slice 3's redesign uncontaminated by the interim placement.
