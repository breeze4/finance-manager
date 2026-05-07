# Step 2 — Ingestion module + import path migration

Branch: `step2-ingestion-module`. Worktree:
`.claude/worktrees/step2`. All work confined to that worktree; no commits.

## What changed

The CSV import pipeline was lifted out of `app.services.import_service`
and into a new module `app.services.ingestion` exposing a
`TransactionIngestion` Protocol, frozen dataclasses for results, and a
`build_ingestion(db)` factory. The import router now makes a single call
into the new module per request and reads totals off the report. Payment
detection is now folded into `ingest()` rather than sequenced separately
in the router. The per-row dedup probe was replaced with a single bulk
`WHERE import_hash IN (…)` query per file. The old `import_service.py`
is deleted.

## Public interface (verbatim)

In `backend/app/services/ingestion.py`:

```python
@dataclass(frozen=True)
class FileOutcome:
    filename: str
    rows_imported: int
    rows_skipped: int
    error: str | None = None


@dataclass(frozen=True)
class IngestReport:
    files: list[FileOutcome]
    rows_imported: int
    rows_skipped: int
    matches_found: int
    total_matches: int


class TransactionIngestion(Protocol):
    def ingest(self, source: Path) -> IngestReport: ...


def build_ingestion(db: Session) -> TransactionIngestion: ...
```

`build_ingestion(db)` returns a fresh `IngestionService(db)` for the
duration of one request/session. `ingest()` accepts either a single
file path or a directory; it dispatches per-branch internally and runs
`payment_service.detect_payments(db)` once after all files in the call
have been processed.

For the single-file branch, `IngestReport.rows_imported` and
`rows_skipped` are populated from the single `FileOutcome`. For the
directory branch they are sums across all per-file outcomes.

Step 3 will extend the Protocol with `reclassify_vendor`. This step
deliberately did not.

## Bulk dedup query

Lives in `backend/app/services/ingestion.py`, in the
`IngestionService._import_one_file` method, immediately after parsing
and before the per-row resolve loop. Form:

```python
parsed_hashes = [r.import_hash for r in raw_transactions]
existing_hashes: set[str] = set()
if parsed_hashes:
    rows = (
        db.query(Transaction.import_hash)
        .filter(Transaction.import_hash.in_(parsed_hashes))
        .all()
    )
    existing_hashes = {h for (h,) in rows}
```

The per-row loop checks `raw.import_hash in existing_hashes` (O(1)) and
adds newly-inserted hashes back into the set so duplicate rows within
the same parsed file are also skipped.

## Router

`backend/app/routers/import_router.py` no longer imports
`payment_service`, `import_service`, or anything from the parser
registry. Each endpoint is one `build_ingestion(db).ingest(...)` call
plus shape assembly. Response shapes are byte-identical to before:

- `POST /api/import` → `{filename, rows_imported, rows_skipped,
  matches_found, total_matches}`. HTTP 400 with
  `detail="Unknown format"` (or whatever the per-file error is) when
  the single-file outcome carries an error.
- `POST /api/import/all` → `{files: [{filename, rows_imported,
  rows_skipped, error}, ...], total_imported, total_skipped,
  matches_found, total_matches}`.

## Tests

### Renamed: `backend/tests/test_import_service.py` → `backend/tests/test_ingestion.py`

Same fixture CSVs, same coverage scope. Test classes renamed:

- `TestIngestFileDedup` (was `TestImportFileDedup`)
- `TestIngestCategoryMapping`
- `TestIngestRuleApplication`
- `TestIngestLog`
- `TestIngestDirectory` (was `TestImportAll`)
- `TestIngestWithRealData`

All assertions go through `build_ingestion(db).ingest(...)` and read
`report.files[0].rows_imported` for single-file tests or
`report.rows_imported` for batch totals.

### New tests added

- `TestIngestFileDedup.test_bulk_dedup_partial_overlap` — imports a
  file with one row, then a second file with three rows where one
  overlaps with the first; asserts `rows_imported == 2`,
  `rows_skipped == 1`, and total `Transaction` row count is 3. This
  exercises the new bulk `WHERE import_hash IN (…)` path.
- `TestIngestDirectory.test_unknown_format_does_not_abort_batch` —
  drops a Chase CSV plus an unrecognized-header CSV into a directory
  and verifies the unknown file produces a `FileOutcome` with
  `error="Unknown format"` while the Chase file still imports its 3
  rows.

### `test_payment_matching.py` — call-site adjustments

Top of file: replaced
`from app.services.import_service import import_all` with
`from app.services.ingestion import build_ingestion`.

Two integration tests in `TestPaymentMatchingIntegration` were
migrated:

- `test_import_real_csvs_and_detect`: changed
  `import_all(db, input_dir)` then `detect_payments(db)` to a single
  `report = build_ingestion(db).ingest(input_dir)`, and asserts on
  `report.matches_found > 0` / `report.total_matches > 0`. Because
  detection runs inside `ingest()`, calling `detect_payments` again
  would have returned `matches_found == 0`, so the assertion was moved
  to the report.
- `test_stats_exclude_transfers_after_detection`: ingestion now
  auto-detects transfers, so the prior structure ("spending before
  detection vs after") no longer measures anything. Rewritten to
  compare `SUM(amount) WHERE amount < 0` against `SUM(amount) WHERE
  amount < 0 AND is_transfer = false` after a single `ingest()` call.
  Same intent — at least one transfer was matched, so excluding
  transfers narrows the spending sum.

The unit-test classes (`TestDetectPayments`, `TestUnmatch`,
`TestListMatches`, `TestPaymentAPI`) were not touched; they construct
transactions directly and never went through import.

### Other test files migrated (not in the original handoff list, found by
`grep -r "import_service" backend/`):

- `backend/tests/test_forecast.py` — single import-line swap and one
  call-site change at the integration test.
- `backend/tests/test_budget_suggestions.py` — same.
- `backend/tests/test_budget_analysis.py` — same.
- `backend/tests/test_subscriptions.py` — same; two call-site changes.
- `backend/tests/test_classification.py` — local function-scope import
  in `TestReimportAppliesRules.test_reimport_uses_rule` swapped to
  `from app.services.ingestion import build_ingestion`, and the
  call-site updated to use `report = build_ingestion(db).ingest(...)`.

Final verification: `grep -r "import_service" backend/` returns
nothing.

## Verification gate result

```
Interface gate OK
```

`make lint` passes (one auto-format applied to
`tests/test_payment_matching.py`).

`make test` → 313 passed, 0 failed.

## Hard constraints honored

- `TransactionIngestion` Protocol exposes only `ingest`. No
  `reclassify_vendor`.
- `payment_service.detect_payments` was not modified; only its call
  site moved.
- Per-file commit boundary preserved (`_import_one_file` calls
  `db.commit()` before returning).
- No new ports, adapters, DI containers. The factory returns a fresh
  `IngestionService` per request.
- Response shapes for both endpoints are byte-identical to pre-change.
