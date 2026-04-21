from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any

import joblib
import numpy as np
import pandas as pd
import sklearn
import xgboost
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    mean_absolute_error,
    mean_squared_error,
    precision_recall_fscore_support,
    r2_score,
)
from sklearn.model_selection import GroupShuffleSplit
from sklearn.utils._tags import RegressorTags, default_tags
from xgboost import XGBRegressor

from app.core.config import get_settings, normalize_session_code
from app.services.fastf1_service import FastF1Service
from app.services.feature_engineering import FINAL_POSITION_FEATURES, FeatureBuilder, bucket_position_delta
from app.services.final_position_model import F1FinalPositionRegressor


MODEL_KIND = "final_position_regressor"


def _ensure_xgboost_sklearn_tags() -> None:
    """Patch old XGBoost sklearn wrappers for scikit-learn 1.6+.

    Older XGBoost releases can raise
    "'super' object has no attribute '__sklearn_tags__'" when scikit-learn asks
    an estimator for metadata tags. The app pins a compatible XGBoost version,
    but this guard keeps existing local environments usable.
    """

    try:
        XGBRegressor().__sklearn_tags__()
        return
    except AttributeError:
        pass

    def _compatible_regressor_tags(self: XGBRegressor):  # type: ignore[no-untyped-def]
        tags = default_tags(self)
        tags.estimator_type = "regressor"
        tags.regressor_tags = RegressorTags()
        tags.target_tags.required = True
        return tags

    XGBRegressor.__sklearn_tags__ = _compatible_regressor_tags  # type: ignore[method-assign]


