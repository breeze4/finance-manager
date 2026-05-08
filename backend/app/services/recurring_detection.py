"""Shared recurring-pattern detection helpers.

Pulled out of ``subscription_service`` so both subscription detection
(outflow charges) and paycheck detection (inflow income) can share the
same ``classify_frequency`` logic without duplicating constants or
tolerance bands.

A "frequency" is matched when the median interval between events lands
within ``TOLERANCE`` of one of the standard periods AND at least 50% of
individual intervals also fall in-band — this rejects bursty/irregular
streams that happen to median into a band.
"""

# Standard periods in days and their labels.
#
# These five frequencies are what subscription detection has used since
# day one. Paycheck detection wants an extra ``semi-monthly`` band that
# subscription detection does not — adding it to this list would break
# subscription tests by reclassifying ~15-day-interval charges. Instead,
# paycheck detection passes its own ``periods`` to ``classify_frequency``.
PERIODS: list[tuple[str, int]] = [
    ("weekly", 7),
    ("bi-weekly", 14),
    ("monthly", 30),
    ("quarterly", 91),
    ("annual", 365),
]

# Same set augmented with semi-monthly, used by paycheck detection where
# distinguishing 14-day from 15-day cadences matters (twice-a-month payroll
# is meaningfully different from a true bi-weekly schedule).
PAYCHECK_PERIODS: list[tuple[str, int]] = [
    ("weekly", 7),
    ("bi-weekly", 14),
    ("semi-monthly", 15),
    ("monthly", 30),
]

# Median interval must be within ±TOLERANCE of a standard period.
TOLERANCE: float = 0.30


def classify_frequency(
    median_interval: float,
    intervals: list[int],
    periods: list[tuple[str, int]] | None = None,
) -> str | None:
    """Match a median interval to a standard frequency, or None if no match.

    ``periods`` defaults to ``PERIODS`` (the subscription set). Pass
    ``PAYCHECK_PERIODS`` to include semi-monthly classification — its band
    overlaps bi-weekly's, so we resolve overlaps by picking whichever
    period is closest to the observed median.

    Requires that at least 50% of individual intervals also fall within the
    tolerance band of the matched period. This prevents false positives when
    the median happens to land in a band despite highly irregular spacing.
    """
    bands = periods if periods is not None else PERIODS

    best_label: str | None = None
    best_distance: float = float("inf")
    for label, period in bands:
        low = period * (1 - TOLERANCE)
        high = period * (1 + TOLERANCE)
        if not (low <= median_interval <= high):
            continue
        in_range = sum(1 for iv in intervals if low <= iv <= high)
        if in_range / len(intervals) < 0.5:
            continue
        distance = abs(median_interval - period)
        if distance < best_distance:
            best_distance = distance
            best_label = label
    return best_label
