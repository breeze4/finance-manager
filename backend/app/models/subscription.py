from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vendor: Mapped[str] = mapped_column(String, nullable=False)
    frequency: Mapped[str] = mapped_column(String, nullable=False)
    subscription_type: Mapped[str] = mapped_column(String, nullable=False)
    amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    amount_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    amount_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    annual_estimate: Mapped[float] = mapped_column(Float, nullable=False)
    last_charge_date: Mapped[date] = mapped_column(Date, nullable=False)
    category_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("categories.id"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    category: Mapped["Category | None"] = relationship(back_populates="subscriptions")  # noqa: F821
