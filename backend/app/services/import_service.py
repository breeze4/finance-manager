import hashlib
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import Category, ImportLog, Transaction
from app.parsers.base import RawTransaction
from app.parsers.chase_cc import ChaseCcParser
from app.parsers.registry import detect_parser
from app.services.classification_service import find_matching_rule


@dataclass
class ImportResult:
    filename: str
    rows_imported: int
    rows_skipped: int
    error: str | None = None


def _file_hash(filepath: Path) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _resolve_category_id(
    db: Session,
    raw: RawTransaction,
    parser: object,
    category_cache: dict[str, int | None],
) -> int | None:
    """Resolve category_id: first try classification rules, then parser's category map."""
    # Try classification rules first
    rule = find_matching_rule(db, raw.vendor)
    if rule and rule.category_id is not None:
        return rule.category_id

    # Fall back to parser's source category mapping
    if isinstance(parser, ChaseCcParser) and raw.source_category:
        canonical_name = parser.map_category(raw.source_category)
        if canonical_name not in category_cache:
            cat = db.query(Category).filter(Category.name == canonical_name).first()
            category_cache[canonical_name] = cat.id if cat else None
        return category_cache[canonical_name]

    return None


def import_file(db: Session, filepath: Path) -> ImportResult:
    """Import a single CSV file into the database."""
    filename = filepath.name

    # Detect parser
    parser = detect_parser(filepath)
    if parser is None:
        return ImportResult(
            filename=filename, rows_imported=0, rows_skipped=0, error="Unknown format"
        )

    # Check if exact file already imported
    fhash = _file_hash(filepath)
    existing_log = db.query(ImportLog).filter(ImportLog.file_hash == fhash).first()
    if existing_log:
        return ImportResult(
            filename=filename,
            rows_imported=0,
            rows_skipped=existing_log.rows_imported + existing_log.rows_skipped,
            error=None,
        )

    # Parse
    raw_transactions = parser.parse(filepath)

    # Import with dedup
    imported = 0
    skipped = 0
    category_cache: dict[str, int | None] = {}

    for raw in raw_transactions:
        # Check dedup by import_hash
        exists = db.query(Transaction.id).filter(Transaction.import_hash == raw.import_hash).first()
        if exists:
            skipped += 1
            continue

        category_id = _resolve_category_id(db, raw, parser, category_cache)

        txn = Transaction(
            source_file=raw.source_file,
            account=raw.account,
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
        imported += 1

    # Log the import
    log = ImportLog(
        filename=filename,
        file_hash=fhash,
        rows_imported=imported,
        rows_skipped=skipped,
    )
    db.add(log)
    db.commit()

    return ImportResult(filename=filename, rows_imported=imported, rows_skipped=skipped)


def import_all(db: Session, input_dir: Path) -> list[ImportResult]:
    """Import all CSV files from the input directory."""
    results = []
    csv_files = sorted(input_dir.glob("*.csv")) + sorted(input_dir.glob("*.CSV"))
    # Deduplicate in case of case-insensitive filesystem
    seen: set[str] = set()
    for filepath in csv_files:
        resolved = str(filepath.resolve())
        if resolved in seen:
            continue
        seen.add(resolved)
        result = import_file(db, filepath)
        results.append(result)
    return results
