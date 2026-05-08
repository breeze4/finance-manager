# Ingestion Deep Module

Consolidate the transaction ingestion path — parser detection, parsing, account
auto-creation, classification, dedup, persistence, and post-import payment
matching — into a single deep module with a small interface and large hidden
implementation. Move parser-specific knowledge onto each parser as a
polymorphic interface. Replace the per-row dedup probe with a single bulk
query.

## Problem

The journey from "a CSV file exists in the input directory" to "the database
reflects everything that file implies" is currently spread across:

- The import router, which sequences two service calls (import, then payment
  detection) as orchestration logic in the HTTP layer.
- The import service, which knows about specific parser classes by name (an
  `isinstance` check and a parser-class-name → account-default lookup table).
- The classification service, called inline from the import service for one
  half of category resolution and from the parser's own `map_category()`
  staticmethod for the other half.
- The transaction router's PATCH and bulk-update handlers, which call the
  classification service directly and reimplement vendor-deduplication in a
  manual loop alongside transaction-update logic.
- The payment service, called from the router after each import to detect
  credit-card payment transfers, with its own commit boundary.

Consequences:

- Adding a new parser (a new bank, a brokerage, an asset account type) requires
  changes in at least three places: a new parser class, a new entry in the
  parser-class-name → account-default map, and a new branch in the
  category-fallback `isinstance` chain.
- Changing the classification precedence requires editing the import service,
  the transaction router, and (if the parser fallback changes) one or more
  parser classes.
- The user-edit path and the import path produce different code paths for the
  same conceptual operation ("classify this vendor"), so they can drift.
- The per-row dedup probe issues one `SELECT` per row in the file — an N+1
  query pattern that scales poorly.

## Solution

Introduce a single **transaction ingestion module** with a Protocol-typed
interface and a factory:

```python
class TransactionIngestion(Protocol):
    def ingest(self, source: Path) -> IngestReport: ...
    def reclassify_vendor(
        self,
        vendor: str,
        category_id: int,
        *,
        vendor_display_name: str | None = None,
    ) -> ClassificationRule: ...

def build_ingestion(db: Session) -> TransactionIngestion: ...
```

`source` accepts either a single file or a directory; the implementation
branches internally. The single-file and batch HTTP endpoints both call
`ingest()` and pull what they need from the report:

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
    rows_imported: int       # sum across files
    rows_skipped: int
    matches_found: int       # from the post-import payment-detection pass
    total_matches: int
