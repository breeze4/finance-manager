import csv
import tempfile
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import Account, Category, ClassificationRule, ImportLog, Transaction
from app.services.ingestion import build_ingestion


def _seed_categories(db: Session) -> dict[str, int]:
    """Seed canonical categories and return name->id map."""
    names = [
        "Shopping",
        "Groceries",
        "Dining",
        "Health & Wellness",
        "Entertainment",
        "Bills & Utilities",
        "Travel",
        "Gas",
        "Education",
        "Personal",
        "Home",
        "Gifts & Donations",
        "Income",
        "Investments",
        "Transfers",
        "Uncategorized",
    ]
    cat_map = {}
    for n in names:
        cat = Category(name=n, is_system=True)
        db.add(cat)
    db.commit()
    for cat in db.query(Category).all():
        cat_map[cat.name] = cat.id
    return cat_map


def _chase_csv(rows: list[list[str]] | None = None) -> Path:
    """Create a Chase CSV temp file."""
    header = ["Transaction Date", "Post Date", "Description", "Category", "Type", "Amount", "Memo"]
    if rows is None:
        rows = [
            ["01/15/2025", "01/16/2025", "FRED-MEYER #0013", "Groceries", "Sale", "-45.67", ""],
            ["01/16/2025", "01/17/2025", "TST* DIN TAI FUNG", "Food & Drink", "Sale", "-89.00", ""],
            ["01/17/2025", "01/17/2025", "Payment Thank You-Mobile", "", "Payment", "500.00", ""],
        ]
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".CSV", delete=False, newline="")
    writer = csv.writer(f)
    writer.writerow(header)
    for row in rows:
        writer.writerow(row)
    f.close()
    return Path(f.name)


def _becu_csv() -> Path:
    """Create a BECU CSV temp file."""
    header = ["Date", "No.", "Description", "Debit", "Credit"]
    rows = [
        ["1/15/2025", "", "External Withdrawal - CHASE CREDIT CRD  - EPAY", "-500", ""],
        ["1/15/2025", "", "External Deposit - AXON ENTERPRISE PP - PAYROLL", "", "3000"],
        ["1/15/2025", "", "Dividend/Interest", "", "1.50"],
    ]
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, newline="")
    writer = csv.writer(f)
    writer.writerow(header)
    for row in rows:
        writer.writerow(row)
    f.close()
    return Path(f.name)


def _unknown_csv() -> Path:
    """Create a CSV with a header that no parser recognizes."""
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, newline="")
    writer = csv.writer(f)
    writer.writerow(["Foo", "Bar", "Baz"])
    writer.writerow(["1", "2", "3"])
    f.close()
    return Path(f.name)


class TestIngestFileDedup:
    def test_import_then_reimport_zero_new(self, db: Session):
        _seed_categories(db)
        filepath = _chase_csv()

        r1 = build_ingestion(db).ingest(filepath)
        assert len(r1.files) == 1
        assert r1.files[0].rows_imported == 3
        assert r1.files[0].rows_skipped == 0
        assert r1.rows_imported == 3
        assert r1.rows_skipped == 0

        # Second import of same file — file hash matches, all skipped
        r2 = build_ingestion(db).ingest(filepath)
        assert r2.files[0].rows_imported == 0
        assert r2.files[0].rows_skipped == 3

    def test_import_hash_dedup_across_files(self, db: Session):
        """Same transactions in two different files — second skips duplicates."""
        _seed_categories(db)
        rows = [
            ["01/15/2025", "01/16/2025", "FRED-MEYER #0013", "Groceries", "Sale", "-45.67", ""],
        ]
        file1 = _chase_csv(rows)
        file2 = _chase_csv(rows)  # Different file, same content

        r1 = build_ingestion(db).ingest(file1)
        assert r1.files[0].rows_imported == 1

        # file2 has different file hash (different temp path) but same row hash
        r2 = build_ingestion(db).ingest(file2)
        assert r2.files[0].rows_imported == 0
        assert r2.files[0].rows_skipped == 1

    def test_bulk_dedup_partial_overlap(self, db: Session):
        """Second file shares some import_hashes with first; only non-overlap imports.

        Exercises the new bulk WHERE import_hash IN (...) dedup path: with three
        rows in file2 where one matches a row already imported from file1, only
        the two new rows should be inserted.
        """
        _seed_categories(db)
        shared_row = [
            "01/15/2025",
            "01/16/2025",
            "FRED-MEYER #0013",
            "Groceries",
            "Sale",
            "-45.67",
            "",
        ]
        file1 = _chase_csv([shared_row])

        file2_rows = [
            shared_row,
            ["02/01/2025", "02/02/2025", "TARGET", "Shopping", "Sale", "-12.34", ""],
            ["02/02/2025", "02/03/2025", "AMAZON", "Shopping", "Sale", "-99.99", ""],
        ]
        file2 = _chase_csv(file2_rows)

        r1 = build_ingestion(db).ingest(file1)
        assert r1.files[0].rows_imported == 1

        r2 = build_ingestion(db).ingest(file2)
        assert r2.files[0].rows_imported == 2
        assert r2.files[0].rows_skipped == 1

        assert db.query(Transaction).count() == 3


