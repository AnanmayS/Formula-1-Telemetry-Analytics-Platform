from __future__ import annotations

from functools import lru_cache
from typing import Any

import numpy as np
import pandas as pd

from app.core.config import normalize_session_code
from app.services.artifact_store import ArtifactStore


class ProcessedDataService:
    REPLAY_CACHE_NAME = "replay_cache_v4.json"

    def __init__(self) -> None:
        self.store = ArtifactStore()

    def require_metadata(self, season: int, event: str, session: str) -> dict[str, Any]:
        path = self.store.session_file(season, event, normalize_session_code(session), "metadata.json")
        if not path.exists():
            raise FileNotFoundError("Session has not been ingested yet. Run POST /api/ingest/session first.")
        return self.store.read_json(path)

    def summary(self, season: int, event: str, session: str) -> dict[str, Any]:
        metadata = self.require_metadata(season, event, session)
        results = self.read_results(season, event, session)
        laps = self.read_laps(season, event, session)
        weather = self.read_weather(season, event, session)
        drivers = self._driver_summaries(results, laps)
        return {
            **metadata,
            "weather": weather.head(25).to_dict(orient="records") if not weather.empty else [],
            "drivers": drivers,
        }

    def drivers(self, season: int, event: str, session: str) -> list[dict[str, Any]]:
        return self._driver_summaries(
            self.read_results(season, event, session),
            self.read_laps(season, event, session),
        )

    @lru_cache(maxsize=64)
    def leaderboard(self, season: int, event: str, session: str) -> list[dict[str, Any]]:
        self.require_metadata(season, event, session)
        laps = self.read_laps(season, event, session)
        rows = self._lap_leaderboard_from_laps(laps)
        if rows:
            return rows
        path = self.store.session_file(season, event, normalize_session_code(session), "leaderboard.json")
        return self.store.read_json(path) if path.exists() else []

    def telemetry(self, season: int, event: str, session: str, driver: str, lap: str) -> dict[str, Any]:
        laps = self.read_laps(season, event, session)
        driver_laps = laps[laps["Driver"] == driver].copy() if "Driver" in laps else pd.DataFrame()
        if driver_laps.empty:
            return {"driver": driver, "lap": lap, "points": [], "lap_times": [], "stints": []}

        for col in ["LapTime", "SpeedI1", "SpeedI2", "SpeedFL", "SpeedST"]:
            if col in driver_laps:
                driver_laps[col] = pd.to_numeric(driver_laps[col], errors="coerce")

        lap_key = lap.strip().lower()
        selected_lap_number: int | None
        if lap_key in {"q1", "q2", "q3"}:
            selected_lap_number = self._select_qualifying_lap_number(driver_laps, laps, lap_key.upper())
        elif lap_key == "fastest" and "LapTime" in driver_laps:
            selected_lap_number = int(driver_laps.sort_values("LapTime").iloc[0]["LapNumber"])
        else:
            selected_lap_number = int(lap)

        lap_times = [
            {
                "lap": int(row["LapNumber"]),
                "lap_time_seconds": _safe_float(row.get("LapTime")),
                "compound": row.get("Compound"),
                "stint": _safe_int(row.get("Stint")),
            }
            for _, row in driver_laps.sort_values("LapNumber").iterrows()
            if pd.notna(row.get("LapNumber"))
        ]
        stints = (
            driver_laps.groupby(["Stint", "Compound"], dropna=False)
            .agg(start_lap=("LapNumber", "min"), end_lap=("LapNumber", "max"), laps=("LapNumber", "count"))
            .reset_index()
            .to_dict(orient="records")
            if "Stint" in driver_laps and "Compound" in driver_laps
            else []
        )
        if selected_lap_number is None:
            return {"driver": driver, "lap": lap, "points": [], "lap_times": lap_times, "stints": stints}

        telemetry = self.read_driver_telemetry(season, event, session)
        driver_telemetry = telemetry[telemetry.get("Driver") == driver].copy() if not telemetry.empty else pd.DataFrame()
        if not driver_telemetry.empty:
            if "LapNumber" in driver_telemetry:
                lap_telemetry = driver_telemetry[pd.to_numeric(driver_telemetry["LapNumber"], errors="coerce") == selected_lap_number].copy()
                if not lap_telemetry.empty:
                    driver_telemetry = lap_telemetry
            driver_telemetry = self._normalize_replay_time(driver_telemetry)
            point_records = self._telemetry_like_points(driver_telemetry)
        else:
            replay = self.read_replay(season, event, session)
            lap_points = replay[(replay.get("Driver") == driver) & (replay.get("LapNumber") == selected_lap_number)].copy()
            if not lap_points.empty:
                lap_points = self._normalize_replay_time(lap_points)
                point_records = self._telemetry_like_points(lap_points)
            else:
                point_records = self._lap_level_trace(driver_laps, selected_lap_number)
        return {"driver": driver, "lap": str(selected_lap_number), "points": point_records, "lap_times": lap_times, "stints": stints}

    def replay(self, season: int, event: str, session: str) -> dict[str, Any]:
        metadata = self.require_metadata(season, event, session)
        cached = self._read_replay_cache(season, event, session)
        if cached is not None:
            return cached

        replay = self.read_replay(season, event, session)
        laps = self.read_laps(season, event, session)
        telemetry = self.read_driver_telemetry(season, event, session)
        notes: list[str] = []
        if replay.empty and telemetry.empty:
            notes.append("No position telemetry was available in the processed artifacts.")
            return {"duration": 0, "track": [], "frames": [], "leaderboard": [], "approximation_notes": notes}

        replay = replay.dropna(subset=["X", "Y"], how="any").copy() if not replay.empty else replay
        telemetry = telemetry.dropna(subset=["X", "Y"], how="any").copy() if not telemetry.empty else telemetry
        if replay.empty and telemetry.empty:
            notes.append("FastF1 position rows existed, but X/Y coordinates were missing.")
            return {"duration": 0, "track": [], "frames": [], "leaderboard": [], "approximation_notes": notes}

        if not replay.empty:
            replay = self._normalize_replay_time(replay)
            replay["LapNumber"] = pd.to_numeric(replay.get("LapNumber"), errors="coerce")
        if not telemetry.empty:
            telemetry = self._normalize_replay_time(telemetry)
            if "LapNumber" in telemetry:
                telemetry["LapNumber"] = pd.to_numeric(telemetry.get("LapNumber"), errors="coerce")
        lap_lookup = self._lap_lookup(laps)
        track_frame = self._build_reference_track(replay, telemetry)
        reference_points = track_frame[["x", "y"]].to_dict(orient="records")
        driver_samples = self._driver_motion_samples(replay, laps, track_frame, telemetry)
        replay_duration = float(replay["ReplayTime"].max()) if "ReplayTime" in replay else 0.0
        duration = self._motion_duration(driver_samples) or replay_duration
        frame_step = max(0.9, duration / 3600.0)
        telemetry_profiles = self._telemetry_profiles(telemetry)
        track_status_segments = self._track_status_segments(laps, duration)

        frames: list[dict[str, Any]] = []
        for time_bucket in np.arange(0.0, duration + frame_step, frame_step):
            time_status = self._track_status_at_time(track_status_segments, float(time_bucket))
            cars = [
                car
                for driver, samples in driver_samples.items()
                if (
                    car := self._interpolated_car(
                        driver,
                        samples,
                        float(time_bucket),
                        track_frame,
                        lap_lookup,
                        telemetry_profiles,
                        time_status,
                    )
                )
                is not None
            ]
            live_leaderboard = self._live_leaderboard(cars, lap_lookup)
            leader_lap = live_leaderboard[0]["lap_number"] if live_leaderboard else None
            frames.append({"time": float(time_bucket), "lap": leader_lap, "cars": cars, "leaderboard": live_leaderboard})

        notes.append(
            "Replay interpolates sparse FastF1 position samples into dense frames and orders cars with FastF1 lap position data."
        )
        notes.append(
            "Live telemetry uses per-lap FastF1 telemetry when present; older artifacts use a fastest-lap trace projected onto current track progress."
        )
        payload = {
            "duration": duration,
            "track": reference_points,
            "frames": frames,
            "leaderboard": frames[-1]["leaderboard"] if frames else self.leaderboard(season, event, session),
            "track_status_segments": track_status_segments,
            "approximation_notes": notes,
            "metadata": metadata,
        }
        self._write_replay_cache(season, event, session, payload)
        return payload

    def read_results(self, season: int, event: str, session: str) -> pd.DataFrame:
        return self.store.read_frame(self.store.session_dir(season, event, session) / "results")

    def read_laps(self, season: int, event: str, session: str) -> pd.DataFrame:
        return self.store.read_frame(self.store.session_dir(season, event, session) / "laps")

    def read_weather(self, season: int, event: str, session: str) -> pd.DataFrame:
        try:
            return self.store.read_frame(self.store.session_dir(season, event, session) / "weather")
        except FileNotFoundError:
            return pd.DataFrame()

    def read_replay(self, season: int, event: str, session: str) -> pd.DataFrame:
        try:
            return self.store.read_frame(self.store.session_dir(season, event, session) / "replay_positions")
        except FileNotFoundError:
            return pd.DataFrame()

    def read_driver_telemetry(self, season: int, event: str, session: str) -> pd.DataFrame:
        try:
            return self.store.read_frame(self.store.session_dir(season, event, session) / "driver_telemetry")
        except FileNotFoundError:
            return pd.DataFrame()

    def _read_replay_cache(self, season: int, event: str, session: str) -> dict[str, Any] | None:
        path = self.store.session_file(season, event, session, self.REPLAY_CACHE_NAME)
        if not path.exists():
            return None
        try:
            return self.store.read_json(path)
        except Exception:
            return None

    def _write_replay_cache(self, season: int, event: str, session: str, payload: dict[str, Any]) -> None:
        path = self.store.session_file(season, event, session, self.REPLAY_CACHE_NAME)
        try:
            self.store.write_json(path, payload)
        except Exception:
            return

    def _driver_summaries(self, results: pd.DataFrame, laps: pd.DataFrame | None = None) -> list[dict[str, Any]]:
        if results.empty:
            return []
        lap_positions = self._driver_position_lookup_from_laps(laps if laps is not None else pd.DataFrame())
        qualifying_lookup = self._qualifying_lookup_from_laps(laps if laps is not None else pd.DataFrame())
        rows: list[dict[str, Any]] = []
        for _, row in results.iterrows():
            abbreviation = row.get("Abbreviation") or row.get("DriverId") or row.get("BroadcastName")
            if not abbreviation:
                continue
            driver = str(abbreviation)
            position_fallback = lap_positions.get(driver, {})
            qualifying_fallback = qualifying_lookup.get(driver, {})
            q1_time = _safe_float(row.get("Q1")) or qualifying_fallback.get("q1_time_seconds")
            q2_time = _safe_float(row.get("Q2")) or qualifying_fallback.get("q2_time_seconds")
            q3_time = _safe_float(row.get("Q3")) or qualifying_fallback.get("q3_time_seconds")
            rows.append(
                {
                    "abbreviation": driver,
                    "driver_number": str(row.get("DriverNumber")) if pd.notna(row.get("DriverNumber")) else None,
                    "full_name": row.get("FullName") or row.get("BroadcastName"),
                    "team_name": row.get("TeamName"),
                    "grid_position": _safe_int(row.get("GridPosition")) or position_fallback.get("first_position"),
                    "finishing_position": _safe_int(row.get("Position")) or qualifying_fallback.get("position") or position_fallback.get("last_position"),
                    "status": row.get("Status"),
                    "q1_time_seconds": q1_time,
                    "q2_time_seconds": q2_time,
                    "q3_time_seconds": q3_time,
                    "qualifying_stage": self._qualifying_stage(row) or qualifying_fallback.get("qualifying_stage"),
                }
            )
        return rows

    def _qualifying_stage(self, row: pd.Series) -> str | None:
        q1 = _safe_float(row.get("Q1"))
        q2 = _safe_float(row.get("Q2"))
        q3 = _safe_float(row.get("Q3"))
        if q3 is not None:
            return "Q3"
        if q2 is not None:
            return "Q2"
        if q1 is not None:
            return "Q1"
        return None

    def _driver_position_lookup_from_laps(self, laps: pd.DataFrame) -> dict[str, dict[str, int | None]]:
        if laps.empty or "Driver" not in laps or "Position" not in laps or "LapNumber" not in laps:
            return {}
        frame = laps.copy()
        frame["LapNumber"] = pd.to_numeric(frame["LapNumber"], errors="coerce")
        frame["Position"] = pd.to_numeric(frame["Position"], errors="coerce")
        lookup: dict[str, dict[str, int | None]] = {}
        for driver, group in frame.dropna(subset=["Driver", "LapNumber", "Position"]).groupby("Driver"):
            ordered = group.sort_values("LapNumber")
            lookup[str(driver)] = {
                "first_position": _safe_int(ordered.iloc[0].get("Position")),
                "last_position": _safe_int(ordered.iloc[-1].get("Position")),
            }
        return lookup

    def _qualifying_lookup_from_laps(self, laps: pd.DataFrame) -> dict[str, dict[str, Any]]:
        if laps.empty or "Driver" not in laps or "LapTime" not in laps or "Time" not in laps:
            return {}
        if "Position" in laps and laps["Position"].notna().any():
            return {}
        frame = laps.copy()
        frame["LapTime"] = pd.to_numeric(frame["LapTime"], errors="coerce")
        frame["Time"] = pd.to_numeric(frame["Time"], errors="coerce")
        frame = frame.dropna(subset=["Driver", "Time"])
        if frame.empty:
            return {}

        q1_end, q2_end = self._qualifying_stage_cutoffs(frame)
        lookup: dict[str, dict[str, Any]] = {}
        for driver, group in frame.groupby("Driver"):
            driver_group = group.dropna(subset=["LapTime"]).copy()
            if driver_group.empty:
                continue
            q1_time = self._best_lap_in_window(driver_group, None, q1_end)
            q2_time = self._best_lap_in_window(driver_group, q1_end, q2_end) if q1_end is not None else None
            q3_time = self._best_lap_in_window(driver_group, q2_end, None) if q2_end is not None else None
            max_time = _safe_float(group["Time"].max())
            stage = "Q3" if q3_time is not None else "Q2" if q2_time is not None else "Q1" if q1_time is not None else None
            best = q3_time or q2_time or q1_time
            lookup[str(driver)] = {
                "q1_time_seconds": q1_time,
                "q2_time_seconds": q2_time,
                "q3_time_seconds": q3_time,
                "qualifying_stage": stage,
                "best_time": best,
                "max_time": max_time,
            }

        ordered = sorted(
            lookup.items(),
            key=lambda item: (
                0 if item[1].get("qualifying_stage") == "Q3" else 1 if item[1].get("qualifying_stage") == "Q2" else 2,
                item[1].get("best_time") or float("inf"),
            ),
        )
        for position, (driver, _) in enumerate(ordered, start=1):
            lookup[driver]["position"] = position
        return lookup

    def _qualifying_stage_cutoffs(self, frame: pd.DataFrame) -> tuple[float | None, float | None]:
        times = sorted(value for value in frame["Time"].tolist() if pd.notna(value))
        gaps: list[tuple[float, float, int]] = []
        for previous, current in zip(times, times[1:]):
            gap = current - previous
            if gap < 120:
                continue
            midpoint = previous + gap / 2
            remaining = frame[frame["Time"] >= midpoint]["Driver"].nunique()
            gaps.append((midpoint, gap, remaining))
        q1_end = next((midpoint for midpoint, _, remaining in gaps if remaining <= 15), None)
        q2_end = next((midpoint for midpoint, _, remaining in gaps if q1_end is not None and midpoint > q1_end and remaining <= 10), None)
        return q1_end, q2_end

    @staticmethod
    def _best_lap_in_window(group: pd.DataFrame, start: float | None, end: float | None) -> float | None:
        window = group
        if start is not None:
            window = window[window["Time"] > start]
        if end is not None:
            window = window[window["Time"] <= end]
        if window.empty or window["LapTime"].dropna().empty:
            return None
        return _safe_float(window["LapTime"].min())

    def _select_qualifying_lap_number(self, driver_laps: pd.DataFrame, laps: pd.DataFrame, stage: str) -> int | None:
        if driver_laps.empty or "LapNumber" not in driver_laps or "LapTime" not in driver_laps or "Time" not in driver_laps:
            return None
        frame = driver_laps.copy()
        for column in ["LapNumber", "LapTime", "Time"]:
            frame[column] = pd.to_numeric(frame[column], errors="coerce")
        frame = frame.dropna(subset=["LapNumber", "LapTime", "Time"])
        if frame.empty:
            return None

        all_laps = laps.copy()
        if "Time" in all_laps:
            all_laps["Time"] = pd.to_numeric(all_laps["Time"], errors="coerce")
        q1_end, q2_end = self._qualifying_stage_cutoffs(all_laps)
        if stage == "Q1":
            window = frame[frame["Time"] <= q1_end] if q1_end is not None else frame
        elif stage == "Q2":
            if q1_end is None:
                return None
            window = frame[frame["Time"] > q1_end]
            if q2_end is not None:
                window = window[window["Time"] <= q2_end]
        elif stage == "Q3":
            if q2_end is None:
                return None
            window = frame[frame["Time"] > q2_end]
        else:
            return None
        if window.empty:
            return None
        fastest = window.sort_values("LapTime").iloc[0]
        return _safe_int(fastest.get("LapNumber"))

    def _lap_leaderboard_from_laps(self, laps: pd.DataFrame) -> list[dict[str, Any]]:
        if laps.empty or "Driver" not in laps or "LapNumber" not in laps:
            return []
        frame = laps.copy()
        for column in ["LapNumber", "Position", "LapTime"]:
            if column in frame:
                frame[column] = pd.to_numeric(frame[column], errors="coerce")
        rows: list[dict[str, Any]] = []
        for lap_number, group in frame.groupby("LapNumber"):
            if pd.isna(lap_number):
                continue
            if "Position" in group and group["Position"].notna().any():
                ordered = group.sort_values("Position")
                use_running_order = True
            elif "LapTime" in group and group["LapTime"].notna().any():
                ordered = group.sort_values("LapTime")
                use_running_order = False
            else:
                continue
            leader_time = ordered["LapTime"].dropna().iloc[0] if "LapTime" in ordered and ordered["LapTime"].notna().any() else None
            for fallback_position, (_, row) in enumerate(ordered.iterrows(), start=1):
                rows.append(
                    {
                        "lap_number": int(lap_number),
                        "position": _safe_int(row.get("Position")) or fallback_position,
                        "driver": str(row.get("Driver")),
                        "gap_to_leader": None if use_running_order else _safe_float(row.get("LapTime") - leader_time) if leader_time is not None and pd.notna(row.get("LapTime")) else None,
                        "lap_time_seconds": _safe_float(row.get("LapTime")),
                        "compound": row.get("Compound"),
                        "stint": _safe_int(row.get("Stint")),
                    }
                )
        return rows

    def _normalize_replay_time(self, replay: pd.DataFrame) -> pd.DataFrame:
        replay = replay.copy()
        if "Date" in replay:
            parsed = pd.to_datetime(replay["Date"], errors="coerce", utc=True)
            if parsed.notna().any():
                replay["ReplayTime"] = (parsed - parsed.min()).dt.total_seconds()
                return replay
        time_source = "SessionTime" if "SessionTime" in replay else "Time" if "Time" in replay else None
        if time_source is None:
            replay["ReplayTime"] = np.arange(len(replay), dtype=float)
            return replay
        replay["ReplayTime"] = pd.to_numeric(replay[time_source], errors="coerce")
        if replay["ReplayTime"].isna().all():
            replay["ReplayTime"] = np.arange(len(replay), dtype=float)
        replay["ReplayTime"] = replay["ReplayTime"] - replay["ReplayTime"].min()
        return replay

    def _driver_position_samples(self, replay: pd.DataFrame, track_frame: pd.DataFrame) -> dict[str, pd.DataFrame]:
        samples: dict[str, pd.DataFrame] = {}
        track_length = self._track_length(track_frame)
        for driver, group in replay.groupby("Driver"):
            driver_frame = (
                group.dropna(subset=["ReplayTime", "X", "Y"])
                .sort_values("ReplayTime")
                .drop_duplicates(subset=["ReplayTime"], keep="last")
                .copy()
            )
            if len(driver_frame) < 2:
                continue
            driver_frame["MotionSource"] = "position"
            driver_frame["TrackProgress"] = [
                self._project_progress(_safe_float(row.get("X")), _safe_float(row.get("Y")), track_frame)
                for _, row in driver_frame.iterrows()
            ]
            if "LapNumber" in driver_frame and driver_frame["LapNumber"].notna().any() and track_length > 0:
                laps = pd.to_numeric(driver_frame["LapNumber"], errors="coerce").ffill().bfill().fillna(1)
                driver_frame["ContinuousProgress"] = (laps.clip(lower=1) - 1) * track_length + driver_frame["TrackProgress"]
            else:
                driver_frame["ContinuousProgress"] = self._unwrap_progress(driver_frame["TrackProgress"].to_numpy(dtype=float), track_length)
            driver_frame["ContinuousProgress"] = np.maximum.accumulate(driver_frame["ContinuousProgress"].to_numpy(dtype=float))
            samples[str(driver)] = driver_frame
        return samples

    def _driver_motion_samples(
        self,
        replay: pd.DataFrame,
        laps: pd.DataFrame,
        track_frame: pd.DataFrame,
        telemetry: pd.DataFrame | None = None,
    ) -> dict[str, pd.DataFrame]:
        telemetry_samples = self._driver_telemetry_motion_samples(telemetry if telemetry is not None else pd.DataFrame(), track_frame)
        if telemetry_samples:
            return telemetry_samples
        timing_samples = self._driver_lap_motion_samples(replay, laps, track_frame)
        if timing_samples:
            return timing_samples
        return self._driver_position_samples(replay, track_frame)

    def _driver_telemetry_motion_samples(self, telemetry: pd.DataFrame, track_frame: pd.DataFrame) -> dict[str, pd.DataFrame]:
        if (
            telemetry.empty
            or "Driver" not in telemetry
            or "LapNumber" not in telemetry
            or "ReplayTime" not in telemetry
            or "X" not in telemetry
            or "Y" not in telemetry
        ):
            return {}
        track_length = self._track_length(track_frame)
        if track_length <= 0:
            return {}

        samples: dict[str, pd.DataFrame] = {}
        for driver, group in telemetry.groupby("Driver"):
            driver_frame = (
                group.dropna(subset=["ReplayTime", "LapNumber", "X", "Y"])
                .sort_values("ReplayTime")
                .drop_duplicates(subset=["ReplayTime"], keep="last")
                .copy()
            )
            if len(driver_frame) < 30 or float(driver_frame["ReplayTime"].max() - driver_frame["ReplayTime"].min()) < 300:
                continue
            driver_frame["MotionSource"] = "telemetry"
            driver_frame["DirectX"] = pd.to_numeric(driver_frame["X"], errors="coerce")
            driver_frame["DirectY"] = pd.to_numeric(driver_frame["Y"], errors="coerce")
            if "RelativeDistance" in driver_frame and driver_frame["RelativeDistance"].notna().any():
                relative_distance = pd.to_numeric(driver_frame["RelativeDistance"], errors="coerce").interpolate(limit_direction="both")
                driver_frame["TrackProgress"] = relative_distance.clip(0, 1) * track_length
            else:
                driver_frame["TrackProgress"] = [
                    self._project_progress(_safe_float(row.get("X")), _safe_float(row.get("Y")), track_frame)
                    for _, row in driver_frame.iterrows()
                ]
            laps = pd.to_numeric(driver_frame["LapNumber"], errors="coerce").ffill().bfill().fillna(1)
            driver_frame["ContinuousProgress"] = (laps.clip(lower=1) - 1) * track_length + driver_frame["TrackProgress"]
            driver_frame["ContinuousProgress"] = np.maximum.accumulate(driver_frame["ContinuousProgress"].to_numpy(dtype=float))
            samples[str(driver)] = driver_frame
        return samples

    def _driver_lap_motion_samples(self, replay: pd.DataFrame, laps: pd.DataFrame, track_frame: pd.DataFrame) -> dict[str, pd.DataFrame]:
        if laps.empty or "Driver" not in laps or "LapNumber" not in laps:
            return {}
        track_length = self._track_length(track_frame)
        if track_length <= 0:
            return {}

        frame = laps.copy()
        frame["LapNumber"] = pd.to_numeric(frame["LapNumber"], errors="coerce")
        frame["LapTime"] = pd.to_numeric(frame.get("LapTime"), errors="coerce")

        samples: dict[str, pd.DataFrame] = {}
        for driver, group in frame.dropna(subset=["LapNumber"]).groupby("Driver"):
            rows: list[dict[str, Any]] = []
            display_time = 0.0
            median_lap_time = _safe_float(group["LapTime"].dropna().median()) or 90.0
            for _, row in group.sort_values("LapNumber").iterrows():
                lap = _safe_int(row.get("LapNumber"))
                if lap is None:
                    continue
                lap_time = _safe_float(row.get("LapTime"))
                lap_duration = lap_time if lap_time is not None and lap_time > 0 else median_lap_time
                start_time = display_time
                end_time = start_time + lap_duration
                display_time = end_time
                rows.append(
                    {
                        "ReplayTime": max(0.0, float(start_time)),
                        "LapNumber": lap,
                        "ContinuousProgress": max(0.0, lap - 1) * track_length,
                        "MotionSource": "lap_timing",
                    }
                )
                rows.append(
                    {
                        "ReplayTime": max(0.0, float(end_time)),
                        "LapNumber": lap,
                        "ContinuousProgress": lap * track_length,
                        "MotionSource": "lap_timing",
                    }
                )
            if len(rows) >= 2:
                driver_frame = (
                    pd.DataFrame(rows)
                    .sort_values("ReplayTime")
                    .drop_duplicates(subset=["ReplayTime"], keep="last")
                    .reset_index(drop=True)
                )
                driver_frame["ContinuousProgress"] = np.maximum.accumulate(
                    driver_frame["ContinuousProgress"].to_numpy(dtype=float)
                )
                samples[str(driver)] = driver_frame
        return samples

    def _motion_duration(self, driver_samples: dict[str, pd.DataFrame]) -> float:
        max_time = 0.0
        for samples in driver_samples.values():
            if "ReplayTime" in samples and not samples.empty:
                max_time = max(max_time, float(samples["ReplayTime"].max()))
        return max_time

    def _interpolated_car(
        self,
        driver: str,
        samples: pd.DataFrame,
        replay_time: float,
        track_frame: pd.DataFrame,
        lap_lookup: dict[tuple[str, int], dict[str, Any]] | None = None,
        telemetry_profiles: dict[str, dict[str, Any]] | None = None,
        time_status: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        times = samples["ReplayTime"].to_numpy(dtype=float)
        if times.size == 0:
            return None

        track_length = self._track_length(track_frame)
        if track_length <= 0:
            return None

        direct_x = None
        direct_y = None
        if replay_time <= times[0]:
            row = samples.iloc[0]
            progress = _safe_float(row.get("ContinuousProgress"))
            lap = _safe_int(row.get("LapNumber"))
            direct_x = _safe_float(row.get("DirectX"))
            direct_y = _safe_float(row.get("DirectY"))
        elif replay_time >= times[-1]:
            row = samples.iloc[-1]
            progress = _safe_float(row.get("ContinuousProgress"))
            lap = _safe_int(row.get("LapNumber"))
            direct_x = _safe_float(row.get("DirectX"))
            direct_y = _safe_float(row.get("DirectY"))
        else:
            next_index = int(np.searchsorted(times, replay_time, side="right"))
            prev_index = max(0, next_index - 1)
            prev = samples.iloc[prev_index]
            nxt = samples.iloc[next_index]
            t0 = float(prev.get("ReplayTime"))
            t1 = float(nxt.get("ReplayTime"))
            span = max(t1 - t0, 0.001)
            ratio = max(0.0, min(1.0, (replay_time - t0) / span))
            ratio = ratio * ratio * (3.0 - 2.0 * ratio)
            source = str(prev.get("MotionSource") or nxt.get("MotionSource") or "")
            if source != "lap_timing" and t1 - t0 > 45:
                row = prev if ratio < 0.5 else nxt
                progress = _safe_float(row.get("ContinuousProgress"))
                lap = _safe_int(row.get("LapNumber"))
                direct_x = _safe_float(row.get("DirectX"))
                direct_y = _safe_float(row.get("DirectY"))
            else:
                p0 = _safe_float(prev.get("ContinuousProgress"))
                p1 = _safe_float(nxt.get("ContinuousProgress"))
                if p0 is None or p1 is None:
                    return None
                progress = p0 + (p1 - p0) * ratio
                lap = int(progress // track_length) + 1
                if source == "telemetry":
                    x0 = _safe_float(prev.get("DirectX"))
                    x1 = _safe_float(nxt.get("DirectX"))
                    y0 = _safe_float(prev.get("DirectY"))
                    y1 = _safe_float(nxt.get("DirectY"))
                    if x0 is not None and x1 is not None and y0 is not None and y1 is not None:
                        direct_x = x0 + (x1 - x0) * ratio
                        direct_y = y0 + (y1 - y0) * ratio

        if progress is None:
            return None
        x, y = (direct_x, direct_y) if direct_x is not None and direct_y is not None else self._point_at_progress(float(progress), track_frame)
        track_progress = float(progress % track_length)
        car = {
            "driver": driver,
            "x": float(x),
            "y": float(y),
            "lap": lap,
            "progress": track_progress,
        }
        if lap is not None:
            lap_data = (lap_lookup or {}).get((driver, lap), {})
            car.update(
                self._telemetry_at_progress(
                    driver,
                    lap,
                    track_progress,
                    track_length,
                    telemetry_profiles or {},
                    lap_data,
                    time_status,
                )
            )
        return car

    def _build_reference_track(self, replay: pd.DataFrame, telemetry: pd.DataFrame | None = None) -> pd.DataFrame:
        telemetry_track = self._reference_track_from_telemetry(telemetry if telemetry is not None else pd.DataFrame())
        if not telemetry_track.empty:
            return telemetry_track

        frame = replay.dropna(subset=["X", "Y"]).copy()
        if frame.empty:
            return pd.DataFrame({"x": [0.0, 1.0], "y": [0.0, 1.0]})
        candidates: list[pd.DataFrame] = []
        if "LapNumber" in frame and frame["LapNumber"].notna().any():
            for _, group in frame.groupby(["Driver", "LapNumber"], dropna=True):
                if len(group) >= 8:
                    candidates.append(group.sort_values("ReplayTime"))
        if not candidates:
            for _, group in frame.groupby("Driver"):
                candidates.append(group.sort_values("ReplayTime"))
        best = max(candidates, key=self._track_candidate_score) if candidates else frame.sort_values("ReplayTime")
        step = max(1, int(len(best) / 700))
        track = (
            best.iloc[::step][["X", "Y"]]
            .drop_duplicates()
            .rename(columns={"X": "x", "Y": "y"})
            .reset_index(drop=True)
        )
        if len(track) < 2:
            return pd.DataFrame({"x": [0.0, 1.0], "y": [0.0, 1.0]})
        return self._densify_track(track, target_points=520)

    def _reference_track_from_telemetry(self, telemetry: pd.DataFrame) -> pd.DataFrame:
        if telemetry.empty or "X" not in telemetry or "Y" not in telemetry:
            return pd.DataFrame()
        frame = telemetry.dropna(subset=["X", "Y"]).copy()
        if frame.empty:
            return pd.DataFrame()

        candidates: list[pd.DataFrame] = []
        if "Driver" in frame and "LapNumber" in frame and frame["LapNumber"].notna().any():
            for _, group in frame.groupby(["Driver", "LapNumber"], dropna=True):
                candidate = self._ordered_track_candidate(group)
                if len(candidate) >= 8:
                    candidates.append(candidate)
        if not candidates and "Driver" in frame:
            for _, group in frame.groupby("Driver"):
                candidate = self._ordered_track_candidate(group)
                if len(candidate) >= 8:
                    candidates.append(candidate)
        if not candidates:
            candidate = self._ordered_track_candidate(frame)
            if len(candidate) >= 8:
                candidates.append(candidate)

        if not candidates:
            return pd.DataFrame()
        best = max(candidates, key=self._track_candidate_score)
        step = max(1, int(len(best) / 700))
        track = (
            best.iloc[::step][["X", "Y"]]
            .drop_duplicates()
            .rename(columns={"X": "x", "Y": "y"})
            .reset_index(drop=True)
        )
        if len(track) < 2:
            return pd.DataFrame()
        return self._densify_track(track, target_points=520)

    def _ordered_track_candidate(self, frame: pd.DataFrame) -> pd.DataFrame:
        order_columns = [
            column
            for column in ["Distance", "RelativeDistance", "ReplayTime", "SessionTime", "Time", "SessionTime_pos", "Time_pos", "Date"]
            if column in frame and frame[column].notna().sum() >= 2
        ]
        candidate = frame.copy()
        if order_columns:
            candidate = candidate.sort_values(order_columns[0])
        return candidate.drop_duplicates(subset=["X", "Y"]).reset_index(drop=True)

    def _track_candidate_score(self, candidate: pd.DataFrame) -> int:
        return int(candidate[["X", "Y"]].drop_duplicates().shape[0])

    def _project_progress(self, x: float | None, y: float | None, track: pd.DataFrame) -> float:
        if x is None or y is None or track.empty:
            return 0.0
        xs = track["x"].to_numpy(dtype=float)
        ys = track["y"].to_numpy(dtype=float)
        x2 = np.roll(xs, -1)
        y2 = np.roll(ys, -1)
        vx = x2 - xs
        vy = y2 - ys
        segment_len_sq = vx * vx + vy * vy
        safe_len_sq = np.where(segment_len_sq <= 0, 1.0, segment_len_sq)
        ratios = np.clip(((x - xs) * vx + (y - ys) * vy) / safe_len_sq, 0.0, 1.0)
        projected_x = xs + vx * ratios
        projected_y = ys + vy * ratios
        distances = (projected_x - x) ** 2 + (projected_y - y) ** 2
        index = int(np.argmin(distances))
        cumulative = self._track_cumulative(track)
        segment_length = float(np.sqrt(max(segment_len_sq[index], 0.0)))
        return float(cumulative[index] + segment_length * ratios[index])

    def _track_length(self, track: pd.DataFrame) -> float:
        if "length" in track.attrs:
            return float(track.attrs["length"])
        if track.empty or len(track) < 2:
            return 0.0
        return float(self._track_cumulative(track)[-1])

    def _track_cumulative(self, track: pd.DataFrame) -> np.ndarray:
        if "cumulative_distance" in track.attrs:
            return track.attrs["cumulative_distance"]
        points = track[["x", "y"]].to_numpy(dtype=float)
        if len(points) < 2:
            cumulative = np.array([0.0])
            track.attrs["cumulative_distance"] = cumulative
            track.attrs["length"] = 0.0
            return cumulative
        next_points = np.roll(points, -1, axis=0)
        lengths = np.hypot(next_points[:, 0] - points[:, 0], next_points[:, 1] - points[:, 1])
        cumulative = np.concatenate(([0.0], np.cumsum(lengths)))
        track.attrs["cumulative_distance"] = cumulative
        track.attrs["length"] = float(cumulative[-1])
        return cumulative

    def _point_at_progress(self, progress: float, track: pd.DataFrame) -> tuple[float, float]:
        points = track[["x", "y"]].to_numpy(dtype=float)
        if len(points) == 0:
            return 0.0, 0.0
        if len(points) == 1:
            return float(points[0][0]), float(points[0][1])

        cumulative = self._track_cumulative(track)
        track_length = float(cumulative[-1])
        target = progress % track_length if track_length > 0 else 0.0
        index = int(np.searchsorted(cumulative, target, side="right") - 1)
        index = max(0, min(index, len(points) - 1))
        nxt = (index + 1) % len(points)
        segment_len = max(float(cumulative[index + 1] - cumulative[index]), 0.001)
        ratio = (target - float(cumulative[index])) / segment_len
        x1, y1 = points[index]
        x2, y2 = points[nxt]
        return float(x1 + (x2 - x1) * ratio), float(y1 + (y2 - y1) * ratio)

    def _unwrap_progress(self, progress_values: np.ndarray, track_length: float) -> np.ndarray:
        if progress_values.size == 0 or track_length <= 0:
            return progress_values
        unwrapped = [float(progress_values[0])]
        lap_offset = 0.0
        previous = float(progress_values[0])
        for value in progress_values[1:]:
            current = float(value)
            if current + lap_offset < previous - track_length * 0.5:
                lap_offset += track_length
            unwrapped_value = current + lap_offset
            unwrapped.append(unwrapped_value)
            previous = unwrapped_value
        return np.array(unwrapped)

    def _densify_track(self, track: pd.DataFrame, target_points: int) -> pd.DataFrame:
        points = track[["x", "y"]].to_numpy(dtype=float)
        if len(points) < 2:
            return track
        segment_lengths = []
        cumulative = [0.0]
        total = 0.0
        for index in range(len(points)):
            nxt = (index + 1) % len(points)
            length = float(np.hypot(points[nxt][0] - points[index][0], points[nxt][1] - points[index][1]))
            segment_lengths.append(length)
            total += length
            cumulative.append(total)
        if total <= 0:
            return track
        samples = np.linspace(0, total, target_points, endpoint=False)
        dense: list[dict[str, float]] = []
        segment_index = 0
        for sample in samples:
            while segment_index < len(segment_lengths) - 1 and cumulative[segment_index + 1] < sample:
                segment_index += 1
            start_distance = cumulative[segment_index]
            length = max(segment_lengths[segment_index], 0.001)
            ratio = (sample - start_distance) / length
            nxt = (segment_index + 1) % len(points)
            x = points[segment_index][0] + (points[nxt][0] - points[segment_index][0]) * ratio
            y = points[segment_index][1] + (points[nxt][1] - points[segment_index][1]) * ratio
            dense.append({"x": float(x), "y": float(y)})
        dense_frame = pd.DataFrame(dense)
        self._track_cumulative(dense_frame)
        return dense_frame

    def _telemetry_profiles(self, telemetry: pd.DataFrame) -> dict[str, dict[str, Any]]:
        profiles: dict[str, dict[str, Any]] = {}
        if telemetry.empty or "Driver" not in telemetry:
            return profiles

        frame = telemetry.copy()
        for column in ["LapNumber", "Distance", "RelativeDistance", "Speed", "Throttle", "Brake", "RPM", "nGear", "DRS"]:
            if column in frame:
                frame[column] = pd.to_numeric(frame[column], errors="coerce")

        for driver, group in frame.groupby("Driver"):
            prepared_all = self._prepare_telemetry_profile(group)
            lap_profiles: dict[int, pd.DataFrame] = {}
            if "LapNumber" in group:
                for lap_number, lap_group in group.dropna(subset=["LapNumber"]).groupby("LapNumber"):
                    lap = _safe_int(lap_number)
                    prepared_lap = self._prepare_telemetry_profile(lap_group)
                    if lap is not None and not prepared_lap.empty:
                        lap_profiles[lap] = prepared_lap
            if not prepared_all.empty or lap_profiles:
                profiles[str(driver)] = {"all": prepared_all, "laps": lap_profiles}
        return profiles

    def _prepare_telemetry_profile(self, group: pd.DataFrame) -> pd.DataFrame:
        profile = group.copy()
        if "RelativeDistance" in profile and profile["RelativeDistance"].notna().any():
            profile["ProgressFraction"] = profile["RelativeDistance"].clip(0, 1)
        elif "Distance" in profile and profile["Distance"].notna().any():
            distance = pd.to_numeric(profile["Distance"], errors="coerce")
            min_distance = float(distance.min())
            span = max(float(distance.max()) - min_distance, 0.001)
            profile["ProgressFraction"] = ((distance - min_distance) / span).clip(0, 1)
        elif "ReplayTime" in profile and profile["ReplayTime"].notna().any():
            replay_time = pd.to_numeric(profile["ReplayTime"], errors="coerce")
            min_time = float(replay_time.min())
            span = max(float(replay_time.max()) - min_time, 0.001)
            profile["ProgressFraction"] = ((replay_time - min_time) / span).clip(0, 1)
        else:
            return pd.DataFrame()

        useful_columns = [
            column
            for column in ["ProgressFraction", "Speed", "Throttle", "Brake", "RPM", "nGear", "DRS"]
            if column in profile
        ]
        profile = profile[useful_columns].dropna(subset=["ProgressFraction"]).sort_values("ProgressFraction")
        profile = profile.drop_duplicates(subset=["ProgressFraction"], keep="last").reset_index(drop=True)
        arrays: dict[str, np.ndarray] = {"fractions": profile["ProgressFraction"].to_numpy(dtype=float)}
        for column in ["Speed", "Throttle", "Brake", "RPM", "nGear", "DRS"]:
            if column in profile and not profile[column].isna().all():
                values = pd.to_numeric(profile[column], errors="coerce").interpolate(limit_direction="both")
                if not values.isna().all():
                    arrays[column] = values.to_numpy(dtype=float)
        profile.attrs["arrays"] = arrays
        return profile

    def _telemetry_at_progress(
        self,
        driver: str,
        lap: int,
        track_progress: float,
        track_length: float,
        telemetry_profiles: dict[str, dict[str, Any]],
        lap_data: dict[str, Any],
        time_status: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        fraction = max(0.0, min(1.0, track_progress / track_length if track_length > 0 else 0.0))
        driver_profile = telemetry_profiles.get(driver, {})
        profile = driver_profile.get("laps", {}).get(lap) if driver_profile else None
        if profile is None or profile.empty:
            profile = driver_profile.get("all") if driver_profile else None

        sample = self._sample_telemetry_profile(profile, fraction) if profile is not None and not profile.empty else {}
        if sample.get("speed") is None:
            sample["speed"] = self._lap_speed_estimate(lap_data, fraction)
        if sample.get("brake") is not None:
            sample["brake"] = 1 if float(sample["brake"]) >= 0.5 else 0
        status_info = time_status or self._track_status_kind(lap_data.get("track_status"))
        sample["track_status"] = status_info.get("status", lap_data.get("track_status"))
        sample["track_status_label"] = status_info["label"]
        return {key: value for key, value in sample.items() if value is not None}

    def _sample_telemetry_profile(self, profile: pd.DataFrame, fraction: float) -> dict[str, Any]:
        arrays = profile.attrs.get("arrays") or {}
        fractions = arrays.get("fractions")
        if fractions is None:
            fractions = profile["ProgressFraction"].to_numpy(dtype=float)
        if fractions.size == 0:
            return {}
        fraction = float(np.clip(fraction, float(fractions.min()), float(fractions.max())))
        sample: dict[str, Any] = {}
        for source_column, output_key in [
            ("Speed", "speed"),
            ("Throttle", "throttle"),
            ("Brake", "brake"),
            ("RPM", "rpm"),
            ("nGear", "gear"),
            ("DRS", "drs"),
        ]:
            values = arrays.get(source_column)
            if values is None:
                sample[output_key] = None
                continue
            value = float(np.interp(fraction, fractions, values))
            sample[output_key] = int(round(value)) if output_key in {"gear", "drs"} else round(value, 3)
        return sample

    def _lap_speed_estimate(self, lap_data: dict[str, Any], fraction: float) -> float | None:
        speed_keys = ("speed_i1", "speed_i2", "speed_st", "speed_fl")
        if fraction < 0.28:
            preferred = ("speed_i1", "speed_st", "speed_i2", "speed_fl")
        elif fraction < 0.58:
            preferred = ("speed_i2", "speed_st", "speed_i1", "speed_fl")
        elif fraction < 0.88:
            preferred = ("speed_st", "speed_i2", "speed_i1", "speed_fl")
        else:
            preferred = ("speed_fl", "speed_st", "speed_i2", "speed_i1")
        for key in preferred:
            value = _safe_float(lap_data.get(key))
            if value is not None and value > 0:
                return value
        values = [_safe_float(lap_data.get(key)) for key in speed_keys]
        valid = [value for value in values if value is not None and value > 0]
        return round(float(np.mean(valid)), 3) if valid else None

    def _track_status_segments(self, laps: pd.DataFrame, duration: float) -> list[dict[str, Any]]:
        if laps.empty or "LapNumber" not in laps or "TrackStatus" not in laps or duration <= 0:
            return [{"start": 0.0, "end": float(duration), **self._track_status_kind("1")}]

        frame = laps.copy()
        frame["LapNumber"] = pd.to_numeric(frame["LapNumber"], errors="coerce")
        frame["LapTime"] = pd.to_numeric(frame.get("LapTime"), errors="coerce")
        fallback_lap_time = _safe_float(frame["LapTime"].dropna().median()) or 90.0

        raw_segments: list[dict[str, Any]] = []
        cursor = 0.0
        for lap_number, group in frame.dropna(subset=["LapNumber"]).sort_values("LapNumber").groupby("LapNumber"):
            statuses = group["TrackStatus"].dropna().astype(str)
            status = statuses.mode().iloc[0] if not statuses.empty else "1"
            lap_duration = _safe_float(group["LapTime"].dropna().median()) or fallback_lap_time
            start = cursor
            end = start + max(float(lap_duration), 1.0)
            raw_segments.append({"start": start, "end": end, "status": status, **self._track_status_kind(status)})
            cursor = end

        if not raw_segments:
            return [{"start": 0.0, "end": float(duration), **self._track_status_kind("1")}]

        scale = float(duration) / max(raw_segments[-1]["end"], 0.001)
        for segment in raw_segments:
            segment["start"] = round(float(segment["start"]) * scale, 3)
            segment["end"] = round(float(segment["end"]) * scale, 3)

        coalesced: list[dict[str, Any]] = []
        for segment in raw_segments:
            if coalesced and coalesced[-1]["kind"] == segment["kind"]:
                coalesced[-1]["end"] = segment["end"]
                coalesced[-1]["status"] = segment["status"]
            else:
                coalesced.append(segment)
        if coalesced:
            coalesced[0]["start"] = 0.0
            coalesced[-1]["end"] = round(float(duration), 3)
        return coalesced

    def _track_status_at_time(self, segments: list[dict[str, Any]], replay_time: float) -> dict[str, Any]:
        for segment in segments:
            if float(segment.get("start", 0.0)) <= replay_time <= float(segment.get("end", 0.0)):
                return segment
        return self._track_status_kind("1")

    def _track_status_kind(self, status: Any) -> dict[str, str]:
        text = "" if status is None else str(status)
        if "4" in text:
            return {"kind": "safety_car", "label": "SC", "color": "#f59e0b"}
        if "6" in text or "7" in text:
            return {"kind": "vsc", "label": "VSC", "color": "#8b5cf6"}
        if "5" in text:
            return {"kind": "red_flag", "label": "Red", "color": "#ef4444"}
        if "2" in text:
            return {"kind": "yellow", "label": "Yellow", "color": "#facc15"}
        return {"kind": "normal", "label": "Normal", "color": "#22c55e"}

    def _lap_lookup(self, laps: pd.DataFrame) -> dict[tuple[str, int], dict[str, Any]]:
        lookup: dict[tuple[str, int], dict[str, Any]] = {}
        if laps.empty or "Driver" not in laps or "LapNumber" not in laps:
            return lookup
        for _, row in laps.iterrows():
            driver = row.get("Driver")
            lap = _safe_int(row.get("LapNumber"))
            if not driver or lap is None:
                continue
            lookup[(str(driver), lap)] = {
                "position": _safe_int(row.get("Position")),
                "lap_time_seconds": _safe_float(row.get("LapTime")),
                "compound": row.get("Compound"),
                "stint": _safe_int(row.get("Stint")),
                "track_status": row.get("TrackStatus"),
                "speed_i1": _safe_float(row.get("SpeedI1")),
                "speed_i2": _safe_float(row.get("SpeedI2")),
                "speed_fl": _safe_float(row.get("SpeedFL")),
                "speed_st": _safe_float(row.get("SpeedST")),
            }
        return lookup

    def _live_leaderboard(self, cars: list[dict[str, Any]], lap_lookup: dict[tuple[str, int], dict[str, Any]]) -> list[dict[str, Any]]:
        ranked = self._rank_cars(cars, lap_lookup)
        rows: list[dict[str, Any]] = []
        leader_progress = float(ranked[0].get("progress") or 0.0) if ranked else 0.0
        leader_lap = _safe_int(ranked[0].get("lap")) if ranked else None
        for position, car in enumerate(ranked, start=1):
            driver = str(car.get("driver"))
            lap = _safe_int(car.get("lap")) or leader_lap or 1
            lap_data = lap_lookup.get((driver, lap), {})
            rows.append(
                {
                    "lap_number": lap,
                    "position": lap_data.get("position") or position,
                    "driver": driver,
                    "gap_to_leader": self._progress_gap(leader_lap, leader_progress, car),
                    "lap_time_seconds": lap_data.get("lap_time_seconds"),
                    "compound": lap_data.get("compound"),
                    "stint": lap_data.get("stint"),
                }
            )
        return rows

    def _rank_cars(self, cars: list[dict[str, Any]], lap_lookup: dict[tuple[str, int], dict[str, Any]]) -> list[dict[str, Any]]:
        def sort_key(car: dict[str, Any]) -> tuple[int, float, float]:
            driver = str(car.get("driver"))
            lap = _safe_int(car.get("lap")) or 0
            lap_position = lap_lookup.get((driver, lap), {}).get("position")
            if lap_position is not None:
                return (lap, -float(lap_position), float(car.get("progress") or 0.0))
            return (lap, 0.0, float(car.get("progress") or 0.0))

        return sorted(cars, key=sort_key, reverse=True)

    def _progress_gap(self, leader_lap: int | None, leader_progress: float, car: dict[str, Any]) -> float | None:
        car_lap = _safe_int(car.get("lap"))
        if leader_lap is None or car_lap is None:
            return None
        lap_gap = leader_lap - car_lap
        progress_gap = leader_progress - float(car.get("progress") or 0.0)
        return round(max(0.0, lap_gap * 1000.0 + progress_gap), 2)

    def _telemetry_like_points(self, points: pd.DataFrame) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        for _, row in points.sort_values("ReplayTime").iterrows():
            records.append(
                {
                    "time": _safe_float(row.get("ReplayTime")),
                    "x": _safe_float(row.get("X")),
                    "y": _safe_float(row.get("Y")),
                    "speed": _safe_float(row.get("Speed")),
                    "throttle": _safe_float(row.get("Throttle")),
                    "brake": _safe_float(row.get("Brake")),
                    "rpm": _safe_float(row.get("RPM")),
                    "gear": _safe_int(row.get("nGear")),
                    "drs": _safe_int(row.get("DRS")),
                    "distance": _safe_float(row.get("Distance")),
                    "relative_distance": _safe_float(row.get("RelativeDistance")),
                }
            )
        return records

    def _lap_level_trace(self, driver_laps: pd.DataFrame, lap_number: int) -> list[dict[str, Any]]:
        row = driver_laps[driver_laps["LapNumber"] == lap_number]
        if row.empty:
            return []
        selected = row.iloc[0]
        speed = _safe_float(selected.get("SpeedST") or selected.get("SpeedFL") or selected.get("SpeedI2"))
        return [{"time": 0, "x": None, "y": None, "speed": speed, "throttle": None, "brake": None, "rpm": None}]


def _safe_float(value: Any) -> float | None:
    try:
        if value is None or pd.isna(value):
            return None
        return float(value)
    except Exception:
        return None


def _safe_int(value: Any) -> int | None:
    try:
        if value is None or pd.isna(value):
            return None
        return int(float(value))
    except Exception:
        return None
