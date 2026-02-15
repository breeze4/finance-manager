from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("categories.id"), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    monthly_amount: Mapped[float] = mapped_column(Float, nullable=False)
    rollover_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    category: Mapped["Category"] = relationship(back_populates="budgets")  # noqa: F821
    monthly_overrides: Mapped[list["BudgetMonthlyOverride"]] = relationship(
        back_populates="budget", cascade="all, delete-orphan"
    )

    __table_args__ = (UniqueConstraint("category_id", "year"),)


class BudgetMonthlyOverride(Base):
    __tablename__ = "budget_monthly_overrides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    budget_id: Mapped[int] = mapped_column(Integer, ForeignKey("budgets.id"), nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)

    budget: Mapped["Budget"] = relationship(back_populates="monthly_overrides")

    __table_args__ = (UniqueConstraint("budget_id", "month"),)
