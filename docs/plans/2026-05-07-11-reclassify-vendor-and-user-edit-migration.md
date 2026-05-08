# Reclassify Vendor + User-Edit Migration

## Parent spec

`docs/specs/2026-05-07-01-ingestion-deep-module.md` — see "Solution"
section, the `reclassify_vendor` paragraph, and "Data Flow → User-edit
reclassification."

## What to build

Add `reclassify_vendor(vendor, category_id, *, vendor_display_name=None)`
to the `TransactionIngestion` Protocol and its concrete implementation.
The method creates or updates an exact-match classification rule for the
vendor, applies the rule to the vendor's unverified transactions, and
flushes — consolidating today's two-step pattern of
`auto_create_rule()` + a manual transaction-update loop into a single
authoritative call.

Migrate the transaction router's PATCH handler (single-vendor case) and
bulk-update handler (loop over unique vendors) to call
`reclassify_vendor`. Remove the manual vendor-deduplication loop and the
direct import of `classification_service` from the router. The
`is_verified=True` write stays in the router per the resolved spec
decision; `reclassify_vendor` does not touch the verification flag.

## Type

AFK

## Blocked by

- Blocked by
  `2026-05-07-10-ingestion-module-and-import-migration.md`

The new method hangs off the `TransactionIngestion` interface and the
`build_ingestion(db)` factory introduced in plan `…-10`.

## User stories addressed

The parent spec is a lightweight architectural spec without numbered
user stories. This slice addresses the "Problem" bullets:

- "The transaction router's PATCH and bulk-update handlers … call the
  classification service directly and reimplement vendor-deduplication
  in a manual loop" — both are replaced by a single
  `reclassify_vendor` call per unique vendor.
- "The user-edit path and the import path produce different code paths
  for the same conceptual operation" — both paths now route through
  the same module.

## Acceptance criteria

- [ ] The `TransactionIngestion` Protocol declares `reclassify_vendor(
      vendor: str, category_id: int, *, vendor_display_name: str | None
      = None) -> ClassificationRule`.
- [ ] The concrete implementation creates a new exact-match rule when
      none exists for the vendor, or updates the existing one
      (preserving today's `auto_create_rule` semantics, including the
      case-insensitive vendor match used for "is there already a rule
      for this vendor" lookups).
- [ ] The implementation also propagates the new `category_id` to all
      `is_verified = false` transactions whose vendor matches the new
      rule's pattern (today's `apply_rule` behavior, scoped to this
      one rule). The flush happens inside the method; the caller
      issues the final commit.
- [ ] The implementation does **not** modify `is_verified` on any
      transaction. The router continues to issue its own `is_verified
      = true` write when the user explicitly verifies via bulk update.
- [ ] The transaction router's `update_transaction` (PATCH) handler
      replaces its direct
      `classification_service.auto_create_rule(...)` call with one
      `build_ingestion(db).reclassify_vendor(...)` call when
      `body.category_id` is present.
- [ ] The transaction router's `bulk_update_transactions` handler
      replaces its manual `seen_vendors` loop with a single set
      comprehension over the affected transactions' vendors followed
      by one `reclassify_vendor` call per unique vendor.
- [ ] `from app.services import classification_service` (or the
      equivalent `from app.services.classification_service import …`)
      is removed from the transaction router's imports — the router
      no longer references the service directly.
- [ ] Existing transaction-router tests pass unchanged. New
      assertions cover: a single PATCH creates/updates a rule and
      propagates to siblings; a bulk update with N transactions of K
      unique vendors creates/updates K rules (not N); the bulk
      update's `is_verified=true` side effect still applies to all N
      transactions.
- [ ] All existing tests pass: `test_classification.py`,
      `test_transaction_api.py`, `test_ingestion.py`, plus the
      router-level tests for accounts, snapshots, stats, etc.

## Owns

- `backend/app/services/ingestion.py` — add `reclassify_vendor` to the
  `TransactionIngestion` Protocol and the concrete `IngestionService`.
  Do not modify the existing `ingest()` method's signature or behavior.
- `backend/app/routers/transaction_router.py` — `update_transaction`
  handler (the auto-create-rule block) and `bulk_update_transactions`
  handler (the seen-vendors loop, plus the import of
  `classification_service`).
- `backend/tests/test_transaction_api.py` — extend with the new
  assertions listed above.
- `backend/tests/test_ingestion.py` — add direct boundary tests for
  `reclassify_vendor` covering: new rule creation, existing rule
  update, sibling propagation to unverified transactions only,
  no-side-effect on verified transactions, no-side-effect on
  `is_verified` flag.

## Must not touch

- `backend/app/services/classification_service.py` — the pure
  functions (`find_matching_rule`, `auto_create_rule`, `apply_rule`,
  `apply_all_rules`) remain available for internal use by the
  ingestion module and any non-router callers. Do not modify
  signatures.
- `backend/app/routers/import_router.py` — finalized in plan `…-10`.
- `backend/app/services/payment_service.py` — out of scope.
- `backend/app/routers/transaction_router.py` `list_transactions` and
  `get_transaction` handlers — unrelated to this slice.
- `backend/app/parsers/*` — finalized in plan `…-09`.

## Defines interfaces

- `TransactionIngestion.reclassify_vendor(...)` in
  `backend/app/services/ingestion.py` — extends the Protocol. No
  downstream consumer plans.

## Pattern exemplar

- **Follow the pattern in**: `backend/app/services/classification_service.py`
  — `auto_create_rule` and `apply_rule` are the existing
  primitives this method composes. The new method's body is largely
  "call `auto_create_rule`, then call `apply_rule` on the returned
  rule, then `flush`." Reuse those functions; do not reimplement
  their logic.
