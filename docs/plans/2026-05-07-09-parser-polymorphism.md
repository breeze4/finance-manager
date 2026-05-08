# Parser Polymorphism

## Parent spec

`docs/specs/2026-05-07-01-ingestion-deep-module.md` — see "Solution"
section, item (1) "Parser polymorphism," and the corresponding bullets
under "Behavior → Polymorphic parser interface."

## What to build

Move parser-specific knowledge — the per-parser default account type and
institution, and the per-parser source-category-to-canonical-name mapping —
out of the ingestion orchestrator and onto each parser, expressed through
two new methods on the parser base class. After this slice, the ingestion
caller no longer imports concrete parser classes, no longer maintains a
parser-class-name lookup table, and no longer branches on parser identity
when resolving a category. Existing import and parser tests continue to
pass.

## Type

AFK

## Blocked by

None — can start immediately.

## User stories addressed

The parent spec is a lightweight architectural spec without numbered user
stories. This slice addresses the "Problem" bullets:

- "Adding a new parser … requires changes in at least three places" —
  reduced to one place (the new parser file).
- "Changing the classification precedence requires editing … one or more
  parser classes" — parsers stop participating in the precedence chain
  beyond their own source-category mapping.

## Acceptance criteria

- [ ] Parser base class declares `account_default()` returning
      `(account_type, institution)` and `map_source_category(source)`
      returning a canonical category name or `None`. Both have safe
      defaults so future parsers may opt out.
- [ ] The Chase credit-card parser's `account_default()` returns
      `("credit_card", "Chase")` and its `map_source_category()` returns
      the value previously produced by its `CHASE_CATEGORY_MAP` lookup,
      or `None` when no entry exists (today's behavior maps unmatched
      sources to `"Uncategorized"` — preserve that mapping by returning
      `"Uncategorized"`, not `None`, to keep current rows ending up in
      the Uncategorized category).
- [ ] The BECU checking parser's `account_default()` returns
      `("checking", "BECU")` and its `map_source_category()` returns
      `None` (no source-category column today).
- [ ] The parser-class-name → account-default lookup table is deleted.
- [ ] The `isinstance(parser, ChaseCcParser)` check in the import path is
      deleted; the import path imports only the parser base class plus
      the parser registry.
- [ ] The static method `ChaseCcParser.map_category` is removed (replaced
      by the instance method on the base interface).
- [ ] Existing parser unit tests pass unchanged.
- [ ] Existing import-service integration tests pass unchanged.
- [ ] New unit tests assert each concrete parser's `account_default()`
      and `map_source_category()` return the expected values.

## Owns

- `backend/app/parsers/base.py` — extend `BaseParser` with
  `account_default()` and `map_source_category()`; keep `RawTransaction`
  unchanged.
- `backend/app/parsers/chase_cc.py` — implement the two new methods on
  `ChaseCcParser`; remove the `map_category` staticmethod once the import
  path stops calling it.
- `backend/app/parsers/becu_checking.py` — implement `account_default()`;
  rely on the base-class default for `map_source_category()` if it
  returns `None`.
- `backend/app/services/import_service.py` — `_PARSER_ACCOUNT_DEFAULTS`
  (delete), `_resolve_account_id` (replace lookup-table call with
  `parser.account_default()`), `_resolve_category_id` (replace
  `isinstance` branch with `parser.map_source_category()`).
- `backend/tests/test_parsers.py` — add the two assertions per parser.
- `backend/tests/test_import_service.py` — verify all assertions still
  pass; adjust any test that mocks the old lookup table.

## Must not touch

- `backend/app/services/classification_service.py` — consumed only.
- `backend/app/services/payment_service.py` — out of scope for this
  slice.
- `backend/app/routers/import_router.py` — owned by plan
  `2026-05-07-10-ingestion-module-and-import-migration.md`.
- `backend/app/routers/transaction_router.py` — owned by plan
  `2026-05-07-11-reclassify-vendor-and-user-edit-migration.md`.
- Any new ingestion module — does not exist yet; created by plan
  `2026-05-07-10-…`.

## Defines interfaces

- `BaseParser.account_default() -> tuple[str, str | None]` in
  `backend/app/parsers/base.py` — consumed by plan
  `2026-05-07-10-ingestion-module-and-import-migration.md`.
- `BaseParser.map_source_category(source: str | None) -> str | None` in
  `backend/app/parsers/base.py` — consumed by plan
  `2026-05-07-10-ingestion-module-and-import-migration.md`.

## Pattern exemplar

- **Follow the pattern in**: `backend/app/parsers/chase_cc.py` — match
  the existing class structure (instance methods alongside `can_parse`
  and `parse`, module-level constants for any data tables, type
  hints throughout).

## Tasks

- [ ] Add abstract or default-implementation `account_default()` and
      `map_source_category()` methods to `BaseParser`. Provide safe
      defaults (`("asset", None)` and `None`) so future parsers may
      opt out without overriding both.
- [ ] Implement `account_default()` on `ChaseCcParser` returning
      `("credit_card", "Chase")`.
- [ ] Implement `account_default()` on `BecuCheckingParser` returning
      `("checking", "BECU")`.
- [ ] Implement `map_source_category()` on `ChaseCcParser` to return the
      `CHASE_CATEGORY_MAP` lookup (preserve the
      `"Uncategorized"`-on-miss behavior of today's `map_category`).
- [ ] Confirm `BecuCheckingParser` either inherits the base default
      `None` for `map_source_category()` or explicitly returns `None`,
      whichever fits the existing class style best.
- [ ] In the import service, replace the `_PARSER_ACCOUNT_DEFAULTS`
      table lookup inside `_resolve_account_id` with
      `parser.account_default()`. Delete the table.
- [ ] In the import service, replace the `isinstance(parser,
      ChaseCcParser)` branch in `_resolve_category_id` with a call to
      `parser.map_source_category(raw.source_category)` and the
      existing canonical-name → category-id cache lookup.
- [ ] Remove the `ChaseCcParser.map_category` staticmethod and any
      other references to the now-deleted lookup table or `isinstance`
      check.
- [ ] Add per-parser unit tests in `test_parsers.py` asserting the new
      method return values.
- [ ] Run the full backend test suite; confirm parser, import, and
      classification tests all pass.

## Implementation notes

The `_PARSER_ACCOUNT_DEFAULTS` table currently maps the string
`"ChaseCcParser"` → `("credit_card", "Chase")` and `"BecuCheckingParser"`
→ `("checking", "BECU")`, with a fallback of `("asset", None)` for
unknown classes. After this slice the lookup is replaced by
`parser.account_default()` returning the same tuples; the fallback
becomes the base-class default implementation.

The current `_resolve_category_id` flow is: check rules → if no rule and
parser is `ChaseCcParser` and `raw.source_category` is set, call the
parser's `map_category()` static method, then resolve the canonical name
to a `Category.id` using a cache. The new flow drops the `isinstance`
check and the static-method dispatch: check rules → if no rule, call
`parser.map_source_category(raw.source_category)` (which may return
`None`); if non-None, resolve via the same cache. The cache and its
shape are unchanged.

The `CHASE_CATEGORY_MAP` module-level dict can stay as a private
constant in `chase_cc.py`, or move inside the class — implementer's
choice. The current module-level placement is fine and easier to read.
