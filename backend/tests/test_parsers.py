import csv
import tempfile
from datetime import date
from pathlib import Path

from app.parsers.base import BaseParser, RawTransaction
from app.parsers.becu_checking import BecuCheckingParser, _extract_vendor_and_type
from app.parsers.chase_cc import ChaseCcParser, _account_name_from_filename, _extract_vendor
from app.parsers.registry import detect_parser


def _write_csv(rows: list[list[str]], suffix: str = ".csv") -> Path:
    """Write rows to a temp CSV file and return its path."""
    f = tempfile.NamedTemporaryFile(mode="w", suffix=suffix, delete=False, newline="")
    writer = csv.writer(f)
    for row in rows:
        writer.writerow(row)
    f.close()
    return Path(f.name)


# -- BaseParser Defaults --


class TestBaseParserDefaults:
    def test_default_account_default(self):
        class _StubParser(BaseParser):
            def can_parse(self, headers: list[str]) -> bool:
                return False

            def parse(self, filepath: Path) -> list[RawTransaction]:
                return []

        assert _StubParser().account_default() == ("asset", None)

    def test_default_map_source_category(self):
        class _StubParser(BaseParser):
            def can_parse(self, headers: list[str]) -> bool:
                return False

            def parse(self, filepath: Path) -> list[RawTransaction]:
                return []

        assert _StubParser().map_source_category("anything") is None
        assert _StubParser().map_source_category(None) is None


# -- Chase CC Parser Tests --


class TestChaseCcVendorExtraction:
    def test_strip_tst_prefix(self):
        assert _extract_vendor("TST* DIN TAI FUNG - SOUTH") == "Din Tai Fung - South"

    def test_strip_sq_prefix(self):
        assert _extract_vendor("SQ *ONO POKE EDMONDS") == "Ono Poke Edmonds"

    def test_strip_sp_prefix(self):
        assert _extract_vendor("SP STIRLING TIMEPIECES") == "Stirling Timepieces"

    def test_strip_wl_prefix(self):
        assert _extract_vendor("WL *Steam Purchase") == "Steam Purchase"

    def test_strip_frg_prefix(self):
        assert _extract_vendor("FRG*TEAMFANSHOP") == "Teamfanshop"

    def test_strip_hlu_prefix(self):
        assert _extract_vendor("HLU*HULUPLUS") == "Huluplus"

    def test_strip_store_number(self):
        assert _extract_vendor("FRED-MEYER #0013") == "Fred-Meyer"

    def test_strip_trailing_digits(self):
        assert _extract_vendor("STEAMGAMES.COM 4259522985") == "Steamgames.Com"

    def test_html_entity(self):
        result = _extract_vendor("BANH MI DELUXE &amp; BOSS TE")
        assert "&" in result
        assert "&amp;" not in result

    def test_plain_vendor(self):
        assert _extract_vendor("TWITCH") == "Twitch"

    def test_payment(self):
        assert _extract_vendor("Payment Thank You-Mobile") == "Payment Thank You-Mobile"


