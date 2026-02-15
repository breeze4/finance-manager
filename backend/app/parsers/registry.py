import csv
from pathlib import Path

from app.parsers.base import BaseParser, RawTransaction
from app.parsers.becu_checking import BecuCheckingParser
from app.parsers.chase_cc import ChaseCcParser

PARSERS: list[BaseParser] = [
    ChaseCcParser(),
    BecuCheckingParser(),
]


def detect_parser(filepath: Path) -> BaseParser | None:
    with open(filepath, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        try:
            headers = next(reader)
        except StopIteration:
            return None

    headers = [h.strip() for h in headers]
    for parser in PARSERS:
        if parser.can_parse(headers):
            return parser
    return None


def parse_file(filepath: Path) -> list[RawTransaction]:
    parser = detect_parser(filepath)
    if parser is None:
        raise ValueError(f"No parser found for {filepath.name}")
    return parser.parse(filepath)
