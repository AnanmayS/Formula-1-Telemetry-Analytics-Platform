"""Evaluate the trained model and print comprehensive metrics.

Usage:
    python scripts/evaluate_model.py

Requires:
    - A trained model artifact (position_change_model.joblib)
    - metrics.json and feature_importance.json from a training run
    - At minimum, one processed session to load feature data

Outputs:
    - Top-3 prediction accuracy (podium hit rate)
    - Mean absolute error in finishing position
    - Per-race prediction breakdown
    - Feature importance (top features ranked)
    - Baseline comparisons (grid position baseline, constructor standing baseline)
    - Confusion matrix for position direction (gained / flat / lost)
"""

from __future__ import annotations

import json
import sys
from typing import Any

import _bootstrap  # noqa: F401

import numpy as np
import pandas as pd

from app.services.feature_engineering import FINAL_POSITION_FEATURES, FeatureBuilder, bucket_position_delta
from app.services.final_position_model import F1FinalPositionRegressor
from app.services.model_service import ModelService


def _top3_accuracy(y_true: np.ndarray, y_pred: np.ndarray, test_frame: pd.DataFrame) -> dict[str, Any]:
    """Compute top-3 (podium) prediction accuracy per race and overall."""
    if "race_id" not in test_frame.columns:
        return {"error": "race_id column not available for per-race breakdown"}

    per_race: dict[str, Any] = {}
    total_hits = 0
    total_races = 0

    for race_id in sorted(test_frame["race_id"].unique()):
        mask = test_frame["race_id"] == race_id
        race_true = y_true[mask]
        race_pred = y_pred[mask]
        grid = test_frame.loc[mask, "grid_position"].astype(int).to_numpy()

        # Actual top-3 drivers
        actual_top3 = set(np.argsort(race_true)[:3])
        # Predicted top-3 drivers (by predicted finishing position)
        pred_top3 = set(np.argsort(race_pred)[:3])

        # Podium hit rate: intersection of actual and predicted top-3
        podium_hits = len(actual_top3 & pred_top3)
        per_race[str(race_id)] = {
            "podium_hits": int(podium_hits),
            "max_podium": 3,
            "podium_accuracy": round(podium_hits / 3, 4),
        }
        total_hits += podium_hits
        total_races += 1

    overall = round(total_hits / (total_races * 3), 4) if total_races else 0.0
    return {
        "top3_hit_rate": overall,
        "top3_hits": int(total_hits),
        "top3_total_positions": int(total_races * 3),
        "total_races": total_races,
        "per_race": per_race,
    }


def _baseline_comparison(y_true: np.ndarray, y_pred: np.ndarray, test_frame: pd.DataFrame) -> dict[str, Any]:
    """Compare model against naive baselines: grid position and constructor standing."""
    grid = test_frame["grid_position"].astype(float).to_numpy()
    grid_mae = float(np.mean(np.abs(grid - y_true)))

    # Constructor standing baseline: use constructor points as a noisy ordering proxy
    # We'll compute MAE if constructor_points_before_race is available
    constructor_mae = None
    if "team_points_before_race" in test_frame.columns:
        team_points = test_frame["team_points_before_race"].astype(float).to_numpy()
        # Higher points → lower finishing position (inverted rank proxy)
        from scipy.stats import rankdata

        inverted_order = len(team_points) + 1 - rankdata(team_points)
        constructor_mae = round(float(np.mean(np.abs(inverted_order - y_true))), 4)

    model_mae = float(np.mean(np.abs(y_pred - y_true)))

    improvement_vs_grid = round((grid_mae - model_mae) / grid_mae * 100, 2) if grid_mae > 0 else 0.0
    result: dict[str, Any] = {
        "model_mae": round(model_mae, 4),
        "grid_position_baseline_mae": round(grid_mae, 4),
        "improvement_vs_grid_pct": improvement_vs_grid,
    }
    if constructor_mae is not None:
        improvement_vs_constructor = round(
            (constructor_mae - model_mae) / constructor_mae * 100, 2
        ) if constructor_mae > 0 else 0.0
        result["constructor_baseline_mae"] = constructor_mae
        result["improvement_vs_constructor_pct"] = improvement_vs_constructor
    return result


