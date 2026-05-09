"""Tests for the payments series deriver and ``GET /api/payments/series``.

Covers ``bucket_size_for_range`` boundary behaviour and the series
endpoint's aggregation contract: positives → ``payments_total``,
negatives → ``charges_total`` (positive magnitude), zero-filled empty
buckets, and bucket-size auto-derivation from the requested range span.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Account, Transaction
from app.services.payment_service import bucket_size_for_range


def _add_account(db: Session, name: str, *, type: str = "credit_card") -> Account:
    account = Account(name=name, type=type, institution=None, is_archived=False)
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def _add_txn(
    db: Session,
    *,
    account_id: int,
    amount: float,
    txn_date: date,
    vendor: str = "Vendor",
    is_transfer: bool = False,
    import_hash: str | None = None,
) -> Transaction:
    txn = Transaction(
        source_file="seed.csv",
        account_id=account_id,
        date=txn_date,
        raw_description=f"{vendor} desc",
        vendor=vendor,
        amount=amount,
        is_transfer=is_transfer,
        import_hash=import_hash or f"h_{account_id}_{amount}_{txn_date}",
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


# ---------------------------------------------------------------------------
# bucket_size_for_range
# ---------------------------------------------------------------------------


class TestBucketSizeForRange:
    """Table-driven boundary tests for the deriver.

    Breakpoints (days): ``<=366`` → month, ``<=1464`` → quarter, else year.
    """

    @pytest.mark.parametrize(
        "span_days,expected",
        [
            (0, "month"),
            (1, "month"),
            (30, "month"),
            (365, "month"),  # one non-leap year
            (366, "month"),  # one year incl. leap day → still month
            (367, "quarter"),  # just over → quarter
            (730, "quarter"),  # ~2 years
            (1463, "quarter"),  # just under 4*366
            (1464, "quarter"),  # exactly 4 years (incl. one leap)
            (1465, "year"),  # just over → year
            (1825, "year"),  # ~5 years
            (3650, "year"),  # ~10 years
        ],
    )
    def test_breakpoints(self, span_days: int, expected: str):
        start = date(2020, 1, 1)
        end = start + timedelta(days=span_days)
        assert bucket_size_for_range(start, end) == expected

    def test_missing_start_defaults_to_month(self):
        assert bucket_size_for_range(None, date(2025, 1, 1)) == "month"

    def test_missing_end_defaults_to_month(self):
        assert bucket_size_for_range(date(2020, 1, 1), None) == "month"

    def test_both_missing_defaults_to_month(self):
        assert bucket_size_for_range(None, None) == "month"


# ---------------------------------------------------------------------------
# GET /api/payments/series
# ---------------------------------------------------------------------------


class TestSeriesEndpoint:
    def test_single_cc_month_bucketing(self, client: TestClient, db: Session):
        cc = _add_account(db, "Chase CC")
        # Jan: one charge (-100), one payment (250)
        _add_txn(db, account_id=cc.id, amount=-100.0, txn_date=date(2025, 1, 5), import_hash="c1")
        _add_txn(db, account_id=cc.id, amount=250.0, txn_date=date(2025, 1, 20), import_hash="p1")
        # Feb: payment only
        _add_txn(db, account_id=cc.id, amount=80.0, txn_date=date(2025, 2, 14), import_hash="p2")
        # Mar: charge only
        _add_txn(db, account_id=cc.id, amount=-40.0, txn_date=date(2025, 3, 1), import_hash="c2")

        resp = client.get("/api/payments/series?start_date=2025-01-01&end_date=2025-03-31")
        assert resp.status_code == 200
        body = resp.json()
        assert body["bucket_size"] == "month"
        labels = [b["label"] for b in body["buckets"]]
        assert labels == ["Jan 2025", "Feb 2025", "Mar 2025"]
        assert body["buckets"][0]["charges_total"] == 100.0
        assert body["buckets"][0]["payments_total"] == 250.0
        assert body["buckets"][1]["charges_total"] == 0.0
        assert body["buckets"][1]["payments_total"] == 80.0
        assert body["buckets"][2]["charges_total"] == 40.0
        assert body["buckets"][2]["payments_total"] == 0.0

    def test_multi_cc_no_account_filter_aggregates_across_cards(
        self, client: TestClient, db: Session
    ):
        cc1 = _add_account(db, "Chase CC")
        cc2 = _add_account(db, "Amex Gold")
        _add_txn(db, account_id=cc1.id, amount=100.0, txn_date=date(2025, 1, 5), import_hash="a")
        _add_txn(db, account_id=cc2.id, amount=200.0, txn_date=date(2025, 1, 10), import_hash="b")
        _add_txn(db, account_id=cc1.id, amount=-50.0, txn_date=date(2025, 1, 15), import_hash="c")

        resp = client.get("/api/payments/series?start_date=2025-01-01&end_date=2025-01-31")
        body = resp.json()
        assert body["bucket_size"] == "month"
        assert len(body["buckets"]) == 1
        assert body["buckets"][0]["payments_total"] == 300.0
        assert body["buckets"][0]["charges_total"] == 50.0

    def test_account_filter_narrows(self, client: TestClient, db: Session):
        cc1 = _add_account(db, "Chase CC")
        cc2 = _add_account(db, "Amex Gold")
        _add_txn(db, account_id=cc1.id, amount=100.0, txn_date=date(2025, 1, 5), import_hash="a")
        _add_txn(db, account_id=cc2.id, amount=200.0, txn_date=date(2025, 1, 10), import_hash="b")

        resp = client.get(
            f"/api/payments/series?account_id={cc2.id}&start_date=2025-01-01&end_date=2025-01-31"
        )
        body = resp.json()
        assert body["buckets"][0]["payments_total"] == 200.0

    def test_non_cc_accounts_excluded(self, client: TestClient, db: Session):
        cc = _add_account(db, "Chase CC")
        checking = _add_account(db, "BECU Checking", type="checking")
        _add_txn(db, account_id=cc.id, amount=100.0, txn_date=date(2025, 1, 5), import_hash="a")
        _add_txn(
            db,
            account_id=checking.id,
            amount=999.0,
            txn_date=date(2025, 1, 6),
            import_hash="b",
        )
        _add_txn(
            db,
            account_id=checking.id,
            amount=-500.0,
            txn_date=date(2025, 1, 7),
            import_hash="c",
        )

        resp = client.get("/api/payments/series?start_date=2025-01-01&end_date=2025-01-31")
        body = resp.json()
        assert body["buckets"][0]["payments_total"] == 100.0
        assert body["buckets"][0]["charges_total"] == 0.0

    def test_empty_buckets_zero_filled(self, client: TestClient, db: Session):
        cc = _add_account(db, "Chase CC")
        # Activity only in Mar; Jan/Feb/Apr/May should still appear.
        _add_txn(db, account_id=cc.id, amount=42.0, txn_date=date(2025, 3, 15), import_hash="a")

        resp = client.get("/api/payments/series?start_date=2025-01-01&end_date=2025-05-31")
        body = resp.json()
        labels = [b["label"] for b in body["buckets"]]
        assert labels == [
            "Jan 2025",
            "Feb 2025",
            "Mar 2025",
            "Apr 2025",
            "May 2025",
        ]
        zeros = [
            (b["charges_total"], b["payments_total"])
            for b in body["buckets"]
            if b["label"] != "Mar 2025"
        ]
        assert zeros == [(0.0, 0.0)] * 4
        mar = next(b for b in body["buckets"] if b["label"] == "Mar 2025")
        assert mar["payments_total"] == 42.0

    def test_quarter_bucketing(self, client: TestClient, db: Session):
        """A 2-year range crosses the month→quarter breakpoint."""
        cc = _add_account(db, "Chase CC")
        _add_txn(
            db, account_id=cc.id, amount=100.0, txn_date=date(2024, 2, 1), import_hash="q1"
        )  # Q1 2024
        _add_txn(
            db, account_id=cc.id, amount=-50.0, txn_date=date(2024, 5, 1), import_hash="q2"
        )  # Q2 2024
        _add_txn(
            db, account_id=cc.id, amount=200.0, txn_date=date(2025, 8, 15), import_hash="q3"
        )  # Q3 2025

        resp = client.get("/api/payments/series?start_date=2024-01-01&end_date=2025-12-31")
        body = resp.json()
        assert body["bucket_size"] == "quarter"
        labels = [b["label"] for b in body["buckets"]]
        assert labels == [
            "Q1 2024",
            "Q2 2024",
            "Q3 2024",
            "Q4 2024",
            "Q1 2025",
            "Q2 2025",
            "Q3 2025",
            "Q4 2025",
        ]
        by_label = {b["label"]: b for b in body["buckets"]}
        assert by_label["Q1 2024"]["payments_total"] == 100.0
        assert by_label["Q2 2024"]["charges_total"] == 50.0
        assert by_label["Q3 2025"]["payments_total"] == 200.0
        assert by_label["Q4 2024"]["payments_total"] == 0.0

    def test_year_bucketing(self, client: TestClient, db: Session):
        """A 6-year range crosses the quarter→year breakpoint."""
        cc = _add_account(db, "Chase CC")
        _add_txn(db, account_id=cc.id, amount=100.0, txn_date=date(2020, 6, 1), import_hash="y20")
        _add_txn(db, account_id=cc.id, amount=-200.0, txn_date=date(2023, 11, 1), import_hash="y23")

        resp = client.get("/api/payments/series?start_date=2020-01-01&end_date=2025-12-31")
        body = resp.json()
        assert body["bucket_size"] == "year"
        labels = [b["label"] for b in body["buckets"]]
        assert labels == ["2020", "2021", "2022", "2023", "2024", "2025"]
        by_label = {b["label"]: b for b in body["buckets"]}
        assert by_label["2020"]["payments_total"] == 100.0
        assert by_label["2023"]["charges_total"] == 200.0
        assert by_label["2024"] == {
            "label": "2024",
            "charges_total": 0.0,
            "payments_total": 0.0,
        }

    def test_range_edges_inclusive(self, client: TestClient, db: Session):
        cc = _add_account(db, "Chase CC")
        _add_txn(db, account_id=cc.id, amount=10.0, txn_date=date(2025, 1, 1), import_hash="a")
        _add_txn(db, account_id=cc.id, amount=20.0, txn_date=date(2025, 1, 31), import_hash="b")
        _add_txn(db, account_id=cc.id, amount=99.0, txn_date=date(2025, 2, 1), import_hash="c")

        resp = client.get("/api/payments/series?start_date=2025-01-01&end_date=2025-01-31")
        body = resp.json()
        assert len(body["buckets"]) == 1
        assert body["buckets"][0]["payments_total"] == 30.0  # 10 + 20, not 99

    def test_charges_are_positive_magnitude(self, client: TestClient, db: Session):
        cc = _add_account(db, "Chase CC")
        _add_txn(db, account_id=cc.id, amount=-123.45, txn_date=date(2025, 1, 5), import_hash="a")

        resp = client.get("/api/payments/series?start_date=2025-01-01&end_date=2025-01-31")
        body = resp.json()
        # The exact 123.45 may have float representation drift; check positive magnitude.
        assert body["buckets"][0]["charges_total"] == pytest.approx(123.45)
        assert body["buckets"][0]["payments_total"] == 0.0

    def test_response_schema_keys(self, client: TestClient, db: Session):
        cc = _add_account(db, "Chase CC")
        _add_txn(db, account_id=cc.id, amount=10.0, txn_date=date(2025, 1, 5), import_hash="a")

        resp = client.get("/api/payments/series?start_date=2025-01-01&end_date=2025-01-31")
        body = resp.json()
        assert set(body.keys()) == {"bucket_size", "buckets"}
        assert set(body["buckets"][0].keys()) == {
            "label",
            "charges_total",
            "payments_total",
        }