class TestChaseCcParser:
    def test_can_parse_chase(self):
        headers = [
            "Transaction Date",
            "Post Date",
            "Description",
            "Category",
            "Type",
            "Amount",
            "Memo",
        ]
        parser = ChaseCcParser()
        assert parser.can_parse(headers) is True

    def test_cannot_parse_becu(self):
        headers = ["Date", "No.", "Description", "Debit", "Credit"]
        parser = ChaseCcParser()
        assert parser.can_parse(headers) is False

    def test_parse_basic_row(self):
        rows = [
            ["Transaction Date", "Post Date", "Description", "Category", "Type", "Amount", "Memo"],
            ["01/15/2025", "01/16/2025", "FRED-MEYER #0013", "Groceries", "Sale", "-45.67", ""],
        ]
        filepath = _write_csv(rows)
        parser = ChaseCcParser()
        txns = parser.parse(filepath)

        assert len(txns) == 1
        t = txns[0]
        assert t.date == date(2025, 1, 15)
        assert t.post_date == date(2025, 1, 16)
        assert t.vendor == "Fred-Meyer"
        assert t.amount == -45.67
        assert t.account == "Chase CC"
        assert t.source_category == "Groceries"
        assert t.type == "Sale"

    def test_import_hash_stable(self):
        rows = [
            ["Transaction Date", "Post Date", "Description", "Category", "Type", "Amount", "Memo"],
            ["01/15/2025", "01/16/2025", "FRED-MEYER #0013", "Groceries", "Sale", "-45.67", ""],
        ]
        filepath = _write_csv(rows)
        parser = ChaseCcParser()
        txns1 = parser.parse(filepath)
        txns2 = parser.parse(filepath)
        assert txns1[0].import_hash == txns2[0].import_hash

    def test_map_source_category(self):
        parser = ChaseCcParser()
        assert parser.map_source_category("Food & Drink") == "Dining"
        assert parser.map_source_category("Groceries") == "Groceries"
        assert parser.map_source_category("Professional Services") == "Uncategorized"
        assert parser.map_source_category(None) == "Uncategorized"
        assert parser.map_source_category("SomeNewCategory") == "Uncategorized"

    def test_account_default(self):
        parser = ChaseCcParser()
        assert parser.account_default() == ("credit_card", "Chase")

    def test_account_name_from_filename(self):
        assert _account_name_from_filename("Chase1234_Activity.CSV") == "Chase 1234"
        assert _account_name_from_filename("Chase5678_Activity.CSV") == "Chase 5678"
        # Fallback for files that don't match the Chase export naming.
        assert _account_name_from_filename("anything.csv") == "Chase CC"
        assert _account_name_from_filename("tmp123.CSV") == "Chase CC"

    def test_parse_real_chase_file(self):
        filepath = Path(__file__).resolve().parent.parent.parent / "input"
        chase_files = list(filepath.glob("Chase*.CSV"))
        if not chase_files:
            return  # Skip if no sample data
        parser = ChaseCcParser()
        sample = chase_files[0]
        expected_account = _account_name_from_filename(sample.name)
        txns = parser.parse(sample)
        assert len(txns) > 0
        for t in txns:
            assert t.account == expected_account
            assert t.import_hash
            assert t.date is not None
            assert t.amount != 0


# -- BECU Checking Parser Tests --


class TestBecuVendorExtraction:
    def test_external_withdrawal(self):
        vendor, txn_type = _extract_vendor_and_type(
            "External Withdrawal - CHASE CREDIT CRD  - EPAY"
        )
        assert vendor == "Chase Credit Crd"
        assert txn_type == "EPAY"

    def test_external_deposit_payroll(self):
        vendor, txn_type = _extract_vendor_and_type(
            "External Deposit - AXON ENTERPRISE 4100075043        PP - PAYROLL"
        )
        assert vendor == "Axon Enterprise Pp"
        assert txn_type == "PAYROLL"

    def test_dividend_interest(self):
        vendor, txn_type = _extract_vendor_and_type("Dividend/Interest")
        assert vendor == "Becu Interest"
        assert txn_type == "Interest"

    def test_wire_transfer(self):
        vendor, txn_type = _extract_vendor_and_type(
            "Descriptive Withdrawal - Outgoing Wire Transfer"
        )
        # Falls through to the simple pattern (no trailing type segment)
        assert "Wire Transfer" in vendor or "Wire" in vendor

    def test_online_banking_transfer(self):
        vendor, txn_type = _extract_vendor_and_type(
            "Withdrawal - Online Banking Transfer To 3628180204 CK"
        )
        assert vendor == "Becu Transfer"
        assert txn_type == "Transfer"

    def test_vanguard_investment(self):
        vendor, txn_type = _extract_vendor_and_type(
            "External Withdrawal - VANGUARD BUY INDIVIDUAL BUY - INVESTMENT"
        )
        assert vendor == "Vanguard Buy Individual Buy"
        assert txn_type == "INVESTMENT"

    def test_strips_long_account_numbers(self):
        vendor, _ = _extract_vendor_and_type(
            "External Withdrawal - BOEING EMP CR U 000000000000000000 - LOAN PAYMT"
        )
        assert "000000" not in vendor


