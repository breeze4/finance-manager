from datetime import date

from pydantic import BaseModel


class SnapshotBatchEntry(BaseModel):
    account_id: int
    balance: float | None = None
    notes: str | None = None


class SnapshotBatchRequest(BaseModel):
    as_of_date: date
    entries: list[SnapshotBatchEntry]


class SnapshotBatchResponse(BaseModel):
    written: int


class LatestBalanceResponse(BaseModel):
    account_id: int
    account_name: str
    account_type: str
    balance: float | None
    as_of_date: date | None
    snapshot_count: int = 0
    transaction_count: int = 0
    first_transaction_date: date | None = None
    last_transaction_date: date | None = None

    model_config = {"from_attributes": True}


class NetWorthPoint(BaseModel):
    date: date
    net_worth: float
