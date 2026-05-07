import csv
import hashlib
import re
from datetime import datetime
from pathlib import Path

from app.parsers.base import BaseParser, RawTransaction

EXPECTED_HEADERS = ["Date", "No.", "Description", "Debit", "Credit"]

# Pattern: "(External|Descriptive) (Withdrawal|Deposit) - VENDOR_INFO - TYPE"
_EXT_PATTERN = re.compile(r"^(External|Descriptive)\s+(Withdrawal|Deposit)\s+-\s+(.+?)\s+-\s+(.+)$")

# "Withdrawal - Online Banking Transfer ..."
_ONLINE_TRANSFER = re.compile(r"^Withdrawal\s+-\s+Online Banking Transfer\b")


def _extract_vendor_and_type(description: str) -> tuple[str, str | None]:
    """Extract a clean vendor name and transaction type from BECU description."""
    desc = description.strip()

    # Dividend/Interest
    if desc == "Dividend/Interest":
        return "Becu Interest", "Interest"

    # Online banking transfer
    if _ONLINE_TRANSFER.match(desc):
        return "Becu Transfer", "Transfer"

    # Standard pattern: External/Descriptive Withdrawal/Deposit - VENDOR - TYPE
    m = _EXT_PATTERN.match(desc)
    if m:
        direction = m.group(2)  # Withdrawal or Deposit
        vendor_raw = m.group(3).strip()
        txn_type = m.group(4).strip()

        vendor = _clean_vendor(vendor_raw)

        # Infer a more useful type
        if "Wire Transfer" in desc:
            inferred_type = "Wire Transfer"
        elif direction == "Deposit":
            inferred_type = txn_type or "Deposit"
        else:
            inferred_type = txn_type or "Withdrawal"

        return vendor, inferred_type

    # Descriptive Withdrawal/Deposit without the trailing type
    simple = re.match(r"^(External|Descriptive)\s+(Withdrawal|Deposit)\s+-\s+(.+)$", desc)
    if simple:
        vendor_raw = simple.group(3).strip()
        return _clean_vendor(vendor_raw), simple.group(2)

    # Fallback
    return desc.title(), None


def _clean_vendor(vendor_raw: str) -> str:
    """Clean up a raw vendor string from BECU descriptions."""
    vendor = vendor_raw.strip()

    # Strip long account number sequences (e.g., "000000000000000000")
    vendor = re.sub(r"\s+\d{10,}", "", vendor)

    # Strip trailing account-like numbers (4+ digits at end after space)
    vendor = re.sub(r"\s+\d{4,}$", "", vendor)

    # Collapse multiple spaces
    vendor = re.sub(r"\s{2,}", " ", vendor).strip()

    return vendor.title() if vendor else vendor_raw.title()


def _compute_hash(date_str: str, description: str, amount: float) -> str:
    raw = f"{date_str}|{description}|{amount}"
    return hashlib.sha256(raw.encode()).hexdigest()


class BecuCheckingParser(BaseParser):
    def can_parse(self, headers: list[str]) -> bool:
        return headers[:5] == EXPECTED_HEADERS

    def account_default(self) -> tuple[str, str | None]:
        return ("checking", "BECU")

    def parse(self, filepath: Path) -> list[RawTransaction]:
        transactions: list[RawTransaction] = []
        filename = filepath.name

        with open(filepath, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                date_str = row["Date"].strip()
                description = row["Description"].strip()
                debit_str = row["Debit"].strip()
                credit_str = row["Credit"].strip()

                txn_date = datetime.strptime(date_str, "%m/%d/%Y").date()

                if debit_str:
                    amount = float(debit_str)  # Already negative
                elif credit_str:
                    amount = float(credit_str)  # Already positive
                else:
                    continue  # Skip rows with no amount

                vendor, txn_type = _extract_vendor_and_type(description)

                transactions.append(
                    RawTransaction(
                        source_file=filename,
                        account="BECU Checking",
                        date=txn_date,
                        post_date=None,
                        raw_description=description,
                        vendor=vendor,
                        amount=amount,
                        source_category=None,
                        type=txn_type,
                        memo=None,
                        import_hash=_compute_hash(date_str, description, amount),
                    )
                )

        return transactions
