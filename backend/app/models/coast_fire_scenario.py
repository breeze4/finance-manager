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


class CoastFireScenario(Base):
    """Stored Coast FIRE calculator scenario.

    Stores user inputs only — derived/computed values (future value, coast age,
    additional savings needed) are not persisted; they are recomputed in the
    frontend math library on every render. See spec
    `docs/specs/2026-05-06-01-calculator-port.md` §"Persistence → Data model".

    Constraints:
      - `name` is unique across the table.
      - At most one row may have `is_active = True`. Enforced by a partial
        unique index added in the Alembic migration (SQLite/Postgres compatible).
    """

    __tablename__ = "coast_fire_scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Inputs — stored as Float to match the calculator's input convention. Ages
    # may be entered as decimals (the source UI uses `type="number"` without
    # an integer constraint) so we keep them as Float for fidelity.
    current_age: Mapped[float] = mapped_column(Float, nullable=False)
    retirement_age: Mapped[float] = mapped_column(Float, nullable=False)
    current_savings: Mapped[float] = mapped_column(Float, nullable=False)
    expected_return_rate: Mapped[float] = mapped_column(Float, nullable=False)
    target_retirement_amount: Mapped[float] = mapped_column(Float, nullable=False)
    monthly_expenses: Mapped[float] = mapped_column(Float, nullable=False)
    yearly_expenses: Mapped[float] = mapped_column(Float, nullable=False)
    withdrawal_rate: Mapped[float] = mapped_column(Float, nullable=False)
    inflation_rate: Mapped[float] = mapped_column(Float, nullable=False)
    use_real_returns: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Plain TEXT — values are 'target' | 'monthly' | 'yearly'. No CHECK
    # constraint — analyzer convention is plain TEXT for small enums.
    last_edited_field: Mapped[str] = mapped_column(String, nullable=False, default="target")

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("name"),
        Index(
            "ix_coast_fire_scenarios_is_active",
            "is_active",
            unique=True,
            sqlite_where=text("is_active = 1"),
            postgresql_where=text("is_active = true"),
        ),
    )
