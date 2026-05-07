"""Service-level tests for ``net_worth_service.compute_time_series``.

Covers the spec's aggregation rules (LVCF, sign flip, archived exclusion)
plus boundary cases (empty DB, single-snapshot single-day range, sparse
multi-account scenarios).
"""

from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models import Account, BalanceSnapshot
from app.services import net_worth_service


def _add_account(
    db: Session, name: str, *, type: str = "checking", is_archived: bool = False
) -> Account:
    account = Account(name=name, type=type, institution=None, is_archived=is_archived)
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def _add_snapshot(db: Session, account: Account, *, as_of: date, balance: float) -> BalanceSnapshot:
    snap = BalanceSnapshot(
        account_id=account.id,
        as_of_date=as_of,
        balance=balance,
        source="manual",
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return snap


class TestEmptyDatabase:
    def test_no_snapshots_returns_empty_list(self, db: Session):
        result = net_worth_service.compute_time_series(db)
        assert result == []

    def test_no_snapshots_with_explicit_range_still_empty(self, db: Session):
        _add_account(db, "Empty Checking", type="checking")
        result = net_worth_service.compute_time_series(
            db,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 5),
        )
        assert result == []


class TestSingleAccountLVCF:
    def test_single_snapshot_single_day_range(self, db: Session):
        acct = _add_account(db, "Solo", type="checking")
        _add_snapshot(db, acct, as_of=date(2026, 4, 1), balance=1000.0)

        result = net_worth_service.compute_time_series(
            db,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 1),
        )
        assert result == [{"date": date(2026, 4, 1), "net_worth": 1000.0}]

    def test_lvcf_carries_across_multi_day_gap(self, db: Session):
        acct = _add_account(db, "Gap Account", type="checking")
        _add_snapshot(db, acct, as_of=date(2026, 4, 1), balance=500.0)
        _add_snapshot(db, acct, as_of=date(2026, 4, 11), balance=750.0)

        result = net_worth_service.compute_time_series(
            db,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 12),
        )
        # Day 1-10: 500 (carried forward). Day 11-12: 750.
        expected_values = [500.0] * 10 + [750.0] * 2
        assert [p["net_worth"] for p in result] == expected_values
        assert [p["date"] for p in result] == [
            date(2026, 4, 1) + timedelta(days=i) for i in range(12)
        ]

    def test_account_with_no_snapshot_before_day_contributes_zero(self, db: Session):
        acct = _add_account(db, "Late Snap", type="checking")
        # Snapshot is AFTER the queried range start, so days before contribute 0.
        _add_snapshot(db, acct, as_of=date(2026, 4, 5), balance=200.0)

        result = net_worth_service.compute_time_series(
            db,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 6),
        )
        assert [p["net_worth"] for p in result] == [0.0, 0.0, 0.0, 0.0, 200.0, 200.0]


class TestSignRule:
    def test_credit_card_subtracts(self, db: Session):
        checking = _add_account(db, "BECU", type="checking")
        cc = _add_account(db, "Chase CC", type="credit_card")
        _add_snapshot(db, checking, as_of=date(2026, 4, 1), balance=5000.0)
        _add_snapshot(db, cc, as_of=date(2026, 4, 1), balance=1500.0)

        result = net_worth_service.compute_time_series(
            db,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 1),
        )
        assert result == [{"date": date(2026, 4, 1), "net_worth": 3500.0}]

    def test_all_non_credit_card_types_add(self, db: Session):
        a = _add_account(db, "Check", type="checking")
        b = _add_account(db, "Save", type="savings")
        c = _add_account(db, "Brok", type="brokerage")
        d = _add_account(db, "Ret", type="retirement")
        e = _add_account(db, "House", type="asset")
        for acct, bal in [(a, 100), (b, 200), (c, 300), (d, 400), (e, 500)]:
            _add_snapshot(db, acct, as_of=date(2026, 4, 1), balance=bal)

        result = net_worth_service.compute_time_series(
            db,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 1),
        )
        assert result == [{"date": date(2026, 4, 1), "net_worth": 1500.0}]


