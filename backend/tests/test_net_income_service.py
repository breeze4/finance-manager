"""Step-function net-income service tests.

Covers lookup before any entry, lookup within range, lookup exactly on a
boundary, multi-period sequences, overwrite semantics, and history
ordering. Also exercises the API router for round-trip coverage of the
month-string <-> YYYYMM-int translation.
"""

from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services import net_income_service


def test_get_for_month_returns_none_when_empty(db: Session):
    assert net_income_service.get_for_month(db, 202605) is None


def test_set_then_get_for_same_month(db: Session):
    row = net_income_service.set_from_month(db, 202605, Decimal("8500.00"))
    assert row.id is not None
    assert row.effective_month == 202605

    got = net_income_service.get_for_month(db, 202605)
    assert got == Decimal("8500.00")


def test_get_before_first_period_returns_none(db: Session):
    net_income_service.set_from_month(db, 202605, Decimal("8500.00"))
    assert net_income_service.get_for_month(db, 202604) is None
    assert net_income_service.get_for_month(db, 202601) is None
    assert net_income_service.get_for_month(db, 202512) is None


def test_get_after_period_returns_amount(db: Session):
    net_income_service.set_from_month(db, 202605, Decimal("8500.00"))
    assert net_income_service.get_for_month(db, 202606) == Decimal("8500.00")
    assert net_income_service.get_for_month(db, 202612) == Decimal("8500.00")
    assert net_income_service.get_for_month(db, 202701) == Decimal("8500.00")


def test_multiple_periods_returns_latest_applicable(db: Session):
    net_income_service.set_from_month(db, 202501, Decimal("7000.00"))
    net_income_service.set_from_month(db, 202507, Decimal("8000.00"))
    net_income_service.set_from_month(db, 202601, Decimal("9000.00"))

    # Before any period.
    assert net_income_service.get_for_month(db, 202412) is None
    # On the first boundary.
    assert net_income_service.get_for_month(db, 202501) == Decimal("7000.00")
    # Between first and second.
    assert net_income_service.get_for_month(db, 202506) == Decimal("7000.00")
    # On the second boundary.
    assert net_income_service.get_for_month(db, 202507) == Decimal("8000.00")
    # Between second and third.
    assert net_income_service.get_for_month(db, 202512) == Decimal("8000.00")
    # On the third boundary.
    assert net_income_service.get_for_month(db, 202601) == Decimal("9000.00")
    # After all.
    assert net_income_service.get_for_month(db, 202612) == Decimal("9000.00")


def test_set_overwrites_existing_month(db: Session):
    first = net_income_service.set_from_month(db, 202605, Decimal("8000.00"))
    second = net_income_service.set_from_month(db, 202605, Decimal("8500.00"))

    # Same row id — upsert in place, not a new row.
    assert first.id == second.id
    assert net_income_service.get_for_month(db, 202605) == Decimal("8500.00")

    # And there's still only one row.
    history = net_income_service.get_history(db)
    assert len(history) == 1


def test_history_ordered_ascending(db: Session):
    # Insert deliberately out of order.
    net_income_service.set_from_month(db, 202601, Decimal("9000.00"))
    net_income_service.set_from_month(db, 202501, Decimal("7000.00"))
    net_income_service.set_from_month(db, 202507, Decimal("8000.00"))

    history = net_income_service.get_history(db)
    assert [r.effective_month for r in history] == [202501, 202507, 202601]


def test_yyyymm_helpers_roundtrip():
    assert net_income_service.yyyymm(2026, 5) == 202605
    assert net_income_service.to_yyyymm_string(202605) == "2026-05"
    assert net_income_service.parse_yyyymm_string("2026-05") == 202605


def test_yyyymm_rejects_invalid_month():
    import pytest

    with pytest.raises(ValueError):
        net_income_service.yyyymm(2026, 0)
    with pytest.raises(ValueError):
        net_income_service.yyyymm(2026, 13)


# ─── Router smoke tests ────────────────────────────────────────────────────


def test_router_get_returns_null_when_empty(client: TestClient):
    resp = client.get("/api/net-income", params={"month": "2026-05"})
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"month": "2026-05", "amount": None, "from_period": None}


def test_router_put_then_get(client: TestClient):
    put = client.put(
        "/api/net-income",
        json={"effective_month": "2026-05", "take_home_amount": 8500.0},
    )
    assert put.status_code == 200
    period = put.json()
    assert period["effective_month"] == "2026-05"
    assert period["take_home_amount"] == 8500.0

    got = client.get("/api/net-income", params={"month": "2026-06"})
    assert got.status_code == 200
    body = got.json()
    assert body["amount"] == 8500.0
    assert body["from_period"]["effective_month"] == "2026-05"


def test_router_history_orders_ascending(client: TestClient):
    client.put(
        "/api/net-income",
        json={"effective_month": "2026-01", "take_home_amount": 9000.0},
    )
    client.put(
        "/api/net-income",
        json={"effective_month": "2025-01", "take_home_amount": 7000.0},
    )
    client.put(
        "/api/net-income",
        json={"effective_month": "2025-07", "take_home_amount": 8000.0},
    )

    resp = client.get("/api/net-income/history")
    assert resp.status_code == 200
    rows = resp.json()
    assert [r["effective_month"] for r in rows] == ["2025-01", "2025-07", "2026-01"]


def test_router_rejects_malformed_month(client: TestClient):
    resp = client.get("/api/net-income", params={"month": "May 2026"})
    assert resp.status_code == 400
