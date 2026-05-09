"""Transaction ingestion module.

Public surface:

* ``TransactionIngestion`` — Protocol with a single ``ingest(source: Path) ->
  IngestReport`` method.
* ``IngestReport`` and ``FileOutcome`` — frozen dataclasses describing the
  outcome of a single ingest call.
* ``build_ingestion(db: Session) -> TransactionIngestion`` — factory that
  returns a fresh ``IngestionService`` bound to the supplied session.

``IngestionService.ingest`` accepts either a single CSV file path or a
directory. For each file it performs SHA-256 file-hash dedup, parses with
the matched parser, dedups parsed rows against existing
``Transaction.import_hash`` values via a single bulk ``WHERE import_hash IN
(…)`` query, auto-creates accounts via the parser's ``account_default()``,
resolves categories through classification rules then the parser's
``map_source_category``, persists rows, writes an ``ImportLog`` entry, and
commits per file. Checking-side credit-card payments are no longer
auto-matched — users classify them manually via the existing transactions
UI (see ``docs/specs/2026-05-08-04-payments-redesign.md``).
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from sqlalchemy.orm import Session

from app.models import Account, Category, ClassificationRule, ImportLog, Transaction
from app.parsers.base import BaseParser, RawTransaction
from app.parsers.registry import detect_parser
from app.services.classification_service import (
    apply_rule,
    auto_create_rule,
    find_matching_rule,
)

logger = logging.getLogger(__name__)


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


class TransactionIngestion(Protocol):
    def ingest(self, source: Path) -> IngestReport: ...

    def reclassify_vendor(
        self,
        vendor: str,
        category_id: int,
        *,
        vendor_display_name: str | None = None,
    ) -> ClassificationRule: ...


def _file_hash(filepath: Path) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _resolve_account_id(
    db: Session,
    account_name: str,
    parser: BaseParser,
    account_cache: dict[str, int],
) -> int:
    """Resolve account_id by name; auto-create with parser-derived defaults."""
    if account_name in account_cache:
        return account_cache[account_name]

    account = db.query(Account).filter(Account.name == account_name).first()
    if account is None:
        parser_cls = parser.__class__.__name__
        acct_type, institution = parser.account_default()
        logger.warning(
            "Auto-creating account row name=%r type=%r institution=%r (parser=%s)",
            account_name,
            acct_type,
            institution,
            parser_cls,
        )
        account = Account(
            name=account_name,
            type=acct_type,
            institution=institution,
            is_archived=False,
        )
        db.add(account)
        db.flush()  # populate id without committing the outer transaction

    account_cache[account_name] = account.id
    return account.id


def _resolve_category_id(
    db: Session,
    raw: RawTransaction,
    parser: BaseParser,
    category_cache: dict[str, int | None],
) -> int | None:
    """Resolve category_id: first try classification rules, then parser's category map."""
    rule = find_matching_rule(db, raw.vendor)
    if rule and rule.category_id is not None:
        return rule.category_id

    if raw.source_category:
        canonical_name = parser.map_source_category(raw.source_category)
        if canonical_name is None:
            return None
        if canonical_name not in category_cache:
            cat = db.query(Category).filter(Category.name == canonical_name).first()
            category_cache[canonical_name] = cat.id if cat else None
        return category_cache[canonical_name]

    return None


class IngestionService:
    """Concrete ``TransactionIngestion`` implementation.

    One instance is created per HTTP request via ``build_ingestion(db)``.
    Holds a reference to the session for the duration of the request.
    """

    def __init__(self, db: Session):
        self._db = db

    def ingest(self, source: Path) -> IngestReport:
        if source.is_dir():
            outcomes = self._ingest_directory(source)
        else:
            outcomes = [self._import_one_file(source)]

        return IngestReport(
            files=outcomes,
            rows_imported=sum(o.rows_imported for o in outcomes),
            rows_skipped=sum(o.rows_skipped for o in outcomes),
        )

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

    def _ingest_directory(self, input_dir: Path) -> list[FileOutcome]:
        outcomes: list[FileOutcome] = []
        csv_files = sorted(input_dir.glob("*.csv")) + sorted(input_dir.glob("*.CSV"))
        seen: set[str] = set()
        for filepath in csv_files:
            resolved = str(filepath.resolve())
            if resolved in seen:
                continue
            seen.add(resolved)
            outcomes.append(self._import_one_file(filepath))
        return outcomes

    def _import_one_file(self, filepath: Path) -> FileOutcome:
        db = self._db
        filename = filepath.name

        parser = detect_parser(filepath)
        if parser is None:
            return FileOutcome(
                filename=filename,
                rows_imported=0,
                rows_skipped=0,
                error="Unknown format",
            )

        fhash = _file_hash(filepath)
        existing_log = db.query(ImportLog).filter(ImportLog.file_hash == fhash).first()
        if existing_log:
            return FileOutcome(
                filename=filename,
                rows_imported=0,
                rows_skipped=existing_log.rows_imported + existing_log.rows_skipped,
                error=None,
            )

        raw_transactions = parser.parse(filepath)

        # Bulk dedup: collect all parsed import_hashes, fetch the subset that
        # already exists in one query, materialize as a set for O(1) checks.
        parsed_hashes = [r.import_hash for r in raw_transactions]
        existing_hashes: set[str] = set()
        if parsed_hashes:
            rows = (
                db.query(Transaction.import_hash)
                .filter(Transaction.import_hash.in_(parsed_hashes))
                .all()
            )
            existing_hashes = {h for (h,) in rows}

        imported = 0
        skipped = 0
        category_cache: dict[str, int | None] = {}
        account_cache: dict[str, int] = {}

        for raw in raw_transactions:
            if raw.import_hash in existing_hashes:
                skipped += 1
                continue

            category_id = _resolve_category_id(db, raw, parser, category_cache)
            account_id = _resolve_account_id(db, raw.account, parser, account_cache)

            txn = Transaction(
                source_file=raw.source_file,
                account_id=account_id,
                date=raw.date,
                post_date=raw.post_date,
                raw_description=raw.raw_description,
                vendor=raw.vendor,
                amount=raw.amount,
                source_category=raw.source_category,
                category_id=category_id,
                type=raw.type,
                memo=raw.memo,
                import_hash=raw.import_hash,
            )
            db.add(txn)
            existing_hashes.add(raw.import_hash)  # guard against intra-file duplicates
            imported += 1

        log = ImportLog(
            filename=filename,
            file_hash=fhash,
            rows_imported=imported,
            rows_skipped=skipped,
        )
        db.add(log)
        db.commit()

        return FileOutcome(
            filename=filename,
            rows_imported=imported,
            rows_skipped=skipped,
        )


def build_ingestion(db: Session) -> TransactionIngestion:
    """Return a fresh ``IngestionService`` bound to ``db``."""
    return IngestionService(db)
