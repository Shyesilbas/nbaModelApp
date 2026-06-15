# NBA Predictor

Production-oriented NBA analytics and prediction platform for game outcomes, final scores, and player box-score projections. The repository combines a Python feature pipeline, calibrated machine-learning artifacts, a FastAPI inference service, a PostgreSQL analysis layer, and a React dashboard.

## What This Project Does

The system is designed around leakage-controlled NBA prediction workflows:

- Predicts matchup win probability with a calibrated WIN v9 model.
- Projects home score, away score, total points, and margin with SCORE v9 XGBoost models plus Ridge residual calibration.
- Forecasts player points, rebounds, and assists with PLAYER v9 LightGBM models plus Ridge residual calibration.
- Builds rolling team, player, opponent, rest, travel, roster, and schedule-context features from season data.
- Serves model predictions through FastAPI endpoints and a React/TypeScript dashboard.
- Maintains generated datasets, production model artifacts, reports, and validation evidence in versioned project folders.

## Current Production Models

| Layer | Active artifact family | Purpose | Validation signal |
| --- | --- | --- | --- |
| WIN v9 | `models/production/win_probability_model_v9.pkl` | Calibrated game winner probability | ROC-AUC `0.7421`, Brier `0.2049` on chronological holdout |
| SCORE v9 | `models/production/score_model_v9_*.pkl` | Pace, ratings, total, and margin projection | Total points MAE `14.75` after Ridge residual correction |
| PLAYER v9 | `models/production/player_v9_lgb_*.pkl` and `player_v9_ridge_*.pkl` | Player PTS, REB, and AST projection | PTS R2 `0.50`, AST R2 `0.46` |

See [PROJECT_STATUS.md](PROJECT_STATUS.md) and [ARTIFACT_REGISTRY.md](ARTIFACT_REGISTRY.md) for the active phase, promoted artifacts, and model inventory.

## Architecture

```text
data/                     Season data, processed datasets, production-ready tables
db/schema/                PostgreSQL schemas for raw, mart, and metadata layers
docs/                     Pipeline, integration, onboarding, and operations guides
frontend/                 React, TypeScript, Vite, Tailwind dashboard
ml-service/               FastAPI service for prediction and frontend data APIs
models/production/        Promoted model artifacts and metadata
reports/                  Production reports, audits, evaluations, and operations notes
scripts/                  Ingestion, feature engineering, exports, prediction, retraining
```

## Main Data Flow

1. Ingest season-level team logs, player logs, box scores, schedules, transactions, and play-by-play data.
2. Normalize dates, teams, players, minutes, matchup strings, and season-specific file paths.
3. Generate rolling features for team form, player form, rest, travel, opponent context, roster stints, and core-player signals.
4. Assemble model-ready datasets for WIN, SCORE, and PLAYER training or inference.
5. Promote validated artifacts into `models/production/`.
6. Export static frontend JSON and serve dynamic predictions through the FastAPI service.

More detail is available in [docs/pipeline_overview.md](docs/pipeline_overview.md).

## Tech Stack

- Python, pandas, NumPy, pyarrow
- scikit-learn, XGBoost, LightGBM, joblib
- FastAPI, Uvicorn, Pydantic
- PostgreSQL 16 through Docker Compose
- React, TypeScript, Vite, Tailwind, Recharts, Lucide React

## Quick Start

### 1. Prepare Python dependencies

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r ml-service/requirements.txt
```

### 2. Validate project structure

```bash
PYTHONPATH=. python3 scripts/audit/validate_project_structure.py
```

### 3. Start the ML service and dashboard

```bash
./scripts/start_all.sh
```

The FastAPI service runs on `http://127.0.0.1:8001` and the Vite frontend runs on `http://localhost:5173` by default.

### 4. Run a CLI prediction

```bash
PYTHONPATH=. python3 scripts/predict_matchup.py --home LAL --away BOS --prediction-date 2026-06-15
```

## Service Endpoints

Common local endpoints:

- `GET /health`
- `GET /model-status`
- `POST /predict/win-probability`
- `POST /predict/score`
- `POST /predict/players`
- `POST /predict/game_full`
- `GET /frontend-data/manifest`
- `GET /frontend-data-api/games`
- `GET /frontend-data-api/games/{game_id}`

The service code lives under [ml-service/app](ml-service/app), with request and response contracts in [ml-service/app/schemas.py](ml-service/app/schemas.py).

## Frontend

The dashboard is a React/TypeScript application backed by exported JSON data and live prediction endpoints.

```bash
cd frontend
npm install
npm run dev
```

Build and lint checks:

```bash
npm run build
npm run lint
```

See [frontend/README.md](frontend/README.md) for dashboard-specific notes.

## PostgreSQL Layer

The local database layer exposes selected datasets and play-by-play records through queryable schemas.

```bash
docker compose up -d postgres
PYTHONPATH=. python3 scripts/db/init_db.py
PYTHONPATH=. python3 scripts/db/import_mart.py --all
PYTHONPATH=. python3 scripts/db/validate_db_counts.py
```

See [docs/postgres_data_layer.md](docs/postgres_data_layer.md) for schema details and example SQL queries.

## Script Reference

| Area | Script | What it does |
| --- | --- | --- |
| Audit | [scripts/audit/validate_project_structure.py](scripts/audit/validate_project_structure.py) | Checks required project paths and expected artifacts. |
| Audit | [scripts/detect_drift_and_leakage.py](scripts/detect_drift_and_leakage.py) | Runs drift and leakage checks across model datasets. |
| Ingestion | [scripts/ingest/ingest_games.py](scripts/ingest/ingest_games.py) | Imports game-level source data. |
| Ingestion | [scripts/ingest/ingest_player_box_scores.py](scripts/ingest/ingest_player_box_scores.py) | Imports player box-score records. |
| Ingestion | [scripts/ingest/ingest_team_box_scores.py](scripts/ingest/ingest_team_box_scores.py) | Imports team box-score records. |
| Ingestion | [scripts/ingest/roster_snapshot_generator.py](scripts/ingest/roster_snapshot_generator.py) | Builds roster snapshots and stint-aware player affiliation data. |
| Features | [scripts/build_matchup_features.py](scripts/build_matchup_features.py) | Builds matchup-level features for prediction workflows. |
| Features | [scripts/features/build_player_features_from_boxscores.py](scripts/features/build_player_features_from_boxscores.py) | Builds player rolling features from box-score data. |
| Export | [scripts/export_frontend_data.py](scripts/export_frontend_data.py) | Exports static JSON consumed by the dashboard. |
| Export | [scripts/export_all_seasons_games.py](scripts/export_all_seasons_games.py) | Exports all-season game index data. |
| Export | [scripts/export_player_profiles.py](scripts/export_player_profiles.py) | Exports player profile and history data. |
| Prediction | [scripts/predict_matchup.py](scripts/predict_matchup.py) | Runs a single matchup prediction from the CLI. |
| Prediction | [scripts/predict_daily_schedule.py](scripts/predict_daily_schedule.py) | Generates predictions for a full game date. |
| Prediction | [scripts/predict_score.py](scripts/predict_score.py) | Runs score prediction from the CLI. |
| Database | [scripts/db/init_db.py](scripts/db/init_db.py) | Initializes PostgreSQL schemas. |
| Database | [scripts/db/import_mart.py](scripts/db/import_mart.py) | Imports selected mart datasets into PostgreSQL. |
| Database | [scripts/db/validate_db_counts.py](scripts/db/validate_db_counts.py) | Validates database row counts against source data. |
| Training | [scripts/retrain_pipeline.py](scripts/retrain_pipeline.py) | Runs the retraining workflow. |

## Key Workflows

### Export frontend data

```bash
PYTHONPATH=. python3 scripts/export_frontend_data.py
PYTHONPATH=. python3 scripts/export_all_seasons_games.py
PYTHONPATH=. python3 scripts/export_player_profiles.py
```

### Predict a daily schedule