def _per_race_breakdown(y_true: np.ndarray, y_pred: np.ndarray, raw_pred: np.ndarray, test_frame: pd.DataFrame) -> list[dict[str, Any]]:
    """Compute per-race metrics breakdown."""
    if "race_id" not in test_frame.columns or "event" not in test_frame.columns:
        return [{"error": "race_id or event columns not available"}]

    rows: list[dict[str, Any]] = []
    for race_id in sorted(test_frame["race_id"].unique()):
        mask = test_frame["race_id"] == race_id
        race_true = y_true[mask]
        race_pred = y_pred[mask]
        race_raw = raw_pred[mask]
        race_frame = test_frame[mask]

        event_name = race_frame["event"].iloc[0] if "event" in race_frame else str(race_id)
        season = int(race_frame["season"].iloc[0]) if "season" in race_frame else 0
        n_drivers = len(race_true)
        race_mae = round(float(np.mean(np.abs(race_pred - race_true))), 4)
        race_within_1 = round(float(np.mean(np.abs(race_pred - race_true) <= 1)), 4)
        race_within_2 = round(float(np.mean(np.abs(race_pred - race_true) <= 2)), 4)
        race_rmse = round(float(np.sqrt(np.mean((race_raw - race_true.astype(float)) ** 2))), 4)

        # Per-race top-3 accuracy
        actual_top3 = set(np.argsort(race_true)[:3])
        pred_top3 = set(np.argsort(race_pred)[:3])
        podium_hits = len(actual_top3 & pred_top3)

        rows.append({
            "season": season,
            "event": event_name,
            "race_id": str(race_id),
            "drivers": int(n_drivers),
            "mae": race_mae,
            "rmse": race_rmse,
            "within_1": race_within_1,
            "within_2": race_within_2,
            "podium_hits": int(podium_hits),
            "podium_hit_rate": round(podium_hits / 3, 4),
        })
    return rows


