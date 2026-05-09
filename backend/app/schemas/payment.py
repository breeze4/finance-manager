from datetime import date

from pydantic import BaseModel


class PaymentListItem(BaseModel):
    """One row in the ``GET /api/payments`` response.

    Represents a positive-amount transaction on a credit-card account.
    Field names match the wire (snake_case); ``amount`` is always
    positive (filtered server-side).
    """

    id: int
    date: date
    account_id: int
    account_name: str
    vendor: str
    amount: float
