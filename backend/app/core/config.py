from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


SessionCode = Literal["FP1", "FP2", "FP3", "Q", "S", "R"]


class Settings(BaseSettings):
    """Runtime settings kept deliberately small for local-first demos."""

    app_name: str = "F1 Analytics Platform"
    api_prefix: str = "/api"
    database_url: str = "sqlite:///./data/f1_analytics.db"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
        "http://localhost:5177",
        "http://127.0.0.1:5177",
    ]
    data_dir: Path = Path("data")
    fastf1_cache_dir: Path = Path("data/cache")
    raw_dir: Path = Path("data/raw")
    processed_dir: Path = Path("data/processed")
    model_dir: Path = Path("data/models")
    default_start_season: int = 2023
    default_end_season: int = 2025
    training_years: int = 3
    bootstrap_on_startup: bool = False
    bootstrap_years: int = 4
    bootstrap_session: str = "R"
    bootstrap_workers: int = 1
    telemetry_ingest_mode: str = "full"
    replay_position_driver_limit: int | None = None

    model_config = SettingsConfigDict(env_file=".env", env_prefix="F1_")

    def ensure_directories(self) -> None:
        for path in [
            self.data_dir,
            self.fastf1_cache_dir,
            self.raw_dir,
            self.processed_dir,
            self.model_dir,
        ]:
            path.mkdir(parents=True, exist_ok=True)


SESSION_ALIASES: dict[str, str] = {
    "practice 1": "FP1",
    "free practice 1": "FP1",
    "fp1": "FP1",
    "practice 2": "FP2",
    "free practice 2": "FP2",
    "fp2": "FP2",
    "practice 3": "FP3",
    "free practice 3": "FP3",
    "fp3": "FP3",
    "qualifying": "Q",
    "q": "Q",
    "sprint": "S",
    "s": "S",
    "race": "R",
    "r": "R",
}


def normalize_session_code(session: str) -> str:
    key = session.strip().lower()
    return SESSION_ALIASES.get(key, session.strip().upper())


def safe_key(value: str) -> str:
    return (
        str(value)
        .strip()
        .replace(" ", "_")
        .replace("/", "_")
        .replace("\\", "_")
        .replace(":", "_")
    )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_directories()
    return settings
