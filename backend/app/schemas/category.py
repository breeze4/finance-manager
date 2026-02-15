from pydantic import BaseModel


class CategoryResponse(BaseModel):
    id: int
    name: str
    is_system: bool
    transaction_count: int

    model_config = {"from_attributes": True}


class CategoryCreate(BaseModel):
    name: str


class CategoryUpdate(BaseModel):
    name: str
