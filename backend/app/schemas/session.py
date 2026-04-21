from __future__ import annotations

from pydantic import BaseModel, Field


class EventOption(BaseModel):
    season: int
    round_number: int | None = None
    event_name: str
    country: str | None = None
    location: str | None = None
    event_date: str | None = None


class SessionOption(BaseModel):
    code: str
    name: str


class DriverSummary(BaseModel):
    abbreviation: str
    driver_number: str | None = None
    full_name: str | None = None
    team_name: str | None = None
    grid_position: int | None = None
    finishing_position: int | None = None
    status: str | None = None
    q1_time_seconds: float | None = None
    q2_time_seconds: float | None = None
    q3_time_seconds: float | None = None
    qualifying_stage: str | None = None


class SessionSummary(BaseModel):
    season: int
    event: str
    session: str
    country: str | None = None
    circuit_name: str | None = None
    event_date: str | None = None
    driver_count: int
    total_laps: int
    has_replay: bool
    has_weather: bool
    weather: list[dict]
    drivers: list[DriverSummary]


class LeaderboardRow(BaseModel):
    lap_number: int
    position: int
    driver: str
    gap_to_leader: float | None = None
    lap_time_seconds: float | None = None
    compound: str | None = None
    stint: int | None = None


class LeaderboardResponse(BaseModel):
    rows: list[LeaderboardRow]


class TelemetryResponse(BaseModel):
    driver: str
    lap: str
    points: list[dict]
    lap_times: list[dict]
    stints: list[dict]


class ReplayFrame(BaseModel):
    time: float
    lap: int | None = None
    cars: list[dict]
    leaderboard: list[LeaderboardRow] = Field(default_factory=list)


class ReplayResponse(BaseModel):
    duration: float
    track: list[dict]
    frames: list[ReplayFrame]
    leaderboard: list[LeaderboardRow]
    track_status_segments: list[dict] = Field(default_factory=list)
    approximation_notes: list[str]
