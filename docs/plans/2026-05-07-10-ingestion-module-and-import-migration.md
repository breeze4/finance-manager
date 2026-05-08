# Ingestion Module + Import Path Migration

## Parent spec

`docs/specs/2026-05-07-01-ingestion-deep-module.md` — see "Solution"
section, the `TransactionIngestion` interface block, and the
"Data Flow → Single-file import" and "→ Batch import" subsections.

## What to build

Introduce the new transaction-ingestion module with its public
`TransactionIngestion` Protocol, `IngestReport` and `FileOutcome`
dataclasses, and `build_ingestion(db)` factory. Implement a concrete
`IngestionService` exposing `ingest(source: Path)` that handles both
single-file and directory inputs, folds the post-import payment-detection
pass into the same call, and replaces the per-row import-hash dedup probe
with a single bulk query. Migrate the import router's two endpoints to
call the new interface and read fields off the report. Rewrite the
import-service tests as boundary tests against `ingest()`.

After this slice, the import HTTP entry points are one-liners against
the new module, the parser registry is no longer imported by the router,
the payment service's `detect_payments` is no longer imported by the
router, and the old `import_service` module either disappears or becomes
a thin compatibility shim that the next slice removes.

## Type

AFK

## Blocked by

- Blocked by `2026-05-07-09-parser-polymorphism.md`

The new module relies on `BaseParser.account_default()` and
`BaseParser.map_source_category()` introduced in plan `…-09`.

## User stories addressed

The parent spec is a lightweight architectural spec without numbered
user stories. This slice addresses the "Problem" bullets:

- Sequencing two service calls (import, then payment detection) in the
  HTTP layer — collapsed into one method call.
- Per-row dedup probe (N+1) — replaced with a single bulk query.
- Classification spread across the import service, parser
  staticmethods, and the classification service — consolidated as one
  internal helper invoked from the new module.

## Acceptance criteria

- [ ] A new module exposes a `TransactionIngestion` Protocol with at
      least the `ingest(source: Path) -> IngestReport` method.
- [ ] A `build_ingestion(db: Session) -> TransactionIngestion` factory
      returns a concrete service ready for use within a single
      request/session scope.
- [ ] `FileOutcome(filename, rows_imported, rows_skipped,
      error: str | None = None)` and `IngestReport(files,
      rows_imported, rows_skipped, matches_found, total_matches)` are
      defined as frozen dataclasses.
- [ ] `ingest(file)` performs file-hash dedup, parses, bulk-dedups by
      `import_hash`, auto-creates accounts via the parser's
      `account_default()`, resolves categories via classification rules
      then `parser.map_source_category()` then a name→id cache,
      persists transactions, writes the `ImportLog` row, runs payment
      detection, and commits. Behavior matches today's observable
      outcomes for the same input.
- [ ] `ingest(directory)` walks CSVs case-insensitively (matching the
      existing case-insensitive dedup behavior), runs the per-file
      pipeline once per file, runs payment matching once at the end,
      and commits per file (per the resolved decision).
- [ ] The per-row `Transaction` dedup probe is replaced with one
      `WHERE import_hash IN (…)` query that materializes a `set` for
      the in-memory dedup loop.
- [ ] An unrecognized header file produces a `FileOutcome` with
      `error="Unknown format"` and does not abort batch processing.
- [ ] A previously imported file (matched by SHA-256 file hash) returns
      a `FileOutcome` carrying the previously imported counts and adds
      no new rows; payment matching still runs.
- [ ] The import router's `/api/import` and `/api/import/all`
      endpoints call `build_ingestion(db).ingest(...)` once each and
      assemble the existing JSON response shape from the report. Their
      response keys are unchanged.
- [ ] The import router no longer imports `payment_service` or
      `import_service` (or the parser registry, beyond what the new
      module imports internally).
- [ ] Old `test_import_service.py` cases are rewritten as boundary
      tests against `ingest()` — same behavior coverage,
      same fixture CSVs, but assertions go through `IngestReport`.
- [ ] All existing tests pass: `test_parsers.py`,
      `test_classification.py`, `test_payment_matching.py`,
      `test_account_migration.py`, `test_transaction_api.py`, and the
      router-level tests for accounts, snapshots, stats, etc.

## Owns

