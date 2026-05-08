# Step 1 Handoff — CSP Category Fields and Bucket Seed

## Migrations

- **Schema migration**: `3a85869c7289` (`backend/alembic/versions/3a85869c7289_csp_category_fields.py`)
  - Adds `categories.csp_bucket` (VARCHAR, nullable) and `categories.is_pre_tax` (BOOLEAN, NOT NULL, server_default `'0'`).
  - `down_revision = '7e2c1a9d4f8b'`.
- **Data migration**: `4810a336d8d4` (`backend/alembic/versions/4810a336d8d4_seed_csp_buckets.py`)
  - Updates 13 spending categories with their approved `csp_bucket` value, matched by `name` for idempotence.
  - Leaves `is_pre_tax = False` (column default already covers it).
  - Leaves Income, Transfers, and Uncategorized at `csp_bucket = NULL`.
  - `down_revision = '3a85869c7289'`.
- **New alembic head**: `4810a336d8d4`. Confirmed via `alembic current`.

## Approved bucket assignments

| ID | Category | csp_bucket | is_pre_tax |
|---:|---|---|---|
| 13 | Income | NULL | false |
| 15 | Transfers | NULL | false |
| 16 | Uncategorized | NULL | false |
| 14 | Investments | investments | false |
| 6 | Bills & Utilities | fixed | false |
| 8 | Gas | fixed | false |
| 2 | Groceries | fixed | false |
| 11 | Home | fixed | false |
| 4 | Health & Wellness | fixed | false |
| 9 | Education | fixed | false |
| 12 | Gifts & Donations | savings | false |
| 3 | Dining | guilt_free | false |
| 5 | Entertainment | guilt_free | false |
| 1 | Shopping | guilt_free | false |
| 7 | Travel | guilt_free | false |
| 10 | Personal | guilt_free | false |

Verified post-migration with `sqlite3 data/finance.db "SELECT id, name, csp_bucket, is_pre_tax FROM categories ORDER BY id"` — every spending category has a non-NULL bucket; every `is_pre_tax` is `0`.

## NULL-bucket categories

The following three categories have `csp_bucket = NULL` and should stay that way for the foreseeable future:

- **Income** (id 13) — income is the source, not a spending bucket.
- **Transfers** (id 15) — account-to-account movement, not spending.
- **Uncategorized** (id 16) — **NULL by user choice.** Excluded from CSP rollups until reclassified. Every Uncategorized transaction should be moved to a real category before bucket totals can be trusted; downstream rollup code should not treat NULL-bucket spending as belonging to any of the four buckets.

Downstream rollup logic (Step 3, `csp_rollup_service`) must explicitly skip `csp_bucket IS NULL` rows when summing per-bucket actuals, and Slice 3's "warning if any spending category lacks a bucket" surface (user story 22) should ignore Income/Transfers/Uncategorized — they're intentionally NULL, not misconfigured.

## CspBucket enum

- **Location**: `backend/app/models/category.py`
- **Definition**: `class CspBucket(str, Enum)` with four members.
- **Exact string values** (these are what is stored in `categories.csp_bucket` and what flows over the API):
  - `CspBucket.FIXED = "fixed"`
  - `CspBucket.INVESTMENTS = "investments"`
  - `CspBucket.SAVINGS = "savings"`
  - `CspBucket.GUILT_FREE = "guilt_free"`
