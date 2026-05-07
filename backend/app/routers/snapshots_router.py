"""Snapshot + net-worth router.

Mounts two routes:

* ``POST /api/snapshots/batch`` — upsert a batch of manual balance entries.
* ``GET  /api/net-worth/latest`` — latest balance per non-archived account.

The future ``GET /api/net-worth?start_date=&end_date=`` time-series route
lives in this same file (added by plan 07). Don't split into a second
router — they are part of the same surface area.
"""

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.balance_snapshot import (
    LatestBalanceResponse,
    NetWorthPoint,
    SnapshotBatchRequest,
    SnapshotBatchResponse,
)
from app.services import net_worth_service, snapshot_service

router = APIRouter(prefix="/api", tags=["snapshots"])


@router.post("/snapshots/batch", response_model=SnapshotBatchResponse)
def post_snapshot_batch(body: SnapshotBatchRequest, db: Session = Depends(get_db)):
    written = snapshot_service.upsert_batch(db, body.as_of_date, body.entries)
    return SnapshotBatchResponse(written=written)


@router.get("/net-worth/latest", response_model=list[LatestBalanceResponse])
def get_net_worth_latest(db: Session = Depends(get_db)):
    return snapshot_service.get_latest_balances(db)


@router.get("/net-worth", response_model=list[NetWorthPoint])
def get_net_worth_series(
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
):
    return net_worth_service.compute_time_series(db, start_date=start_date, end_date=end_date)
