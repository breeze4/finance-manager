from datetime import datetime

from pydantic import BaseModel

from app.schemas.transaction import TransactionResponse


class PaymentMatchResponse(BaseModel):
    id: int
    checking_transaction: TransactionResponse
    cc_transaction: TransactionResponse
    matched_at: datetime

    model_config = {"from_attributes": True}


class DetectionResultResponse(BaseModel):
    matches_found: int
    total_matches: int
