from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Index, Integer, Numeric, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class NetIncomePeriod(Base):
    """One step-function entry for monthly take-home (net) income.

    Step-function semantics: for any month ``M``, the effective monthly net
    income is the row with the largest ``effective_month`` <= ``M``.

    ``effective_month`` is encoded as an integer ``YYYYMM`` (e.g. ``202605``
    for May 2026). This keeps the column total-orderable, makes lookups a
    plain ``<=`` comparison, and avoids the day-of-month ambiguity that a
    DATE column would force on us. ``UNIQUE`` on ``effective_month`` enforces
    one row per month so updates overwrite cleanly.
    """

    __tablename__ = "net_income_periods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    effective_month: Mapped[int] = mapped_column(Integer, nullable=False)
    take_home_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("effective_month", name="uq_net_income_effective_month"),
        Index("ix_net_income_effective_month", "effective_month"),
    )
