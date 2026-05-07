from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Account, Category


@pytest.fixture
def db() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)


@pytest.fixture
def client(db: Session) -> Generator[TestClient, None, None]:
    """FastAPI test client with overridden DB dependency."""

    def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def get_or_create_account(
    db: Session,
    name: str,
    *,
    type: str = "asset",
    institution: str | None = None,
) -> Account:
    """Test helper: return account row by name, creating it if absent.

    Used by tests that previously passed ``account="..."`` directly to
    ``Transaction(...)``. Defaults to ``type="asset"`` for arbitrary
    placeholder names like "Test"; callers that need a specific type can
    pass it explicitly.
    """
    account = db.query(Account).filter(Account.name == name).first()
    if account is None:
        account = Account(name=name, type=type, institution=institution, is_archived=False)
        db.add(account)
        db.commit()
        db.refresh(account)
    return account


@pytest.fixture
def chase_cc_account(db: Session) -> Account:
    """Pre-seeded Chase CC account row matching the migration's bulk_insert."""
    account = Account(
        name="Chase CC",
        type="credit_card",
        institution="Chase",
        is_archived=False,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@pytest.fixture
def becu_account(db: Session) -> Account:
    """Pre-seeded BECU Checking account row matching the migration's bulk_insert."""
    account = Account(
        name="BECU Checking",
        type="checking",
        institution="BECU",
        is_archived=False,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@pytest.fixture
def seed_categories(db: Session) -> dict[str, int]:
    """Seed canonical categories and return name->id map."""
    names = [
        "Shopping",
        "Groceries",
        "Dining",
        "Health & Wellness",
        "Entertainment",
        "Bills & Utilities",
        "Travel",
        "Gas",
        "Education",
        "Personal",
        "Home",
        "Gifts & Donations",
        "Income",
        "Investments",
        "Transfers",
        "Uncategorized",
    ]
    for n in names:
        db.add(Category(name=n, is_system=True))
    db.commit()
    return {cat.name: cat.id for cat in db.query(Category).all()}
