from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ImportLog(Base):
    __tablename__ = "import_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String, nullable=False)
    file_hash: Mapped[str] = mapped_column(String, nullable=False)
    rows_imported: Mapped[int] = mapped_column(Integer, nullable=False)
    rows_skipped: Mapped[int] = mapped_column(Integer, nullable=False)
    imported_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
