"""Net-worth time-series aggregation.

Pure read-only service. Given a date range, returns one ``NetWorthPoint``
per day in the inclusive range covering ``[start_date, end_date]``.

Aggregation rules (verbatim from
``docs/specs/2026-05-06-02-balance-snapshots.md``):

* **LVCF** — on date ``D``, each non-archived account contributes the most
  recent ``BalanceSnapshot`` where ``as_of_date <= D``. Accounts without any
  prior snapshot contribute ``0``.
* **Sign rule** — balances are stored as positive numbers; ``credit_card``
  account balances subtract from net worth, every other type adds.
* **Archived exclusion** — accounts with ``is_archived=True`` are excluded
  entirely, regardless of whether they have historical snapshots.
* **Default range** — if ``start_date`` is omitted, use the earliest
  snapshot's date. If ``end_date`` is omitted, use today. If the database
  has no snapshots at all, return an empty list.

The implementation pulls all relevant snapshots once and walks each
account's date-sorted list with a per-account pointer; it never queries the
DB inside the daily loop.
"""

from datetime import date, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Account, BalanceSnapshot


def compute_time_series(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[dict]:
    """Compute the daily net-worth time series.

    Returns a list of ``{"date": date, "net_worth": float}`` dicts, one per
    day in the inclusive range. Returns ``[]`` when the database holds no
    snapshots at all.
    """
    # Resolve default range. If no snapshots exist at all, bail early.
    earliest: date | None = db.query(func.min(BalanceSnapshot.as_of_date)).scalar()
    if earliest is None:
        return []

    if start_date is None:
        start_date = earliest
    if end_date is None:
        end_date = date.today()

    if end_date < start_date:
        return []

    # Active (non-archived) accounts only. Snapshots tied to archived
    # accounts are excluded entirely.
    accounts = db.query(Account.id, Account.type).filter(Account.is_archived.is_(False)).all()
    if not accounts:
        # No active accounts → every day is 0. Spec says to return points
        # over the chosen range; with no contributing accounts the sum is 0.
        return [
            {"date": start_date + timedelta(days=i), "net_worth": 0.0}
            for i in range((end_date - start_date).days + 1)
        ]

    account_types: dict[int, str] = {acct_id: acct_type for acct_id, acct_type in accounts}
    active_ids = list(account_types.keys())

    # All snapshots for active accounts, sorted ascending by date so each
    # per-account list is already in walk order.
    snap_rows = (
        db.query(
            BalanceSnapshot.account_id,
            BalanceSnapshot.as_of_date,
            BalanceSnapshot.balance,
        )
        .filter(BalanceSnapshot.account_id.in_(active_ids))
        .order_by(BalanceSnapshot.account_id, BalanceSnapshot.as_of_date)
        .all()
    )

    snapshots_by_account: dict[int, list[tuple[date, float]]] = {
        acct_id: [] for acct_id in active_ids
    }
    for acct_id, as_of, balance in snap_rows:
        snapshots_by_account[acct_id].append((as_of, balance))

    # Per-account walk pointer + last-seen contribution. ``last_balance``
    # is None until the first snapshot on or before the current day.
    pointers: dict[int, int] = {acct_id: 0 for acct_id in active_ids}
    last_balance: dict[int, float | None] = {acct_id: None for acct_id in active_ids}

    series: list[dict] = []
    total_days = (end_date - start_date).days + 1
    for i in range(total_days):
        current = start_date + timedelta(days=i)

        net_worth = 0.0
        for acct_id in active_ids:
            account_snaps = snapshots_by_account[acct_id]
            ptr = pointers[acct_id]
            while ptr < len(account_snaps) and account_snaps[ptr][0] <= current:
                last_balance[acct_id] = account_snaps[ptr][1]
                ptr += 1
            pointers[acct_id] = ptr

            balance = last_balance[acct_id]
            if balance is None:
                continue

            if account_types[acct_id] == "credit_card":
                net_worth -= balance
            else:
                net_worth += balance

        series.append({"date": current, "net_worth": round(net_worth, 2)})

    return series