```bash
PYTHONPATH=. python3 scripts/predict_daily_schedule.py --date 2026-06-15
```

### Run retraining pipeline

```bash
PYTHONPATH=. python3 scripts/retrain_pipeline.py
```

### Onboard or refresh a season

Use [docs/season_onboarding_guide.md](docs/season_onboarding_guide.md) for the current season bootstrap and refresh sequence.

## Reports

Reports are the fastest way to understand why the project is structured this way, how model versions were evaluated, and what validation evidence exists without reading the full codebase.

| Report | What it shows |
| --- | --- |
| [Model performance and architecture](reports/production/model_performance_and_architecture_report.md) | Main technical reference for active WIN v9, SCORE v9, and PLAYER v9 models, including architecture, calibration, feature families, and chronological validation metrics. |
| [V8 vs V9 model comparison](reports/production/v8_vs_v9_model_comparisons.md) | Explains the model-version changes, metric movement, feature adjustments, and why v9 artifacts were promoted. |
| [2025-26 model v9 evaluation](reports/evaluation/season_2025-26_model_v9_evaluation_report.md) | Season-level evaluation of v9 behavior on 2025-26 data. |
| [V8 vs V9 2025-26 comparison](reports/evaluation/compare_v8_vs_v9_season_2025-26.md) | Direct 2025-26 comparison between v8 and v9 model outputs. |
| [2026 playoff score validation](reports/evaluation/score_2026_playoffs_validation.md) | Focused validation of SCORE model behavior on 2026 playoff games. |
| [Data pipeline architecture](reports/operations/data_pipeline_architecture_report.md) | Operational map of ingestion, season bootstrapping, roster discovery, stint logic, and pipeline organization. |
| [Team model-ready v3 report](reports/operations/team_model_ready_v3_report.md) | Documents the team model-ready v3 dataset and its feature/assembly behavior. |
| [Final production truth audit](reports/audits/final_production_truth_report.md) | Production-readiness audit covering the final promoted artifacts and project truth state. |
| [Win model promotion audit](reports/audits/win_model_promotion_report.md) | Promotion checklist and compatibility evidence for the WIN model. |
| [Feature engineering flaws audit](reports/audits/feature_engineering_flaws_audit_report.md) | Quality-control ledger for feature engineering risks, venue alignment, parity issues, and fixes. |
| [Opponent feature audit](reports/audits/opponent_feature_report.md) | Validation of opponent-side feature construction and alignment. |
| [Drift and leakage audit](reports/audits/drift_and_leakage_2024-25_vs_2025-26.md) | Checks drift and leakage risk between 2024-25 and 2025-26 datasets. |
| [Sample schedule prediction report](reports/predictions/schedule_2026-01-10_model_v9.md) | Example generated prediction report for a scheduled game date using model v9. |
| [Reports index](reports/README.md) | Compact index of the core report set. |

## Documentation Map

- [docs/pipeline_overview.md](docs/pipeline_overview.md): end-to-end pipeline and orchestration overview.
- [docs/season_onboarding_guide.md](docs/season_onboarding_guide.md): season ingestion, validation, and refresh workflow.
- [docs/nba_prediction_integration.md](docs/nba_prediction_integration.md): prediction integration notes.
- [docs/ai_compact_game_payload.md](docs/ai_compact_game_payload.md): compact game payload format.
- [docs/reporting_and_validation_guide.md](docs/reporting_and_validation_guide.md): reporting and validation workflow.
- [reports/README.md](reports/README.md): report index.
- [reports/production/model_performance_and_architecture_report.md](reports/production/model_performance_and_architecture_report.md): model architecture and performance reference.
- [reports/production/v8_vs_v9_model_comparisons.md](reports/production/v8_vs_v9_model_comparisons.md): v8 to v9 comparison.

## Repository Status

The project is currently in a production-artifact validation and monitoring phase with WIN v9, SCORE v9, and PLAYER v9 active. Phase 7 efficiency and strength feature work is parked until explicitly resumed. The canonical status tracker is [PROJECT_STATUS.md](PROJECT_STATUS.md).