- `backend/app/services/ingestion.py` (new) — module containing the
  Protocol, dataclasses, factory, and concrete `IngestionService` with
  the `ingest()` method. Internal helpers for parser detection
  delegation, file-hash dedup, bulk row dedup, account auto-create,
  category resolution, persistence, ImportLog write, and the
  payment-detection invocation all live here.
- `backend/app/routers/import_router.py` — both `import_single` and
  `import_all_files` endpoints. Replace the two-step
  `import_file`/`import_all` + `detect_payments` orchestration with
  one `ingest()` call; assemble the response shape from the
  `IngestReport`.
- `backend/app/services/import_service.py` — delete the file (its
  behavior moves into the new module). If anything outside the import
  router still imports it, route those callers through the new module
  instead. Confirm via `grep -r "from app.services.import_service" \
  backend/`.
- `backend/tests/test_import_service.py` — rename to
  `test_ingestion.py` and rewrite assertions against `ingest()`. Keep
  the existing fixture CSVs and the same coverage scope (file-hash
  dedup, row-hash dedup, idempotency, account auto-create, category
  fallback, unknown format, batch).
- `backend/tests/test_payment_matching.py` — the import-time call site
  changed (now inside `ingest()`); test cases that assert on
  matches-after-import now go through the new boundary. Adjust as
  needed; do not relax coverage.

## Must not touch

- `backend/app/services/classification_service.py` — consumed only.
  The pure `find_matching_rule`, `apply_rule`, and `apply_all_rules`
  functions remain available; this slice does not modify or replace
  them.
- `backend/app/services/payment_service.py` — `detect_payments`,
  `list_matches`, and `unmatch` keep their current signatures and
  bodies. Only the call site moves; the function does not.
- `backend/app/parsers/*` — already finalized in plan `…-09`. Treat
  parser methods as a stable interface.
- `backend/app/routers/transaction_router.py` — owned by plan
  `2026-05-07-11-reclassify-vendor-and-user-edit-migration.md`. Do not
  refactor its classification-rule call sites in this slice; the new
  module will not yet have `reclassify_vendor`.
- `backend/app/routers/payment_router.py` — owned elsewhere; the
  list/unmatch HTTP path is unchanged.

## Defines interfaces

- `TransactionIngestion` Protocol in `backend/app/services/ingestion.py`
  — consumed by plan
  `2026-05-07-11-reclassify-vendor-and-user-edit-migration.md` (which
  adds `reclassify_vendor`).
- `IngestReport`, `FileOutcome` dataclasses in
  `backend/app/services/ingestion.py` — consumed by the import
  router; future callers may also read them.
- `build_ingestion(db: Session) -> TransactionIngestion` factory in
  `backend/app/services/ingestion.py` — consumed by both routers
  across plans `…-10` and `…-11`.

## Pattern exemplar

- **Follow the pattern in**: `backend/app/services/net_worth_service.py`
  — match the service-style module shape (frozen dataclasses for
  results, type-hinted public functions, `Session` passed explicitly,
  no module-level state).
- **Follow the pattern in**:
  `backend/app/services/import_service.py` (about to be deleted) — for
  the existing import logic that needs to be preserved verbatim
  (file-hash, account caches, ImportLog, dedup loop). Use it as a
  reference for what behavior to reproduce, not for code style.
- **Follow the pattern in**:
  `backend/app/routers/snapshots_router.py` or
  `backend/app/routers/account_router.py` — for the typical FastAPI
  router shape: thin handlers that call a service factory and
  translate between domain objects and response shapes.

The Protocol-typed interface is novel for this codebase; no exemplar
exists for that part. Refer to the spec's interface signature block
for the exact shape.

## Tasks

- [ ] Create `backend/app/services/ingestion.py` with the
      `TransactionIngestion` Protocol declaring `ingest(source: Path)
      -> IngestReport`.
- [ ] Define `FileOutcome` and `IngestReport` as frozen dataclasses.
- [ ] Implement a concrete `IngestionService` class that holds a
      `Session` reference and implements `ingest(source)`.
- [ ] Implement the single-file branch of `ingest()`: detect parser →
      file-hash dedup short-circuit → parse → bulk-dedup → per-row
      account/category resolve and persist → ImportLog → in-line
      `payment_service.detect_payments(db)` call → commit. Keep the
      account-name and category-name caches; both populate during the
      per-row loop.
- [ ] Implement the bulk-dedup query: collect every parsed row's
      `import_hash`, issue one `SELECT import_hash FROM transactions
      WHERE import_hash IN (...)`, build a `set`, and dedup the parsed
      list against it. Replace the existing per-row probe.
