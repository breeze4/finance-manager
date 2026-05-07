from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import MortgageScenario

SCENARIOS_URL = "/api/calculators/mortgage/scenarios"


def _default_payload(name: str = "My mortgage", **overrides) -> dict:
    payload = {
        "name": name,
        "principal": 300000,
        "years_left": 25,
        "interest_rate": 4.5,
        "monthly_payment": 1500,
        "additional_monthly_payment": 0,
        "lump_sum_payment": 0,
        "investment_return_rate": 7,
        "investment_tax_rate": 20,
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


def test_list_empty(client: TestClient):
    resp = client.get(SCENARIOS_URL)
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_returns_created(client: TestClient):
    client.post(SCENARIOS_URL, json=_default_payload("Plan A"))
    client.post(SCENARIOS_URL, json=_default_payload("Plan B"))

    resp = client.get(SCENARIOS_URL)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    names = {s["name"] for s in data}
    assert names == {"Plan A", "Plan B"}


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


def test_create_returns_201_with_full_response(client: TestClient):
    resp = client.post(SCENARIOS_URL, json=_default_payload("Plan A"))
    assert resp.status_code == 201
    data = resp.json()

    assert data["id"] > 0
    assert data["name"] == "Plan A"
    # First scenario auto-activates so the page has something to load.
    assert data["is_active"] is True
    assert data["principal"] == 300000
    assert data["years_left"] == 25
    assert data["interest_rate"] == 4.5
    assert data["monthly_payment"] == 1500
    assert data["additional_monthly_payment"] == 0
    assert data["lump_sum_payment"] == 0
    assert data["investment_return_rate"] == 7
    assert data["investment_tax_rate"] == 20
    assert "created_at" in data
    assert "updated_at" in data


def test_create_second_does_not_auto_activate(client: TestClient):
    client.post(SCENARIOS_URL, json=_default_payload("Plan A"))
    resp = client.post(SCENARIOS_URL, json=_default_payload("Plan B"))
    assert resp.status_code == 201
    assert resp.json()["is_active"] is False


def test_create_duplicate_name_409(client: TestClient):
    client.post(SCENARIOS_URL, json=_default_payload("Plan A"))
    resp = client.post(SCENARIOS_URL, json=_default_payload("Plan A"))
    assert resp.status_code == 409
    assert "already exists" in resp.json()["detail"].lower()


def test_create_validation_error_422(client: TestClient):
    bad = _default_payload("Plan A")
    bad.pop("principal")
    resp = client.post(SCENARIOS_URL, json=bad)
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Get one
# ---------------------------------------------------------------------------


def test_get_one(client: TestClient):
    created = client.post(SCENARIOS_URL, json=_default_payload("Plan A")).json()

    resp = client.get(f"{SCENARIOS_URL}/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Plan A"


def test_get_one_404(client: TestClient):
    resp = client.get(f"{SCENARIOS_URL}/99999")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Active
# ---------------------------------------------------------------------------


def test_get_active_when_none_404(client: TestClient):
    resp = client.get(f"{SCENARIOS_URL}/active")
    assert resp.status_code == 404


def test_get_active_after_create(client: TestClient):
    created = client.post(SCENARIOS_URL, json=_default_payload("Plan A")).json()
    resp = client.get(f"{SCENARIOS_URL}/active")
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


def test_update_partial(client: TestClient):
    created = client.post(SCENARIOS_URL, json=_default_payload("Plan A")).json()

    resp = client.put(
        f"{SCENARIOS_URL}/{created['id']}",
        json={"principal": 250000, "additional_monthly_payment": 200},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["principal"] == 250000
    assert data["additional_monthly_payment"] == 200
    # Untouched fields preserved.
    assert data["interest_rate"] == 4.5
    assert data["name"] == "Plan A"


def test_update_404(client: TestClient):
    resp = client.put(f"{SCENARIOS_URL}/99999", json={"principal": 100000})
    assert resp.status_code == 404


def test_update_does_not_change_is_active(client: TestClient):
    a = client.post(SCENARIOS_URL, json=_default_payload("Plan A")).json()
    client.post(SCENARIOS_URL, json=_default_payload("Plan B"))

    # Try to set is_active=False on the active scenario via PUT — should be ignored.
    resp = client.put(f"{SCENARIOS_URL}/{a['id']}", json={"is_active": False})
    assert resp.status_code == 200
    assert resp.json()["is_active"] is True


def test_update_rename_to_existing_name_409(client: TestClient):
    client.post(SCENARIOS_URL, json=_default_payload("Plan A"))
    b = client.post(SCENARIOS_URL, json=_default_payload("Plan B")).json()

    resp = client.put(f"{SCENARIOS_URL}/{b['id']}", json={"name": "Plan A"})
    assert resp.status_code == 409


def test_update_rename_to_same_name_ok(client: TestClient):
    a = client.post(SCENARIOS_URL, json=_default_payload("Plan A")).json()
    resp = client.put(f"{SCENARIOS_URL}/{a['id']}", json={"name": "Plan A"})
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Activate
# ---------------------------------------------------------------------------


def test_activate_switches_active_flag(client: TestClient, db: Session):
    a = client.post(SCENARIOS_URL, json=_default_payload("Plan A")).json()
    b = client.post(SCENARIOS_URL, json=_default_payload("Plan B")).json()

    # A starts active; activate B.
    resp = client.post(f"{SCENARIOS_URL}/{b['id']}/activate")
    assert resp.status_code == 200
    assert resp.json()["id"] == b["id"]
    assert resp.json()["is_active"] is True

    # A is now inactive.
    a_after = client.get(f"{SCENARIOS_URL}/{a['id']}").json()
    assert a_after["is_active"] is False

    # Active endpoint returns B.
    active = client.get(f"{SCENARIOS_URL}/active").json()
    assert active["id"] == b["id"]

    # Verify the partial unique index invariant: only one active row in DB.
    rows = db.query(MortgageScenario).filter(MortgageScenario.is_active.is_(True)).all()
    assert len(rows) == 1


def test_activate_404(client: TestClient):
    resp = client.post(f"{SCENARIOS_URL}/99999/activate")
    assert resp.status_code == 404


def test_activate_self_idempotent(client: TestClient):
    a = client.post(SCENARIOS_URL, json=_default_payload("Plan A")).json()
    # A is already active; re-activating should still 200.
    resp = client.post(f"{SCENARIOS_URL}/{a['id']}/activate")
    assert resp.status_code == 200
    assert resp.json()["is_active"] is True


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


def test_delete(client: TestClient):
    created = client.post(SCENARIOS_URL, json=_default_payload("Plan A")).json()

    resp = client.delete(f"{SCENARIOS_URL}/{created['id']}")
    assert resp.status_code == 204

    resp = client.get(f"{SCENARIOS_URL}/{created['id']}")
    assert resp.status_code == 404


def test_delete_404(client: TestClient):
    resp = client.delete(f"{SCENARIOS_URL}/99999")
    assert resp.status_code == 404
