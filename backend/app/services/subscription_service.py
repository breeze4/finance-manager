import statistics
from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy.orm import Session, joinedload

from app.models import Category, Subscription, Transaction

# Standard periods in days and their labels.
_PERIODS = [
    ("weekly", 7),
    ("bi-weekly", 14),
    ("monthly", 30),
    ("quarterly", 91),
    ("annual", 365),
]

# Tolerance: median interval must be within ±30% of a standard period.
_TOLERANCE = 0.30

# Minimum number of transactions from a vendor to consider for detection.
_MIN_TRANSACTIONS = 3

# Amount coefficient of variation threshold for fixed vs variable.
_FIXED_CV_THRESHOLD = 0.05


@dataclass
class DetectionResult:
    subscriptions_found: int
    total_active: int


def _classify_frequency(median_interval: float, intervals: list[int]) -> str | None:
    """Match a median interval to a standard frequency, or None if no match.

    Requires that at least 50% of individual intervals also fall within the
    tolerance band of the matched period. This prevents false positives when
    the median happens to land in a band despite highly irregular spacing.
    """
    for label, period in _PERIODS:
        low = period * (1 - _TOLERANCE)
        high = period * (1 + _TOLERANCE)
        if low <= median_interval <= high:
            # Check consistency: majority of intervals must also be in range.
            in_range = sum(1 for iv in intervals if low <= iv <= high)
            if in_range / len(intervals) >= 0.5:
                return label
    return None


def _annual_multiplier(frequency: str) -> float:
    """How many occurrences per year for a given frequency."""
    return {
        "weekly": 52,
        "bi-weekly": 26,
        "monthly": 12,
        "quarterly": 4,
        "annual": 1,
    }[frequency]


def detect_subscriptions(db: Session) -> DetectionResult:
    """Detect recurring charges from transaction history.

    Algorithm:
    1. Group outflow transactions by vendor (excluding transfers).
    2. For vendors with 3+ transactions, compute intervals between consecutive charges.
    3. If median interval matches a standard period (±30%), classify frequency.
    4. Amount std dev < 5% of mean → fixed; otherwise → variable.
    5. Upsert into subscriptions table.
    """
    # Get all outflow, non-transfer transactions grouped by vendor.
    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.is_transfer.is_(False),
            Transaction.amount < 0,
        )
        .order_by(Transaction.vendor, Transaction.date)
        .all()
    )

    # Group by vendor.
    vendor_groups: dict[str, list[Transaction]] = defaultdict(list)
    for txn in transactions:
        vendor_groups[txn.vendor].append(txn)

    # Clear existing detected subscriptions before re-detecting.
    # Preserve user overrides (is_active=False) by only deleting auto-detected active ones.
    db.query(Subscription).filter(Subscription.is_active.is_(True)).delete()
    db.flush()

    found = 0

    for vendor, txns in vendor_groups.items():
        if len(txns) < _MIN_TRANSACTIONS:
            continue

        # Sort by date (should already be sorted, but be safe).
        txns.sort(key=lambda t: t.date)

        # Compute intervals between consecutive charges.
        intervals = []
        for i in range(1, len(txns)):
            delta = (txns[i].date - txns[i - 1].date).days
            if delta > 0:
                intervals.append(delta)

        if not intervals:
            continue

        median_interval = statistics.median(intervals)
        frequency = _classify_frequency(median_interval, intervals)
        if frequency is None:
            continue

        # Determine fixed vs variable from amounts.
        amounts = [abs(t.amount) for t in txns]
        mean_amount = statistics.mean(amounts)
        if mean_amount == 0:
            continue

        if len(amounts) >= 2:
            std_dev = statistics.stdev(amounts)
            cv = std_dev / mean_amount
        else:
            cv = 0.0

        is_fixed = cv < _FIXED_CV_THRESHOLD
        subscription_type = "fixed" if is_fixed else "variable"

        # Compute annual estimate.
        multiplier = _annual_multiplier(frequency)
        annual_estimate = round(mean_amount * multiplier, 2)

        # Find the most common category among these transactions.
        category_id = _most_common_category(txns)

        sub = Subscription(
            vendor=vendor,
            frequency=frequency,
            subscription_type=subscription_type,
            amount=round(mean_amount, 2) if is_fixed else None,
            amount_min=round(min(amounts), 2) if not is_fixed else None,
            amount_max=round(max(amounts), 2) if not is_fixed else None,
            annual_estimate=annual_estimate,
            last_charge_date=txns[-1].date,
            category_id=category_id,
            is_active=True,
        )
        db.add(sub)
        found += 1

    db.commit()

    total_active = db.query(Subscription).filter(Subscription.is_active.is_(True)).count()
    return DetectionResult(subscriptions_found=found, total_active=total_active)


def _most_common_category(txns: list[Transaction]) -> int | None:
    """Return the most frequently occurring category_id, or None."""
    counts: dict[int, int] = defaultdict(int)
    for t in txns:
        if t.category_id is not None:
            counts[t.category_id] += 1
    if not counts:
        return None
    return max(counts, key=counts.get)


def list_subscriptions(db: Session) -> list[Subscription]:
    """List all subscriptions with category eagerly loaded."""
    return (
        db.query(Subscription)
        .options(joinedload(Subscription.category))
        .order_by(Subscription.annual_estimate.desc())
        .all()
    )


def get_subscription(db: Session, subscription_id: int) -> Subscription | None:
    return (
        db.query(Subscription)
        .options(joinedload(Subscription.category))
        .filter(Subscription.id == subscription_id)
        .first()
    )


def update_subscription(
    db: Session,
    subscription_id: int,
    *,
    is_active: bool | None = None,
    category_id: int | None = None,
) -> Subscription | None:
    """Update a subscription's overridable fields."""
    sub = db.query(Subscription).filter(Subscription.id == subscription_id).first()
    if sub is None:
        return None

    if is_active is not None:
        sub.is_active = is_active
    if category_id is not None:
        # Validate category exists.
        cat = db.query(Category).filter(Category.id == category_id).first()
        if cat is not None:
            sub.category_id = category_id

    db.commit()
    db.refresh(sub)
    return sub
