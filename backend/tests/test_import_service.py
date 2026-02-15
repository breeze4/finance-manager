import csv
import tempfile
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import Category, ClassificationRule, ImportLog, Transaction
from app.services.import_service import import_all, import_file


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


class TestImportFileDedup:
    def test_import_then_reimport_zero_new(self, db: Session):
        _seed_categories(db)
        filepath = _chase_csv()
        r1 = import_file(db, filepath)
        assert r1.rows_imported == 3
        assert r1.rows_skipped == 0

        # Second import of same file — file hash matches, all skipped
        r2 = import_file(db, filepath)
        assert r2.rows_imported == 0
        assert r2.rows_skipped == 3

    def test_import_hash_dedup_across_files(self, db: Session):
        """Same transactions in two different files — second skips duplicates."""
        _seed_categories(db)
        rows = [
            ["01/15/2025", "01/16/2025", "FRED-MEYER #0013", "Groceries", "Sale", "-45.67", ""],
        ]
        file1 = _chase_csv(rows)
        file2 = _chase_csv(rows)  # Different file, same content

        r1 = import_file(db, file1)
        assert r1.rows_imported == 1

        # file2 has different file hash (different temp path) but same row hash
        r2 = import_file(db, file2)
        assert r2.rows_imported == 0
        assert r2.rows_skipped == 1


class TestImportCategoryMapping:
    def test_chase_categories_mapped(self, db: Session):
        cat_map = _seed_categories(db)
        filepath = _chase_csv()
        import_file(db, filepath)

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
        import_file(db, filepath)

        txns = db.query(Transaction).all()
        for t in txns:
            assert t.category_id is None
            assert t.source_category is None


class TestImportRuleApplication:
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
        import_file(db, filepath)

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
        import_file(db, filepath)

        dtf = db.query(Transaction).filter(Transaction.vendor == "Din Tai Fung").first()
        assert dtf is not None
        # Rule should win over CHASE_CATEGORY_MAP
        assert dtf.category_id == cat_map["Entertainment"]


class TestImportLog:
    def test_import_creates_log(self, db: Session):
        _seed_categories(db)
        filepath = _chase_csv()
        import_file(db, filepath)

        logs = db.query(ImportLog).all()
        assert len(logs) == 1
        assert logs[0].rows_imported == 3
        assert logs[0].rows_skipped == 0
        assert logs[0].file_hash


class TestImportAll:
    def test_import_all_from_directory(self, db: Session):
        _seed_categories(db)
        tmpdir = Path(tempfile.mkdtemp())

        # Create two files
        chase_path = _chase_csv()
        becu_path = _becu_csv()

        # Move to tmpdir
        import shutil

        shutil.copy(chase_path, tmpdir / "chase.CSV")
        shutil.copy(becu_path, tmpdir / "becu.csv")

        results = import_all(db, tmpdir)
        assert len(results) == 2
        total = sum(r.rows_imported for r in results)
        assert total == 6  # 3 chase + 3 becu


class TestImportWithRealData:
    def test_import_real_files(self, db: Session):
        """Integration test against actual sample CSVs."""
        _seed_categories(db)
        input_dir = Path(__file__).resolve().parent.parent.parent / "input"
        if not input_dir.is_dir():
            return

        results = import_all(db, input_dir)
        total_imported = sum(r.rows_imported for r in results)
        assert total_imported > 1000  # We know there are ~1270 unique transactions

        # Verify Chase transactions have categories
        chase_with_cat = (
            db.query(Transaction)
            .filter(Transaction.account == "Chase CC", Transaction.category_id.isnot(None))
            .count()
        )
        assert chase_with_cat > 0

        # Verify BECU transactions have no categories
        becu_with_cat = (
            db.query(Transaction)
            .filter(Transaction.account == "BECU Checking", Transaction.category_id.isnot(None))
            .count()
        )
        assert becu_with_cat == 0

        # Verify dedup: re-import yields 0 new
        results2 = import_all(db, input_dir)
        total_imported2 = sum(r.rows_imported for r in results2)
        assert total_imported2 == 0
