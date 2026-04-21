from __future__ import annotations

from pydantic import BaseModel, Field


class TrainRequest(BaseModel):
    seasons: list[int] | None = None
    test_season: int | None = None
    min_sessions: int = 3


class TrainResponse(BaseModel):
    status: str
    rows: int
    training_seasons: list[int] = Field(default_factory=list)
    metrics: dict


class PredictionCard(BaseModel):
    driver: str
    team: str | None = None
    starting_position: int | None = None
    actual_finishing_position: int | None = None
    predicted_finishing_position: int | None = None
    predicted_class: int
    predicted_position_delta: int
    probability_gain: float
    confidence: float
    top_contributing_features: list[dict]


class FinalGridRow(BaseModel):
    position: int
    driver: str
    team: str | None = None
    starting_position: int | None = None
    predicted_position_delta: int
    confidence: float


class PredictionResponse(BaseModel):
    season: int
    event: str
    session: str
    predictions: list[PredictionCard]
    final_grid: list[FinalGridRow] = Field(default_factory=list)
    model_version: str | None = None
