from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd

from app.core.config import get_settings, normalize_session_code, safe_key


class ArtifactStore:
    def __init__(self) -> None:
        self.settings = get_settings()

    def session_dir(self, season: int, event: str, session: str) -> Path:
        path = (
            self.settings.processed_dir
            / str(season)
            / safe_key(event)
            / normalize_session_code(session)
        )
        path.mkdir(parents=True, exist_ok=True)
        return path

    def session_file(self, season: int, event: str, session: str, name: str) -> Path:
        return self.session_dir(season, event, session) / name

    def write_json(self, path: Path, payload: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")

    def read_json(self, path: Path) -> Any:
        return json.loads(path.read_text(encoding="utf-8"))

    def write_frame(self, path_without_suffix: Path, frame: pd.DataFrame) -> Path:
        path_without_suffix.parent.mkdir(parents=True, exist_ok=True)
        parquet_path = path_without_suffix.with_suffix(".parquet")
        try:
            frame.to_parquet(parquet_path, index=False)
            return parquet_path
        except Exception:
            csv_path = path_without_suffix.with_suffix(".csv")
            frame.to_csv(csv_path, index=False)
            return csv_path

    def read_frame(self, path_without_suffix: Path) -> pd.DataFrame:
        parquet_path = path_without_suffix.with_suffix(".parquet")
        csv_path = path_without_suffix.with_suffix(".csv")
        if parquet_path.exists():
            return pd.read_parquet(parquet_path)
        if csv_path.exists():
            return pd.read_csv(csv_path)
        raise FileNotFoundError(f"Missing artifact {parquet_path.name} or {csv_path.name}")

    def exists(self, season: int, event: str, session: str) -> bool:
        return self.session_file(season, event, session, "metadata.json").exists()

    def list_session_dirs(self) -> list[Path]:
        if not self.settings.processed_dir.exists():
            return []
        return [p for p in self.settings.processed_dir.glob("*/*/*") if p.is_dir()]

