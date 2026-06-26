# Formula 1 Telemetry Analytics Platform

[![CI](https://github.com/AnanmayS/Formula-1-Telemetry-Analytics-Platform/actions/workflows/ci.yml/badge.svg)](https://github.com/AnanmayS/Formula-1-Telemetry-Analytics-Platform/actions/workflows/ci.yml)

A Formula 1 analytics app built with FastAPI, React, FastF1, and XGBoost.

The app can download real F1 session data, process it into replay and telemetry files, show an interactive race replay, and generate simple future-race finishing order predictions from locally trained model artifacts.

## Screenshots

Session view with season, event, and session selectors, summary stats, and results table after loading ingested data.

![Session overview with leaderboard and stats](docs/screenshots/session-overview.png)

Interactive race replay: circuit map, live-style leaderboard, weather, top three, and playback controls.

![Race replay with track map and leaderboard](docs/screenshots/race-replay.png)

Per-driver telemetry (throttle, brake, speed, gear, tires) with a time-synced leaderboard for the selected lap.

![Driver telemetry and synced leaderboard](docs/screenshots/telemetry-leaderboard.png)

Qualifying replay with sector-colored trace, driver-focused telemetry, and Q1–Q3 times.

![Qualifying session replay](docs/screenshots/qualifying-replay.png)

Model tab: predict final finishing order for a chosen Grand Prix with confidence bars.

![Race predictor model results](docs/screenshots/race-predictor.png)

## Features

- FastAPI backend for F1 session, replay, telemetry, ingest, and model endpoints
- React frontend with session selection, leaderboard views, replay controls, and prediction cards
- FastF1-based data ingestion for historical race sessions
- Local SQLite database for ingested session metadata
- XGBoost model pipeline for finishing-position predictions
- Docker Compose setup for running the full app locally

## Tech Stack

- Backend: Python, FastAPI, SQLAlchemy, Pandas, FastF1, XGBoost
- Frontend: React, TypeScript, Vite
- Data: SQLite plus local processed artifacts
- DevOps: Docker Compose and GitHub Actions

## Run With Docker

```bash
docker compose up --build
```

Open:

- Frontend: http://localhost:5173
- Backend health check: http://localhost:8000/health
- API docs: http://localhost:8000/docs

The app does not download the full dataset on startup. Use the frontend ingest controls for a single race first, or run the bootstrap command when you want to cache more recent seasons.

## Local Development

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Data Commands

Ingest one race:

```bash
docker compose exec backend python scripts/preprocess_sessions.py --seasons 2024 --events "Monaco Grand Prix" --session R --workers 1
```

Bootstrap recent seasons:

```bash
docker compose exec backend python scripts/bootstrap_data.py
```

Train the model:

```bash
docker compose exec backend python scripts/train_model.py
```

## Tests

Backend tests:

```bash
python3 -m pytest
```

Frontend build:

```bash
cd frontend
npm run build
```

GitHub Actions also runs backend tests and a frontend production build on pushes and pull requests.

## Project Structure

```text
backend/
  app/        FastAPI app, routes, schemas, services, and database setup
  scripts/    Data ingestion, feature building, model training, and evaluation
  tests/      Backend tests

frontend/
  src/        React app, pages, components, API client, and types

docker-compose.yml
```

## Notes

Generated data is intentionally not committed to Git. Local FastF1 cache files, processed session artifacts, model artifacts, SQLite databases, build output, Python caches, and `node_modules` are ignored.

If prediction fails because model artifacts are missing, ingest enough race data and run the training command again.

## Evaluation

The model is an XGBoost regressor trained on 30+ engineered features including driver form, team strength, circuit characteristics, qualifying performance, and historical finishing patterns. Below is a summary of the evaluation methodology, available metrics, and how to generate them.

### Running Evaluation

After training the model (`python scripts/train_model.py`), generate the full report:

```bash
cd backend
python scripts/evaluate_model.py
```

Or via the API:

```bash
curl http://localhost:8000/api/model/metrics
curl http://localhost:8000/api/model/feature-importance
```

### Metrics Summary

| Metric | Description |
|--------|-------------|
| **Mean Absolute Error (MAE)** | Average absolute difference between predicted and actual finishing position (lower is better) |
| **Root Mean Squared Error (RMSE)** | RMSE of raw (unrounded) predictions — penalizes large errors more heavily |
| **R² Score** | Proportion of variance explained by the model (1.0 = perfect) |
| **Exact Position Accuracy** | Fraction of predictions landing exactly on the actual finishing position |
| **Within 1 Position** | Fraction of predictions within ±1 position of the actual finish |
| **Within 2 Positions** | Fraction of predictions within ±2 positions of the actual finish |
| **Top-3 (Podium) Hit Rate** | Fraction of correctly predicted podium drivers across all test races |
| **Direction Accuracy** | Fraction of predictions that correctly predict whether a driver gains, holds, or loses positions relative to grid |
| **Precision / Recall / F1** | Macro-averaged classification metrics for direction prediction (gained / flat / lost) |

### Baseline Comparison

The model is evaluated against two naive baselines to demonstrate improvement:

| Baseline | Description |
|----------|-------------|
| **Grid Position** | Predicts each driver finishes exactly where they start. Strong baseline on many circuits. |
| **Constructor Standing** | Orders drivers by constructor championship points before the race — a proxy for team strength. |

The evaluation report shows the percentage improvement in MAE over each baseline.

### Feature Importance

The model ranks features by their contribution to predictions (XGBoost's built-in `feature_importances_`, measuring how often and how much each feature is used across all decision trees). Top features typically include:

- Driver skill and form scores
- Team strength and constructor points
- Qualifying performance (grid position, sector times)
- Historical finishing averages (last 5 races for driver and team)
- Circuit-specific characteristics (overtaking difficulty, position importance)
- Championship context (points before race, season stage)

### Per-Race Breakdown

The evaluation report prints a per-race table with:

- **MAE** and **RMSE** per race
- **Within 1 / Within 2** accuracy rates
- **Podium hit rate** (fraction of top-3 predicted correctly)

This helps identify which circuits or conditions the model handles well or poorly.

### Train/Test Split

By default the model trains on the latest three processed seasons and holds out the most recent season for testing. When a single season is available, GroupShuffleSplit (25% test, grouped by race) is used instead. Training samples are weighted by recency (exponential decay) and in-season form, so the model focuses more on current driver and constructor performance.

### Confusion Matrix

The direction confusion matrix tracks three classes:

- **Gained positions**: driver finishes ahead of grid position
- **Flat**: driver finishes at the same grid position
- **Lost positions**: driver finishes behind grid position

This provides insight into whether the model systematically over- or under-estimates position changes.
