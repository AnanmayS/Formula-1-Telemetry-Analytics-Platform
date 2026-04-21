from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.schemas.model import PredictionResponse, TrainRequest, TrainResponse
from app.services.model_service import ModelService

router = APIRouter(prefix="/model", tags=["model"])


@router.post("/train", response_model=TrainResponse)
def train_model(payload: TrainRequest) -> TrainResponse:
    try:
        return TrainResponse(**ModelService().train(payload.seasons, payload.test_season, payload.min_sessions))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Model training failed: {exc}") from exc


@router.get("/metrics")
def model_metrics() -> dict:
    return ModelService().metrics()


@router.get("/feature-importance")
def feature_importance() -> list[dict]:
    return ModelService().feature_importance()


@router.get("/predict-race", response_model=PredictionResponse)
def predict_race(season: int = Query(..., ge=2018), event: str = Query(...), session: str = Query("R")) -> PredictionResponse:
    try:
        return PredictionResponse(**ModelService().predict_race(season, event, session))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}") from exc
