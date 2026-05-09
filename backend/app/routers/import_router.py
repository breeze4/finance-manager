from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.services.ingestion import build_ingestion

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("")
def import_single(filename: str, db: Session = Depends(get_db)):
    filepath = settings.input_dir / filename
    if not filepath.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")
    report = build_ingestion(db).ingest(filepath)
    outcome = report.files[0]
    if outcome.error:
        raise HTTPException(status_code=400, detail=outcome.error)
    return {
        "filename": outcome.filename,
        "rows_imported": outcome.rows_imported,
        "rows_skipped": outcome.rows_skipped,
    }


@router.post("/all")
def import_all_files(db: Session = Depends(get_db)):
    input_dir = Path(settings.input_dir)
    if not input_dir.is_dir():
        raise HTTPException(status_code=400, detail=f"Input directory not found: {input_dir}")
    report = build_ingestion(db).ingest(input_dir)
    return {
        "files": [
            {
                "filename": f.filename,
                "rows_imported": f.rows_imported,
                "rows_skipped": f.rows_skipped,
                "error": f.error,
            }
            for f in report.files
        ],
        "total_imported": report.rows_imported,
        "total_skipped": report.rows_skipped,
    }
