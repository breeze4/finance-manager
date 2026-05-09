"""Payments service.

The credit-card account is the source of truth for payment activity:
every positive-amount transaction on an account of type ``credit_card``
is treated as money flowing back into the card (payment, refund, credit).
Users classify checking-side debits manually via the existing
transactions UI; no auto-matching runs at import time.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

from sqlalchemy import case, cast, func, literal
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.types import Integer, String

from app.models import Account, Transaction

BucketSize = Literal["month", "quarter", "year"]

# Day-count breakpoints for ``bucket_size_for_range``.
#
# Spec: "≤ ~12 months → month; ~13mo–4y → quarter; ≥5y → year".
# We pick:
#   span <= 366 days  → "month"   (covers any 12-month window incl. leap year)
#   span <= 4 * 366   → "quarter" (1464 days; covers any 4-year window incl. one leap)
#   span >  4 * 366   → "year"
#
# This keeps both edges inclusive on the lower side so a clean 12-month or
# 4-year window picks the smaller bucket; anything beyond rolls over.
_MONTH_MAX_DAYS = 366
_QUARTER_MAX_DAYS = 4 * 366  # 1464


def bucket_size_for_range(start: date | None, end: date | None) -> BucketSize:
    """Pure helper: derive the chart bucket size from a date span.

    Breakpoints (in days, where ``span = (end - start).days``):

    - ``span <= 366`` → ``"month"``
    - ``366 < span <= 1464`` → ``"quarter"``
    - ``span > 1464`` → ``"year"``

    When either ``start`` or ``end`` is missing the span is undefined, so
    we default to ``"month"`` — the safest, finest-grained option for an
    indeterminate window. The caller is responsible for supplying both
    bounds when it cares about quarter/year bucketing.
    """
    if start is None or end is None:
        return "month"
    span = (end - start).days
    if span <= _MONTH_MAX_DAYS:
        return "month"
    if span <= _QUARTER_MAX_DAYS:
        return "quarter"
    return "year"


@dataclass
class SeriesBucket:
    label: str
    charges_total: float
    payments_total: float


@dataclass
class SeriesResult:
    bucket_size: BucketSize
    buckets: list[SeriesBucket]


_MONTH_SHORT = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
]


def _month_label(year: int, month: int) -> str:
    return f"{_MONTH_SHORT[month - 1]} {year}"


def _quarter_label(year: int, quarter: int) -> str:
    return f"Q{quarter} {year}"


def _year_label(year: int) -> str:
    return str(year)


def _enumerate_month_buckets(start: date, end: date) -> list[tuple[str, str]]:
    """Return ``[(key, label), ...]`` covering every month in ``[start, end]``.

    Key is ``YYYY-MM`` to match SQLite's ``strftime('%Y-%m', date)``.
    """
    out: list[tuple[str, str]] = []
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        out.append((f"{y:04d}-{m:02d}", _month_label(y, m)))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


def _enumerate_quarter_buckets(start: date, end: date) -> list[tuple[str, str]]:
    """Return ``[(key, label), ...]`` covering every quarter in ``[start, end]``.

    Key is ``YYYY-Q`` (e.g. ``2025-1``).
    """
    out: list[tuple[str, str]] = []
    y, q = start.year, ((start.month - 1) // 3) + 1
    end_q = ((end.month - 1) // 3) + 1
    while (y, q) <= (end.year, end_q):
        out.append((f"{y:04d}-{q}", _quarter_label(y, q)))
        q += 1
        if q > 4:
            q = 1
            y += 1
    return out


def _enumerate_year_buckets(start: date, end: date) -> list[tuple[str, str]]:
    """Return ``[(key, label), ...]`` covering every year in ``[start, end]``."""
    return [(f"{y:04d}", _year_label(y)) for y in range(start.year, end.year + 1)]


def _enumerate_buckets(bucket_size: BucketSize, start: date, end: date) -> list[tuple[str, str]]:
    if bucket_size == "month":
        return _enumerate_month_buckets(start, end)
    if bucket_size == "quarter":
        return _enumerate_quarter_buckets(start, end)
    return _enumerate_year_buckets(start, end)


def _bucket_key_expr(bucket_size: BucketSize):
    """SQLite expression producing the bucket key matching ``_enumerate_*``.

    - ``month``  → ``strftime('%Y-%m', date)``
    - ``year``   → ``strftime('%Y', date)``
    - ``quarter`` → ``strftime('%Y', date) || '-' || quarter`` where
      ``quarter = ((month-1)/3)+1`` evaluated with INTEGER cast on the
      division so SQLite uses integer (truncating) arithmetic — without
      the cast SQLAlchemy emits ``/`` which SQLite interprets as float
      division (e.g. month=2 would give ``1.333`` instead of ``1``).
    """
    if bucket_size == "month":
        return func.strftime("%Y-%m", Transaction.date)
    if bucket_size == "year":
        return func.strftime("%Y", Transaction.date)
    month_int = cast(func.strftime("%m", Transaction.date), Integer)
    quarter = cast((month_int - 1) / 3, Integer) + 1
    year_text = func.strftime("%Y", Transaction.date)
    return year_text.op("||")(literal("-")).op("||")(cast(quarter, String))


def list_cc_payments(
    db: Session,
    *,
    account_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[Transaction]:
    """List positive-amount transactions on credit-card accounts.

    Joined to ``accounts`` and filtered to ``accounts.type = 'credit_card'``
    AND ``transactions.amount > 0``. Optional ``account_id`` narrows to a
    single CC; absent means "All CCs". Optional ``start_date`` / ``end_date``
    are inclusive bounds on ``transactions.date``. Sorted by ``date DESC,
    id DESC``.
    """
    query = (
        db.query(Transaction)
        .join(Account, Transaction.account_id == Account.id)
        .options(joinedload(Transaction.account))
        .filter(Account.type == "credit_card")
        .filter(Transaction.amount > 0)
    )
    if account_id is not None:
        query = query.filter(Transaction.account_id == account_id)
    if start_date is not None:
        query = query.filter(Transaction.date >= start_date)
    if end_date is not None:
        query = query.filter(Transaction.date <= end_date)
    return query.order_by(Transaction.date.desc(), Transaction.id.desc()).all()


def get_series(
    db: Session,
    *,
    account_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> SeriesResult:
    """Aggregate charges and payments per bucket across credit-card accounts.

    Returns one row per bucket spanning ``[start_date, end_date]`` inclusive,
    even for buckets with no activity (zero-filled). Bucket size is derived
    from the span via :func:`bucket_size_for_range`.

    For each bucket:
        ``payments_total`` = sum of positive amounts (payments, refunds)
        ``charges_total`` = sum of |amount| for negative amounts (charges)

    Filters:
        - ``accounts.type = 'credit_card'``
        - optional ``account_id`` narrows to one card
        - optional ``start_date`` / ``end_date`` (inclusive) on ``transactions.date``
    """
    bucket_size = bucket_size_for_range(start_date, end_date)

    # If we don't have both bounds we can't generate a bucket spine. Return
    # whatever the aggregator gives us with no zero-fill.
    if start_date is None or end_date is None:
        spine: list[tuple[str, str]] = []
    else:
        spine = _enumerate_buckets(bucket_size, start_date, end_date)

    bucket_key = _bucket_key_expr(bucket_size)

    payments_sum = func.coalesce(
        func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0.0)),
        0.0,
    )
    charges_sum = func.coalesce(
        func.sum(case((Transaction.amount < 0, -Transaction.amount), else_=0.0)),
        0.0,
    )

    query = (
        db.query(
            bucket_key.label("bucket_key"),
            payments_sum.label("payments_total"),
            charges_sum.label("charges_total"),
        )
        .join(Account, Transaction.account_id == Account.id)
        .filter(Account.type == "credit_card")
    )
    if account_id is not None:
        query = query.filter(Transaction.account_id == account_id)
    if start_date is not None:
        query = query.filter(Transaction.date >= start_date)
    if end_date is not None:
        query = query.filter(Transaction.date <= end_date)
    query = query.group_by("bucket_key")

    by_key: dict[str, tuple[float, float]] = {}
    for row in query.all():
        by_key[row.bucket_key] = (
            float(row.payments_total or 0.0),
            float(row.charges_total or 0.0),
        )

    if spine:
        buckets = [
            SeriesBucket(
                label=label,
                payments_total=by_key.get(key, (0.0, 0.0))[0],
                charges_total=by_key.get(key, (0.0, 0.0))[1],
            )
            for key, label in spine
        ]
    else:
        # Fallback: no bounds → emit whatever we got, sorted by key.
        buckets = []
        for key in sorted(by_key.keys()):
            payments, charges = by_key[key]
            buckets.append(
                SeriesBucket(
                    label=key,
                    payments_total=payments,
                    charges_total=charges,
                )
            )

    return SeriesResult(bucket_size=bucket_size, buckets=buckets)
