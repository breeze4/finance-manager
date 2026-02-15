from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from pathlib import Path


@dataclass
class RawTransaction:
    source_file: str
    account: str
    date: date
    post_date: date | None
    raw_description: str
    vendor: str
    amount: float
    source_category: str | None
    type: str | None
    memo: str | None
    import_hash: str


class BaseParser(ABC):
    @abstractmethod
    def can_parse(self, headers: list[str]) -> bool:
        """Return True if this parser handles the given CSV headers."""

    @abstractmethod
    def parse(self, filepath: Path) -> list[RawTransaction]:
        """Parse the CSV file into a list of RawTransactions."""