class TestIngestCategoryMapping:
    def test_chase_categories_mapped(self, db: Session):
        cat_map = _seed_categories(db)
        filepath = _chase_csv()
        build_ingestion(db).ingest(filepath)

        txns = db.query(Transaction).order_by(Transaction.date).all()
        # "Groceries" -> our Groceries
        assert txns[0].category_id == cat_map["Groceries"]
        # "Food & Drink" -> our Dining
        assert txns[1].category_id == cat_map["Dining"]
        # Payment with empty category -> None
        assert txns[2].category_id is None

    def test_becu_no_categories(self, db: Session):
        _seed_categories(db)
        filepath = _becu_csv()
        build_ingestion(db).ingest(filepath)

        txns = db.query(Transaction).all()
        for t in txns:
            assert t.category_id is None
            assert t.source_category is None


class TestIngestRuleApplication:
    def test_rules_applied_during_import(self, db: Session):
        cat_map = _seed_categories(db)

        # Create a rule before importing
        rule = ClassificationRule(
            vendor_pattern="Fred-Meyer",
            match_type="exact",
            category_id=cat_map["Groceries"],
            vendor_display_name="Fred Meyer",
        )
        db.add(rule)
        db.commit()

        filepath = _chase_csv()
        build_ingestion(db).ingest(filepath)

        fred = db.query(Transaction).filter(Transaction.vendor == "Fred-Meyer").first()
        assert fred is not None
        assert fred.category_id == cat_map["Groceries"]

    def test_rule_overrides_source_category(self, db: Session):
        cat_map = _seed_categories(db)

        # Create a rule that overrides the Chase category mapping
        rule = ClassificationRule(
            vendor_pattern="Din Tai Fung",
            match_type="exact",
            category_id=cat_map["Entertainment"],  # Override: Food & Drink -> Entertainment
        )
        db.add(rule)
        db.commit()

        filepath = _chase_csv()
        build_ingestion(db).ingest(filepath)

        dtf = db.query(Transaction).filter(Transaction.vendor == "Din Tai Fung").first()
        assert dtf is not None
        # Rule should win over the parser's source-category map
        assert dtf.category_id == cat_map["Entertainment"]


class TestIngestLog:
    def test_import_creates_log(self, db: Session):
        _seed_categories(db)
        filepath = _chase_csv()
        build_ingestion(db).ingest(filepath)

        logs = db.query(ImportLog).all()
        assert len(logs) == 1
        assert logs[0].rows_imported == 3
        assert logs[0].rows_skipped == 0
        assert logs[0].file_hash


class TestIngestDirectory:
    def test_import_all_from_directory(self, db: Session):
        _seed_categories(db)
        tmpdir = Path(tempfile.mkdtemp())

        chase_path = _chase_csv()
        becu_path = _becu_csv()

        import shutil

        shutil.copy(chase_path, tmpdir / "chase.CSV")
        shutil.copy(becu_path, tmpdir / "becu.csv")

        report = build_ingestion(db).ingest(tmpdir)
        assert len(report.files) == 2
        assert report.rows_imported == 6  # 3 chase + 3 becu

    def test_unknown_format_does_not_abort_batch(self, db: Session):
        """An unknown-format file produces error='Unknown format' and other files still import."""
        _seed_categories(db)
        tmpdir = Path(tempfile.mkdtemp())

        chase_path = _chase_csv()
        unknown_path = _unknown_csv()

        import shutil

        shutil.copy(chase_path, tmpdir / "chase.CSV")
        shutil.copy(unknown_path, tmpdir / "weird.csv")

        report = build_ingestion(db).ingest(tmpdir)
        assert len(report.files) == 2
        by_name = {f.filename: f for f in report.files}
        assert by_name["chase.CSV"].rows_imported == 3
        assert by_name["chase.CSV"].error is None
        assert by_name["weird.csv"].rows_imported == 0
        assert by_name["weird.csv"].error == "Unknown format"
        assert report.rows_imported == 3


class TestIngestWithRealData:
    def test_import_real_files(self, db: Session):
        """Integration test against actual sample CSVs."""
        _seed_categories(db)
        input_dir = Path(__file__).resolve().parent.parent.parent / "input"
        if not input_dir.is_dir():
            return

        report = build_ingestion(db).ingest(input_dir)
        assert report.rows_imported > 1000  # We know there are ~1270 unique transactions

        # Verify Chase transactions have categories
        chase_account = db.query(Account).filter(Account.name == "Chase CC").first()
        becu_account = db.query(Account).filter(Account.name == "BECU Checking").first()
        assert chase_account is not None
        assert becu_account is not None
        chase_with_cat = (
            db.query(Transaction)
            .filter(
                Transaction.account_id == chase_account.id,
                Transaction.category_id.isnot(None),
            )
            .count()
        )
        assert chase_with_cat > 0

        # Verify BECU transactions have no categories
        becu_with_cat = (
            db.query(Transaction)
            .filter(
                Transaction.account_id == becu_account.id,
                Transaction.category_id.isnot(None),
            )
            .count()
        )
        assert becu_with_cat == 0

        # Verify dedup: re-import yields 0 new
        report2 = build_ingestion(db).ingest(input_dir)
        assert report2.rows_imported == 0
