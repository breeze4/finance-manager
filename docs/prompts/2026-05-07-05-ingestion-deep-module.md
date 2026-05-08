# Orchestration Prompt: Ingestion Deep Module

Execute the three plans that deepen the transaction-ingestion path
into a single module with a small public interface and large hidden
implementation. Strictly serial; all steps AFK; no HITL checkpoints.

## Project context

- Working directory: `.`
- Spec: `docs/specs/2026-05-07-01-ingestion-deep-module.md`
- Research: none — proceed from plans + spec
- Test: `make test` (runs `cd backend && uv run pytest -v`)
- Lint: `make lint` (runs `ruff check` + `ruff format --check`)
- Lint-fix: `make lint-fix` (runs `ruff check --fix` + `ruff format`)
- Migrations: not needed — no schema changes in this work
- Handoff directory: `docs/handoff/` (already exists)

Python only. No frontend touched. No DB schema changes. No new
dependencies.

## Orchestrator responsibilities

You are actively managing context between agents. Before launching
each step:

1. Read the files listed under "Context sources" and inline the
   relevant excerpts in the agent's "Context" field.
2. If a previous step completed, read its handoff file (path given
   under "Prior step context") and inline what changed.
3. Each agent runs in an isolated worktree. After the agent finishes,
   merge the worktree, then run the gate.
4. On gate failure: stop. Report the failure with the failing test
   names or lint output. Do not auto-fix and do not advance to the
   next step.
5. Between steps, do not modify any plan-owned files yourself.

## Execution plan

### Step 1 — Parser polymorphism

**Plan**: `docs/plans/2026-05-07-09-parser-polymorphism.md`

**Agent briefing**:

- **Context sources** (orchestrator reads these and inlines excerpts):
  - `docs/specs/2026-05-07-01-ingestion-deep-module.md` —
    "Solution → Parser polymorphism" subsection and "Behavior →
    Polymorphic parser interface" bullets.
  - `backend/app/parsers/base.py` — current `BaseParser` and
    `RawTransaction` definitions.
  - `backend/app/parsers/chase_cc.py` — current `ChaseCcParser`,
    `CHASE_CATEGORY_MAP`, and `map_category` staticmethod.
  - `backend/app/parsers/becu_checking.py` — current
    `BecuCheckingParser`.
  - `backend/app/services/import_service.py` —
    `_PARSER_ACCOUNT_DEFAULTS`, `_resolve_account_id`,
    `_resolve_category_id`. (This file is *modified* in this step,
    not yet deleted.)

- **Read first**: `docs/plans/2026-05-07-09-parser-polymorphism.md`

- **Context**: <orchestrator inlines the excerpts above>

- **Owns**:
  - `backend/app/parsers/base.py`
  - `backend/app/parsers/chase_cc.py`
  - `backend/app/parsers/becu_checking.py`
  - `backend/app/services/import_service.py` —
    `_PARSER_ACCOUNT_DEFAULTS` (delete), `_resolve_account_id`
    (replace lookup-table call), `_resolve_category_id` (replace
    `isinstance` branch). Do not change anything else in this file.
  - `backend/tests/test_parsers.py`
  - `backend/tests/test_import_service.py` (touch only as needed
    to keep tests passing)

- **Must not touch**:
  - Any new `ingestion` module — does not exist yet (Step 2 creates it).
  - `backend/app/services/classification_service.py`
  - `backend/app/services/payment_service.py`
  - `backend/app/routers/import_router.py` (Step 2)
  - `backend/app/routers/transaction_router.py` (Step 3)

- **MUST follow the pattern in**: `backend/app/parsers/chase_cc.py`
  — match the existing class structure (instance methods alongside
  `can_parse` and `parse`, module-level constants for data tables,
  type hints throughout). The new `account_default()` and
  `map_source_category()` instance methods belong on the same class
  as the existing parser methods.

- **Do not**:
  - Do not introduce the `TransactionIngestion` Protocol or any
    `ingest()` method — that is Step 2's responsibility.
  - Do not delete `import_service.py` — Step 2 deletes it.
  - Do not change `RawTransaction` or `BaseParser.can_parse` /
    `BaseParser.parse` signatures.
  - Do not modify `payment_service.py` or any router.
  - Do not change the case-insensitive vendor matching, the
    `Uncategorized` fallback name, or any other observable behavior.

- **If unclear, stop**: if any test in `test_import_service.py`
  fails after the refactor and the failure is not obviously caused
  by a behavior-preserving change, stop and report. Do not
  "fix" by relaxing the test.

