from sqlalchemy.orm import Session

from app.models import MortgageScenario


def list_scenarios(db: Session) -> list[MortgageScenario]:
    """Return all scenarios ordered by id ascending (creation order)."""
    return db.query(MortgageScenario).order_by(MortgageScenario.id.asc()).all()


def get_scenario(db: Session, *, scenario_id: int) -> MortgageScenario | None:
    return db.query(MortgageScenario).filter(MortgageScenario.id == scenario_id).first()


def get_active_scenario(db: Session) -> MortgageScenario | None:
    return db.query(MortgageScenario).filter(MortgageScenario.is_active.is_(True)).first()


def get_by_name(db: Session, *, name: str) -> MortgageScenario | None:
    return db.query(MortgageScenario).filter(MortgageScenario.name == name).first()


def create_scenario(
    db: Session,
    *,
    name: str,
    principal: float,
    years_left: float,
    interest_rate: float,
    monthly_payment: float,
    additional_monthly_payment: float,
    lump_sum_payment: float,
    investment_return_rate: float,
    investment_tax_rate: float,
) -> MortgageScenario:
    """Create a new scenario.

    The first scenario in the table is auto-activated; subsequent scenarios
    default to inactive (callers can flip via `activate_scenario`).
    """
    has_any = db.query(MortgageScenario.id).first() is not None
    scenario = MortgageScenario(
        name=name,
        is_active=not has_any,
        principal=principal,
        years_left=years_left,
        interest_rate=interest_rate,
        monthly_payment=monthly_payment,
        additional_monthly_payment=additional_monthly_payment,
        lump_sum_payment=lump_sum_payment,
        investment_return_rate=investment_return_rate,
        investment_tax_rate=investment_tax_rate,
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
) -> MortgageScenario | None:
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


def activate_scenario(db: Session, *, scenario_id: int) -> MortgageScenario | None:
    """Set `is_active=True` for one scenario, clearing the flag on all others.

    Done in a single transaction. Returns the activated scenario, or None if
    the id was not found.
    """
    scenario = get_scenario(db, scenario_id=scenario_id)
    if scenario is None:
        return None

    # Clear the flag on every other row first so the partial unique index on
    # is_active=True is not violated mid-transaction.
    db.query(MortgageScenario).filter(
        MortgageScenario.id != scenario_id,
        MortgageScenario.is_active.is_(True),
    ).update({MortgageScenario.is_active: False}, synchronize_session=False)

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
