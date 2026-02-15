from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ClassificationRule(Base):
    __tablename__ = "classification_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vendor_pattern: Mapped[str] = mapped_column(String, nullable=False)
    match_type: Mapped[str] = mapped_column(String, nullable=False, default="exact")
    category_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("categories.id"), nullable=True
    )
    vendor_display_name: Mapped[str | None] = mapped_column(String, nullable=True)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    category: Mapped["Category | None"] = relationship(  # noqa: F821
        back_populates="classification_rules"
    )
