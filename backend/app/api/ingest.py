from __future__ import annotations

import threading

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.common import BulkIngestRequest, IngestResponse, IngestSessionRequest
from app.services.bootstrap import DataBootstrapService
from app.services.preprocessing import SessionPreprocessor, ingest_bulk

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("/session", response_model=IngestResponse)
def ingest_session(payload: IngestSessionRequest, db: Session = Depends(get_db)) -> IngestResponse:
    try:
        result = SessionPreprocessor().ingest_event_sessions(
            payload.season,
            payload.event,
            payload.session,
            force=payload.force,
            db=db,
        )
        return IngestResponse(**result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Session ingest failed: {exc}") from exc


@router.post("/bulk", response_model=list[IngestResponse])
def bulk_ingest(payload: BulkIngestRequest) -> list[IngestResponse]:
    results = ingest_bulk(payload.seasons, payload.session, payload.events, payload.force, payload.workers)
    return [IngestResponse(**item) for item in results]


@router.get("/bootstrap-status")
def bootstrap_status() -> dict:
    return DataBootstrapService().status()


@router.post("/bootstrap")
def bootstrap_recent_races() -> dict:
    threading.Thread(
        target=DataBootstrapService().bootstrap_recent_races,
        name="fastf1-manual-bootstrap",
        daemon=True,
    ).start()
    return {
        "status": "started",
        "message": "Started background caching for the last four completed race seasons.",
    }
