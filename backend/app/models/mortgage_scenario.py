from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MortgageScenario(Base):
    """Stored Mortgage Payoff calculator scenario.

    Stores user inputs only — derived/computed values (payoff time, interest
    saved, investment comparison) are not persisted; they are recomputed in the
    frontend math library on every render. See spec
    `docs/specs/2026-05-06-01-calculator-port.md` §"Persistence → Data model".

    Constraints:
      - `name` is unique across the table.
      - At most one row may have `is_active = True`. Enforced by a partial
        unique index added in the Alembic migration (SQLite/Postgres compatible).
    """

    __tablename__ = "mortgage_scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Inputs — stored as Float to match the calculator's input convention.
    principal: Mapped[float] = mapped_column(Float, nullable=False)
    years_left: Mapped[float] = mapped_column(Float, nullable=False)
    interest_rate: Mapped[float] = mapped_column(Float, nullable=False)
    monthly_payment: Mapped[float] = mapped_column(Float, nullable=False)
    additional_monthly_payment: Mapped[float] = mapped_column(Float, nullable=False)
    lump_sum_payment: Mapped[float] = mapped_column(Float, nullable=False)
    investment_return_rate: Mapped[float] = mapped_column(Float, nullable=False)
    investment_tax_rate: Mapped[float] = mapped_column(Float, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("name"),
        Index(
            "ix_mortgage_scenarios_is_active",
            "is_active",
            unique=True,
            sqlite_where=text("is_active = 1"),
            postgresql_where=text("is_active = true"),
        ),
    )
