from __future__ import annotations

import logging
from datetime import datetime
from multiprocessing import Pool
from typing import Any

import pandas as pd
from sqlalchemy.orm import Session

from app.core.config import normalize_session_code
from app.core.config import get_settings
from app.db.database import SessionLocal
from app.models.metadata import IngestedSession
from app.services.artifact_store import ArtifactStore
from app.services.fastf1_service import FastF1Service

logger = logging.getLogger(__name__)


def _serialize_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    if frame.empty:
        return []
    return frame.where(pd.notnull(frame), None).to_dict(orient="records")


class SessionPreprocessor:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.fastf1 = FastF1Service()
        self.store = ArtifactStore()

    def ingest_session(
        self,
        season: int,
        event: str,
        session: str,
        force: bool = False,
        db: Session | None = None,
    ) -> dict[str, Any]:
        session_code = normalize_session_code(session)
        if self.store.exists(season, event, session_code) and not force:
            path = self.store.session_dir(season, event, session_code)
            return {
                "season": season,
                "event": event,
                "session": session_code,
                "status": "cached",
                "artifact_path": str(path),
                "message": "Processed artifacts already exist. Use force=true to rebuild.",
            }

        logger.info("Ingesting %s %s %s", season, event, session_code)
        f1_session = self.fastf1.load_session(season, event, session_code, telemetry=True)
        results = self.fastf1.get_results(f1_session)
        laps = self.fastf1.get_laps(f1_session)
        weather = self.fastf1.get_weather(f1_session)
        drivers = sorted(laps["Driver"].dropna().unique().tolist()) if "Driver" in laps else []
        telemetry = self._collect_driver_telemetry(f1_session, drivers, session_code)
        replay = (
            pd.DataFrame()
            if self._has_position_telemetry(telemetry)
            else self.fastf1.get_replay_position_data(
                f1_session,
                max_drivers=None,
            )
        )

        session_dir = self.store.session_dir(season, event, session_code)
        self._clear_replay_caches(session_dir)
        self.store.write_frame(session_dir / "results", results)
        self.store.write_frame(session_dir / "laps", laps)
        self.store.write_frame(session_dir / "weather", weather)
        self.store.write_frame(session_dir / "replay_positions", replay)
        self.store.write_frame(session_dir / "driver_telemetry", telemetry)

        lap_summary = self._build_lap_summary(laps)
        self.store.write_json(session_dir / "leaderboard.json", lap_summary)

        event_info = getattr(f1_session, "event", {})
        metadata = {
            "season": season,
            "event": event,
            "session": session_code,
            "country": str(event_info.get("Country")) if event_info is not None and event_info.get("Country") else None,
            "circuit_name": str(event_info.get("OfficialEventName")) if event_info is not None and event_info.get("OfficialEventName") else None,
            "event_date": str(event_info.get("EventDate")) if event_info is not None and event_info.get("EventDate") else None,
            "drivers": drivers,
            "driver_count": len(drivers),
            "total_laps": int(laps["LapNumber"].max()) if not laps.empty and "LapNumber" in laps else 0,
            "has_laps": not laps.empty,
            "has_replay": not replay.empty or self._has_position_telemetry(telemetry),
            "has_weather": not weather.empty,
            "created_at": datetime.utcnow().isoformat(),
        }
        self.store.write_json(session_dir / "metadata.json", metadata)

        self._upsert_metadata(db, metadata, str(session_dir))
        return {
            "season": season,
            "event": event,
            "session": session_code,
            "status": "processed",
            "artifact_path": str(session_dir),
            "message": f"Ingested {len(drivers)} drivers and {len(laps)} lap rows.",
        }

    def _build_lap_summary(self, laps: pd.DataFrame) -> list[dict[str, Any]]:
        if laps.empty:
            return []
        frame = laps.copy()
        for col in ["LapTime", "Sector1Time", "Sector2Time", "Sector3Time"]:
            if col in frame:
                frame[col] = pd.to_numeric(frame[col], errors="coerce")
        if "LapNumber" not in frame or "Driver" not in frame:
            return []
        rows: list[dict[str, Any]] = []
        for lap_number, group in frame.groupby("LapNumber"):
            lap_group = group.copy()
            if lap_group.empty:
                continue
            if "Position" in lap_group and lap_group["Position"].notna().any():
                lap_group["Position"] = pd.to_numeric(lap_group["Position"], errors="coerce")
                lap_group = lap_group.sort_values("Position")
            else:
                lap_group = lap_group[lap_group["LapTime"].notna()].sort_values("LapTime")
            if lap_group.empty:
                continue
            leader_time = float(lap_group["LapTime"].dropna().iloc[0]) if lap_group["LapTime"].notna().any() else None
            for position, (_, row) in enumerate(lap_group.iterrows(), start=1):
                running_position = int(row.get("Position")) if pd.notna(row.get("Position")) else position
                rows.append(
                    {
                        "lap_number": int(lap_number),
                        "position": running_position,
                        "driver": row.get("Driver"),
                        "gap_to_leader": float(row.get("LapTime") - leader_time) if row.get("LapTime") and leader_time else None,
                        "lap_time_seconds": float(row.get("LapTime")) if row.get("LapTime") else None,
                        "compound": row.get("Compound"),
                        "stint": int(row.get("Stint")) if pd.notna(row.get("Stint")) else None,
                    }
                )
        return rows

    def _collect_driver_telemetry(self, f1_session: Any, drivers: list[str], session_code: str) -> pd.DataFrame:
        mode = self.settings.telemetry_ingest_mode.strip().lower()
        if mode in {"none", "off", "false", "0"}:
            logger.info("Skipping driver telemetry collection because F1_TELEMETRY_INGEST_MODE=%s", mode)
            return pd.DataFrame()

        frames: list[pd.DataFrame] = []
        for driver in drivers:
            try:
                if session_code == "R" and mode in {"full", "race", "full_race"}:
                    telemetry = self.fastf1.get_driver_race_telemetry(f1_session, driver)
                    if telemetry.empty:
                        telemetry = self.fastf1.get_driver_telemetry(f1_session, driver, lap="fastest")
                else:
                    telemetry = self.fastf1.get_driver_telemetry(f1_session, driver, lap="fastest")
                if telemetry.empty:
                    continue
                telemetry["Driver"] = driver
                frames.append(telemetry)
            except Exception as exc:
                logger.warning("Skipping telemetry for %s: %s", driver, exc)
        return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()

    @staticmethod
    def _has_position_telemetry(frame: pd.DataFrame) -> bool:
        return not frame.empty and {"X", "Y"}.issubset(frame.columns) and frame[["X", "Y"]].notna().any().all()

    @staticmethod
    def _clear_replay_caches(session_dir: Any) -> None:
        for path in session_dir.glob("replay_cache_*.json"):
            try:
                path.unlink()
            except OSError:
                continue

    def ingest_event_sessions(
        self,
        season: int,
        event: str,
        session: str,
        force: bool = False,
        db: Session | None = None,
    ) -> dict[str, Any]:
        session_code = normalize_session_code(session)
        session_codes = ["Q", "R"] if session_code == "R" else [session_code]
        results = [
            self.ingest_session(season, event, code, force=force, db=db)
            for code in session_codes
        ]
        selected = next((item for item in results if item.get("session") == session_code), results[-1])
        processed = sum(1 for item in results if item.get("status") == "processed")
        cached = sum(1 for item in results if item.get("status") == "cached")
        selected["status"] = "processed" if processed else "cached"
        selected["message"] = (
            f"Ready: {', '.join(str(item.get('session')) for item in results)} "
            f"({processed} processed, {cached} cached)."
        )
        return selected

    def _upsert_metadata(self, db: Session | None, metadata: dict[str, Any], artifact_path: str) -> None:
        owns_session = db is None
        db = db or SessionLocal()
        try:
            row = (
                db.query(IngestedSession)
                .filter(
                    IngestedSession.season == metadata["season"],
                    IngestedSession.event_name == metadata["event"],
                    IngestedSession.session_code == metadata["session"],
                )
                .one_or_none()
            )
            if row is None:
                row = IngestedSession(
                    season=metadata["season"],
                    event_name=metadata["event"],
                    session_code=metadata["session"],
                    artifact_path=artifact_path,
                )
                db.add(row)
            row.country = metadata.get("country")
            row.circuit_name = metadata.get("circuit_name")
            row.event_date = metadata.get("event_date")
            row.has_laps = bool(metadata.get("has_laps"))
            row.has_replay = bool(metadata.get("has_replay"))
            row.has_weather = bool(metadata.get("has_weather"))
            row.driver_count = int(metadata.get("driver_count") or 0)
            row.artifact_path = artifact_path
            row.updated_at = datetime.utcnow()
            db.commit()
        finally:
            if owns_session:
                db.close()


def ingest_one(args: tuple[int, str, str, bool]) -> dict[str, Any]:
    season, event, session, force = args
    try:
        return SessionPreprocessor().ingest_session(season, event, session, force=force)
    except Exception as exc:
        logger.exception("Failed to ingest %s %s %s", season, event, session)
        return {"season": season, "event": event, "session": session, "status": "failed", "message": str(exc)}


def ingest_bulk(seasons: list[int], session: str, events: list[str] | None, force: bool, workers: int) -> list[dict[str, Any]]:
    fastf1 = FastF1Service()
    jobs: list[tuple[int, str, str, bool]] = []
    for season in seasons:
        season_events = events or [item["event_name"] for item in fastf1.get_events(season)]
        jobs.extend((season, event, session, force) for event in season_events)
    if workers == 1:
        return [ingest_one(job) for job in jobs]
    with Pool(processes=workers) as pool:
        return pool.map(ingest_one, jobs)