- [ ] Implement the directory branch of `ingest()`: list CSVs
      case-insensitively (preserve today's `*.csv`/`*.CSV` handling and
      resolve-path dedup), call the per-file branch, accumulate
      `FileOutcome`s, and run payment matching once at the end.
      Aggregate the `rows_imported` and `rows_skipped` totals on the
      `IngestReport`.
- [ ] Implement `build_ingestion(db)` factory returning a fresh
      `IngestionService` bound to the supplied session.
- [ ] Update the import router's `import_single` to call
      `build_ingestion(db).ingest(filepath)` and assemble the
      single-file JSON response from `report.files[0]` plus
      `report.matches_found` and `report.total_matches`. Translate
      `error="Unknown format"` to HTTP 400.
- [ ] Update the import router's `import_all_files` to call
      `build_ingestion(db).ingest(input_dir)` and assemble the batch
      JSON response from `report.files` plus the totals.
- [ ] Delete `backend/app/services/import_service.py`. Run `grep -r
      "import_service" backend/` and update any remaining importers
      (there should be none after the router migration).
- [ ] Rename `backend/tests/test_import_service.py` to
      `backend/tests/test_ingestion.py`. Rewrite assertions to go
      through `build_ingestion(db).ingest(...)` and read the report.
      Keep the same fixture CSVs and the same coverage scope.
- [ ] Adjust `test_payment_matching.py` as needed for the new
      import-time call site. Do not relax coverage of the matching
      heuristics themselves.
- [ ] Run the full backend test suite; confirm all suites green.
- [ ] Smoke-test the endpoints manually: import a fresh CSV, import
      the same CSV again (expect skip count, no new rows), import the
      whole directory (expect aggregate totals + match counts).

## Implementation notes

**Interface shape** (Protocol, dataclasses) — copy from the spec's
"Solution" section verbatim. Keep `IngestReport.rows_imported` and
`rows_skipped` as the sums across files, populated when the directory
branch finishes; for the single-file branch, populate them from the
single `FileOutcome`. The `match_found`/`total_matches` fields come
from the `DetectionResult` returned by `payment_service.detect_payments`.

**Caches**. The account-name → `Account.id` cache and the
canonical-category-name → `Category.id` cache live as `dict` locals
inside `_import_one_file()` (or equivalent), seeded fresh per file.
Across files in a batch, regenerate them — accounts auto-created
during file 1 are visible via DB lookup during file 2.

**Commit boundary** (resolved decision). Per-file commit, then payment
matching at the end of the batch with its own commit. Do **not** wrap
the whole batch in a single transaction; preserve today's behavior of
"earlier files survive a later-file failure."

**Bulk dedup**. Issue the bulk query once per file, after parsing and
before the per-row resolve loop. Materialize the result as a `set[str]`
of already-seen hashes; the loop checks membership in O(1). The query
is `db.query(Transaction.import_hash).filter(Transaction.import_hash.in_(parsed_hashes)).all()`
with the result transformed to a set of strings.

**Error semantics**. The router today translates `result.error` to
HTTP 400 only for the single-file endpoint; the batch endpoint includes
errors as fields inside the per-file response objects. Preserve both
behaviors.

**Response shapes** for the import router (from current code; do not
change without explicit user sign-off):

- Single-file: `{filename, rows_imported, rows_skipped, matches_found,
  total_matches}` plus the existing HTTP 400 path on `error`.
- Batch: `{files: [...], total_imported, total_skipped, matches_found,
  total_matches}` where each file entry has `{filename,
  rows_imported, rows_skipped, error}`.

**Session lifetime**. The `IngestionService` instance lives only for
the duration of one HTTP request — `build_ingestion(db)` is called
inside the request handler with `Depends(get_db)`. Do not memoize
across requests.

**Payment-matching invocation**. `payment_service.detect_payments`
already commits its own changes. After this slice, the router no
longer calls it directly; the ingestion module does. The function's
signature and behavior are unchanged.

**Test rewrite scope**. Keep the existing fixture CSVs in
`backend/tests/fixtures/` (or wherever they live today). Replace
`from app.services.import_service import import_file, import_all`
with the factory call; replace `result.rows_imported` etc. with
`report.files[0].rows_imported` for single-file tests and
`report.rows_imported` for batch totals.
