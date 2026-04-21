from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class IngestedSession(Base):
    __tablename__ = "ingested_sessions"
    __table_args__ = (
        UniqueConstraint("season", "event_name", "session_code", name="uq_ingested_session"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    season: Mapped[int] = mapped_column(Integer, index=True)
    event_name: Mapped[str] = mapped_column(String, index=True)
    session_code: Mapped[str] = mapped_column(String(8), index=True)
    country: Mapped[str | None] = mapped_column(String, nullable=True)
    circuit_name: Mapped[str | None] = mapped_column(String, nullable=True)
    event_date: Mapped[str | None] = mapped_column(String, nullable=True)
    has_laps: Mapped[bool] = mapped_column(Boolean, default=False)
    has_replay: Mapped[bool] = mapped_column(Boolean, default=False)
    has_weather: Mapped[bool] = mapped_column(Boolean, default=False)
    driver_count: Mapped[int] = mapped_column(Integer, default=0)
    artifact_path: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

