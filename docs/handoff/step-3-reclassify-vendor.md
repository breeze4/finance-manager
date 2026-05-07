# Step 3 Handoff — Reclassify Vendor + User-Edit Migration

Plan: `docs/plans/2026-05-07-11-reclassify-vendor-and-user-edit-migration.md`
Branch: `step3-reclassify-vendor` (worktree).

## 1. New method on the Protocol and concrete class

`backend/app/services/ingestion.py`

Imports added:

```python
from app.models import Account, Category, ClassificationRule, ImportLog, Transaction
from app.services.classification_service import (
    apply_rule,
    auto_create_rule,
    find_matching_rule,
)
```

Protocol (additive — `ingest` unchanged):

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
```

Concrete implementation on `IngestionService` (verbatim):

```python
def reclassify_vendor(
    self,
    vendor: str,
    category_id: int,
    *,
    vendor_display_name: str | None = None,
) -> ClassificationRule:
    """Create or update an exact-match rule for the vendor and propagate.

    Composes ``classification_service.auto_create_rule`` and
    ``classification_service.apply_rule``: the former creates or updates
    the rule, the latter propagates the new ``category_id`` to all
    unverified transactions whose vendor matches the rule's pattern.
    Flushes; the caller commits. Does not modify ``is_verified``.
    """
    rule = auto_create_rule(
        self._db,
        vendor,
        category_id,
        vendor_display_name=vendor_display_name,
    )
    apply_rule(self._db, rule)
    self._db.flush()
    return rule
```

The method does not commit and does not touch `is_verified` on any
transaction. `auto_create_rule` and `apply_rule` each flush; the trailing
`self._db.flush()` is explicit per the plan ("the flush happens inside the
method").

## 2. Call-site changes in `transaction_router.py`

### Imports

Before:

```python
from app.services import classification_service, transaction_service
```

After:

```python
from app.services import transaction_service
from app.services.ingestion import build_ingestion
```

### `update_transaction` (PATCH)

Before:

```python
if body.category_id is not None:
    classification_service.auto_create_rule(db, txn.vendor, body.category_id)
    db.commit()
```

After:

```python
if body.category_id is not None:
    build_ingestion(db).reclassify_vendor(txn.vendor, body.category_id)
    db.commit()
```

### `bulk_update_transactions`

Before:

```python
if body.category_id is not None:
    txns = db.query(Transaction).filter(Transaction.id.in_(body.ids)).all()
    seen_vendors: set[str] = set()
    for txn in txns:
        vendor_lower = txn.vendor.lower()
        if vendor_lower not in seen_vendors:
            seen_vendors.add(vendor_lower)
            classification_service.auto_create_rule(db, txn.vendor, body.category_id)
    db.query(Transaction).filter(Transaction.id.in_(body.ids)).update(
        {"is_verified": True}, synchronize_session="fetch"
    )
    db.commit()
```

After:

```python
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

Case-insensitive dedup is preserved (first-seen casing wins). The
`is_verified=True` bulk write stays in the router. The router still
commits at the end.

## 3. New boundary tests in `backend/tests/test_ingestion.py`

Added a small `_make_txn(db, *, vendor, category_id, is_verified, import_hash)`
helper (direct `Transaction(...)` construction via `get_or_create_account`,
mirroring `test_payment_matching.py`'s idiom) and a new `TestReclassifyVendor`
class with five tests:

- `test_creates_new_exact_rule` — call on empty DB; assert exactly one
  `ClassificationRule` row with `vendor_pattern="Acme"`,
  `match_type="exact"`, `category_id=Groceries`.
- `test_updates_existing_rule_does_not_duplicate` — pre-seed an exact rule
  for "Acme" with Groceries; reclassify to Dining; assert one rule remains
  with `category_id=Dining`.
- `test_propagates_to_unverified_siblings` — two unverified "Acme" txns;
  reclassify; both `category_id` updated.
- `test_does_not_touch_verified_transactions` — one verified "Acme" txn
  with Dining; reclassify "Acme" to Groceries; verified txn's
  `category_id` stays Dining.
- `test_does_not_modify_is_verified_flag` — two unverified "Acme" txns;
  reclassify; both still have `is_verified=False`.

## 4. New assertions in `backend/tests/test_transaction_api.py`

Imported `ClassificationRule`. Extended `TestUpdateTransaction`:

- `test_patch_creates_classification_rule` — PATCH category on an "Acme"
  txn; query `ClassificationRule` and assert exactly one exact-match rule
  with the new `category_id`.
- `test_patch_propagates_to_unverified_siblings` — two unverified "Acme"
  txns; PATCH one; the other gets the new category.
- `test_patch_does_not_touch_verified_siblings` — one unverified, one
  verified "Acme" (with Dining); PATCH the unverified one to Groceries;
  the verified one's category stays Dining.
- `test_patch_updates_existing_rule_instead_of_duplicating` — PATCH
  "Acme" twice with different categories; assert exactly one rule, with
  the latest category.

Extended `TestBulkUpdate`:

- `test_bulk_update_creates_one_rule_per_unique_vendor` — five txns
  across two case-variant vendors ("Acme" x2, "ACME" x1, "Beta" x2),
  bulk-update all to Groceries; assert exactly two `ClassificationRule`
  rows (one per case-insensitive vendor), all five txns are
  `is_verified=True`, and all five have the new `category_id`.

## Verification

- Interface gate: PASS (`reclassify_vendor` on Protocol;
  `classification_service` no longer imported in router; `build_ingestion`
  imported).
- `make test`: PASS — 323 passed, 0 failed.
- `make lint`: PASS — `ruff check` and `ruff format --check` both clean.

No skips, no relaxations. No pre-existing failures encountered.
