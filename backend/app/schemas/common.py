from __future__ import annotations

from pydantic import BaseModel, Field


class MessageResponse(BaseModel):
    message: str


class SessionRef(BaseModel):
    season: int = Field(..., ge=2018)
    event: str
    session: str = Field(..., examples=["R", "Q", "FP1"])


class IngestSessionRequest(SessionRef):
    force: bool = False


class BulkIngestRequest(BaseModel):
    seasons: list[int] = Field(default_factory=lambda: [2024])
    session: str = "R"
    events: list[str] | None = None
    force: bool = False
    workers: int = Field(default=2, ge=1, le=8)


class IngestResponse(BaseModel):
    season: int
    event: str
    session: str
    status: str
    artifact_path: str | None = None
    message: str | None = None

