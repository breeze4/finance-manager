import csv
import hashlib
import html
import re
from datetime import datetime
from pathlib import Path

from app.parsers.base import BaseParser, RawTransaction

EXPECTED_HEADERS = [
    "Transaction Date",
    "Post Date",
    "Description",
    "Category",
    "Type",
    "Amount",
    "Memo",
]

# Maps Chase category names to our canonical category names.
# Unmapped categories fall through to "Uncategorized".
CHASE_CATEGORY_MAP: dict[str, str] = {
    "Bills & Utilities": "Bills & Utilities",
    "Education": "Education",
    "Entertainment": "Entertainment",
    "Food & Drink": "Dining",
    "Gas": "Gas",
    "Gifts & Donations": "Gifts & Donations",
    "Groceries": "Groceries",
    "Health & Wellness": "Health & Wellness",
    "Home": "Home",
    "Personal": "Personal",
    "Professional Services": "Uncategorized",
    "Shopping": "Shopping",
    "Travel": "Travel",
}

# Prefixes to strip from descriptions before vendor extraction.
_VENDOR_PREFIXES = re.compile(
    r"^(TST\*\s*|WL\s*\*|SQ\s*\*|SP\s+|FRG\*|HLU\*|VTG\*|YPS\*)", re.IGNORECASE
)

# Trailing store numbers: #XXXX or standalone 4+ digit sequences at the end.
_TRAILING_STORE_NUM = re.compile(r"\s*[#]\d+$")
_TRAILING_DIGITS = re.compile(r"\s+\d{4,}$")

# Chase exports are named like "Chase1234_Activity20240507_...CSV" — the
# digits between "Chase" and the first underscore are the card's last-four,
# which we use to keep each card's transactions in their own account.
_CHASE_FILENAME = re.compile(r"^Chase(\d+)_", re.IGNORECASE)


def _account_name_from_filename(filename: str) -> str:
    m = _CHASE_FILENAME.match(filename)
    if m:
        return f"Chase {m.group(1)}"
    return "Chase CC"


def _extract_vendor(description: str) -> str:
    vendor = html.unescape(description).strip()
    vendor = _VENDOR_PREFIXES.sub("", vendor).strip()
    vendor = _TRAILING_STORE_NUM.sub("", vendor)
    vendor = _TRAILING_DIGITS.sub("", vendor)
    vendor = re.sub(r"\s{2,}", " ", vendor).strip()
    return vendor.title() if vendor else description.title()


def _compute_hash(txn_date: str, post_date: str, description: str, amount: str) -> str:
    raw = f"{txn_date}|{post_date}|{description}|{amount}"
    return hashlib.sha256(raw.encode()).hexdigest()


class ChaseCcParser(BaseParser):
    def can_parse(self, headers: list[str]) -> bool:
        return headers[:7] == EXPECTED_HEADERS

    def parse(self, filepath: Path) -> list[RawTransaction]:
        transactions: list[RawTransaction] = []
        filename = filepath.name
        account_name = _account_name_from_filename(filename)

        with open(filepath, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                txn_date_str = row["Transaction Date"].strip()
                post_date_str = row["Post Date"].strip()
                description = row["Description"].strip()
                category = row["Category"].strip() or None
                txn_type = row["Type"].strip() or None
                amount_str = row["Amount"].strip()
                memo = row["Memo"].strip() or None

                txn_date = datetime.strptime(txn_date_str, "%m/%d/%Y").date()
                post_date = datetime.strptime(post_date_str, "%m/%d/%Y").date()
                amount = float(amount_str)
                vendor = _extract_vendor(description)

                transactions.append(
                    RawTransaction(
                        source_file=filename,
                        account=account_name,
                        date=txn_date,
                        post_date=post_date,
                        raw_description=description,
                        vendor=vendor,
                        amount=amount,
                        source_category=category,
                        type=txn_type,
                        memo=memo,
                        import_hash=_compute_hash(
                            txn_date_str, post_date_str, description, amount_str
                        ),
                    )
                )

        return transactions

    def account_default(self) -> tuple[str, str | None]:
        return ("credit_card", "Chase")

    def map_source_category(self, source_category: str | None) -> str | None:
        if not source_category:
            return "Uncategorized"
        return CHASE_CATEGORY_MAP.get(source_category, "Uncategorized")