class ModelService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.builder = FeatureBuilder()
        self.model_path = self.settings.model_dir / "position_change_model.joblib"
        self.metrics_path = self.settings.model_dir / "metrics.json"
        self.importance_path = self.settings.model_dir / "feature_importance.json"
        self.features_path = self.settings.model_dir / "training_features.csv"

    def train(self, seasons: list[int] | None = None, test_season: int | None = None, min_sessions: int = 3) -> dict[str, Any]:
        _ensure_xgboost_sklearn_tags()
        selected_seasons = seasons or self._default_training_seasons()
        result = self.builder.build_from_processed(seasons=selected_seasons)
        frame = result.frame.dropna(subset=["finishing_position", "grid_position"]).copy()
        frame = frame[(frame["finishing_position"].astype(float) > 0) & (frame["grid_position"].astype(float) > 0)]
        if result.source_sessions < min_sessions or len(frame) < 30:
            raise ValueError(
                f"Need at least {min_sessions} ingested race sessions and roughly 30 driver rows; "
                f"found {result.source_sessions} sessions and {len(frame)} rows for seasons {selected_seasons}."
            )

        train_idx, test_idx = self._split(frame, test_season)
        sample_weights = self._training_sample_weights(frame)
        model = F1FinalPositionRegressor(FINAL_POSITION_FEATURES)
        model.fit(
            frame.iloc[train_idx][FINAL_POSITION_FEATURES],
            frame.iloc[train_idx]["finishing_position"],
            sample_weight=sample_weights[train_idx],
        )

        raw_predictions = model.predict_raw(frame.iloc[test_idx][FINAL_POSITION_FEATURES])
        rounded_predictions = np.clip(np.round(raw_predictions), 1, max(20, len(frame.iloc[test_idx]))).astype(int)
        metrics = self._metrics(
            frame.iloc[test_idx]["finishing_position"].astype(int).to_numpy(),
            rounded_predictions,
            raw_predictions,
            frame.iloc[test_idx],
            selected_seasons,
        )

        self.settings.model_dir.mkdir(parents=True, exist_ok=True)
        joblib.dump(
            {
                "model": model,
                "model_kind": MODEL_KIND,
                "trained_at": datetime.utcnow().isoformat(),
                "features": FINAL_POSITION_FEATURES,
                "sklearn_version": sklearn.__version__,
                "xgboost_version": xgboost.__version__,
                "training_seasons": selected_seasons,
            },
            self.model_path,
        )
        frame.to_csv(self.features_path, index=False)
        self.metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
        self.importance_path.write_text(json.dumps(model.feature_importance()[:30], indent=2), encoding="utf-8")
        return {"status": "trained", "rows": len(frame), "training_seasons": selected_seasons, "metrics": metrics}

    def metrics(self) -> dict[str, Any]:
        if not self.metrics_path.exists():
            return {"status": "missing", "message": "Train the model first with POST /api/model/train."}
        return json.loads(self.metrics_path.read_text(encoding="utf-8"))

    def feature_importance(self) -> list[dict[str, Any]]:
        if not self.importance_path.exists():
            return []
        return json.loads(self.importance_path.read_text(encoding="utf-8"))

    def predict_race(self, season: int, event: str, session: str) -> dict[str, Any]:
        _ensure_xgboost_sklearn_tags()
        if not self._is_future_event(season, event):
            raise ValueError(
                "Race predictions are only available for future races. "
                "Use the replay and model evaluation pages for completed historical races."
            )
        model_bundle = self._load_or_train_model()
        model: F1FinalPositionRegressor = model_bundle["model"]
        frame = self.builder.build_future_rows(season, event)
        if frame.empty:
            raise FileNotFoundError("No historical driver/team data is available. Ingest and train on completed races first.")

        prediction_frame = model.predict_race(frame[FINAL_POSITION_FEATURES])
        importance = {item["feature"]: item["importance"] for item in model.feature_importance()}
        predictions: list[dict[str, Any]] = []
        for _, predicted in prediction_frame.results.iterrows():
            original_index = predicted["original_index"]
            source_row = frame.loc[original_index] if original_index in frame.index else frame.iloc[int(original_index)]
            prepared_row = (
                prediction_frame.prepared_features.loc[original_index]
                if original_index in prediction_frame.prepared_features.index
                else prediction_frame.prepared_features.iloc[int(original_index)]
            )
            final_position = int(predicted["final_position"])
            starting_position = _to_int(source_row.get("grid_position"))
            predicted_delta = int(starting_position - final_position) if starting_position else 0
            raw_position = float(predicted.get("predicted_position_raw") or final_position)
            predictions.append(
                {
                    "driver": source_row["driver"],
                    "team": source_row.get("team"),
                    "starting_position": starting_position,
                    "actual_finishing_position": None,
                    "predicted_class": 1 if predicted_delta > 0 else -1 if predicted_delta < 0 else 0,
                    "predicted_position_delta": predicted_delta,
                    "predicted_finishing_position": final_position,
                    "probability_gain": round(_gain_probability(predicted_delta), 4),
                    "confidence": round(_prediction_confidence(raw_position, final_position, predicted_delta), 4),
                    "top_contributing_features": self._top_contributors(prepared_row, importance),
                }
            )

        return {
            "season": season,
            "event": event,
            "session": normalize_session_code(session),
            "model_version": model_bundle.get("trained_at"),
            "predictions": predictions,
            "final_grid": [
                {
                    "position": item["predicted_finishing_position"],
                    "driver": item["driver"],
                    "team": item.get("team"),
                    "starting_position": item.get("starting_position"),
                    "predicted_position_delta": item["predicted_position_delta"],
                    "confidence": item["confidence"],
                }
                for item in predictions
            ],
        }

    def _split(self, frame: pd.DataFrame, test_season: int | None) -> tuple[np.ndarray, np.ndarray]:
        if test_season and (frame["season"] == test_season).any() and (frame["season"] != test_season).any():
            train_idx = np.flatnonzero((frame["season"] != test_season).to_numpy())
            test_idx = np.flatnonzero((frame["season"] == test_season).to_numpy())
            return train_idx, test_idx
        splitter = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=42)
        train_pos, test_pos = next(splitter.split(frame, frame["finishing_position"], groups=frame["race_id"]))
        return train_pos, test_pos

    def _metrics(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        raw_pred: np.ndarray,
        test_frame: pd.DataFrame,
        training_seasons: list[int],
    ) -> dict[str, Any]:
        grid = test_frame["grid_position"].astype(int).to_numpy()
        true_direction = np.array([bucket_position_delta(g, f) or 0 for g, f in zip(grid, y_true)])
        pred_direction = np.array([bucket_position_delta(g, f) or 0 for g, f in zip(grid, y_pred)])
        labels = [-1, 0, 1]
        precision, recall, f1, _ = precision_recall_fscore_support(
            true_direction,
            pred_direction,
            labels=labels,
            average="macro",
            zero_division=0,
        )
        errors = np.abs(y_pred - y_true)
        return {
            "status": "trained",
            "model_kind": MODEL_KIND,
            "trained_at": datetime.utcnow().isoformat(),
            "rows_tested": int(len(y_true)),
            "training_seasons": training_seasons,
            "test_races": sorted(test_frame["race_id"].unique().tolist()),
            "split_explanation": (
                "The model predicts exact finishing position with XGBRegressor. "
                "By default it trains on the latest three processed seasons. Evaluation is grouped by race using "
                "GroupShuffleSplit, or by the requested held-out season when possible. Newer seasons receive larger "
                "training weights so current driver and constructor form matters more than older history."
            ),
            "sample_weighting": (
                "Season recency uses exponential decay, the latest processed season receives an extra multiplier, "
                "and in-season driver/team points add a small form boost."
            ),
            "mae": round(float(mean_absolute_error(y_true, raw_pred)), 4),
            "rmse": round(float(np.sqrt(mean_squared_error(y_true, raw_pred))), 4),
            "r2": round(float(r2_score(y_true, raw_pred)), 4) if len(np.unique(y_true)) > 1 else 0.0,
            "exact_position_accuracy": round(float(np.mean(errors == 0)), 4),
            "within_1_accuracy": round(float(np.mean(errors <= 1)), 4),
            "within_2_accuracy": round(float(np.mean(errors <= 2)), 4),
            "accuracy": round(float(accuracy_score(true_direction, pred_direction)), 4),
            "precision_macro": round(float(precision), 4),
            "recall_macro": round(float(recall), 4),
            "f1_macro": round(float(f1), 4),
            "gain_probability_precision": None,
            "gain_probability_recall": None,
            "gain_probability_f1": None,
            "labels": ["lost_positions", "flat", "gained_positions"],
            "confusion_matrix": confusion_matrix(true_direction, pred_direction, labels=labels).tolist(),
        }

    def _top_contributors(self, prepared_row: pd.Series, importance: dict[str, float]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for feature, value in prepared_row.items():
            score = abs(float(value)) * float(importance.get(feature, 0.0))
            if score > 0:
                rows.append({"feature": feature, "score": round(score, 6)})
        return sorted(rows, key=lambda item: item["score"], reverse=True)[:5]

    def _default_training_seasons(self) -> list[int]:
        seasons = self._available_processed_seasons()
        if seasons:
            return seasons[-max(1, int(self.settings.training_years)) :]
        today_year = date.today().year
        end_year = today_year - 1
        start_year = max(2018, end_year - max(1, int(self.settings.training_years)) + 1)
        return list(range(start_year, end_year + 1))

    def _available_processed_seasons(self) -> list[int]:
        seasons: set[int] = set()
        for session_dir in self.builder.store.list_session_dirs():
            metadata_path = session_dir / "metadata.json"
            if not metadata_path.exists():
                continue
            try:
                metadata = self.builder.store.read_json(metadata_path)
                if metadata.get("session") == "R":
                    seasons.add(int(metadata.get("season")))
            except Exception:
                continue
        return sorted(seasons)

    def _training_sample_weights(self, frame: pd.DataFrame) -> np.ndarray:
        seasons = pd.to_numeric(frame["season"], errors="coerce")
        latest_season = int(seasons.max())
        season_delta = (latest_season - seasons).clip(lower=0)
        weights = np.exp(-0.72 * season_delta.to_numpy(dtype=float))
        weights *= np.where(seasons.to_numpy(dtype=float) == float(latest_season), 2.4, 1.0)

        driver_points = self._numeric_column(frame, "championship_points_before_race", 0.0)
        team_points = self._numeric_column(frame, "team_points_before_race", 0.0)
        form_boost = 1.0 + (driver_points.clip(0, 150) / 150.0 * 0.25) + (team_points.clip(0, 350) / 350.0 * 0.25)
        weights *= form_boost.to_numpy(dtype=float)
        mean_weight = float(np.mean(weights)) if len(weights) else 1.0
        if mean_weight > 0:
            weights = weights / mean_weight
        return weights.astype(float)

    @staticmethod
    def _numeric_column(frame: pd.DataFrame, column: str, default: float) -> pd.Series:
        if column not in frame:
            return pd.Series(default, index=frame.index, dtype=float)
        return pd.to_numeric(frame[column], errors="coerce").fillna(default)

    def _load_model(self) -> dict[str, Any]:
        _ensure_xgboost_sklearn_tags()
        if not self.model_path.exists():
            raise FileNotFoundError("Model artifact is missing. Train the model first.")
        bundle = joblib.load(self.model_path)
        if bundle.get("model_kind") != MODEL_KIND or "model" not in bundle:
            raise FileNotFoundError("The saved model is from the old classifier. Retrain the model to create the final-position regressor.")
        return bundle

    def _load_or_train_model(self) -> dict[str, Any]:
        try:
            return self._load_model()
        except FileNotFoundError:
            self.train(min_sessions=3)
            return self._load_model()

    def _is_future_event(self, season: int, event: str) -> bool:
        today = date.today()
        if season > today.year:
            return True
        if season < today.year:
            return False
        try:
            events = FastF1Service().get_events(season)
        except Exception:
            return season >= today.year
        normalized_event = event.strip().lower()
        for item in events:
            if str(item.get("event_name", "")).strip().lower() != normalized_event:
                continue
            event_date = pd.to_datetime(item.get("event_date"), errors="coerce")
            if pd.isna(event_date):
                return season >= today.year
            return event_date.date() > today
        return season >= today.year


def _to_int(value: Any) -> int | None:
    try:
        if value is None or pd.isna(value):
            return None
        return int(float(value))
    except Exception:
        return None


def _gain_probability(predicted_delta: int) -> float:
    return float(1.0 / (1.0 + np.exp(-predicted_delta / 2.0)))


def _prediction_confidence(raw_position: float, final_position: int, predicted_delta: int) -> float:
    rounding_confidence = 1.0 / (1.0 + abs(raw_position - final_position))
    movement_penalty = max(0.65, 1.0 - abs(predicted_delta) * 0.025)
    return float(np.clip(rounding_confidence * movement_penalty, 0.05, 0.98))
