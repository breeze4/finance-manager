# CSP Category Fields and Bucket Seed

## Parent spec

`docs/specs/2026-05-07-02-conscious-spending-plan.md`

## What to build

Add `csp_bucket` (enum: `fixed | investments | savings | guilt_free`, nullable) and `is_pre_tax` (boolean, default false) fields to the Category model end-to-end. Make the new fields editable on the Categories management page (dropdown + toggle). Run a one-time data migration that seeds `csp_bucket` for every existing category — agent proposes assignments per Ramit's textbook defaults; user reviews the full proposal before the migration is committed.

`csp_bucket` is NULL for income, transfer-only, and `exclude_from_budget=true` categories. All other categories must have a non-NULL bucket.

## Type

HITL — user reviews the full bucket-assignment proposal before the data migration is committed.

## Blocked by

None — can start immediately.

## User stories addressed

- User story 3 (every spending category belongs to a bucket)
- User story 4 (existing system categories pre-assigned to defaults)
- User story 5 (bucket override per category)
- User story 6 (`is_pre_tax` flag)
- User story 22 (warning if any spending category lacks a bucket — surfacing logic, not the visual; Slice 3 displays it)

## Acceptance criteria

- [ ] Alembic schema migration adds `csp_bucket` and `is_pre_tax` columns; existing rows have NULL `csp_bucket` and `is_pre_tax = false`.
- [ ] Category Pydantic schemas (`CategoryResponse`, `CategoryCreate`, `CategoryUpdate`) expose both new fields.
- [ ] `category_router` accepts both fields on PUT/POST and returns them on GET.
- [ ] Frontend Categories page renders a bucket dropdown column (Fixed / Investments / Savings / Guilt-Free / —) and an `is_pre_tax` toggle for each category. Both are editable and persist via existing Category endpoints.
- [ ] Data migration seeds `csp_bucket` for every existing category. NULL is correct for income, transfer-only, and `exclude_from_budget=true` categories; non-NULL for all other spending categories.
- [ ] User reviews the proposed assignment list (printed as a markdown table or terminal output) and approves before the data migration runs against the database.
- [ ] Tests cover: schema migration shape, default values on insert, NULL semantics for excluded categories, round-trip via API.
- [ ] Backend test suite passes.

## Owns

- `backend/app/models/category.py` — add `csp_bucket` and `is_pre_tax` columns
- `backend/app/schemas/category.py` — add fields to `CategoryResponse`, `CategoryCreate`, `CategoryUpdate`
- `backend/app/routers/category_router.py` — accept new fields on create/update; return on read
- `backend/alembic/versions/<new>_csp_category_fields.py` — schema migration (new file)
- `backend/alembic/versions/<new>_seed_csp_buckets.py` — data migration (new file)
- `backend/tests/test_csp_category_fields.py` — new test file
- `frontend/src/pages/Categories.tsx` — bucket dropdown column + pre-tax toggle
- `frontend/src/api/categories.ts` — TypeScript types for the new fields

## Must not touch

- `backend/app/services/budget_service.py` — owned by `2026-05-07-17-pretax-actuals-and-actual-vs-budget-csp.md` (pre-tax actuals branch)
- `backend/app/services/net_income_service.py` — owned by `2026-05-07-15-net-income-and-paycheck-detection.md` (does not exist yet)
- `backend/app/services/csp_rollup_service.py` — owned by `2026-05-07-16-csp-rollup-and-set-budget-redesign.md` (does not exist yet)
- `frontend/src/pages/Budget.tsx` — Set Budget redesign owned by Slice 3, Actual vs Budget changes owned by Slice 4
- `backend/app/services/category_filters.py` — leave existing exclusion logic untouched

## Defines interfaces

- `Category.csp_bucket` and `Category.is_pre_tax` model fields — consumed by plans `2026-05-07-15`, `2026-05-07-16`, `2026-05-07-17`
- `CategoryResponse.csp_bucket` and `CategoryResponse.is_pre_tax` schema fields — consumed by all downstream plans and frontend
- Verification gate: schema migration must land and tests must pass before any downstream plan starts

## Pattern exemplar

- **MUST follow the pattern in**: `backend/alembic/versions/61d1164fa063_category_exclude_from_budget.py` — same bracket of work (adding a column to Category), same use of `op.add_column` and `op.execute` for backfill, same naming convention.
- **MUST follow the pattern in**: `backend/alembic/versions/9650d330fb7a_seed_canonical_categories.py` — for the data-migration step that updates existing category rows with bucket assignments. Use `op.execute` with parameterized SQL.
- **Follow the pattern in**: `backend/tests/test_category_exclusion.py` — for test structure, fixtures, and assertions on Category fields.
- **Follow the pattern in**: `backend/app/routers/category_router.py` (existing handlers) — for how new fields integrate into existing CRUD.

## Tasks

- [ ] Add `csp_bucket` enum and `is_pre_tax` columns to `Category` model
- [ ] Update `CategoryResponse`, `CategoryCreate`, `CategoryUpdate` schemas
- [ ] Update `category_router` create and update handlers to read/write new fields
- [ ] Generate Alembic schema migration; verify it adds columns with correct nullability and defaults
- [ ] Write tests covering: column shape, default values, round-trip via API, NULL allowed for `csp_bucket`
- [ ] Update `frontend/src/api/categories.ts` types
- [ ] Add bucket dropdown and pre-tax toggle UI to Categories page; wire to existing PUT endpoint
- [ ] Build the bucket-assignment proposal: enumerate all existing categories, classify each per Ramit's defaults (NULL for income/transfer/excluded; one of the four buckets for everything else), output as a reviewable markdown table
- [ ] Pause for user review of proposals; iterate if user wants edits
- [ ] Generate Alembic data migration that applies the approved assignments via `op.execute`
- [ ] Run migrations against dev database; verify no spending categories have NULL `csp_bucket`

## Implementation notes

Default Ramit-style bucket assignments (starting points; agent should override per-category when context suggests otherwise):

- **Fixed** (50–60% target): Rent/Mortgage, Groceries, Bills & Utilities, Insurance, Auto & Gas, Health Care (premium), Phone, Internet, Childcare, Loan Payments
- **Investments** (10% target): Investments, Retirement, Brokerage Contributions
- **Savings** (5–10% target): Savings, Emergency Fund, Vacation Fund, Gifts (when treated as savings; agent may move to Guilt-Free if it's actively spent monthly)
- **Guilt-Free** (20–35% target): Dining, Entertainment, Shopping, Travel, Hobbies, Personal Care, Subscriptions (Netflix etc.), Pets, Gym
- **NULL bucket**: any category with `exclude_from_budget=true`, any income category, any transfer-only category

The agent reviews actual category names in the user's database before producing the final proposal — Ramit's labels are guidelines, not literal mappings. Edge cases (Health Care, Pets, Subscriptions) should be flagged in the proposal output for user attention.
