"""Subscription-due helpers — has-it-hit-this-month and remaining-due.

Two public functions:

* ``subscriptions_already_hit(db, year_month)`` answers "for the requested
  calendar month, which active subscriptions have already charged?" Used
  by ``pace_service`` to compute ``subs_already_hit`` per category.

* ``subscriptions_remaining(db, date_from, date_to)`` returns active
  subscriptions whose next-expected-charge date falls in ``[date_from,
  date_to]`` and that have NOT already been matched by a transaction.
  Step 4 wraps this in an HTTP endpoint without changing the helper.

Hit-detection rule (spec, "Subscription hit-detection"): a non-transfer
transaction matches a subscription iff:

  - ``transaction.category_id == subscription.category_id``
  - amount within ±5% of the subscription's expected amount
  - date within ±7 days of ``last_charge_date + frequency_period`` mapped
    into the current calendar month

For amount-fluctuating subs (``amount`` is NULL but ``amount_min`` /
``amount_max`` are set) the expected amount is the midpoint of the range.

Defensive cases:
  - ``is_active = False`` subscriptions are excluded from both helpers.
  - Subscriptions with ``category_id = NULL`` are excluded from
    ``subscriptions_already_hit`` (no category to attribute to) but
    INCLUDED in ``subscriptions_remaining`` so the dashboard can list
    upcoming charges with an "(uncategorized)" label.
"""

from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Category, Subscription, Transaction

# Frequency string → days-per-period. Strings match
# ``recurring_detection.PERIODS`` and the ``Subscription.frequency`` column.
_FREQUENCY_DAYS: dict[str, int] = {
    "weekly": 7,
    "bi-weekly": 14,
    "monthly": 30,
    "quarterly": 91,
    "annual": 365,
}

# Match window: ±5% on amount AND within 7 days of expected date.
_AMOUNT_TOLERANCE: Decimal = Decimal("0.05")
_DATE_WINDOW_DAYS: int = 7


def _expected_amount(sub: Subscription) -> Decimal:
    """Return the expected charge amount for a subscription as Decimal.

    Fixed subs carry ``amount`` directly. Variable subs use the midpoint of
    ``[amount_min, amount_max]``. Returns 0 if neither is populated (a
    defensive fallback — the parser should always populate one).
    """
    if sub.amount is not None:
        return Decimal(str(sub.amount))
    if sub.amount_min is not None and sub.amount_max is not None:
        return (Decimal(str(sub.amount_min)) + Decimal(str(sub.amount_max))) / Decimal("2")
    if sub.amount_min is not None:
        return Decimal(str(sub.amount_min))
    if sub.amount_max is not None:
        return Decimal(str(sub.amount_max))
    return Decimal("0")


def _expected_date_in_month(sub: Subscription, year: int, month: int) -> date:
    """Map a subscription's next-expected-charge into a target calendar month.

    The naive computation is ``last_charge_date + frequency_days``; we then
    advance/retreat by the frequency until the result lands in the target
    month. For frequencies that don't divide a month evenly (e.g., weekly,
    bi-weekly) we return the last occurrence whose day falls in the target
    month — that's the spec's expected-date for "this calendar month".

    For annual subs whose anniversary doesn't fall in the target month,
    we return the anniversary date clamped into the target month (so the
    ±7-day window can never span out into another month). Practically, an
    annual sub's "expected this month" is a no-op unless ``last_charge_date
    + 365d`` lands in the target month.
    """
    period_days = _FREQUENCY_DAYS.get(sub.frequency)
    if period_days is None:
        # Unknown frequency — fall back to last_charge_date clamped to month.
        return _clamp_to_month(sub.last_charge_date, year, month)

    # Walk forward from last_charge_date by frequency_days until we land in
    # the target (year, month) — or pass it.
    candidate = sub.last_charge_date + timedelta(days=period_days)
    # Bound the walk so a misconfigured row can't loop forever.
    for _ in range(400):
        if candidate.year == year and candidate.month == month:
            return candidate
        if (candidate.year, candidate.month) > (year, month):
            # Walked past the target; for monthly/quarterly/annual subs this
            # means the sub doesn't expect a charge this month. Return the
            # candidate anyway — callers compare it to the actual range and
            # exclude it if out of range.
            return candidate
        candidate = candidate + timedelta(days=period_days)
    return candidate


def _clamp_to_month(d: date, year: int, month: int) -> date:
    """Return d's day-of-month inside (year, month), clamped to month length."""
    last_day = monthrange(year, month)[1]
    day = min(d.day, last_day)
    return date(year, month, day)


def _amount_matches(txn_amount: float, expected: Decimal) -> bool:
    """±5% tolerance against the expected amount.

    Compares absolute values so the sign convention (transactions are
    negative for outflows, subscriptions amounts are positive) doesn't
    matter. Boundary is inclusive of exactly ±5%.
    """
    if expected == 0:
        return False
    txn = abs(Decimal(str(txn_amount)))
    diff = abs(txn - expected)
    return diff <= expected * _AMOUNT_TOLERANCE


def _date_matches(txn_date: date, expected_date: date) -> bool:
    """Within ±7 days of expected_date, inclusive."""
    return abs((txn_date - expected_date).days) <= _DATE_WINDOW_DAYS


def _find_match(
    sub: Subscription,
    expected_date: date,
    candidates: list[Transaction],
) -> Transaction | None:
    """Return the first transaction in ``candidates`` that matches the sub.

    ``candidates`` should already be filtered to non-transfer rows in the
    target month with the same category as the subscription.
    """
    expected = _expected_amount(sub)
    for txn in candidates:
        if not _amount_matches(txn.amount, expected):
            continue
        if not _date_matches(txn.date, expected_date):
            continue
        return txn
    return None


