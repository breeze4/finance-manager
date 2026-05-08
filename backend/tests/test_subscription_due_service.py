"""Unit tests for subscription_due_service.

Covers:
  - all five frequencies (weekly / bi-weekly / monthly / quarterly / annual)
  - active sub with no transactions yet returns expected_date =
    last_charge_date + frequency_days
  - match-window edges (exactly ±5%, exactly 7 days)
  - no-match cases (out-of-tolerance amount, out-of-window date)
  - inactive subs and uncategorized-sub handling
  - ``subscriptions_remaining`` includes uncategorized subs but excludes
    inactive ones
"""

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import Category, Subscription, Transaction
from app.services import subscription_due_service


def _seed_category(db: Session, name: str = "Streaming") -> Category:
    cat = Category(name=name, is_system=False, csp_bucket="guilt_free")
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


def _make_sub(
    db: Session,
    *,
    vendor: str,
    frequency: str,
    last_charge_date: date,
    amount: float | None = 10.0,
    amount_min: float | None = None,
    amount_max: float | None = None,
    annual_estimate: float = 120.0,
    category_id: int | None,
    is_active: bool = True,
    subscription_type: str = "fixed",
) -> Subscription:
    sub = Subscription(
        vendor=vendor,
        frequency=frequency,
        subscription_type=subscription_type,
        amount=amount,
        amount_min=amount_min,
        amount_max=amount_max,
        annual_estimate=annual_estimate,
        last_charge_date=last_charge_date,
        category_id=category_id,
        is_active=is_active,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def _make_txn(
    db: Session,
    *,
    vendor: str,
    amount: float,
    txn_date: date,
    category_id: int | None,
    import_hash: str,
    is_transfer: bool = False,
) -> Transaction:
    from tests.conftest import get_or_create_account

    account = get_or_create_account(db, "Test")
    txn = Transaction(
        source_file="test.csv",
        account_id=account.id,
        date=txn_date,
        raw_description=vendor,
        vendor=vendor,
        amount=amount,
        category_id=category_id,
        import_hash=import_hash,
        is_transfer=is_transfer,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


# ---------------------------------------------------------------------------
# subscriptions_already_hit
# ---------------------------------------------------------------------------


def test_monthly_sub_matched_within_window(db: Session):
    cat = _seed_category(db)
    _make_sub(
        db,
        vendor="Netflix",
        frequency="monthly",
        last_charge_date=date(2026, 4, 5),
        amount=15.0,
        category_id=cat.id,
    )
    # Expected charge: 2026-05-05 (last + 30d). Charge actually hit 2026-05-06.
    _make_txn(
        db,
        vendor="Netflix",
        amount=-15.0,
        txn_date=date(2026, 5, 6),
        category_id=cat.id,
        import_hash="m1",
    )
    hits = subscription_due_service.subscriptions_already_hit(db, 202605)
    assert hits == {cat.id: Decimal("15")}


def test_monthly_sub_not_yet_hit(db: Session):
    cat = _seed_category(db)
    _make_sub(
        db,
        vendor="Netflix",
        frequency="monthly",
        last_charge_date=date(2026, 4, 5),
        amount=15.0,
        category_id=cat.id,
    )
    # No transaction yet.
    hits = subscription_due_service.subscriptions_already_hit(db, 202605)
    assert hits == {}


def test_amount_tolerance_inclusive_at_5_percent(db: Session):
    """Exactly ±5% is in-window."""
    cat = _seed_category(db)
    _make_sub(
        db,
        vendor="Netflix",
        frequency="monthly",
        last_charge_date=date(2026, 4, 5),
        amount=20.0,
        category_id=cat.id,
    )
    # 5% above 20.00 = 21.00 — exactly on the boundary.
    _make_txn(
        db,
        vendor="Netflix",
        amount=-21.0,
        txn_date=date(2026, 5, 5),
        category_id=cat.id,
        import_hash="bound1",
    )
    hits = subscription_due_service.subscriptions_already_hit(db, 202605)
    assert hits == {cat.id: Decimal("20")}


def test_amount_tolerance_excluded_just_outside(db: Session):
    cat = _seed_category(db)
    _make_sub(
        db,
        vendor="Netflix",
        frequency="monthly",
        last_charge_date=date(2026, 4, 5),
        amount=20.0,
        category_id=cat.id,
    )
    # 6% above (21.20) — outside the ±5% window.
    _make_txn(
        db,
        vendor="Netflix",
        amount=-21.20,
        txn_date=date(2026, 5, 5),
        category_id=cat.id,
        import_hash="oob1",
    )
    hits = subscription_due_service.subscriptions_already_hit(db, 202605)
    assert hits == {}


def test_date_window_inclusive_at_7_days(db: Session):
    cat = _seed_category(db)
    _make_sub(
        db,
        vendor="Netflix",
        frequency="monthly",
        last_charge_date=date(2026, 4, 5),
        amount=15.0,
        category_id=cat.id,
    )
    # Expected 2026-05-05; transaction exactly 7 days later (2026-05-12).
    _make_txn(
        db,
        vendor="Netflix",
        amount=-15.0,
        txn_date=date(2026, 5, 12),
        category_id=cat.id,
        import_hash="dw7",
    )
    hits = subscription_due_service.subscriptions_already_hit(db, 202605)
    assert hits == {cat.id: Decimal("15")}


def test_date_window_excluded_just_outside(db: Session):
    cat = _seed_category(db)
    _make_sub(
        db,
        vendor="Netflix",
        frequency="monthly",
        last_charge_date=date(2026, 4, 5),
        amount=15.0,
        category_id=cat.id,
    )
    # 8 days off — outside the ±7-day window.
    _make_txn(
        db,
        vendor="Netflix",
        amount=-15.0,
        txn_date=date(2026, 5, 13),
        category_id=cat.id,
        import_hash="dw8",
    )
    hits = subscription_due_service.subscriptions_already_hit(db, 202605)
    assert hits == {}


def test_inactive_sub_excluded(db: Session):
    cat = _seed_category(db)
    _make_sub(
        db,
        vendor="Inactive",
        frequency="monthly",
        last_charge_date=date(2026, 4, 5),
        amount=15.0,
        category_id=cat.id,
        is_active=False,
    )
    _make_txn(
        db,
        vendor="Inactive",
        amount=-15.0,
        txn_date=date(2026, 5, 5),
        category_id=cat.id,
        import_hash="inact1",
    )
    hits = subscription_due_service.subscriptions_already_hit(db, 202605)
    assert hits == {}


def test_null_category_sub_excluded_from_already_hit(db: Session):
    """subs with category_id=NULL are excluded from already_hit (no
    category to attribute to)."""
    _make_sub(
        db,
        vendor="Mystery",
        frequency="monthly",
        last_charge_date=date(2026, 4, 5),
        amount=15.0,
        category_id=None,
    )
    hits = subscription_due_service.subscriptions_already_hit(db, 202605)
    assert hits == {}


def test_variable_amount_sub_uses_midpoint(db: Session):
    cat = _seed_category(db)
    _make_sub(
        db,
        vendor="Power",
        frequency="monthly",
        last_charge_date=date(2026, 4, 10),
        amount=None,
        amount_min=80.0,
        amount_max=120.0,
        category_id=cat.id,
        subscription_type="variable",
    )
    # Midpoint = 100; ±5% → [95, 105]. Charge of $98 is in-window.
    _make_txn(
        db,
        vendor="Power",
        amount=-98.0,
        txn_date=date(2026, 5, 10),
        category_id=cat.id,
        import_hash="var1",
    )
    hits = subscription_due_service.subscriptions_already_hit(db, 202605)
    assert hits == {cat.id: Decimal("100")}


# ---------------------------------------------------------------------------
# Frequencies — every one of the five
# ---------------------------------------------------------------------------


def test_weekly_frequency_active_no_txn(db: Session):
    cat = _seed_category(db)
    sub = _make_sub(
        db,
        vendor="Coffee",
        frequency="weekly",
        last_charge_date=date(2026, 4, 28),
        amount=5.0,
        category_id=cat.id,
    )
    # last + 7d = 2026-05-05
    expected = subscription_due_service._expected_date_in_month(sub, 2026, 5)
    assert expected == date(2026, 5, 5)


def test_biweekly_frequency_active_no_txn(db: Session):
    cat = _seed_category(db)
    sub = _make_sub(
        db,
        vendor="GymBI",
        frequency="bi-weekly",
        last_charge_date=date(2026, 4, 22),
        amount=20.0,
        category_id=cat.id,
    )
    # 2026-04-22 + 14d = 2026-05-06
    expected = subscription_due_service._expected_date_in_month(sub, 2026, 5)
    assert expected == date(2026, 5, 6)


def test_monthly_frequency_expected_date(db: Session):
    cat = _seed_category(db)
    sub = _make_sub(
        db,
        vendor="Netflix",
        frequency="monthly",
        last_charge_date=date(2026, 4, 15),
        amount=15.0,
        category_id=cat.id,
    )
    # 2026-04-15 + 30d = 2026-05-15
    expected = subscription_due_service._expected_date_in_month(sub, 2026, 5)
    assert expected == date(2026, 5, 15)


def test_quarterly_frequency_expected_date(db: Session):
    cat = _seed_category(db)
    sub = _make_sub(
        db,
        vendor="QuarterCharge",
        frequency="quarterly",
        last_charge_date=date(2026, 2, 1),
        amount=300.0,
        category_id=cat.id,
    )
    # 2026-02-01 + 91d = 2026-05-03
    expected = subscription_due_service._expected_date_in_month(sub, 2026, 5)
    assert expected == date(2026, 5, 3)


def test_annual_frequency_expected_date(db: Session):
    cat = _seed_category(db)
    sub = _make_sub(
        db,
        vendor="Domain",
        frequency="annual",
        last_charge_date=date(2025, 5, 10),
        amount=12.0,
        category_id=cat.id,
    )
    # 2025-05-10 + 365d = 2026-05-10
    expected = subscription_due_service._expected_date_in_month(sub, 2026, 5)
    assert expected == date(2026, 5, 10)


# ---------------------------------------------------------------------------
# subscriptions_remaining
# ---------------------------------------------------------------------------


def test_remaining_includes_uncategorized_sub(db: Session):
    """Uncategorized subs ARE listed in remaining (with category_name fallback)."""
    _make_sub(
        db,
        vendor="MysteryBox",
        frequency="monthly",
        last_charge_date=date(2026, 4, 10),
        amount=25.0,
        category_id=None,
    )
    result = subscription_due_service.subscriptions_remaining(
        db, date(2026, 5, 1), date(2026, 5, 31)
    )
    assert result["count"] == 1
    assert result["total"] == Decimal("25")
    assert result["subscriptions"][0]["category_name"] == "(uncategorized)"
    assert result["subscriptions"][0]["category_id"] is None


def test_remaining_excludes_inactive(db: Session):
    cat = _seed_category(db)
    _make_sub(
        db,
        vendor="Inactive",
        frequency="monthly",
        last_charge_date=date(2026, 4, 10),
        amount=25.0,
        category_id=cat.id,
        is_active=False,
    )
    result = subscription_due_service.subscriptions_remaining(
        db, date(2026, 5, 1), date(2026, 5, 31)
    )
    assert result["count"] == 0


def test_remaining_excludes_already_matched(db: Session):
    cat = _seed_category(db)
    _make_sub(
        db,
        vendor="Netflix",
        frequency="monthly",
        last_charge_date=date(2026, 4, 5),
        amount=15.0,
        category_id=cat.id,
    )
    # Already hit on 2026-05-06 (within window of expected 2026-05-05).
    _make_txn(
        db,
        vendor="Netflix",
        amount=-15.0,
        txn_date=date(2026, 5, 6),
        category_id=cat.id,
        import_hash="rem_match",
    )
    result = subscription_due_service.subscriptions_remaining(
        db, date(2026, 5, 1), date(2026, 5, 31)
    )
    assert result["count"] == 0


def test_remaining_excludes_subs_outside_range(db: Session):
    cat = _seed_category(db)
    _make_sub(
        db,
        vendor="Annual",
        frequency="annual",
        last_charge_date=date(2025, 7, 10),
        amount=100.0,
        category_id=cat.id,
    )
    # Expected next charge: 2026-07-10 — outside May.
    result = subscription_due_service.subscriptions_remaining(
        db, date(2026, 5, 1), date(2026, 5, 31)
    )
    assert result["count"] == 0