class TestBecuCheckingParser:
    def test_can_parse_becu(self):
        headers = ["Date", "No.", "Description", "Debit", "Credit"]
        parser = BecuCheckingParser()
        assert parser.can_parse(headers) is True

    def test_cannot_parse_chase(self):
        headers = [
            "Transaction Date",
            "Post Date",
            "Description",
            "Category",
            "Type",
            "Amount",
            "Memo",
        ]
        parser = BecuCheckingParser()
        assert parser.can_parse(headers) is False

    def test_parse_debit(self):
        rows = [
            ['"Date"', '"No."', '"Description"', '"Debit"', '"Credit"'],
            ['"1/15/2025"', '""', '"External Withdrawal - VENMO  - PAYMENT"', '"-100"', '""'],
        ]
        # Write raw since BECU uses quoted fields
        f = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, newline="")
        for row in rows:
            f.write(",".join(row) + "\n")
        f.close()
        filepath = Path(f.name)

        parser = BecuCheckingParser()
        txns = parser.parse(filepath)

        assert len(txns) == 1
        t = txns[0]
        assert t.date == date(2025, 1, 15)
        assert t.amount == -100.0
        assert t.account == "BECU Checking"
        assert t.source_category is None

    def test_import_hash_stable(self):
        rows = [
            ["Date", "No.", "Description", "Debit", "Credit"],
            ["1/15/2025", "", "Dividend/Interest", "", "3.32"],
        ]
        filepath = _write_csv(rows)
        parser = BecuCheckingParser()
        txns1 = parser.parse(filepath)
        txns2 = parser.parse(filepath)
        assert txns1[0].import_hash == txns2[0].import_hash

    def test_account_default(self):
        parser = BecuCheckingParser()
        assert parser.account_default() == ("checking", "BECU")

    def test_map_source_category_returns_none(self):
        parser = BecuCheckingParser()
        assert parser.map_source_category("anything") is None
        assert parser.map_source_category(None) is None

    def test_parse_real_becu_file(self):
        filepath = Path(__file__).resolve().parent.parent.parent / "input"
        becu_files = list(filepath.glob("becu*.csv"))
        if not becu_files:
            return  # Skip if no sample data
        parser = BecuCheckingParser()
        txns = parser.parse(becu_files[0])
        assert len(txns) > 0
        for t in txns:
            assert t.account == "BECU Checking"
            assert t.import_hash
            assert t.source_category is None


# -- Registry Tests --


class TestRegistry:
    def test_detect_chase(self):
        rows = [
            ["Transaction Date", "Post Date", "Description", "Category", "Type", "Amount", "Memo"],
            ["01/01/2025", "01/02/2025", "TEST", "Shopping", "Sale", "-10", ""],
        ]
        filepath = _write_csv(rows)
        parser = detect_parser(filepath)
        assert isinstance(parser, ChaseCcParser)

    def test_detect_becu(self):
        rows = [
            ["Date", "No.", "Description", "Debit", "Credit"],
            ["1/1/2025", "", "Dividend/Interest", "", "1.00"],
        ]
        filepath = _write_csv(rows)
        parser = detect_parser(filepath)
        assert isinstance(parser, BecuCheckingParser)

    def test_detect_unknown(self):
        rows = [["Col1", "Col2", "Col3"], ["a", "b", "c"]]
        filepath = _write_csv(rows)
        parser = detect_parser(filepath)
        assert parser is None
