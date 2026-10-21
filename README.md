# NBA Matchup & Player Prediction Platform

Production-grade NBA machine learning pipeline, analytics engine, and interactive dashboard. Predicts matchup win probabilities, final score lines (pace, offensive ratings, total points, spread), and individual player box-score projections (PTS, REB, AST) with zero lookahead leakage and rigorous empirical calibration.

---

## Benchmark Highlights & Model Metrics

Models are trained on six NBA seasons (2020-21 through 2025-26: 7,390 games, 165,430 player-game rows). Every number below is measured, not copied from training metadata, and can be reproduced with `python -m scripts.backtest.offline` (walk-forward) and `python -m scripts.backtest.live` (season replay through the API code).

| Layer | Model | Walk-forward 2025-26 (trained on 2020-21..2024-25 only) | 3-season walk-forward (2023-24..2025-26, 3,772 games) |
| :--- | :--- | :--- | :--- |
| **WIN Probability (v10)** | Logistic regression on 7 features (Elo diff, home, clean net rating diff, win-rate diff, rest), early-season Elo blend | ROC-AUC `0.740`, Brier `0.204`, Log-loss `0.596`, Accuracy `68.4%` (1,257 games) | ROC-AUC `0.732`, Brier `0.208`, Accuracy `66.9%` |
| **SCORE Prediction (v10)** | Ridge pace / offensive-rating models (2 features each), Ridge margin on the WIN inputs, Ridge residual correction; actual-point targets | Total MAE `15.31`, Margin MAE `11.45`, Winner accuracy `68.1%` | Total MAE `14.97`, Margin MAE `11.14` |
| **PLAYER Projection (v9)** | LightGBM per target (L1 for points), 21 features incl. opponent allowance to the player's position | MAE PTS `4.50`, REB `1.89`, AST `1.33` (28,698 rows) | MAE PTS `4.51`, REB `1.90`, AST `1.33` |

The walk-forward columns above score the raw model probability. The served probability additionally blends in the pure Elo probability during each team's first 6 games (weight 0.40 decaying to 0; `src/inference/win_blend.py`, used by the API, CLI, daily schedule and SHAP explanation). Replaying the first 250 games of 2025-26 (95 of them with an active blend), the blend moves Brier from `0.2204` to `0.2185` and accuracy from `66.3%` to `67.4%` on those 95 games; it changes nothing afterwards. The sample is small, so read it as "not harmful", not as a proven gain.

Live replay of 2025-26 (every game predicted from the API code path with features as of that morning, models trained through 2024-25): blended probability, ROC-AUC `0.735`, Brier `0.206`, Total MAE `15.46`, Margin MAE `11.42`, 0 failed games out of 1,321. Run it with `NBA_MODEL_DIR=models/experimental/holdout_eval python -m scripts.backtest.live --season 2025-26 --out <path>` so the replay uses models that never saw 2025-26.

Against simple pregame baselines over five walk-forward seasons (`reports/evaluation/multi_season_walk_forward_backtest.md`): WIN Brier `0.2141` vs `0.2157` for Elo + home court, SCORE total MAE `14.90` vs `14.95` and margin MAE `10.97` vs `11.41` for last-10 real points, PLAYER PTS MAE `4.54` vs `4.63` for EMA-10. The game-level models sit close to what pregame data allows; larger gains need new information (injuries, lineups, market lines).

> **Validation**: walk-forward means each test season is predicted by models fitted only on earlier seasons. The production models are then refit on every eligible row (`final_refit_scope: all_eligible_rows`). The 2026-10 model audit and the 2026-10-20 review (`reports/production/model_performance_and_architecture_report.md`, section 5) describe each fix.

---

## High-Performance Engineering

### 1. Data Engine (CSV & SQLite)
- **CSV pipeline data**: every layer under `data/` is a single CSV per table (no Parquet copies that can go stale).
- **Frontend Store**: one SQLite file per season under `data/frontend_store/` plus `global.db`, built by `scripts/build_frontend_store.py`. A season is sealed once its Finals are decided and never rebuilt; the daily refresh only rebuilds the active season (~3 s). The frontend reads everything through `/frontend-data-api/*`.
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
├── data/                  # Local only (gitignored) except the files noted in .gitignore
│   ├── reference/         # Cross-season inputs: player metadata, player movement feed
│   ├── season=YYYY-YY/    # One season: raw/ (game logs, box scores, PBP), processed/, features/, analysis/
│   ├── training/          # Model-ready datasets: team_model_ready_YYYY_YY.csv, player_model_ready.csv
│   ├── frontend_store/    # Per-season SQLite store served by the API to the frontend
│   ├── predictions/       # Shadow prediction log
│   └── experimental/      # Outputs of --output-scope experimental and --mock runs only
├── frontend/
│   ├── src/components/    # React prediction, player, and roster explorer views
│   └── src/lib/           # Centralized constants, API clients, and query caching
├── models/production/     # Promoted logistic (WIN), Ridge (SCORE) and LightGBM (PLAYER) artifacts
├── src/
│   ├── api/               # FastAPI service: routes, schemas, rate limiter, model loader
│   ├── api/services/      # Endpoint logic (win, score, player, frontend data, refresh)
│   ├── core/              # Season, data path and artifact path resolution
│   └── ...                # ingestion, features, processing, training, inference, evaluation
├── scripts/               # CLI entry points: ingest, retrain, predict, backtest, audit
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
| **Build Frontend Store** | `PYTHONPATH=. python3 scripts/build_frontend_store.py [--season YYYY-YY] [--force]` | Builds the per-season SQLite store; sealed (closed) seasons are skipped |
| **Roster & Core Player Audit** | `PYTHONPATH=. python3 main.py --season 2026-27 --run-roster-analysis` | Computes player minutes share, rotation depth, and trade stints |
| **Retraining Pipeline** | `PYTHONPATH=. python3 scripts/retrain_pipeline.py --season 2025-26 --dry-run` | Audits champion vs challenger models before promotion |
| **Quality & Structure Audit** | `PYTHONPATH=. python3 scripts/audit/validate_project_structure.py` | Validates file integrity, feature alignment, and path refactoring |

---

## Documentation & Governance

- [docs/artifact_registry.md](docs/artifact_registry.md) — Single source of truth for all active models, datasets, and paths.
- [docs/project_status.md](docs/project_status.md) — Current development phase, active production configurations, and backlog.
- [reports/production/model_performance_and_architecture_report.md](reports/production/model_performance_and_architecture_report.md) — Active model architecture, the 2026-10-20 review changes and walk-forward benchmarks.
- [docs/season_onboarding_guide.md](docs/season_onboarding_guide.md) — Step-by-step workflow for ingesting new NBA seasons.