- **Follow the pattern in**: `backend/app/routers/transaction_router.py`
  current `update_transaction` and `bulk_update_transactions`
  handlers — preserve their HTTP shape and response semantics; only
  the internals change.

## Tasks

- [ ] Add `reclassify_vendor(vendor, category_id, *,
      vendor_display_name=None) -> ClassificationRule` to the
      `TransactionIngestion` Protocol.
- [ ] Implement the method on `IngestionService`. Internally: call
      `classification_service.auto_create_rule(self._db, vendor,
      category_id, vendor_display_name=vendor_display_name)` to
      create/update the rule, then call
      `classification_service.apply_rule(self._db, rule)` to
      propagate to unverified siblings, then `self._db.flush()`.
      Return the rule.
- [ ] Confirm the method does not commit; the caller commits.
- [ ] Update the transaction router's `update_transaction`: replace
      `classification_service.auto_create_rule(db, txn.vendor,
      body.category_id); db.commit()` with
      `build_ingestion(db).reclassify_vendor(txn.vendor,
      body.category_id); db.commit()`.
- [ ] Update the transaction router's `bulk_update_transactions`:
      replace the `seen_vendors` loop with a set comprehension over
      the affected transactions' vendors (case-insensitively
      deduplicated, mirroring today's behavior), then call
      `build_ingestion(db).reclassify_vendor(vendor,
      body.category_id)` for each unique vendor. Keep the existing
      `is_verified=true` bulk update and the final `db.commit()`.
- [ ] Remove the `classification_service` import from the
      transaction router.
- [ ] Add boundary tests for `reclassify_vendor` to
      `test_ingestion.py`: new rule, existing rule update, sibling
      propagation, no-effect on verified transactions, no-effect on
      `is_verified` flag.
- [ ] Extend `test_transaction_api.py` to assert: PATCH path creates
      or updates exactly one rule and propagates; bulk path with N
      transactions of K unique vendors produces K rules; bulk path
      still marks all N transactions verified.
- [ ] Run the full backend test suite; confirm all green.
- [ ] Smoke-test manually: PATCH a transaction's category, observe
      the rule appears (or updates) and any sibling unverified
      transactions get the new category; bulk-update a multi-vendor
      selection, observe per-vendor rules and the verified flag set.

## Implementation notes

**Why two existing functions, not one new big one.**
`classification_service.auto_create_rule` and `apply_rule` already exist
and are correct. `reclassify_vendor` is the *composition* of the two
plus a flush — it does not contain new business logic. Resist the
temptation to inline either function's body inside the new method;
keep the call sites visible so future changes to rule precedence or
SQL flushing still flow through the centralized helpers.

**Case sensitivity in vendor dedup.** Today's bulk-update handler
deduplicates vendors via `vendor.lower()` in a `set`. Preserve that
behavior when collecting unique vendors before calling
`reclassify_vendor`. The first-seen casing wins as the argument to
`reclassify_vendor` (today's behavior — `auto_create_rule` itself
uses an `ilike` match for finding existing rules, so the casing of
the argument does not affect rule lookup).

**Why `is_verified` stays in the router.** Per the resolved spec
decision, the ingestion module handles only "classify this vendor."
The "the user confirmed this category" intent — expressed by the
bulk-update handler setting `is_verified=true` — is a router-level
concern that uses HTTP-level information (the user's explicit choice
to bulk-confirm). Folding it into `reclassify_vendor` would entangle
the user-edit semantics with the import path, where rows are imported
unverified and only become verified through later user action.

**Commit boundary.** `reclassify_vendor` flushes; the router commits.
The PATCH path commits once at the end of the handler (after both the
field updates and the rule operation). The bulk path commits once at
the end after the per-vendor loop and the `is_verified` bulk write.
Today's commit semantics are preserved.

**Concrete migration of `bulk_update_transactions`** (the highest-churn
section). Today's body:

```text
count = transaction_service.bulk_update_transactions(db, body.ids, **kwargs)
if body.category_id is not None:
    txns = db.query(Transaction).filter(Transaction.id.in_(body.ids)).all()
    seen_vendors = set()
    for txn in txns:
        if txn.vendor.lower() not in seen_vendors:
            seen_vendors.add(txn.vendor.lower())
            classification_service.auto_create_rule(db, txn.vendor, body.category_id)
    db.query(Transaction).filter(Transaction.id.in_(body.ids)).update(
        {"is_verified": True}, synchronize_session="fetch"
    )
    db.commit()
```

After the migration:

```text
count = transaction_service.bulk_update_transactions(db, body.ids, **kwargs)
if body.category_id is not None:
    txns = db.query(Transaction).filter(Transaction.id.in_(body.ids)).all()
    seen_lower: set[str] = set()
    unique_vendors: list[str] = []
    for txn in txns:
        key = txn.vendor.lower()
        if key not in seen_lower:
            seen_lower.add(key)
            unique_vendors.append(txn.vendor)
    ingestion = build_ingestion(db)
    for vendor in unique_vendors:
        ingestion.reclassify_vendor(vendor, body.category_id)
    db.query(Transaction).filter(Transaction.id.in_(body.ids)).update(
        {"is_verified": True}, synchronize_session="fetch"
    )
    db.commit()
```

**PATCH migration**:

```text
# Before
classification_service.auto_create_rule(db, txn.vendor, body.category_id)
db.commit()

# After
build_ingestion(db).reclassify_vendor(txn.vendor, body.category_id)
db.commit()
```

**No reuse of `apply_all_rules`.** This slice does not call
`classification_service.apply_all_rules`. That function remains
available for any future "re-classify everything" operation but is
out of scope here.