def subscriptions_already_hit(db: Session, year_month: int) -> dict[int, Decimal]:
    """For the calendar month YYYYMM, return per-category hit totals.

    Returns ``{category_id: hit_amount}``. ``hit_amount`` is the sum of
    subscription expected-amounts (NOT the transaction amounts) that have
    already matched in the target month — the pace formula uses the
    subscription's expected amount as the "this is locked in" portion of
    expected MTD.

    Excluded from the result:
      - subscriptions with ``is_active = False``
      - subscriptions with ``category_id = NULL``
      - subscriptions whose category has ``exclude_from_budget = True``
    """
    year = year_month // 100
    month = year_month % 100
    if not (1 <= month <= 12):
        return {}

    month_start = date(year, month, 1)
    month_end = date(year, month, monthrange(year, month)[1])

    excluded = select(Category.id).where(Category.exclude_from_budget.is_(True))
    subs: list[Subscription] = (
        db.query(Subscription)
        .filter(Subscription.is_active.is_(True))
        .filter(Subscription.category_id.isnot(None))
        .filter(Subscription.category_id.notin_(excluded))
        .all()
    )
    if not subs:
        return {}

    # Pull all candidate transactions for the month in one query, indexed
    # by category for the matcher.
    txns: list[Transaction] = (
        db.query(Transaction)
        .filter(
            Transaction.is_transfer.is_(False),
            Transaction.date >= month_start,
            Transaction.date <= month_end,
            Transaction.category_id.isnot(None),
        )
        .all()
    )
    by_category: dict[int, list[Transaction]] = {}
    for txn in txns:
        by_category.setdefault(txn.category_id, []).append(txn)

    hits: dict[int, Decimal] = {}
    for sub in subs:
        expected_date = _expected_date_in_month(sub, year, month)
        if expected_date.year != year or expected_date.month != month:
            # The sub doesn't expect a charge in this month at all.
            continue
        # Only sub-already-hit if the expected date is on/before today is
        # the spec line for the pace formula — but here we just classify
        # based on whether a matching transaction has actually been seen.
        # If a charge landed unexpectedly early (within window), treat it
        # as hit.
        candidates = by_category.get(sub.category_id, [])
        match = _find_match(sub, expected_date, candidates)
        if match is None:
            continue
        hits[sub.category_id] = hits.get(sub.category_id, Decimal("0")) + _expected_amount(sub)

    return hits


def subscriptions_remaining(db: Session, date_from: date, date_to: date) -> dict:
    """Active subscriptions expected in [date_from, date_to] not yet matched.

    Returns ``{"total": Decimal, "count": int, "subscriptions": [...]}``.
    Each subscription record carries: ``id``, ``vendor``, ``expected_date``,
    ``expected_amount``, ``category_id`` (may be None), ``category_name``
    ("(uncategorized)" when null).

    ``expected_date`` is computed from ``last_charge_date + frequency_days``
    walked into the requested range (per ``_expected_date_in_month``). If
    the next expected charge falls outside ``[date_from, date_to]``, the
    subscription is excluded.

    A subscription is considered "already matched" iff a non-transfer
    transaction in the requested month matches by ±5% / ±7-day rules.

    Subscriptions whose category has ``exclude_from_budget = True`` are
    skipped — same structural filter applied across the spending pipeline.
    Uncategorized subs (``category_id IS NULL``) still flow through.
    """
    if date_from > date_to:
        return {"total": Decimal("0"), "count": 0, "subscriptions": []}

    year = date_to.year
    month = date_to.month

    excluded = select(Category.id).where(Category.exclude_from_budget.is_(True))
    subs: list[Subscription] = (
        db.query(Subscription)
        .filter(
            Subscription.is_active.is_(True),
            or_(
                Subscription.category_id.is_(None),
                Subscription.category_id.notin_(excluded),
            ),
        )
        .all()
    )

    # Index categories for the display name of remaining subs.
    cat_names: dict[int, str] = {c.id: c.name for c in db.query(Category).all()}

    # All non-transfer txns in the [date_from, date_to] range.
    txns: list[Transaction] = (
        db.query(Transaction)
        .filter(
            Transaction.is_transfer.is_(False),
            Transaction.date >= date_from,
            Transaction.date <= date_to,
        )
        .all()
    )
    by_category: dict[int | None, list[Transaction]] = {}
    for txn in txns:
        by_category.setdefault(txn.category_id, []).append(txn)

    out: list[dict] = []
    total = Decimal("0")
    for sub in subs:
        expected_date = _expected_date_in_month(sub, year, month)
        if expected_date < date_from or expected_date > date_to:
            continue

        # Only categorized subs can match against transactions; uncategorized
        # subs are listed but never considered "already hit".
        candidates = by_category.get(sub.category_id, []) if sub.category_id is not None else []
        if sub.category_id is not None and _find_match(sub, expected_date, candidates):
            continue

        amount = _expected_amount(sub)
        total += amount
        out.append(
            {
                "id": sub.id,
                "vendor": sub.vendor,
                "expected_date": expected_date,
                "expected_amount": amount,
                "category_id": sub.category_id,
                "category_name": (
                    cat_names.get(sub.category_id, "(uncategorized)")
                    if sub.category_id is not None
                    else "(uncategorized)"
                ),
            }
        )

    return {"total": total, "count": len(out), "subscriptions": out}
