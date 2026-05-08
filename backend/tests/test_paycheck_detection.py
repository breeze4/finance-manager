"""Tests for paycheck-detection's recurring-pattern income summing.

Each fixture seeds income transactions at a specific cadence and asserts
the suggested monthly net rounds to roughly what we'd expect from the
mean amount × monthly multiplier.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Transaction
from app.services import paycheck_detection
from tests.conftest import get_or_create_account


def _seed_income(
    db: Session,
    *,
    vendor: str,
    amount: float,
    start: date,
    interval_days: int,
    count: int,
) -> list[Transaction]:
    account = get_or_create_account(db, "BECU Checking", type="checking", institution="BECU")
    txns = []
    for i in range(count):
        d = start + timedelta(days=interval_days * i)
        txn = Transaction(
            source_file="test.csv",
            account_id=account.id,
            date=d,
            raw_description=vendor,
            vendor=vendor,
            amount=amount,
            import_hash=f"{vendor}_{amount}_{d}_{i}",
            is_transfer=False,
        )
        db.add(txn)
        txns.append(txn)
    db.commit()
    return txns


def test_no_income_returns_none(db: Session):
    assert paycheck_detection.suggest_monthly_net(db) is None


def test_single_income_transaction_returns_none(db: Session):
    _seed_income(
        db,
        vendor="ACME Payroll",
        amount=2500.0,
        start=date(2026, 1, 1),
        interval_days=14,
        count=1,
    )
    assert paycheck_detection.suggest_monthly_net(db) is None


def test_two_income_transactions_returns_none(db: Session):
    """Below the 3-transaction floor."""
    _seed_income(
        db,
        vendor="ACME Payroll",
        amount=2500.0,
        start=date(2026, 1, 1),
        interval_days=14,
        count=2,
    )
    assert paycheck_detection.suggest_monthly_net(db) is None


def test_biweekly_paycheck_yields_roughly_2_167x_mean(db: Session):
    _seed_income(
        db,
        vendor="ACME Payroll",
        amount=2500.0,
        start=date(2026, 1, 2),
        interval_days=14,
        count=6,
    )
    suggested = paycheck_detection.suggest_monthly_net(db)
    assert suggested is not None
    # 2500 * 26 / 12 = 5416.67
    expected = Decimal("2500.00") * Decimal("26") / Decimal("12")
    assert suggested == expected.quantize(Decimal("0.01"))


def test_monthly_paycheck_yields_mean(db: Session):
    _seed_income(
        db,
        vendor="ACME Payroll",
        amount=8500.0,
        start=date(2026, 1, 5),
        interval_days=30,
        count=4,
    )
    suggested = paycheck_detection.suggest_monthly_net(db)
    assert suggested is not None
    assert suggested == Decimal("8500.00")


def test_semi_monthly_paycheck_yields_2x_mean(db: Session):
    # Seed 6 income events at 15-day intervals — semi-monthly cadence.
    _seed_income(
        db,
        vendor="ACME Payroll",
        amount=4250.0,
        start=date(2026, 1, 1),
        interval_days=15,
        count=6,
    )
    suggested = paycheck_detection.suggest_monthly_net(db)
    assert suggested is not None
    # 4250 * 2 = 8500
    assert suggested == Decimal("8500.00")


def test_weekly_paycheck_yields_4_333x_mean(db: Session):
    _seed_income(
        db,
        vendor="Freelance",
        amount=1000.0,
        start=date(2026, 1, 1),
        interval_days=7,
        count=8,
    )
    suggested = paycheck_detection.suggest_monthly_net(db)
    assert suggested is not None
    # 1000 * 52 / 12 ≈ 4333.33
    expected = (Decimal("1000.00") * Decimal("52") / Decimal("12")).quantize(Decimal("0.01"))
    assert suggested == expected


def test_multiple_paychecks_combine(db: Session):
    # Spouse on monthly, self on bi-weekly. Both should be summed.
    _seed_income(
        db,
        vendor="ACME Payroll",
        amount=2500.0,
        start=date(2026, 1, 2),
        interval_days=14,
        count=6,
    )
    _seed_income(
        db,
        vendor="Spouse Co",
        amount=4000.0,
        start=date(2026, 1, 5),
        interval_days=30,
        count=4,
    )
    suggested = paycheck_detection.suggest_monthly_net(db)
    assert suggested is not None

    biweekly = Decimal("2500.00") * Decimal("26") / Decimal("12")
    monthly = Decimal("4000.00")
    expected = (biweekly + monthly).quantize(Decimal("0.01"))
    assert suggested == expected


def test_irregular_one_offs_are_ignored(db: Session):
    """Three refunds at random intervals that don't classify shouldn't yield a suggestion."""
    account = get_or_create_account(db, "BECU Checking", type="checking", institution="BECU")
    for i, days_in in enumerate([0, 5, 90]):
        d = date(2026, 1, 1) + timedelta(days=days_in)
        db.add(
            Transaction(
                source_file="test.csv",
                account_id=account.id,
                date=d,
                raw_description="Random Refund",
                vendor="Random Refund",
                amount=50.0,
                import_hash=f"refund_{i}",
                is_transfer=False,
            )
        )
    db.commit()
    assert paycheck_detection.suggest_monthly_net(db) is None


def test_transfers_are_excluded(db: Session):
    """Even a perfectly recurring inflow shouldn't count if it's flagged as a transfer."""
    account = get_or_create_account(db, "BECU Checking", type="checking", institution="BECU")
    for i in range(6):
        d = date(2026, 1, 1) + timedelta(days=14 * i)
        db.add(
            Transaction(
                source_file="test.csv",
                account_id=account.id,
                date=d,
                raw_description="Internal Move",
                vendor="Internal Move",
                amount=2500.0,
                import_hash=f"transfer_{i}",
                is_transfer=True,
            )
        )
    db.commit()
    assert paycheck_detection.suggest_monthly_net(db) is None


def test_outflows_are_excluded(db: Session):
    """Subscriptions (negative amounts) must not be picked up by paycheck detection."""
    _seed_income(
        db,
        vendor="Netflix",
        amount=-15.99,
        start=date(2026, 1, 1),
        interval_days=30,
        count=4,
    )
    assert paycheck_detection.suggest_monthly_net(db) is None


def test_router_suggest_returns_value(client: TestClient, db: Session):
    _seed_income(
        db,
        vendor="ACME Payroll",
        amount=2500.0,
        start=date(2026, 1, 2),
        interval_days=14,
        count=6,
    )
    resp = client.get("/api/paycheck-detection/suggest")
    assert resp.status_code == 200
    body = resp.json()
    assert body["suggested_monthly_net"] is not None
    assert body["suggested_monthly_net"] == pytest.approx(2500.0 * 26 / 12, rel=1e-3)


def test_router_suggest_returns_null_when_no_signal(client: TestClient):
    resp = client.get("/api/paycheck-detection/suggest")
    assert resp.status_code == 200
    assert resp.json() == {"suggested_monthly_net": None}
