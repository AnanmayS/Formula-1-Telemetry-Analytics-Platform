from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

import fastf1
import numpy as np
import pandas as pd

from app.core.config import get_settings, normalize_session_code

logger = logging.getLogger(__name__)


class FastF1Service:
    """Small boundary around FastF1 so the rest of the app stays testable."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self.settings.ensure_directories()
        fastf1.Cache.enable_cache(str(self.settings.fastf1_cache_dir))

    @lru_cache(maxsize=64)
    def load_session(self, season: int, event: str, session: str, telemetry: bool = True) -> Any:
        session_code = normalize_session_code(session)
        logger.info("Loading FastF1 session: %s %s %s", season, event, session_code)
        f1_session = fastf1.get_session(season, event, session_code)
        f1_session.load(laps=True, telemetry=telemetry, weather=True, messages=False)
        return f1_session

    def get_events(self, season: int) -> list[dict[str, Any]]:
        fallback = self._fallback_events(season)
        if fallback:
            return fallback
        try:
            schedule = fastf1.get_event_schedule(season, include_testing=False)
        except Exception:
            raise
        events: list[dict[str, Any]] = []
        for _, row in schedule.iterrows():
            event_name = row.get("EventName")
            if not event_name or str(event_name).lower() == "nan":
                continue
            events.append(
                {
                    "season": season,
                    "round_number": self._safe_int(row.get("RoundNumber")),
                    "event_name": str(event_name),
                    "country": self._safe_str(row.get("Country")),
                    "location": self._safe_str(row.get("Location")),
                    "event_date": self._safe_str(row.get("EventDate")),
                }
            )
        return events

    def _fallback_events(self, season: int) -> list[dict[str, Any]]:
        if season != 2026:
            return []
        calendar = [
            (1, "Australian Grand Prix", "Australia", "Melbourne", "2026-03-08"),
            (2, "Chinese Grand Prix", "China", "Shanghai", "2026-03-15"),
            (3, "Japanese Grand Prix", "Japan", "Suzuka", "2026-03-29"),
            (4, "Bahrain Grand Prix", "Bahrain", "Sakhir", "2026-04-12"),
            (5, "Saudi Arabian Grand Prix", "Saudi Arabia", "Jeddah", "2026-04-19"),
            (6, "Miami Grand Prix", "USA", "Miami", "2026-05-03"),
            (7, "Canadian Grand Prix", "Canada", "Montreal", "2026-05-24"),
            (8, "Monaco Grand Prix", "Monaco", "Monaco", "2026-06-07"),
            (9, "Spanish Grand Prix", "Spain", "Barcelona-Catalunya", "2026-06-14"),
            (10, "Austrian Grand Prix", "Austria", "Spielberg", "2026-06-28"),
            (11, "British Grand Prix", "Great Britain", "Silverstone", "2026-07-05"),
            (12, "Belgian Grand Prix", "Belgium", "Spa-Francorchamps", "2026-07-19"),
            (13, "Hungarian Grand Prix", "Hungary", "Budapest", "2026-07-26"),
            (14, "Dutch Grand Prix", "Netherlands", "Zandvoort", "2026-08-23"),
            (15, "Italian Grand Prix", "Italy", "Monza", "2026-09-06"),
            (16, "Madrid Grand Prix", "Spain", "Madrid", "2026-09-13"),
            (17, "Azerbaijan Grand Prix", "Azerbaijan", "Baku", "2026-09-26"),
            (18, "Singapore Grand Prix", "Singapore", "Singapore", "2026-10-11"),
            (19, "United States Grand Prix", "USA", "Austin", "2026-10-25"),
            (20, "Mexico City Grand Prix", "Mexico", "Mexico City", "2026-11-01"),
            (21, "Sao Paulo Grand Prix", "Brazil", "Sao Paulo", "2026-11-08"),
            (22, "Las Vegas Grand Prix", "USA", "Las Vegas", "2026-11-21"),
            (23, "Qatar Grand Prix", "Qatar", "Lusail", "2026-11-29"),
            (24, "Abu Dhabi Grand Prix", "Abu Dhabi", "Yas Marina", "2026-12-06"),
        ]
        return [
            {
                "season": season,
                "round_number": round_number,
                "event_name": event_name,
                "country": country,
                "location": location,
                "event_date": event_date,
            }
            for round_number, event_name, country, location, event_date in calendar
        ]

    def get_sessions_for_event(self, season: int, event: str) -> list[dict[str, str]]:
        event_info = fastf1.get_event(season, event)
        mapping = [
            ("Session1", "Session1Date"),
            ("Session2", "Session2Date"),
            ("Session3", "Session3Date"),
            ("Session4", "Session4Date"),
            ("Session5", "Session5Date"),
        ]
        options: list[dict[str, str]] = []
        for name_key, _ in mapping:
            name = event_info.get(name_key)
            if not name or str(name).lower() == "nan":
                continue
            code = normalize_session_code(str(name))
            options.append({"code": code, "name": str(name)})
        return [option for option in options if option["code"] in {"Q", "R"}]

    def get_laps(self, f1_session: Any) -> pd.DataFrame:
        laps = f1_session.laps.copy()
        return self._clean_frame(laps)

    def get_results(self, f1_session: Any) -> pd.DataFrame:
        results = f1_session.results.copy()
        return self._clean_frame(results)

    def get_weather(self, f1_session: Any) -> pd.DataFrame:
        weather = getattr(f1_session, "weather_data", pd.DataFrame()).copy()
        return self._clean_frame(weather)

    def get_driver_telemetry(self, f1_session: Any, driver: str, lap: int | str = "fastest") -> pd.DataFrame:
        laps = f1_session.laps.pick_driver(driver)
        if laps.empty:
            return pd.DataFrame()
        selected_lap = laps.pick_fastest() if str(lap).lower() == "fastest" else laps[laps["LapNumber"] == int(lap)].iloc[0]
        telemetry = selected_lap.get_car_data().add_distance()
        position = selected_lap.get_pos_data()
        merged = telemetry.merge(position, on="Date", how="outer", suffixes=("", "_pos")).sort_values("Date")
        return self._clean_frame(merged)

    def get_driver_race_telemetry(self, f1_session: Any, driver: str) -> pd.DataFrame:
        """Collect lap-by-lap telemetry so replay overlays can follow race time.

        FastF1 does not always expose every channel for every historical lap. We keep
        each lap independent and let the API layer fall back to lap summary speeds
        when a channel is missing.
        """
        frames: list[pd.DataFrame] = []
        laps = f1_session.laps.pick_driver(driver)
        for _, lap in laps.iterlaps():
            try:
                telemetry = lap.get_telemetry().copy()
                if telemetry.empty:
                    continue
                telemetry["Driver"] = driver
                telemetry["LapNumber"] = self._safe_int(lap.get("LapNumber"))
                telemetry["Compound"] = self._safe_str(lap.get("Compound"))
                telemetry["TyreLife"] = self._safe_int(lap.get("TyreLife"))
                frames.append(telemetry)
            except Exception as exc:
                logger.debug("Telemetry missing for %s lap %s: %s", driver, lap.get("LapNumber"), exc)
        if not frames:
            return pd.DataFrame()
        return self._clean_frame(pd.concat(frames, ignore_index=True))

    def get_driver_position_data(self, f1_session: Any, driver: str) -> pd.DataFrame:
        frames: list[pd.DataFrame] = []
        laps = f1_session.laps.pick_driver(driver)
        for _, lap in laps.iterlaps():
            try:
                pos = lap.get_pos_data().copy()
                if pos.empty:
                    continue
                pos["Driver"] = driver
                pos["LapNumber"] = self._safe_int(lap.get("LapNumber"))
                frames.append(pos)
            except Exception as exc:
                logger.debug("Position data missing for %s lap %s: %s", driver, lap.get("LapNumber"), exc)
        if not frames:
            return pd.DataFrame()
        return self._clean_frame(pd.concat(frames, ignore_index=True))

    def get_replay_position_data(
        self,
        f1_session: Any,
        max_points_per_driver: int = 800,
        max_drivers: int | None = 4,
    ) -> pd.DataFrame:
        drivers = list(f1_session.laps["Driver"].dropna().unique())
        frames: list[pd.DataFrame] = []
        for driver in drivers:
            try:
                driver_pos = self.get_driver_position_data(f1_session, driver)
                if driver_pos.empty:
                    continue
                step = max(1, int(len(driver_pos) / max_points_per_driver))
                frames.append(driver_pos.iloc[::step].copy())
                if max_drivers is not None and len(frames) >= max_drivers:
                    break
            except Exception as exc:
                logger.warning("Skipping replay position data for %s: %s", driver, exc)
        if not frames:
            return pd.DataFrame()
        return self._clean_frame(pd.concat(frames, ignore_index=True))

    def _clean_frame(self, frame: pd.DataFrame) -> pd.DataFrame:
        frame = frame.copy()
        for column in frame.columns:
            if pd.api.types.is_timedelta64_dtype(frame[column]):
                frame[column] = frame[column].dt.total_seconds()
            elif pd.api.types.is_datetime64_any_dtype(frame[column]):
                frame[column] = frame[column].astype(str)
        frame = frame.replace({np.nan: None})
        return frame

    @staticmethod
    def _safe_str(value: Any) -> str | None:
        if value is None or str(value).lower() == "nan":
            return None
        return str(value)

    @staticmethod
    def _safe_int(value: Any) -> int | None:
        try:
            if value is None or str(value).lower() == "nan":
                return None
            return int(value)
        except Exception:
            return None
