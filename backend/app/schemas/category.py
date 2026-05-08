from pydantic import BaseModel

from app.models.category import CspBucket


class CategoryResponse(BaseModel):
    id: int
    name: str
    is_system: bool
    exclude_from_budget: bool
    csp_bucket: CspBucket | None
    is_pre_tax: bool
    transaction_count: int

    model_config = {"from_attributes": True}


class CategoryCreate(BaseModel):
    name: str
    exclude_from_budget: bool = False
    csp_bucket: CspBucket | None = None
    is_pre_tax: bool = False


class CategoryUpdate(BaseModel):
    name: str | None = None
    exclude_from_budget: bool | None = None
    csp_bucket: CspBucket | None = None
    is_pre_tax: bool | None = None
