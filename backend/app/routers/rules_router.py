from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ClassificationRule
from app.schemas.rule import RuleCreate, RuleResponse, RuleUpdate
from app.services import classification_service

router = APIRouter(prefix="/api/rules", tags=["rules"])


def _rule_to_response(rule: ClassificationRule) -> RuleResponse:
    return RuleResponse(
        id=rule.id,
        vendor_pattern=rule.vendor_pattern,
        match_type=rule.match_type,
        category_id=rule.category_id,
        category_name=rule.category.name if rule.category else None,
        vendor_display_name=rule.vendor_display_name,
        is_hidden=rule.is_hidden,
        priority=rule.priority,
        created_at=rule.created_at,
    )


@router.get("", response_model=list[RuleResponse])
def list_rules(db: Session = Depends(get_db)):
    rules = (
        db.query(ClassificationRule)
        .order_by(ClassificationRule.priority.desc(), ClassificationRule.id.desc())
        .all()
    )
    return [_rule_to_response(r) for r in rules]


@router.post("", response_model=RuleResponse, status_code=201)
def create_rule(body: RuleCreate, db: Session = Depends(get_db)):
    if body.match_type not in ("exact", "starts_with", "contains"):
        raise HTTPException(
            status_code=400, detail="match_type must be exact, starts_with, or contains"
        )
    rule = ClassificationRule(
        vendor_pattern=body.vendor_pattern,
        match_type=body.match_type,
        category_id=body.category_id,
        vendor_display_name=body.vendor_display_name,
        is_hidden=body.is_hidden,
        priority=body.priority,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _rule_to_response(rule)


@router.patch("/{rule_id}", response_model=RuleResponse)
def update_rule(rule_id: int, body: RuleUpdate, db: Session = Depends(get_db)):
    rule = db.query(ClassificationRule).filter(ClassificationRule.id == rule_id).first()
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")

    if body.vendor_pattern is not None:
        rule.vendor_pattern = body.vendor_pattern
    if body.match_type is not None:
        if body.match_type not in ("exact", "starts_with", "contains"):
            raise HTTPException(
                status_code=400, detail="match_type must be exact, starts_with, or contains"
            )
        rule.match_type = body.match_type
    if body.category_id is not None:
        rule.category_id = body.category_id
    if body.vendor_display_name is not None:
        rule.vendor_display_name = body.vendor_display_name
    if body.is_hidden is not None:
        rule.is_hidden = body.is_hidden
    if body.priority is not None:
        rule.priority = body.priority

    db.commit()
    db.refresh(rule)
    return _rule_to_response(rule)


@router.delete("/{rule_id}", status_code=204)
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(ClassificationRule).filter(ClassificationRule.id == rule_id).first()
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()


@router.post("/{rule_id}/apply")
def apply_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(ClassificationRule).filter(ClassificationRule.id == rule_id).first()
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    count = classification_service.apply_rule(db, rule)
    db.commit()
    return {"updated": count}


@router.post("/apply-all")
def apply_all_rules(db: Session = Depends(get_db)):
    count = classification_service.apply_all_rules(db)
    return {"updated": count}
