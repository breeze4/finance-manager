"""Step-function net-income service.

The table holds one row per "effective month": from that month forward
(until the next row), the stored ``take_home_amount`` is in effect.

Lookup semantics:
    For a target month ``M``, return the row with the largest
    ``effective_month <= M``. None if no such row exists.

Set semantics:
    Setting an amount for a month that already has a row overwrites that
    row. Otherwise inserts a new row.

Public functions are stateless — they take a SQLAlchemy ``Session`` and
work directly off the model. Conversion between the integer ``YYYYMM``
storage and ``"YYYY-MM"`` display strings happens here so callers can use
whichever shape is more convenient.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import NetIncomePeriod


def yyyymm(year: int, month: int) -> int:
    """Encode a (year, month) pair as the integer ``YYYYMM`` used by the model."""
    if month < 1 or month > 12:
        raise ValueError(f"month must be 1-12, got {month}")
    return year * 100 + month


def to_yyyymm_string(value: int) -> str:
    """Decode an integer ``YYYYMM`` back to a ``"YYYY-MM"`` string."""
    year = value // 100
    month = value % 100
    return f"{year:04d}-{month:02d}"


def parse_yyyymm_string(value: str) -> int:
    """Parse a ``"YYYY-MM"`` string into the integer ``YYYYMM`` form."""
    if len(value) != 7 or value[4] != "-":
        raise ValueError(f"month must be formatted YYYY-MM, got {value!r}")
    year = int(value[:4])
    month = int(value[5:])
    return yyyymm(year, month)


def current_month_yyyymm() -> int:
    today = date.today()
    return yyyymm(today.year, today.month)


def get_for_month(db: Session, month_yyyymm: int) -> Decimal | None:
    """Return the take-home amount in effect for the given month, or None.

    Step-function: returns the ``take_home_amount`` from the latest row
    whose ``effective_month <= month_yyyymm``.
    """
    row = (
        db.query(NetIncomePeriod)
        .filter(NetIncomePeriod.effective_month <= month_yyyymm)
        .order_by(NetIncomePeriod.effective_month.desc())
        .first()
    )
    if row is None:
        return None
    return row.take_home_amount


def get_period_for_month(db: Session, month_yyyymm: int) -> NetIncomePeriod | None:
    """Return the period row in effect for the given month, or None."""
    return (
        db.query(NetIncomePeriod)
        .filter(NetIncomePeriod.effective_month <= month_yyyymm)
        .order_by(NetIncomePeriod.effective_month.desc())
        .first()
    )


def set_from_month(
    db: Session,
    effective_month: int,
    take_home_amount: Decimal,
) -> NetIncomePeriod:
    """Upsert a period: overwrite if a row exists for this month, else insert."""
    existing = (
        db.query(NetIncomePeriod).filter(NetIncomePeriod.effective_month == effective_month).first()
    )
    if existing is not None:
        existing.take_home_amount = take_home_amount
        db.commit()
        db.refresh(existing)
        return existing

    row = NetIncomePeriod(
        effective_month=effective_month,
        take_home_amount=take_home_amount,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_history(db: Session) -> list[NetIncomePeriod]:
    """Return every period row, ordered ascending by effective_month."""
    return db.query(NetIncomePeriod).order_by(NetIncomePeriod.effective_month.asc()).all()
