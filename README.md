# NBA Matchup & Player Prediction Platform

Production-grade NBA machine learning pipeline, analytics engine, and interactive dashboard. Predicts matchup win probabilities, final score lines (pace, offensive ratings, total points, spread), and individual player box-score projections (PTS, REB, AST) with zero lookahead leakage and rigorous empirical calibration.

---

## Benchmark Highlights & Model Metrics

Models are trained on six NBA seasons (2020-21 through 2025-26: 7,390 games, 165,430 player-game rows). Every number below is measured, not copied from training metadata, and can be reproduced with `python -m scripts.backtest.offline` (walk-forward) and `python -m scripts.backtest.live` (season replay through the API code).

| Layer | Model | Walk-forward 2025-26 (trained on 2020-21..2024-25 only) | 3-season walk-forward (2023-24..2025-26, 2,644 games) |
| :--- | :--- | :--- | :--- |
| **WIN Probability (v10)** | Logistic regression (family picked on fold-averaged Brier), early-season Elo blend | ROC-AUC `0.736`, Brier `0.206`, Log-loss `0.599`, Accuracy `68.5%` (1,257 games) | ROC-AUC `0.728`, Brier `0.209`, Accuracy `66.9%` |
| **SCORE Prediction (v10)** | Ridge pace / offensive-rating models + Ridge residual correction | Total MAE `15.38`, Margin MAE `11.47`, Winner accuracy `68.2%` | Total MAE `14.94`, Margin MAE `11.33` |
| **PLAYER Projection (v9)** | LightGBM (L1 objective for points) + Ridge calibration | MAE PTS `4.54`, REB `1.89`, AST `1.34` (28,698 rows) | MAE PTS `4.56`, REB `1.90`, AST `1.34` |

Live replay of 2025-26 (every game predicted from the API code path with features as of that morning, models trained through 2024-25): ROC-AUC `0.731`, Brier `0.208`, Total MAE `15.42`, Margin MAE `11.48`, 0 failed games out of 1,321.

> **Validation**: walk-forward means each test season is predicted by models fitted only on earlier seasons. The production models are then refit on every eligible row (`final_refit_scope: all_eligible_rows`). The 2026-10 model audit and the step-by-step measurements of each fix are in the audit report.

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
- [reports/production/model_performance_and_architecture_report.md](reports/production/model_performance_and_architecture_report.md) — Active V10/V10.1 model architecture, empirical 6-season benchmarks, and calibration methods.
- [reports/audits/model_quality_leakage_and_governance_audit.md](reports/audits/model_quality_leakage_and_governance_audit.md) — Comprehensive audit of V10.1 out-of-sample performance, leakage prevention, and metric verification.
- [docs/season_onboarding_guide.md](docs/season_onboarding_guide.md) — Step-by-step workflow for ingesting new NBA seasons.
- [reports/production/v8_vs_v9_model_comparisons.md](reports/production/v8_vs_v9_model_comparisons.md) — Historical model evolution and calibration notes.
