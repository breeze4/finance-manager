from datetime import date, datetime

from pydantic import BaseModel


class TransactionResponse(BaseModel):
    id: int
    source_file: str
    account: str
    date: date
    post_date: date | None
    raw_description: str
    vendor: str
    amount: float
    source_category: str | None
    category_id: int | None
    category_name: str | None
    type: str | None
    is_verified: bool
    is_transfer: bool
    is_reviewed: bool
    memo: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PaginatedTransactions(BaseModel):
    items: list[TransactionResponse]
    total: int
    page: int
    page_size: int


class TransactionUpdate(BaseModel):
    category_id: int | None = None
    is_verified: bool | None = None
    is_reviewed: bool | None = None
    vendor: str | None = None
    memo: str | None = None


class BulkUpdateRequest(BaseModel):
    ids: list[int]
    category_id: int | None = None
    is_verified: bool | None = None
    is_reviewed: bool | None = None
