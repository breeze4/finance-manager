from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.services.import_service import import_all, import_file
from app.services.payment_service import detect_payments

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("")
def import_single(filename: str, db: Session = Depends(get_db)):
    filepath = settings.input_dir / filename
    if not filepath.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")
    result = import_file(db, filepath)
    if result.error:
        raise HTTPException(status_code=400, detail=result.error)
    detection = detect_payments(db)
    return {
        "filename": result.filename,
        "rows_imported": result.rows_imported,
        "rows_skipped": result.rows_skipped,
        "matches_found": detection.matches_found,
        "total_matches": detection.total_matches,
    }


@router.post("/all")
def import_all_files(db: Session = Depends(get_db)):
    input_dir = Path(settings.input_dir)
    if not input_dir.is_dir():
        raise HTTPException(status_code=400, detail=f"Input directory not found: {input_dir}")
    results = import_all(db, input_dir)
    total_imported = sum(r.rows_imported for r in results)
    total_skipped = sum(r.rows_skipped for r in results)
    detection = detect_payments(db)
    return {
        "files": [
            {
                "filename": r.filename,
                "rows_imported": r.rows_imported,
                "rows_skipped": r.rows_skipped,
                "error": r.error,
            }
            for r in results
        ],
        "total_imported": total_imported,
        "total_skipped": total_skipped,
        "matches_found": detection.matches_found,
        "total_matches": detection.total_matches,
    }
