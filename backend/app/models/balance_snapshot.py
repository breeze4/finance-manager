"""Balance snapshot model.

Each row records the balance of one ``Account`` at one ``as_of_date``. The
balance is always stored as a positive number; sign (e.g. credit-card debt
shown as negative) is applied at display time based on ``Account.type``.

A unique constraint on ``(account_id, as_of_date)`` enforces "one snapshot
per account per day" — re-entering for the same pair upserts via the
``POST /api/snapshots/batch`` endpoint.
"""

from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

SNAPSHOT_SOURCES = ("manual",)


class BalanceSnapshot(Base):
    __tablename__ = "balance_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(Integer, ForeignKey("accounts.id"), nullable=False)
    as_of_date: Mapped[date] = mapped_column(Date, nullable=False)
    balance: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(
        Enum(*SNAPSHOT_SOURCES, name="snapshotsource"),
        nullable=False,
        default="manual",
    )
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    account: Mapped["Account"] = relationship()  # noqa: F821

    __table_args__ = (
        UniqueConstraint("account_id", "as_of_date", name="uq_balance_snapshots_account_date"),
        Index("ix_balance_snapshots_account_id", "account_id"),
    )
