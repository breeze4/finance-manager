# Step 1 — Parser polymorphism handoff

## 1. New `BaseParser` methods

Both methods live on `app.parsers.base.BaseParser` as concrete (non-abstract) instance methods, providing safe defaults that subclasses may override.

```python
def account_default(self) -> tuple[str, str | None]:
    """Return (account_type, institution) for auto-creating an Account."""
    return ("asset", None)

def map_source_category(self, source_category: str | None) -> str | None:
    """Map the parser's source category string to a canonical category name."""
    return None
```

Default behavior:
- `account_default()` returns `("asset", None)` — the orchestrator uses this when a parser does not override.
- `map_source_category(...)` returns `None` for any input — meaning "this parser does not provide source-category-based classification."

The two existing abstract methods (`can_parse`, `parse`) are unchanged.

## 2. Concrete parser return values

### `ChaseCcParser` (`app/parsers/chase_cc.py`)

- `account_default()` -> `("credit_card", "Chase")`
- `map_source_category(None)` -> `"Uncategorized"` (None case)
- `map_source_category("Bogus Source")` -> `"Uncategorized"` (miss case)
- `map_source_category("Food & Drink")` -> `"Dining"` (representative hit)
- `map_source_category("Professional Services")` -> `"Uncategorized"` (mapped to Uncategorized in `CHASE_CATEGORY_MAP`)

The module-level constant `CHASE_CATEGORY_MAP` is preserved.

### `BecuCheckingParser` (`app/parsers/becu_checking.py`)

- `account_default()` -> `("checking", "BECU")`
- `map_source_category(...)` is not overridden — relies on the `BaseParser` default which returns `None` for any input. This matches the existing behavior since BECU CSVs have no source-category column (every `RawTransaction.source_category` is `None`).

## 3. Identifiers / blocks deleted from `app/services/import_service.py`

- Module-level dict `_PARSER_ACCOUNT_DEFAULTS: dict[str, tuple[str, str]]` and its docstring comment — deleted.
- Import `from app.parsers.chase_cc import ChaseCcParser` — deleted (no longer referenced after the `isinstance` branch was removed).
- Inside `_resolve_account_id`: replaced `_PARSER_ACCOUNT_DEFAULTS.get(parser_cls, ("asset", None))` with `parser.account_default()`. The `parser_cls = parser.__class__.__name__` line is retained for the diagnostic warning log only.
- Inside `_resolve_category_id`: replaced the `isinstance(parser, ChaseCcParser) and raw.source_category` branch with a parser-agnostic flow that gates on `raw.source_category` truthy, calls `parser.map_source_category(raw.source_category)`, and short-circuits to `None` if the result is `None`. Cache shape (`dict[str, int | None]`) is unchanged.
- Type hints on the `parser` parameter of `_resolve_account_id` and `_resolve_category_id` tightened from `object` to `BaseParser`. The `BaseParser` symbol is now imported alongside `RawTransaction` from `app.parsers.base`.

Also deleted (in `app/parsers/chase_cc.py`):
- `ChaseCcParser.map_category` staticmethod — replaced by the new instance method `map_source_category` with identical behavior (returns `"Uncategorized"` for both the `None` and miss cases).

## 4. Test changes

### `backend/tests/test_parsers.py`

- Added `TestBaseParserDefaults` class with two tests asserting the `BaseParser` default method behavior via a minimal stub subclass.
- Renamed `TestChaseCcParser.test_category_map` -> `test_map_source_category`, updated all calls from `parser.map_category(...)` to `parser.map_source_category(...)`. Identical inputs and expected outputs (Food & Drink -> Dining, None -> Uncategorized, Bogus -> Uncategorized, etc.). This replaces the old test for the now-deleted `map_category` staticmethod.
- Added `TestChaseCcParser.test_account_default` asserting `("credit_card", "Chase")`.
- Added `TestBecuCheckingParser.test_account_default` asserting `("checking", "BECU")`.
- Added `TestBecuCheckingParser.test_map_source_category_returns_none` asserting `None` for any input (proves the inherited base default is in effect).
- Added imports for `BaseParser` and `RawTransaction` from `app.parsers.base` to support the stub-class tests.

### `backend/tests/test_import_service.py`

No changes required. All existing tests pass under the refactored `_resolve_account_id` / `_resolve_category_id` because observable behavior is preserved:
- Account auto-creation still uses `("credit_card", "Chase")` for Chase imports and `("checking", "BECU")` for BECU imports — now sourced via `parser.account_default()` instead of the deleted lookup table.
- Category resolution still maps Chase source categories via the same `CHASE_CATEGORY_MAP` dict and still returns `None` when `raw.source_category` is empty/None.
- The `test_rule_overrides_source_category` test continues to pass: rules are checked before the parser mapping.
- The `test_becu_no_categories` test continues to pass: BECU's `source_category` is always `None`, so the truthy gate in `_resolve_category_id` short-circuits before invoking `map_source_category`.

## Verification

- Interface gate (the script in the prompt): PASS — prints `Interface gate OK`.
- `make test`: PASS — 311 tests passed.
- `make lint`: PASS — `ruff check` clean, `ruff format --check` clean (86 files).

No skips, no relaxations.
