from datetime import date

import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    Account,
    Budget,
    BudgetMonthlyOverride,
    Category,
    ClassificationRule,
    ImportLog,
    Subscription,
    Transaction,
)


def _make_account(db: Session, name: str = "Chase CC", type: str = "credit_card") -> Account:
    account = Account(name=name, type=type, institution=None, is_archived=False)
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def _seed_categories(db: Session) -> list[Category]:
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
    cats = [Category(name=n, is_system=True) for n in names]
    db.add_all(cats)
    db.commit()
    return cats


class TestCategoryModel:
    def test_seed_categories(self, db: Session):
        cats = _seed_categories(db)
        assert len(cats) == 16
        assert db.query(Category).count() == 16

    def test_category_unique_name(self, db: Session):
        db.add(Category(name="Test", is_system=False))
        db.commit()
        db.add(Category(name="Test", is_system=False))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_system_flag_defaults_false(self, db: Session):
        cat = Category(name="Custom")
        db.add(cat)
        db.commit()
        assert cat.is_system is False


class TestTransactionModel:
    def test_create_transaction(self, db: Session):
        cat = Category(name="Groceries", is_system=True)
        db.add(cat)
        db.commit()
        account = _make_account(db)

        txn = Transaction(
            source_file="test.csv",
            account_id=account.id,
            date=date(2025, 6, 15),
            raw_description="FRED MEYER #1234",
            vendor="Fred Meyer",
            amount=-45.67,
            category_id=cat.id,
            import_hash="abc123",
        )
        db.add(txn)
        db.commit()

        assert txn.id is not None
        assert txn.account.name == "Chase CC"
        assert txn.category.name == "Groceries"
        assert txn.is_verified is False
        assert txn.is_transfer is False

    def test_import_hash_unique(self, db: Session):
        account = _make_account(db)
        base = dict(
            source_file="test.csv",
            account_id=account.id,
            date=date(2025, 1, 1),
            raw_description="desc",
            vendor="V",
            amount=-10.0,
        )
        db.add(Transaction(**base, import_hash="same"))
        db.commit()
        db.add(Transaction(**base, import_hash="same"))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_category_relationship(self, db: Session):
        cat = Category(name="Dining", is_system=True)
        db.add(cat)
        db.commit()
        account = _make_account(db, name="A", type="asset")

        txn = Transaction(
            source_file="f.csv",
            account_id=account.id,
            date=date(2025, 1, 1),
            raw_description="r",
            vendor="v",
            amount=-5.0,
            import_hash="h1",
            category_id=cat.id,
        )
        db.add(txn)
        db.commit()

        assert txn.category is cat
        assert txn in cat.transactions


class TestClassificationRuleModel:
    def test_create_rule(self, db: Session):
        cat = Category(name="Groceries", is_system=True)
        db.add(cat)
        db.commit()

        rule = ClassificationRule(
            vendor_pattern="Fred Meyer",
            match_type="exact",
            category_id=cat.id,
        )
        db.add(rule)
        db.commit()

        assert rule.id is not None
        assert rule.priority == 0
        assert rule.is_hidden is False
        assert rule.category.name == "Groceries"


class TestBudgetModel:
    def test_budget_with_overrides(self, db: Session):
        cat = Category(name="Groceries", is_system=True)
        db.add(cat)
        db.commit()

        budget = Budget(category_id=cat.id, year=2026, monthly_amount=500.0)
        db.add(budget)
        db.commit()

        override = BudgetMonthlyOverride(budget_id=budget.id, month=12, amount=800.0)
        db.add(override)
        db.commit()

        assert len(budget.monthly_overrides) == 1
        assert budget.monthly_overrides[0].amount == 800.0
        assert budget.rollover_mode is False

    def test_budget_unique_category_year(self, db: Session):
        cat = Category(name="Dining", is_system=True)
        db.add(cat)
        db.commit()

        db.add(Budget(category_id=cat.id, year=2026, monthly_amount=300.0))
        db.commit()
        db.add(Budget(category_id=cat.id, year=2026, monthly_amount=400.0))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_override_cascade_delete(self, db: Session):
        cat = Category(name="Gas", is_system=True)
        db.add(cat)
        db.commit()

        budget = Budget(category_id=cat.id, year=2026, monthly_amount=200.0)
        db.add(budget)
        db.commit()

        db.add(BudgetMonthlyOverride(budget_id=budget.id, month=6, amount=250.0))
        db.commit()
        assert db.query(BudgetMonthlyOverride).count() == 1

        db.delete(budget)
        db.commit()
        assert db.query(BudgetMonthlyOverride).count() == 0


class TestSubscriptionModel:
    def test_create_subscription(self, db: Session):
        cat = Category(name="Entertainment", is_system=True)
        db.add(cat)
        db.commit()

        sub = Subscription(
            vendor="YouTube Premium",
            frequency="monthly",
            subscription_type="fixed",
            amount=15.44,
            annual_estimate=185.28,
            last_charge_date=date(2026, 1, 15),
            category_id=cat.id,
        )
        db.add(sub)
        db.commit()

        assert sub.id is not None
        assert sub.is_active is True
        assert sub.category.name == "Entertainment"


class TestImportLogModel:
    def test_create_import_log(self, db: Session):
        log = ImportLog(
            filename="chase.csv",
            file_hash="sha256abc",
            rows_imported=150,
            rows_skipped=3,
        )
        db.add(log)
        db.commit()

        assert log.id is not None
        assert log.rows_imported == 150


class TestMigrationAppliesCleanly:
    def test_all_tables_created(self, db: Session):
        inspector = inspect(db.bind)
        tables = set(inspector.get_table_names())
        expected = {
            "accounts",
            "categories",
            "transactions",
            "classification_rules",
            "budgets",
            "budget_monthly_overrides",
            "subscriptions",
            "import_log",
        }
        assert expected.issubset(tables)
