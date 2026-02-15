from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PaymentMatch(Base):
    __tablename__ = "payment_matches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    checking_transaction_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("transactions.id"), nullable=False
    )
    cc_transaction_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("transactions.id"), nullable=False
    )
    matched_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    checking_transaction: Mapped["Transaction"] = relationship(  # noqa: F821
        foreign_keys=[checking_transaction_id]
    )
    cc_transaction: Mapped["Transaction"] = relationship(  # noqa: F821
        foreign_keys=[cc_transaction_id]
    )