def main() -> None:
    service = ModelService()

    # Load stored metrics
    metrics = service.metrics()
    print("=" * 72)
    print("MODEL EVALUATION REPORT")
    print("=" * 72)

    if metrics.get("status") == "missing":
        print("\nNo trained model found. Train the model first:")
        print("  python scripts/train_model.py")
        print("\nOr via the API:")
        print("  POST /api/model/train")
        sys.exit(1)

    print(f"\nTraining seasons: {metrics.get('training_seasons', 'N/A')}")
    print(f"Rows tested:      {metrics.get('rows_tested', 'N/A')}")
    print(f"Test races:       {len(metrics.get('test_races', []))}")
    print(f"Trained at:       {metrics.get('trained_at', 'N/A')}")
    print(f"Model kind:       {metrics.get('model_kind', 'N/A')}")
    print()

    # --- Core regression metrics ---
    print("-" * 72)
    print("1. REGRESSION METRICS")
    print("-" * 72)
    print(f"  Mean Absolute Error (MAE):          {metrics.get('mae', 'N/A')}")
    print(f"  Root Mean Squared Error (RMSE):     {metrics.get('rmse', 'N/A')}")
    print(f"  R² Score:                           {metrics.get('r2', 'N/A')}")
    print(f"  Exact position accuracy:            {metrics.get('exact_position_accuracy', 'N/A')}")
    print(f"  Within 1 position accuracy:         {metrics.get('within_1_accuracy', 'N/A')}")
    print(f"  Within 2 positions accuracy:        {metrics.get('within_2_accuracy', 'N/A')}")

    # --- Direction metrics ---
    print()
    print("-" * 72)
    print("2. DIRECTION CLASSIFICATION (gained / flat / lost positions vs grid)")
    print("-" * 72)
    print(f"  Direction accuracy:                 {metrics.get('accuracy', 'N/A')}")
    print(f"  Precision (macro):                  {metrics.get('precision_macro', 'N/A')}")
    print(f"  Recall (macro):                     {metrics.get('recall_macro', 'N/A')}")
    print(f"  F1 Score (macro):                   {metrics.get('f1_macro', 'N/A')}")
    cm = metrics.get("confusion_matrix")
    if cm:
        labels = metrics.get("labels", ["lost", "flat", "gained"])
        print(f"  Confusion matrix ({' / '.join(labels)}):")
        for i, row in enumerate(cm):
            print(f"    {labels[i]:>12}: {row}")

    # --- Feature importance ---
    importance = service.feature_importance()
    print()
    print("-" * 72)
    print("3. FEATURE IMPORTANCE (Top 15)")
    print("-" * 72)
    if importance:
        for i, item in enumerate(importance[:15], 1):
            print(f"  {i:2d}. {item['feature']:<45s} {item['importance']:.6f}")
    else:
        print("  No feature importance data available.")

    # --- Load model and data for deeper evaluation ---
    print()
    print("-" * 72)
    print("4. DEEPER EVALUATION (requires model + training features)")
    print("-" * 72)

    try:
        bundle = service._load_model()
    except Exception as e:
        print(f"  Skipping deeper evaluation: {e}")
        sys.exit(0)

    model: F1FinalPositionRegressor = bundle["model"]
    features_path = service.features_path

    if not features_path.exists():
        print("  Training features CSV not found. Cannot compute per-race breakdown.")
        sys.exit(0)

    frame = pd.read_csv(features_path)
    frame = frame.dropna(subset=["finishing_position", "grid_position"]).copy()
    frame = frame[(frame["finishing_position"].astype(float) > 0) & (frame["grid_position"].astype(float) > 0)]

    if frame.empty:
        print("  No valid rows in training features. Cannot compute per-race metrics.")
        sys.exit(0)

    # Reconstruct the evaluation split using the same logic as training
    test_season = None
    if len(frame["season"].unique()) > 1:
        # Use the most recent season as test
        test_season = int(frame["season"].max())

    from sklearn.model_selection import GroupShuffleSplit

    if test_season and (frame["season"] == test_season).any() and (frame["season"] != test_season).any():
        train_idx = np.flatnonzero((frame["season"] != test_season).to_numpy())
        test_idx = np.flatnonzero((frame["season"] == test_season).to_numpy())
    else:
        splitter = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=42)
        train_pos, test_pos = next(
            splitter.split(frame, frame["finishing_position"], groups=frame["race_id"])
        )
        train_idx, test_idx = train_pos, test_pos

    test_frame = frame.iloc[test_idx]
    y_true = test_frame["finishing_position"].astype(int).to_numpy()
    raw_pred = model.predict_raw(test_frame[FINAL_POSITION_FEATURES])
    y_pred = np.clip(np.round(raw_pred), 1, max(20, len(test_frame))).astype(int)

    # Top-3 accuracy
    top3 = _top3_accuracy(y_true, y_pred, test_frame)
    print(f"\n  Top-3 (podium) hit rate:            {top3.get('top3_hit_rate', 'N/A')}")
    print(f"  Top-3 hits / total positions:      {top3.get('top3_hits', 'N/A')} / {top3.get('top3_total_positions', 'N/A')}")
    print(f"  Total races evaluated:             {top3.get('total_races', 'N/A')}")

    # Baseline comparison
    baseline = _baseline_comparison(y_true, y_pred, test_frame)
    print(f"\n  Model MAE:                           {baseline.get('model_mae', 'N/A')}")
    print(f"  Grid position baseline MAE:         {baseline.get('grid_position_baseline_mae', 'N/A')}")
    print(f"  Improvement vs grid:                {baseline.get('improvement_vs_grid_pct', 'N/A')}%")
    if baseline.get("constructor_baseline_mae"):
        print(f"  Constructor standing baseline MAE:  {baseline.get('constructor_baseline_mae', 'N/A')}")
        print(f"  Improvement vs constructor:         {baseline.get('improvement_vs_constructor_pct', 'N/A')}%")

    # Per-race breakdown
    breakdown = _per_race_breakdown(y_true, y_pred, raw_pred, test_frame)
    if breakdown and "error" not in breakdown[0]:
        print(f"\n  Per-race breakdown ({len(breakdown)} races):")
        print(f"  {'Season':>6} {'Event':<30} {'Drv':>3} {'MAE':>6} {'RMSE':>6} {'W/in1':>6} {'W/in2':>6} {'Podium':>6}")
        print(f"  {'-'*6} {'-'*30} {'-'*3} {'-'*6} {'-'*6} {'-'*6} {'-'*6} {'-'*6}")
        for race in breakdown:
            print(f"  {race['season']:>6} {race['event']:<30} {race['drivers']:>3} "
                  f"{race['mae']:>6} {race['rmse']:>6} {race['within_1']:>6} "
                  f"{race['within_2']:>6} {race['podium_hit_rate']:>6}")

    print()
    print("=" * 72)
    print("END OF EVALUATION REPORT")
    print("=" * 72)


if __name__ == "__main__":
    main()