- **Done when**:
  - `BaseParser.account_default()` and `BaseParser.map_source_category()`
    exist with safe defaults.
  - Both concrete parsers implement them with the values listed in
    the plan.
  - `_PARSER_ACCOUNT_DEFAULTS` and the `isinstance(parser,
    ChaseCcParser)` check are gone.
  - `ChaseCcParser.map_category` staticmethod is gone.
  - `make test` and `make lint` pass.

- **Handoff**: write `docs/handoff/step-1-parser-polymorphism.md`
  listing: (a) the new `BaseParser` method signatures and their
  default-implementation behavior, (b) each concrete parser's return
  values for `account_default()` and `map_source_category()`,
  (c) the exact lines deleted from `import_service.py`, (d) any
  test-file changes and why.

**Interface gate** (orchestrator runs after Step 1, before Step 2):

```bash
cd backend && uv run python -c "
from app.parsers.base import BaseParser
from app.parsers.chase_cc import ChaseCcParser
from app.parsers.becu_checking import BecuCheckingParser
assert hasattr(BaseParser, 'account_default')
assert hasattr(BaseParser, 'map_source_category')
assert ChaseCcParser().account_default() == ('credit_card', 'Chase')
assert BecuCheckingParser().account_default() == ('checking', 'BECU')
assert ChaseCcParser().map_source_category('Food & Drink') == 'Dining'
assert ChaseCcParser().map_source_category(None) == 'Uncategorized'
assert not hasattr(ChaseCcParser, 'map_category')
import app.services.import_service as imp
assert not hasattr(imp, '_PARSER_ACCOUNT_DEFAULTS')
print('Interface gate OK')
"
```

If the gate fails, fix Step 1 before launching Step 2.

**Test gate**: `make test && make lint`

---

### Step 2 — Ingestion module + import path migration

**Plan**:
`docs/plans/2026-05-07-10-ingestion-module-and-import-migration.md`

**Agent briefing**:

- **Context sources** (orchestrator reads and inlines):
  - `docs/handoff/step-1-parser-polymorphism.md` — to confirm the
    new parser methods are available.
  - `docs/specs/2026-05-07-01-ingestion-deep-module.md` — the
    `TransactionIngestion` Protocol block, "Data Flow → Single-file"
    and "→ Batch" subsections, and the resolved decisions on
    atomicity (per-file commit) and parser→category resolution
    (parser returns name).
  - `backend/app/services/import_service.py` — every line. This is
    the behavior the new module must reproduce, then the file is
    deleted.
  - `backend/app/routers/import_router.py` — current handlers and
    response shapes.
  - `backend/app/services/payment_service.py` —
    `detect_payments` signature and `DetectionResult` dataclass.
    (This file is **not modified**; only its call site moves.)
  - `backend/app/services/classification_service.py` —
    `find_matching_rule` signature. (Consumed only.)
  - `backend/app/services/net_worth_service.py` — service-style
    pattern reference (frozen dataclasses, type hints).
  - `backend/app/routers/snapshots_router.py` — router-shape
    reference.
  - `backend/tests/test_import_service.py` — current test
    coverage; agent rewrites this as `test_ingestion.py`.
  - `backend/tests/test_payment_matching.py` — coverage that
    interacts with the import path.

- **Read first**:
  `docs/plans/2026-05-07-10-ingestion-module-and-import-migration.md`

- **Context**: <orchestrator inlines the excerpts above plus the
  step-1 handoff>

- **Prior step context**: Step 1 added two methods to `BaseParser`
  and removed the parser-class-name lookup table from the import
  service. The new module relies on those methods and must not
  reintroduce parser-aware branching. Trust
  `docs/handoff/step-1-parser-polymorphism.md` over any cached
  knowledge.

- **Owns**:
  - `backend/app/services/ingestion.py` (new file — Protocol,
    dataclasses, `IngestionService`, `build_ingestion` factory,
    internal helpers)
  - `backend/app/routers/import_router.py` (both endpoints)
  - `backend/app/services/import_service.py` (delete)
  - `backend/tests/test_import_service.py` → rename to
    `backend/tests/test_ingestion.py` and rewrite assertions
  - `backend/tests/test_payment_matching.py` (adjust call sites
    only; do not relax matcher coverage)

- **Must not touch**:
  - `backend/app/parsers/*` — finalized in Step 1.
  - `backend/app/services/classification_service.py` — consumed only.
  - `backend/app/services/payment_service.py` — consumed only.
  - `backend/app/routers/transaction_router.py` — owned by Step 3.
  - `backend/app/routers/payment_router.py` — unchanged.
  - Any other service or router.

