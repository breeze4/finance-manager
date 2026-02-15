from datetime import datetime

from pydantic import BaseModel


class RuleResponse(BaseModel):
    id: int
    vendor_pattern: str
    match_type: str
    category_id: int | None
    category_name: str | None
    vendor_display_name: str | None
    is_hidden: bool
    priority: int
    created_at: datetime

    model_config = {"from_attributes": True}


class RuleCreate(BaseModel):
    vendor_pattern: str
    match_type: str = "exact"
    category_id: int | None = None
    vendor_display_name: str | None = None
    is_hidden: bool = False
    priority: int = 0


class RuleUpdate(BaseModel):
    vendor_pattern: str | None = None
    match_type: str | None = None
    category_id: int | None = None
    vendor_display_name: str | None = None
    is_hidden: bool | None = None
    priority: int | None = None
