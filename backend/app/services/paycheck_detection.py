"""Suggest a monthly net income from observed income transactions.

Algorithm mirrors ``subscription_service.detect_subscriptions`` but on
the income side: group inflow (``amount > 0``, ``is_transfer=False``)
transactions by vendor, compute intervals, and classify each cluster's
cadence via the shared :mod:`recurring_detection` helpers.

The shared helper's default period table doesn't include semi-monthly
because subscription detection doesn't want to distinguish ~15-day
charges from bi-weekly. Paycheck detection does — twice-a-month payroll
is a real and common cadence — so we pass ``PAYCHECK_PERIODS`` to
``classify_frequency``.

A vendor needs at least three income transactions to be considered. For
each matched vendor we project its mean amount up to a monthly figure
using ``_MONTHLY_MULTIPLIERS``; the suggestion is the SUM across all
matched income vendors so multi-paycheck households (e.g. spouse +
freelance) work without extra plumbing.

Returns ``None`` when no income vendor matched a known cadence.
"""

import statistics
from collections import defaultdict
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import Transaction
from app.services.recurring_detection import PAYCHECK_PERIODS, classify_frequency

_MIN_TRANSACTIONS = 3

# Conversion from cadence label to monthly multiplier.
# Weekly: 52 / 12 ≈ 4.333; bi-weekly: 26 / 12 ≈ 2.167; semi-monthly: 2/mo;
# monthly: 1/mo.
_MONTHLY_MULTIPLIERS: dict[str, Decimal] = {
    "weekly": Decimal("52") / Decimal("12"),
    "bi-weekly": Decimal("26") / Decimal("12"),
    "semi-monthly": Decimal("2"),
    "monthly": Decimal("1"),
}


def suggest_monthly_net(db: Session) -> Decimal | None:
    """Return the suggested monthly net income, or ``None``.

    Sums monthly-projected mean amounts across every income vendor whose
    cadence classifies as weekly, bi-weekly, semi-monthly, or monthly.
    """
    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.is_transfer.is_(False),
            Transaction.amount > 0,
        )
        .order_by(Transaction.vendor, Transaction.date)
        .all()
    )

    vendor_groups: dict[str, list[Transaction]] = defaultdict(list)
    for txn in transactions:
        vendor_groups[txn.vendor].append(txn)

    total: Decimal = Decimal("0")
    matched = False

    for txns in vendor_groups.values():
        if len(txns) < _MIN_TRANSACTIONS:
            continue

        txns.sort(key=lambda t: t.date)

        intervals: list[int] = []
        for i in range(1, len(txns)):
            delta = (txns[i].date - txns[i - 1].date).days
            if delta > 0:
                intervals.append(delta)

        if not intervals:
            continue

        median_interval = statistics.median(intervals)
        frequency = classify_frequency(median_interval, intervals, periods=PAYCHECK_PERIODS)
        if frequency is None or frequency not in _MONTHLY_MULTIPLIERS:
            continue

        amounts = [Decimal(str(t.amount)) for t in txns]
        mean_amount = sum(amounts) / Decimal(len(amounts))
        monthly = mean_amount * _MONTHLY_MULTIPLIERS[frequency]
        total += monthly
        matched = True

    if not matched:
        return None

    # Round to two decimal places for display-friendly Decimals.
    return total.quantize(Decimal("0.01"))
