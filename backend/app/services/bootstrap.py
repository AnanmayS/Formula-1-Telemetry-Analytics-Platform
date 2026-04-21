from __future__ import annotations

import json
import logging
from datetime import date, datetime
from pathlib import Path
from typing import Any

from app.core.config import get_settings, normalize_session_code
from app.services.preprocessing import ingest_bulk

logger = logging.getLogger(__name__)


class DataBootstrapService:
    """Populate a useful local FastF1 cache without blocking API startup."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self.marker_path = self.settings.data_dir / "bootstrap_recent_races.json"

    def bootstrap_recent_races(self, force: bool = False) -> dict[str, Any]:
        seasons = self.recent_completed_seasons(self.settings.bootstrap_years)
        session = normalize_session_code(self.settings.bootstrap_session)
        if not force and self._marker_matches(seasons, session):
            message = f"Recent race bootstrap already completed for {seasons} {session}."
            logger.info(message)
            return {"status": "cached", "message": message, "seasons": seasons, "session": session}

        logger.info("Bootstrapping FastF1 race cache for seasons=%s session=%s", seasons, session)
        results = ingest_bulk(
            seasons=seasons,
            session=session,
            events=None,
            force=force,
            workers=max(1, int(self.settings.bootstrap_workers)),
        )
        summary = {
            "status": "completed",
            "seasons": seasons,
            "session": session,
            "started_for_year": date.today().year,
            "completed_at": datetime.utcnow().isoformat(),
            "processed": sum(1 for item in results if item.get("status") == "processed"),
            "cached": sum(1 for item in results if item.get("status") == "cached"),
            "failed": sum(1 for item in results if item.get("status") == "failed"),
            "results": results,
        }
        self.marker_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        logger.info(
            "FastF1 bootstrap complete: processed=%s cached=%s failed=%s",
            summary["processed"],
            summary["cached"],
            summary["failed"],
        )
        return summary

    def status(self) -> dict[str, Any]:
        marker = self._read_marker()
        if marker:
            return marker
        seasons = self.recent_completed_seasons(self.settings.bootstrap_years)
        return {
            "status": "not_started",
            "seasons": seasons,
            "session": normalize_session_code(self.settings.bootstrap_session),
            "message": "Recent race cache has not been bootstrapped yet.",
        }

    @staticmethod
    def recent_completed_seasons(years: int) -> list[int]:
        current_year = date.today().year
        end_year = current_year - 1
        start_year = max(2018, end_year - max(1, years) + 1)
        return list(range(start_year, end_year + 1))

    def _marker_matches(self, seasons: list[int], session: str) -> bool:
        marker = self._read_marker()
        return marker.get("status") == "completed" and marker.get("seasons") == seasons and marker.get("session") == session

    def _read_marker(self) -> dict[str, Any]:
        if not self.marker_path.exists():
            return {}
        try:
            return json.loads(self.marker_path.read_text(encoding="utf-8"))
        except Exception:
            logger.warning("Ignoring unreadable bootstrap marker at %s", self.marker_path)
            return {}


def run_startup_bootstrap() -> None:
    try:
        DataBootstrapService().bootstrap_recent_races(force=False)
    except Exception:
        logger.exception("Background FastF1 bootstrap failed.")