- **Follow the pattern in**:
  - `backend/app/services/net_worth_service.py` — service module
    shape (frozen result dataclasses, type-hinted public functions,
    `Session` passed explicitly, no module-level mutable state).
  - `backend/app/routers/snapshots_router.py` — thin handler that
    delegates to a service and assembles the response.
  - `backend/app/services/import_service.py` — for the *behavior*
    to preserve (file-hash, account caches, ImportLog write,
    case-insensitive `*.csv`/`*.CSV` walk). Use as a behavior
    reference, not a code-style reference.

- **Do not**:
  - Do not add `reclassify_vendor` to the Protocol or the concrete
    class — that is Step 3's responsibility. The Protocol may
    declare only `ingest()` for now.
  - Do not modify `transaction_router.py` — Step 3 migrates it.
  - Do not change `detect_payments`'s signature, body, or commit
    behavior — only the call site moves.
  - Do not introduce a single-batch-transaction commit boundary;
    preserve per-file commits per the resolved spec decision.
  - Do not add new ports, adapters, or DI containers. The factory
    pattern from the spec is sufficient.
  - Do not change the JSON response shape of either import endpoint.
    The exact keys are listed in the plan's "Implementation notes".

- **If unclear, stop**:
  - If preserving today's behavior conflicts with the
    spec/plan in any case (response shape, error semantics, commit
    boundary, fixture-CSV outcomes), stop and report.
  - If a test in `test_payment_matching.py` resists the call-site
    move without a deeper change, stop and report rather than
    rewriting the test.

- **Done when**:
  - `backend/app/services/ingestion.py` exposes the
    `TransactionIngestion` Protocol (with `ingest()` only), the
    `IngestReport` and `FileOutcome` frozen dataclasses, the
    `build_ingestion(db)` factory, and a concrete `IngestionService`
    class.
  - `import_service.py` is deleted; no remaining imports of it
    anywhere in the codebase. Verify with `grep -r "import_service"
    backend/`.
  - The bulk import-hash dedup query is in place (one
    `WHERE import_hash IN (...)` per file).
  - The import router's two endpoints call `ingest()` and return
    the same JSON shape as before.
  - `make test` and `make lint` pass.
  - Manual smoke test: importing a fixture CSV produces the same
    counts as before.

- **Handoff**: write
  `docs/handoff/step-2-ingestion-module.md` listing: (a) the
  Protocol and dataclass signatures, (b) the `build_ingestion`
  factory signature, (c) where the bulk dedup query lives,
  (d) the renamed test file and any added test cases, (e) any
  call-site adjustments in `test_payment_matching.py`.

**Interface gate** (orchestrator runs after Step 2, before Step 3):

```bash
cd backend && uv run python -c "
from app.services.ingestion import (
    TransactionIngestion, IngestReport, FileOutcome, build_ingestion
)
from dataclasses import is_dataclass
assert is_dataclass(IngestReport)
assert is_dataclass(FileOutcome)
assert hasattr(TransactionIngestion, 'ingest')
import importlib, importlib.util
assert importlib.util.find_spec('app.services.import_service') is None, \
    'import_service.py must be deleted'
print('Interface gate OK')
"
```

If the gate fails, fix Step 2 before launching Step 3.

**Test gate**: `make test && make lint`

---

### Step 3 — Reclassify vendor + user-edit migration

**Plan**:
`docs/plans/2026-05-07-11-reclassify-vendor-and-user-edit-migration.md`

**Agent briefing**:

- **Context sources** (orchestrator reads and inlines):
  - `docs/handoff/step-2-ingestion-module.md` — to confirm
    `TransactionIngestion` and `build_ingestion` exist.
  - `docs/specs/2026-05-07-01-ingestion-deep-module.md` — the
    `reclassify_vendor` paragraph in "Solution" and "Data Flow →
    User-edit reclassification".
  - `backend/app/services/ingestion.py` (current state after Step 2)
    — the Protocol and `IngestionService` class to extend.
  - `backend/app/routers/transaction_router.py` —
    `update_transaction` (PATCH) and `bulk_update_transactions`
    handlers, and the `from app.services import classification_service`
    import.
  - `backend/app/services/classification_service.py` —
    `auto_create_rule` and `apply_rule` (the primitives the new
    method composes).
  - `backend/tests/test_transaction_api.py` — current coverage of
    the PATCH and bulk handlers.

- **Read first**:
  `docs/plans/2026-05-07-11-reclassify-vendor-and-user-edit-migration.md`

- **Context**: <orchestrator inlines the excerpts above plus the
  step-2 handoff>

- **Prior step context**: Step 2 introduced the
  `TransactionIngestion` Protocol with `ingest()` only and the
  `build_ingestion(db)` factory. This step extends the Protocol and
  the concrete class with `reclassify_vendor` and migrates the
  transaction router. Trust `docs/handoff/step-2-ingestion-module.md`
  over any cached knowledge.

