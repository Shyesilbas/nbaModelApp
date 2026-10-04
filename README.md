# NBA Matchup & Player Prediction Platform

Production-grade NBA machine learning pipeline, analytics engine, and interactive dashboard. Predicts matchup win probabilities, final score lines (pace, offensive ratings, total points, spread), and individual player box-score projections (PTS, REB, AST) with zero lookahead leakage and rigorous empirical calibration.

---

## Benchmark Highlights & Model Metrics

The platform is trained across **6 full NBA seasons (2020-21 through 2025-26)** encompassing **10,280 games** and **165,988 player-game records**.

| Layer | Architecture | Key Features | Pure Unseen Holdout (2025-26) | Full Production Refit (Live 2026-27) |
| :--- | :--- | :--- | :--- | :--- |
| **WIN Probability** | Calibrated LightGBM (Isotonic) | Continuous Elo, Dean Oliver Four Factors, 3PT regression delta, Havoc rate, Out-of-fold score margins, Player PRA projections | **ROC-AUC: 0.7391**<br>Brier: `0.2057`<br>Accuracy: `66.6%`<br>Log-Loss: `0.5938` | **ROC-AUC: 0.7918** (2025-26)<br>Cross-Season ROC-AUC: `0.7772`<br>Live Accuracy: **71.7%**<br>Cross-Season Acc: `70.3%` |
| **SCORE Prediction** | 4-way XGBoost + Ridge Residual Correction | Team pace, Home/Away Off_Rtg, Rest advantage, Travel distance, Playoff elimination context | **Total Points MAE: ~14.75 pts**<br>Pace MAE: `3.15`<br>Margin MAE: `9.82` | Continuous residual correction for playoff intensity & back-to-backs |
| **PLAYER Projection** | LightGBM Regressors + Ridge Calibration | Rolling 5/10/20 game form, Usage rate trends, Defense vs Position, Minutes projections | **PTS $R^2$: 0.50** (MAE 4.12)<br>**AST $R^2$: 0.46** (MAE 1.34)<br>**REB $R^2$: 0.43** (MAE 1.86) | Calibrated for 165K+ player logs with position & usage buckets |

> **Validation Rigor**: Metrics are split into **Pure Out-of-Sample Holdout** (model strictly fitted on 2020-21 through 2024-25 and evaluated on completely unseen 2025-26) and **Full Refit** (retrained on all 10,280 rows for live production deployment). Zero future data leakage.

---

## High-Performance Engineering

### 1. High-Speed Data Engine (Parquet & SQLite)
- **ZSTD-Compressed Parquet Layer**: Replaced bloated raw CSVs with Parquet datasets, delivering **12x faster load times** and **~76% disk footprint reduction**.
- **Embedded SQLite Store (`nba_frontend.db`)**: Indexed WAL-mode SQLite database providing **sub-millisecond (<1ms)** point lookups for game details, team box scores, and historical player logs with zero startup memory overhead.
- **In-Memory Caching**: State-cached Continuous Elo engine and memoized joblib models eliminate redundant filesystem I/O during real-time schedule predictions.

### 2. Hardened FastAPI ML Inference Service
- **Sub-20ms Latency**: Model inference endpoints return rich predictions, factor attributions, and player matchup distributions in under 20ms.
- **Production Gateways**: IP-based sliding-window rate limiting (`RATE_LIMIT_PREDICT_MAX=30`, `RATE_LIMIT_DATA_API_MAX=120`), environment-driven CORS security, and automated health checks (`GET /health`, `GET /model-status`).

### 3. Modern React 19 Dashboard
- **Tech Stack**: React 19, TypeScript, Vite, Tailwind CSS, Recharts, and Lucide React.
- **Week-by-Week Lazy Schedule Navigation**: Eliminated full-season (1,274 games) DOM bottlenecks by introducing calendar-bounded week slicing, cutting network transfer from **1.2 MB to ~25 KB per view**.
- **Interactive Visualizations**: Dynamic win probability gauges, expected score margins, head-to-head signal breakdown cards, roster depth charts, and detailed player projection cards.

---

## System Architecture

```text
├── data/
│   ├── processed/         # Team model-ready datasets (V3, 2020-21 to 2025-26) in Parquet/CSV
│   ├── experimental/      # Player model-ready datasets (V4 USG, 165K rows)
│   ├── frontend/          # High-performance nba_frontend.db SQLite store
│   └── season=YYYY-YY/    # Season-scoped raw box scores, schedules, and rolling features
├── ml-service/
│   ├── app/               # FastAPI prediction service, schemas, and rate limiters
│   └── app/services/      # Model inference engines (win, score, player, frontend data)
├── frontend/
│   ├── src/components/    # React prediction, player, and roster explorer views
│   └── src/lib/           # Centralized constants, API clients, and query caching
├── models/production/     # Promoted LightGBM, XGBoost, and Ridge model artifacts
├── scripts/               # Ingestion, feature engineering, SQLite compilation, retraining
└── reports/               # Audits, empirical benchmark logs, and governance documents
```

---

## Quick Start

### 1. Launch Everything (One Command)
Run the automated orchestrator to bootstrap both the Python ML backend and the Vite frontend:
```bash
./scripts/start_all.sh
```
- **ML Service API**: [http://127.0.0.1:8001](http://127.0.0.1:8001) (Swagger docs at `/docs`)
- **Web Dashboard**: [http://localhost:5173](http://localhost:5173)

### 2. Manual Environment Setup
```bash
# ML Service & Scripts
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r ml-service/requirements.txt

# Frontend
cd frontend
npm install
npm run dev
```

### 3. Run Predictions via CLI
```bash
# Predict specific matchup
PYTHONPATH=. python3 scripts/predict_matchup.py --home LAL --away BOS --prediction-date 2026-10-15

# Predict full schedule for a date
PYTHONPATH=. python3 scripts/predict_daily_schedule.py --date 2026-10-08 --season 2026-27
```

---

## Daily Operations & Pipelines

| Task | Command | Description |
| :--- | :--- | :--- |
| **Ingest Latest Data** | `PYTHONPATH=. python3 main.py --update-data` | Fetches latest completed box scores and schedule updates |
| **Build Frontend SQLite Store** | `PYTHONPATH=. python3 scripts/build_frontend_db.py` | Compiles raw JSON/logs into indexed `nba_frontend.db` |
| **Roster & Core Player Audit** | `PYTHONPATH=. python3 main.py --season 2026-27 --run-roster-analysis` | Computes player minutes share, rotation depth, and trade stints |
| **Retraining Pipeline** | `PYTHONPATH=. python3 scripts/retrain_pipeline.py --season 2025-26 --dry-run` | Audits champion vs challenger models before promotion |
| **Quality & Structure Audit** | `PYTHONPATH=. python3 scripts/audit/validate_project_structure.py` | Validates file integrity, feature alignment, and path refactoring |

---

## Documentation & Governance

- [ARTIFACT_REGISTRY.md](ARTIFACT_REGISTRY.md) — Single source of truth for all active models, datasets, and paths.
- [PROJECT_STATUS.md](PROJECT_STATUS.md) — Current development phase, active production configurations, and backlog.
- [reports/production/v8_vs_v9_model_comparisons.md](reports/production/v8_vs_v9_model_comparisons.md) — Mathematical calibration methods and benchmark comparisons.
- [docs/season_onboarding_guide.md](docs/season_onboarding_guide.md) — Step-by-step workflow for ingesting new NBA seasons.
