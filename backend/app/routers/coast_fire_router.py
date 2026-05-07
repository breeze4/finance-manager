from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.coast_fire_scenario import (
    CoastFireScenarioCreate,
    CoastFireScenarioResponse,
    CoastFireScenarioUpdate,
)
from app.services import coast_fire_service

router = APIRouter(
    prefix="/api/calculators/coast-fire/scenarios",
    tags=["coast-fire"],
)


@router.get("", response_model=list[CoastFireScenarioResponse])
def list_scenarios(db: Session = Depends(get_db)):
    return coast_fire_service.list_scenarios(db)


@router.post(
    "",
    response_model=CoastFireScenarioResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_scenario(body: CoastFireScenarioCreate, db: Session = Depends(get_db)):
    existing = coast_fire_service.get_by_name(db, name=body.name)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Scenario name '{body.name}' already exists",
        )
    return coast_fire_service.create_scenario(
        db,
        name=body.name,
        current_age=body.current_age,
        retirement_age=body.retirement_age,
        current_savings=body.current_savings,
        expected_return_rate=body.expected_return_rate,
        target_retirement_amount=body.target_retirement_amount,
        monthly_expenses=body.monthly_expenses,
        yearly_expenses=body.yearly_expenses,
        withdrawal_rate=body.withdrawal_rate,
        inflation_rate=body.inflation_rate,
        use_real_returns=body.use_real_returns,
        last_edited_field=body.last_edited_field,
    )


@router.get("/active", response_model=CoastFireScenarioResponse)
def get_active(db: Session = Depends(get_db)):
    scenario = coast_fire_service.get_active_scenario(db)
    if scenario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active scenario",
        )
    return scenario


@router.get("/{scenario_id}", response_model=CoastFireScenarioResponse)
def get_one(scenario_id: int, db: Session = Depends(get_db)):
    scenario = coast_fire_service.get_scenario(db, scenario_id=scenario_id)
    if scenario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scenario not found",
        )
    return scenario


@router.put("/{scenario_id}", response_model=CoastFireScenarioResponse)
def update_one(
    scenario_id: int,
    body: CoastFireScenarioUpdate,
    db: Session = Depends(get_db),
):
    # Reject duplicate-name on rename.
    if body.name is not None:
        existing = coast_fire_service.get_by_name(db, name=body.name)
        if existing is not None and existing.id != scenario_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Scenario name '{body.name}' already exists",
            )

    scenario = coast_fire_service.update_scenario(
        db,
        scenario_id=scenario_id,
        fields=body.model_dump(exclude_unset=True),
    )
    if scenario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scenario not found",
        )
    return scenario


@router.post("/{scenario_id}/activate", response_model=CoastFireScenarioResponse)
def activate(scenario_id: int, db: Session = Depends(get_db)):
    scenario = coast_fire_service.activate_scenario(db, scenario_id=scenario_id)
    if scenario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scenario not found",
        )
    return scenario


@router.delete("/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_one(scenario_id: int, db: Session = Depends(get_db)):
    deleted = coast_fire_service.delete_scenario(db, scenario_id=scenario_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scenario not found",
        )
