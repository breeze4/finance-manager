from pydantic import BaseModel


class CategoryResponse(BaseModel):
    id: int
    name: str
    is_system: bool
    exclude_from_budget: bool
    transaction_count: int

    model_config = {"from_attributes": True}


class CategoryCreate(BaseModel):
    name: str
    exclude_from_budget: bool = False


class CategoryUpdate(BaseModel):
    name: str | None = None
    exclude_from_budget: bool | None = None
