from datetime import date, datetime

from pydantic import BaseModel


class TransactionResponse(BaseModel):
    id: int
    source_file: str
    account_id: int
    account_name: str
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
    vendor: str | None = None
    memo: str | None = None
    # When True with category_id set, also reclassifies all other unverified
    # transactions matching the same vendor and creates/updates the rule.
    # Default False — single-row updates change only the target row.
    apply_to_vendor: bool = False


class BulkUpdateRequest(BaseModel):
    ids: list[int]
    category_id: int | None = None
    is_verified: bool | None = None
    apply_to_vendor: bool = False