- **Owns**:
  - `backend/app/services/ingestion.py` — add `reclassify_vendor`
    to the Protocol and the concrete class. Do not change `ingest()`
    or any helper introduced in Step 2.
  - `backend/app/routers/transaction_router.py` —
    `update_transaction` (PATCH) and `bulk_update_transactions`
    handlers, and the `classification_service` import.
  - `backend/tests/test_transaction_api.py` — extend with new
    assertions per the plan.
  - `backend/tests/test_ingestion.py` — add boundary tests for
    `reclassify_vendor`.

- **Must not touch**:
  - `backend/app/services/classification_service.py` — consumed only.
    `auto_create_rule`, `apply_rule`, `apply_all_rules`, and
    `find_matching_rule` keep their current signatures.
  - `backend/app/services/payment_service.py`.
  - `backend/app/routers/import_router.py` — finalized in Step 2.
  - `backend/app/routers/transaction_router.py`'s
    `list_transactions` and `get_transaction` handlers — unrelated.
  - `backend/app/parsers/*` — finalized in Step 1.

- **Follow the pattern in**:
  - `backend/app/services/classification_service.py` —
    `auto_create_rule` and `apply_rule` are the existing
    primitives `reclassify_vendor` *composes*. The new method's
    body is "call `auto_create_rule`, then call `apply_rule` on
    the returned rule, then `flush`." Do not reimplement the rule
    matching or the case-insensitive vendor lookup.
  - The current `update_transaction` and `bulk_update_transactions`
    handlers in `transaction_router.py` — preserve HTTP shape and
    response semantics; only the internals change.

- **Do not**:
  - Do not modify `is_verified` on any transaction inside
    `reclassify_vendor` — verification stays in the router per the
    resolved spec decision.
  - Do not commit inside `reclassify_vendor` — flush only; the
    router commits.
  - Do not call `apply_all_rules` from `reclassify_vendor` — only
    `apply_rule` on the single new/updated rule.
  - Do not change the case-insensitive vendor-deduplication
    behavior of the bulk-update path.
  - Do not fold the bulk-update `is_verified=True` write into the
    new method.

- **If unclear, stop**:
  - If a test of the bulk-update handler depends on a specific
    ordering of "rules created" vs "transactions verified", stop and
    report. The migration preserves both, but the *order* may
    differ slightly; the agent should confirm the test asserts on
    end-state, not call sequence.

- **Done when**:
  - `TransactionIngestion.reclassify_vendor(vendor, category_id, *,
    vendor_display_name=None) -> ClassificationRule` is declared and
    implemented.
  - The transaction router's PATCH and bulk handlers call
    `build_ingestion(db).reclassify_vendor(...)` instead of
    `classification_service.auto_create_rule(...)` directly.
  - The router no longer imports `classification_service`.
  - Bulk path still marks all affected transactions
    `is_verified=true`.
  - `make test` and `make lint` pass.

- **Handoff**: write
  `docs/handoff/step-3-reclassify-vendor.md` summarizing: (a) the
  new method signature, (b) the call-site changes in
  `transaction_router.py`, (c) the new boundary-test cases in
  `test_ingestion.py`, (d) the new assertions in
  `test_transaction_api.py`.

**Test gate**: `make test && make lint`

---

## HITL checkpoints

None. All three steps are AFK with strong existing test coverage.

## Completion criteria

- All three plans' acceptance criteria met (each plan's checkboxes
  ticked).
- `make test && make lint` passes after Step 3.
- Manual smoke test:
  - `POST /api/import?filename=<fixture>` returns the expected
    counts and matches.
  - `POST /api/import/all` returns aggregate totals + match counts.
  - Re-running either is idempotent (no new rows, no duplicate
    matches).
  - PATCH on a transaction's category creates/updates a rule and
    propagates to unverified siblings.
  - Bulk update of N transactions across K vendors creates K rules
    and marks all N verified.
- All three handoff files exist:
  - `docs/handoff/step-1-parser-polymorphism.md`
  - `docs/handoff/step-2-ingestion-module.md`
  - `docs/handoff/step-3-reclassify-vendor.md`
- No frontend code changed (verify with `git diff --stat
  frontend/`).
- No DB migrations added (verify with
  `git status backend/alembic/versions/`).

## Out of scope

The following are deliberately not part of this work and should not
be touched:

- The `BaseParser.parse` / `RawTransaction` shape.
- The classification rule schema or the `find_matching_rule`
  precedence (exact > starts_with > contains).
- The payment-matching heuristics inside `detect_payments`
  (BECU↔Chase substring, 3-day window, exact-amount equality).
- Subscription detection.
- Any frontend file.
- The four other follow-on architectural candidates (#2, #3, #5
  from the original deepening discussion) — those are subsumed
  by this work or deferred.