- The Pydantic schemas (`CategoryResponse`, `CategoryCreate`, `CategoryUpdate`) import `CspBucket` from the model and use `CspBucket | None` as the field type. The router converts to `.value` when writing to the model column (which is a plain `String`, not a SQLAlchemy `Enum` — keeps the migration simple and matches the codebase's existing approach).
- Frontend mirror: `frontend/src/api/categories.ts` exports `type CspBucket = "fixed" | "investments" | "savings" | "guilt_free"` and a `CSP_BUCKETS` array with the same four values in the canonical UI order (Fixed → Investments → Savings → Guilt-Free).

## Files modified

### Backend
- `backend/app/models/category.py` — added `CspBucket` enum and the two new columns.
- `backend/app/schemas/category.py` — added both fields to `CategoryResponse`, `CategoryCreate` (with defaults `None` and `False`), and `CategoryUpdate` (both optional).
- `backend/app/routers/category_router.py` — `_to_response`, `create_category`, and `update_category` read/write the new fields. PATCH uses `body.model_fields_set` to distinguish "field absent in payload" (no change) from "explicit null" (clear the bucket).
- `backend/alembic/versions/3a85869c7289_csp_category_fields.py` — schema migration (new file).
- `backend/alembic/versions/4810a336d8d4_seed_csp_buckets.py` — data migration (new file).
- `backend/tests/test_csp_category_fields.py` — new test file: column shape, NULL semantics, default values, API round-trip on create/patch/list, invalid-bucket rejection.

### Frontend
- `frontend/src/api/categories.ts` — added `CspBucket` type, `CSP_BUCKETS` constant, and the new fields on response/create/update interfaces.
- `frontend/src/pages/Categories.tsx` — added a "Bucket" column (Select dropdown with 5 options including `—` for none) and a "Pre-tax" column (Switch). Both edit inline via PATCH. The form modal also surfaces both fields. Internally uses a `__none__` sentinel for the empty bucket option (Radix Select disallows empty-string values) and translates to `null` at the API boundary.
- `frontend/src/pages/__tests__/Categories.test.tsx` — added `csp_bucket`/`is_pre_tax` to all fixtures, added a new test for the inline pre-tax toggle, added `RequestInit` type annotation on the `mockImplementation` callback (see "Test failures" below).
- `frontend/tsconfig.app.json` — added `"vite/client"` to `compilerOptions.types` (see "Test failures" below).

## Test failures encountered and how resolved

1. **`tsc -b` failed in `Categories.test.tsx`** with `Property 'method' does not exist on type 'unknown'`. The pre-existing test file used an untyped `init` parameter on `vi.spyOn(globalThis, "fetch").mockImplementation(...)`; TypeScript inferred `init` as `unknown` because `vi.spyOn`'s overload resolution doesn't carry through fetch's `RequestInit | undefined`. **Fix**: annotate the parameter explicitly as `init?: RequestInit` in all three callers in the test file. (This error existed at HEAD too — independent of CSP changes — but I had to fix it to satisfy the gate.)
2. **`tsc -b` failed in `src/api/_client.ts`** with `Property 'env' does not exist on type 'ImportMeta'`. There is a pre-existing uncommitted change to `_client.ts` in the working tree that uses `import.meta.env.BASE_URL`, but the project lacks a `vite-env.d.ts` triple-slash reference and the `vite/client` types weren't in `tsconfig.app.json`'s `types` array. **Fix**: added `"vite/client"` to `compilerOptions.types` in `frontend/tsconfig.app.json`. This is the standard Vite typing approach and unblocks the build.

Both fixes are minimal and limited to making the test gate pass on changes that were already in the tree.

## Final test gate results

- Backend: `make test` — **343 passed**.
- Frontend build: `npm run build` — **succeeds**, 1007.96 kB bundle.
- Frontend tests: `npm test --run` — **13 files, 286 tests passed**.

## What's NOT done

- Step 2 (`net_income_service` and paycheck detection) — owned by `docs/plans/2026-05-07-15-net-income-and-paycheck-detection.md`.
- Step 3 (`csp_rollup_service` and Set Budget redesign) — owned by `docs/plans/2026-05-07-16-csp-rollup-and-set-budget-redesign.md`. This is where the NULL-bucket exclusion logic and the user-story-22 warning surface live.
- Step 4 (pre-tax actuals and Actual vs Budget CSP changes) — owned by `docs/plans/2026-05-07-17-pretax-actuals-and-actual-vs-budget-csp.md`. The `is_pre_tax` flag is in place but no consumer reads it yet.

The new model fields are stable and ready for downstream plans to consume.
