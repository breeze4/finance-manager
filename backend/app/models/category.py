from enum import StrEnum

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CspBucket(StrEnum):
    """Conscious Spending Plan bucket assigned to a category.

    Categories with ``exclude_from_budget=True``, income categories, and
    transfer-only categories are NULL — they don't belong in any spending
    bucket. All other spending categories must be one of these four values.
    """

    FIXED = "fixed"
    INVESTMENTS = "investments"
    SAVINGS = "savings"
    GUILT_FREE = "guilt_free"


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    exclude_from_budget: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    csp_bucket: Mapped[str | None] = mapped_column(String, nullable=True)
    is_pre_tax: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="category")  # noqa: F821
    classification_rules: Mapped[list["ClassificationRule"]] = relationship(  # noqa: F821
        back_populates="category"
    )
    budgets: Mapped[list["Budget"]] = relationship(back_populates="category")  # noqa: F821
    subscriptions: Mapped[list["Subscription"]] = relationship(  # noqa: F821
        back_populates="category"
    )
