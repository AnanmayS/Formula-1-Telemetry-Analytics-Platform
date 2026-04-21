from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.core.config import get_settings
from app.schemas.session import EventOption, SessionOption
from app.services.fastf1_service import FastF1Service

router = APIRouter(tags=["events"])


@router.get("/seasons", response_model=list[int])
def seasons() -> list[int]:
    settings = get_settings()
    return list(range(settings.default_start_season, settings.default_end_season + 1))


@router.get("/events", response_model=list[EventOption])
def events(season: int = Query(..., ge=2018)) -> list[EventOption]:
    try:
        return [EventOption(**item) for item in FastF1Service().get_events(season)]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not load FastF1 event schedule: {exc}") from exc


@router.get("/sessions", response_model=list[SessionOption])
def sessions(season: int = Query(..., ge=2018), event: str = Query(...)) -> list[SessionOption]:
    try:
        return [SessionOption(**item) for item in FastF1Service().get_sessions_for_event(season, event)]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not load FastF1 sessions for event: {exc}") from exc

