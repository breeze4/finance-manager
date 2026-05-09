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


class PaymentSeriesBucket(BaseModel):
    """One bucket in the ``GET /api/payments/series`` response.

    ``label`` is pre-formatted by the backend (e.g. ``"Jan 2026"``,
    ``"Q1 2026"``, ``"2026"``) so the frontend doesn't reimplement
    formatting. Both totals are non-negative magnitudes in dollars.
    """

    label: str
    charges_total: float
    payments_total: float


class PaymentSeriesResponse(BaseModel):
    """Response shape for ``GET /api/payments/series``.

    ``bucket_size`` is the size chosen by the backend deriver
    (``"month"`` | ``"quarter"`` | ``"year"``). ``buckets`` is in
    chronological order and includes every bucket in the requested
    range — empty buckets appear with ``charges_total == 0`` and
    ``payments_total == 0``.
    """

    bucket_size: str
    buckets: list[PaymentSeriesBucket]