```

`reclassify_vendor` is the second and only other entry point. It is the
authoritative way to (a) create or update an exact-match classification rule
for a vendor and (b) propagate the new category to that vendor's existing
unverified transactions. Both the single-row PATCH and the bulk-update paths
in the transaction router call it; the manual vendor-dedup loop in the
bulk-update handler collapses into a `set` of unique vendors followed by one
`reclassify_vendor` call per vendor.

Two internal changes accompany the new boundary:

1. **Parser polymorphism.** Each parser declares its own account default and
   source-category mapping via abstract methods on the parser base class:

   ```python
   class BaseParser(ABC):
       @abstractmethod
       def can_parse(self, headers: list[str]) -> bool: ...
       @abstractmethod
       def parse(self, filepath: Path) -> list[RawTransaction]: ...

       def account_default(self) -> tuple[str, str | None]:
           """Return (account_type, institution) for auto-creating an Account."""
           return ("asset", None)

       def map_source_category(self, source_category: str | None) -> str | None:
           """Map the parser's source category string to a canonical category name."""
           return None
   ```

   The orchestrator stops importing concrete parser classes; the
   parser-class-name → account-default lookup table is deleted; the
   `isinstance` check on the parser is deleted.

2. **Bulk dedup query.** During an import, after the parser has produced the
   list of `RawTransaction`s, the implementation issues a single
   `WHERE import_hash IN (...)` query to load the set of already-imported
   hashes, then dedups in-memory. The per-row `SELECT` disappears.

## Data Flow

Single-file import (router-level shape unchanged for callers):

1. The router resolves the file path from settings, validates existence, and
   calls `build_ingestion(db).ingest(filepath)`.
2. The ingestion module detects a parser for the file's headers via the parser
   registry. If no parser matches, the corresponding `FileOutcome` carries an
   `error="Unknown format"`; the router translates that into HTTP 400.
3. The module hashes the file and short-circuits if the hash matches an
   `ImportLog` row; the report reflects the previously imported counts.
4. The parser parses the file into `RawTransaction`s.
5. The module loads the set of already-imported `import_hash` values for this
   batch in a single bulk query.
6. For each non-duplicate raw row, the module:
   - Resolves `account_id` against an in-memory cache, auto-creating an
     `Account` row using `parser.account_default()` when the name is unknown.
   - Resolves `category_id` by consulting classification rules first, then
     falling back to `parser.map_source_category()` and a name-based category
     lookup.
   - Persists a new `Transaction` row.
7. The module writes an `ImportLog` row, then runs the payment-matching pass
   in the same unit of work, then commits.
8. The module returns a single `IngestReport` containing per-file outcomes
   plus the aggregate match counts.

Batch import: the same call with a directory `source`. The module discovers
CSV files, deduplicates case-insensitively, and runs the per-file pipeline
for each, accumulating `FileOutcome`s. Payment matching runs once at the end.

User-edit reclassification (single PATCH or bulk-update):

1. The transaction router applies the field updates via the transaction
   service.
2. If the update changes `category_id`, the router calls
   `build_ingestion(db).reclassify_vendor(vendor, category_id)` for each
   distinct affected vendor.
3. The ingestion module creates or updates an exact-match classification
   rule, applies it to unverified transactions for that vendor, and flushes.

## Behavior

**Public surface (the new module owns)**:

- `ingest(source)`: file-or-directory import, idempotent at both file-hash
  and row-hash granularity, returning per-file outcomes plus aggregate
  payment-match counts. Always runs payment matching as part of the same
  unit of work.
- `reclassify_vendor(vendor, category_id, ...)`: authoritative path for
  creating/updating an exact-match classification rule and propagating the
  new category. Replaces the call sites that today combine
  `auto_create_rule` with manual transaction-update loops.

**Hidden inside the module**:

- Parser detection, the parser registry's identity, file-hash computation,
  ImportLog reads/writes, per-row dedup, account auto-creation, classification
  rule precedence (exact > starts_with > contains), parser-fallback category
  resolution, payment matching heuristics, the commit boundary.

**Polymorphic parser interface (the `BaseParser` contract grows)**:

- `account_default()` returns `(type, institution)` and replaces the
  parser-class-name → account-default lookup table.
- `map_source_category(source)` replaces the parser-aware `isinstance` branch
  in the import path. Parsers that do not map source categories return `None`
  from the default implementation.

**Edge cases**:

- A file whose hash matches an existing `ImportLog` returns a `FileOutcome`
  with the previously imported counts and zero new rows; payment matching
  still runs (idempotent, so re-running is safe).
- A parser cannot be detected: the file produces a `FileOutcome` with
  `error="Unknown format"`; the rest of the batch continues.
- An account name appears for the first time: the module auto-creates an
  `Account` using the parser's `account_default()`. A warning log is emitted.
- A vendor matches no classification rule and the parser's source-category
  map returns `None`: `category_id` is left `NULL` (today's behavior).
- `reclassify_vendor` called with the same vendor twice: the second call
  updates the existing exact-match rule rather than creating a duplicate
  (today's behavior, now centralized).

**Caller migration**:

- The single-file and batch import endpoints call `ingest()` once and read
  fields off the report; the existing JSON response shape is preserved.
- The transaction router stops importing the classification service directly.
  Its PATCH and bulk-update handlers keep their current schemas and HTTP
  responses; internally they call `reclassify_vendor` per unique vendor.
- The payment service's `detect_payments`, `list_matches`, and `unmatch`
  functions stay; only the import-time call moves inside the ingestion
  module. The payments router (list/unmatch) is unchanged.
- The classification service's pure functions (`find_matching_rule`,
  `apply_rule`, `apply_all_rules`) remain available for internal use by the
  ingestion module and for any non-import callers (none today besides the
  ingestion module itself).

**What stays out of this work**:

- The payment-matching heuristics themselves (BECU↔Chase substring match,
  3-day window, exact-amount equality) remain as-is. Making the matcher
  pluggable is a separate concern.
- The classification rule schema (`vendor_pattern`, `match_type`, `priority`,
  `vendor_display_name`, `is_hidden`) is unchanged.
- Subscription detection is not folded into the ingestion module; it remains
  a separately invoked service.

## Dependency Strategy

**Local-substitutable.** The ingestion module's dependencies are:

- A SQLAlchemy `Session` (the only argument to the factory).
- A parser registry, resolved internally as the existing module-level list of
  parser instances.
- The filesystem, accessed only for header sniffing and SHA-256 file hashing.

All three have local stand-ins available in the existing test suite (SQLite
in-memory database via the project's test fixtures, real `Path` objects under
`tmp_path`, and direct construction of parser instances). The module is
tested end-to-end against these stand-ins. No new ports, protocols, or
adapters are introduced beyond the parser polymorphism extension to
`BaseParser`.

If a future need arises (in-memory testing without SQLite, an alternative
storage backend, an alternate parser registry per environment), the
concrete `IngestionService` class can be refactored toward injected ports
without changing the public `TransactionIngestion` interface.

## Testing Strategy

**New boundary tests to write** (against the `TransactionIngestion`
interface, not internals):

- `ingest(file)` imports rows, populates accounts via parser defaults, and
  produces an `IngestReport` with correct per-file and aggregate counts.
- `ingest(file)` is idempotent: re-running on the same file returns the
  prior counts and adds zero new rows.
- `ingest(file)` runs payment detection in the same unit of work; the report
  reflects the new and total match counts.
- `ingest(directory)` walks CSVs case-insensitively, dedups paths, and
  aggregates outcomes.
- `ingest(file)` with an unrecognized header returns `error="Unknown format"`
  on the per-file outcome and does not abort the batch.
- Classification precedence (exact > starts_with > contains, ordered by
  priority) holds end-to-end through `ingest()`.
- Parser fallback: when no rule matches, the parser's `map_source_category`
  drives category resolution.
- `reclassify_vendor` creates a new exact-match rule and updates the
  vendor's unverified transactions.
- `reclassify_vendor` updates (does not duplicate) an existing exact-match
  rule for the same vendor.
- Bulk-dedup query: importing a file whose rows partially overlap an existing
  import skips only the overlapping rows and reports the right counts.

**Old tests to delete or fold in**:

- The current per-function tests for `import_file` and `import_all` are
  replaced by tests against `ingest()`.
- The classification-resolution assertions inside the import service tests
  are replaced by classification assertions through `ingest()` and
  `reclassify_vendor()`.
- The transaction router's bulk-update tests stop asserting on the manual
  vendor-dedup loop and instead assert on the observable outcomes (rules
  created, transactions updated).
- Direct unit tests of the parser-class-name → account-default lookup table
  go away; replaced by tests asserting that each parser's
  `account_default()` returns the expected tuple.

**Tests that stay unchanged**:

- Parser tests (header detection, vendor extraction, CSV row parsing) — these
  test the parser layer directly, below the new boundary.
- Classification-service unit tests for `find_matching_rule` precedence —
  still useful as focused tests of the pure-function half of classification.
- Payment-matching tests — `detect_payments`, `unmatch`, and the payments
  router are unchanged.
- Net-worth, budget, snapshot, and other unrelated service tests.

**Test environment needs**: none new. The existing SQLite-backed test
fixtures and `tmp_path` for fixture CSV files are sufficient.

## Resolved Decisions

- [x] **Atomicity of batch import**: per-file commit; payment matching
  commits at the end. Preserves today's observable behavior; a failure
  mid-batch still leaves earlier files persisted.

- [x] **`reclassify_vendor` and `is_verified`**: the ingestion module
  handles only rule creation and category propagation. The router
  continues to mark transactions verified separately. Preserves today's
  split between "classify" and "confirm."

- [x] **Parser → category id resolution**: parser's
  `map_source_category()` returns a canonical category *name*. The
  ingestion module resolves name → id via a cached lookup. Parsers stay
  free of DB knowledge; matches today's pattern.
