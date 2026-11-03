# NBA Matchup & Player Prediction Platform

Production-grade NBA machine learning pipeline, analytics engine, and interactive dashboard. Predicts matchup win probabilities, final score lines (pace, offensive ratings, total points, spread), and individual player box-score projections (PTS, REB, AST) with zero lookahead leakage and rigorous empirical calibration.

---

## Benchmark Highlights & Model Metrics

Models are trained on six NBA seasons (2020-21 through 2025-26: 14,780 team-game rows, 165,988 player-game rows). Every number below is measured by `python -m scripts.walk_forward_benchmark` (generated report: `reports/evaluation/multi_season_walk_forward_backtest.md`, which also prints date-block bootstrap intervals); none is copied from training metadata.

<!-- BEGIN GENERATED: walk-forward-table (scripts/refresh_reports.py; do not edit) -->
| Layer | Model | Walk-forward 2025-26 (trained on 2020-21..2024-25 only) | 5-season walk-forward (2021-22..2025-26, 6,276 games) |
| :--- | :--- | :--- | :--- |
| **WIN Probability (v15)** | Logistic regression on 11 features (Elo diff, home, clean net rating diff, win-rate diff, rest diff, back-to-backs, ABS_DIFF, missing rotation minutes, rotation continuity, active lineup Game Score), early-season Elo blend | ROC-AUC `0.749`, Brier `0.201`, Log-loss `0.585`, Accuracy `68.7%` (1,257 games) | ROC-AUC `0.721`, Brier `0.2098` (Elo `0.2157`), Accuracy `66.2%` |
| **SCORE Prediction (v15)** | Ridge pace (2 features) and offensive-rating models (4 features each), Ridge margin on the WIN inputs, Ridge residual correction; actual-point targets | Total MAE `15.29`, Margin MAE `11.21` | Total MAE `14.87` (last-10 `14.95`, not significant), Margin MAE `10.85` (last-10 `11.41`) |
| **PLAYER Projection (v15)** | LightGBM per target (L1 median objectives), 24 features incl. opponent allowance to the player's position and team rotation context | MAE PTS `4.43`, REB `1.85`, AST `1.30` (28,594 rows) | MAE PTS `4.46`, REB `1.86`, AST `1.28` (EMA-10 `4.63` / `1.93` / `1.33`) |
<!-- END GENERATED: walk-forward-table -->

The walk-forward columns above score the raw model probability. The served probability additionally blends in the pure Elo probability during each team's first 6 games (weight 0.40 decaying to 0; `src/inference/win_blend.py`, used by the API, CLI, daily schedule and SHAP explanation). Replaying the first 250 games of 2025-26 (95 of them with an active blend), the blend moves Brier from `0.2204` to `0.2185` and accuracy from `66.3%` to `67.4%` on those 95 games; it changes nothing afterwards. The sample is small, so read it as "not harmful", not as a proven gain. SCORE pace/rating inputs likewise start at last season's team means and hand over to current form over 6 games, and player projections take 40% of last season's per-game averages at a player's first game, fading out over 3 (`reports/backtests/2026-10-21_early_season/`).

Live replay of 2025-26 with `v15` holdout copies (every game predicted from the API code path with features as of that morning, models trained through 2024-25; `reports/backtests/2026-11-02_live_replay_v15/`): blended probability, ROC-AUC `0.736`, Brier `0.206`, Accuracy `68.1%`, Total MAE `15.31`, Margin MAE `11.33`, 0 failed games out of 1,321. Run it with `NBA_MODEL_DIR=models/experimental/holdout_eval python -m scripts.backtest.live --season 2025-26 --out <path>` so the replay uses models that never saw 2025-26.

<!-- BEGIN GENERATED: walk-forward-significance (scripts/refresh_reports.py; do not edit) -->
Against simple pregame baselines over 5 walk-forward seasons the WIN Brier gain over Elo + home court (`-0.0059`, 95% CI `[-0.0079, -0.0038]`) and the margin gain over last-10 points (`-0.57`) are significant; the total-points gain (`-0.08`) is not significant (CI includes 0). Training and backtest take the four roster-availability features from each game's own box score, which live serving only approximates; with the live default (whoever played the previous game plays, no injury report) the WIN gain over Elo shrinks to `-0.0022` (95% CI `[-0.0041, -0.0002]`). The game-level models sit close to what pregame data allows; larger gains need new information.
<!-- END GENERATED: walk-forward-significance -->

Prospective tracking of the locked 2026-27 season (frozen pre-tip predictions, graded against pure Elo and last-10 baselines, split by model version): `reports/evaluation/paper_ledger_2026_27.md`, rebuilt by `PYTHONPATH=. python3 scripts/paper_ledger_report.py --season 2026-27`.

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

- [ARTIFACT_REGISTRY.md](ARTIFACT_REGISTRY.md) — Single source of truth for all active models, datasets, and paths.
- [PROJECT_STATUS.md](PROJECT_STATUS.md) — Current development phase, active production configurations, and backlog.
- [reports/README.md](reports/README.md) — Which reports are generated (and by which script) and which are hand-written records.
- [reports/production/model_performance_and_architecture_report.md](reports/production/model_performance_and_architecture_report.md) — Active model architecture, the 2026-10-20 review changes and walk-forward benchmarks.
- [docs/season_onboarding_guide.md](docs/season_onboarding_guide.md) — Step-by-step workflow for ingesting new NBA seasons.
