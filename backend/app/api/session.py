from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.schemas.session import (
    DriverSummary,
    LeaderboardResponse,
    ReplayResponse,
    SessionSummary,
    TelemetryResponse,
)
from app.services.data_access import ProcessedDataService

router = APIRouter(prefix="/session", tags=["session"])


@router.get("/summary", response_model=SessionSummary)
def session_summary(season: int = Query(..., ge=2018), event: str = Query(...), session: str = Query("R")) -> SessionSummary:
    try:
        return SessionSummary(**ProcessedDataService().summary(season, event, session))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not build session summary: {exc}") from exc


@router.get("/drivers", response_model=list[DriverSummary])
def session_drivers(season: int = Query(..., ge=2018), event: str = Query(...), session: str = Query("R")) -> list[DriverSummary]:
    try:
        return [DriverSummary(**item) for item in ProcessedDataService().drivers(season, event, session)]
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/leaderboard", response_model=LeaderboardResponse)
def session_leaderboard(season: int = Query(..., ge=2018), event: str = Query(...), session: str = Query("R")) -> LeaderboardResponse:
    try:
        return LeaderboardResponse(rows=ProcessedDataService().leaderboard(season, event, session))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/telemetry", response_model=TelemetryResponse)
def session_telemetry(
    season: int = Query(..., ge=2018),
    event: str = Query(...),
    session: str = Query("R"),
    driver: str = Query(...),
    lap: str = Query("fastest"),
) -> TelemetryResponse:
    try:
        return TelemetryResponse(**ProcessedDataService().telemetry(season, event, session, driver, lap))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not load telemetry: {exc}") from exc


@router.get("/replay", response_model=ReplayResponse)
def session_replay(season: int = Query(..., ge=2018), event: str = Query(...), session: str = Query("R")) -> ReplayResponse:
    try:
        return ReplayResponse(**ProcessedDataService().replay(season, event, session))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