class TestArchivedExclusion:
    def test_archived_account_snapshots_excluded_entirely(self, db: Session):
        active = _add_account(db, "Active", type="checking")
        archived = _add_account(db, "Old", type="checking", is_archived=True)
        _add_snapshot(db, active, as_of=date(2026, 4, 1), balance=1000.0)
        _add_snapshot(db, archived, as_of=date(2026, 4, 1), balance=9999.0)

        result = net_worth_service.compute_time_series(
            db,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 1),
        )
        assert result == [{"date": date(2026, 4, 1), "net_worth": 1000.0}]

    def test_account_archived_after_snapshots_excluded(self, db: Session):
        # Account had snapshots, then was archived. Its history must NOT
        # contribute to net worth at any point in the queried range.
        acct = _add_account(db, "Will Be Archived", type="savings")
        _add_snapshot(db, acct, as_of=date(2026, 3, 1), balance=2000.0)
        _add_snapshot(db, acct, as_of=date(2026, 3, 15), balance=2500.0)
        acct.is_archived = True
        db.commit()

        result = net_worth_service.compute_time_series(
            db,
            start_date=date(2026, 3, 1),
            end_date=date(2026, 3, 15),
        )
        # No active accounts → 0 every day, but the earliest-snapshot
        # default still triggers a non-empty list (snapshot exists in DB).
        assert all(p["net_worth"] == 0.0 for p in result)
        assert len(result) == 15


class TestDefaultRange:
    def test_default_start_uses_earliest_snapshot(self, db: Session):
        acct = _add_account(db, "A", type="checking")
        _add_snapshot(db, acct, as_of=date(2026, 4, 5), balance=100.0)
        _add_snapshot(db, acct, as_of=date(2026, 4, 10), balance=200.0)

        result = net_worth_service.compute_time_series(db, end_date=date(2026, 4, 12))
        assert result[0]["date"] == date(2026, 4, 5)
        assert result[-1]["date"] == date(2026, 4, 12)

    def test_default_end_uses_today(self, db: Session):
        acct = _add_account(db, "A", type="checking")
        _add_snapshot(db, acct, as_of=date(2026, 4, 1), balance=50.0)

        result = net_worth_service.compute_time_series(db, start_date=date(2026, 4, 1))
        assert result[0]["date"] == date(2026, 4, 1)
        assert result[-1]["date"] == date.today()


class TestSparseMultiAccount:
    def test_sparse_multi_account_lvcf(self, db: Session):
        # Three accounts with snapshots on different dates. Verify each
        # day's total is the sum of each account's most-recent-or-zero
        # contribution.
        check = _add_account(db, "Check", type="checking")
        cc = _add_account(db, "CC", type="credit_card")
        save = _add_account(db, "Save", type="savings")

        _add_snapshot(db, check, as_of=date(2026, 4, 1), balance=1000.0)
        _add_snapshot(db, save, as_of=date(2026, 4, 3), balance=500.0)
        _add_snapshot(db, cc, as_of=date(2026, 4, 5), balance=200.0)
        _add_snapshot(db, check, as_of=date(2026, 4, 7), balance=1100.0)

        result = net_worth_service.compute_time_series(
            db,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 8),
        )

        by_date = {p["date"]: p["net_worth"] for p in result}
        # 4/1: check=1000
        assert by_date[date(2026, 4, 1)] == 1000.0
        # 4/2: check=1000
        assert by_date[date(2026, 4, 2)] == 1000.0
        # 4/3: check=1000 + save=500
        assert by_date[date(2026, 4, 3)] == 1500.0
        # 4/4: check=1000 + save=500
        assert by_date[date(2026, 4, 4)] == 1500.0
        # 4/5: check=1000 + save=500 - cc=200
        assert by_date[date(2026, 4, 5)] == 1300.0
        # 4/6: check=1000 + save=500 - cc=200
        assert by_date[date(2026, 4, 6)] == 1300.0
        # 4/7: check=1100 + save=500 - cc=200
        assert by_date[date(2026, 4, 7)] == 1400.0
        # 4/8: check=1100 + save=500 - cc=200
        assert by_date[date(2026, 4, 8)] == 1400.0
