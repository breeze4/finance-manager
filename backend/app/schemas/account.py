from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class AccountType(StrEnum):
    checking = "checking"
    savings = "savings"
    credit_card = "credit_card"
    brokerage = "brokerage"
    retirement = "retirement"
    asset = "asset"


class AccountResponse(BaseModel):
    id: int
    name: str
    type: AccountType
    institution: str | None
    is_archived: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AccountCreate(BaseModel):
    name: str
    type: AccountType
    institution: str | None = None


class AccountUpdate(BaseModel):
    name: str | None = None
    type: AccountType | None = None
    institution: str | None = None
