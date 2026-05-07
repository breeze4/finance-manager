from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.mortgage_scenario import (
    MortgageScenarioCreate,
    MortgageScenarioResponse,
    MortgageScenarioUpdate,
)
from app.services import mortgage_scenario_service

router = APIRouter(
    prefix="/api/calculators/mortgage/scenarios",
    tags=["mortgage"],
)


@router.get("", response_model=list[MortgageScenarioResponse])
def list_scenarios(db: Session = Depends(get_db)):
    return mortgage_scenario_service.list_scenarios(db)


@router.post(
    "",
    response_model=MortgageScenarioResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_scenario(body: MortgageScenarioCreate, db: Session = Depends(get_db)):
    existing = mortgage_scenario_service.get_by_name(db, name=body.name)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Scenario name '{body.name}' already exists",
        )
    return mortgage_scenario_service.create_scenario(
        db,
        name=body.name,
        principal=body.principal,
        years_left=body.years_left,
        interest_rate=body.interest_rate,
        monthly_payment=body.monthly_payment,
        additional_monthly_payment=body.additional_monthly_payment,
        lump_sum_payment=body.lump_sum_payment,
        investment_return_rate=body.investment_return_rate,
        investment_tax_rate=body.investment_tax_rate,
    )


@router.get("/active", response_model=MortgageScenarioResponse)
def get_active(db: Session = Depends(get_db)):
    scenario = mortgage_scenario_service.get_active_scenario(db)
    if scenario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active scenario",
        )
    return scenario


@router.get("/{scenario_id}", response_model=MortgageScenarioResponse)
def get_one(scenario_id: int, db: Session = Depends(get_db)):
    scenario = mortgage_scenario_service.get_scenario(db, scenario_id=scenario_id)
    if scenario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scenario not found",
        )
    return scenario


@router.put("/{scenario_id}", response_model=MortgageScenarioResponse)
def update_one(
    scenario_id: int,
    body: MortgageScenarioUpdate,
    db: Session = Depends(get_db),
):
    # Reject duplicate-name on rename.
    if body.name is not None:
        existing = mortgage_scenario_service.get_by_name(db, name=body.name)
        if existing is not None and existing.id != scenario_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Scenario name '{body.name}' already exists",
            )

    scenario = mortgage_scenario_service.update_scenario(
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


@router.post("/{scenario_id}/activate", response_model=MortgageScenarioResponse)
def activate(scenario_id: int, db: Session = Depends(get_db)):
    scenario = mortgage_scenario_service.activate_scenario(db, scenario_id=scenario_id)
    if scenario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scenario not found",
        )
    return scenario


@router.delete("/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_one(scenario_id: int, db: Session = Depends(get_db)):
    deleted = mortgage_scenario_service.delete_scenario(db, scenario_id=scenario_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scenario not found",
        )
