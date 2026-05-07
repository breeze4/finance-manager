from sqlalchemy.orm import Session

from app.models import CoastFireScenario


def list_scenarios(db: Session) -> list[CoastFireScenario]:
    """Return all scenarios ordered by id ascending (creation order)."""
    return db.query(CoastFireScenario).order_by(CoastFireScenario.id.asc()).all()


def get_scenario(db: Session, *, scenario_id: int) -> CoastFireScenario | None:
    return db.query(CoastFireScenario).filter(CoastFireScenario.id == scenario_id).first()


def get_active_scenario(db: Session) -> CoastFireScenario | None:
    return db.query(CoastFireScenario).filter(CoastFireScenario.is_active.is_(True)).first()


def get_by_name(db: Session, *, name: str) -> CoastFireScenario | None:
    return db.query(CoastFireScenario).filter(CoastFireScenario.name == name).first()


def create_scenario(
    db: Session,
    *,
    name: str,
    current_age: float,
    retirement_age: float,
    current_savings: float,
    expected_return_rate: float,
    target_retirement_amount: float,
    monthly_expenses: float,
    yearly_expenses: float,
    withdrawal_rate: float,
    inflation_rate: float,
    use_real_returns: bool,
    last_edited_field: str = "target",
) -> CoastFireScenario:
    """Create a new scenario.

    The first scenario in the table is auto-activated; subsequent scenarios
    default to inactive (callers can flip via `activate_scenario`).
    """
    has_any = db.query(CoastFireScenario.id).first() is not None
    scenario = CoastFireScenario(
        name=name,
        is_active=not has_any,
        current_age=current_age,
        retirement_age=retirement_age,
        current_savings=current_savings,
        expected_return_rate=expected_return_rate,
        target_retirement_amount=target_retirement_amount,
        monthly_expenses=monthly_expenses,
        yearly_expenses=yearly_expenses,
        withdrawal_rate=withdrawal_rate,
        inflation_rate=inflation_rate,
        use_real_returns=use_real_returns,
        last_edited_field=last_edited_field,
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return scenario


def update_scenario(
    db: Session,
    *,
    scenario_id: int,
    fields: dict,
) -> CoastFireScenario | None:
    """Apply a partial update to a scenario. `is_active` is ignored here —
    use `activate_scenario` instead."""
    scenario = get_scenario(db, scenario_id=scenario_id)
    if scenario is None:
        return None

    for key, value in fields.items():
        if key == "is_active":
            continue
        if value is None:
            continue
        if hasattr(scenario, key):
            setattr(scenario, key, value)

    db.commit()
    db.refresh(scenario)
    return scenario


def activate_scenario(db: Session, *, scenario_id: int) -> CoastFireScenario | None:
    """Set `is_active=True` for one scenario, clearing the flag on all others.

    Done in a single transaction. Returns the activated scenario, or None if
    the id was not found.
    """
    scenario = get_scenario(db, scenario_id=scenario_id)
    if scenario is None:
        return None

    # Clear the flag on every other row first so the partial unique index on
    # is_active=True is not violated mid-transaction.
    db.query(CoastFireScenario).filter(
        CoastFireScenario.id != scenario_id,
        CoastFireScenario.is_active.is_(True),
    ).update({CoastFireScenario.is_active: False}, synchronize_session=False)

    scenario.is_active = True
    db.commit()
    db.refresh(scenario)
    return scenario


def delete_scenario(db: Session, *, scenario_id: int) -> bool:
    scenario = get_scenario(db, scenario_id=scenario_id)
    if scenario is None:
        return False
    db.delete(scenario)
    db.commit()
    return True
