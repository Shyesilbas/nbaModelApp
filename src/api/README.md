# API Domain

Exposes the FastAPI ML inference service (`/predict/*`, `/model-status`, `/health`) and SQLite-backed frontend data endpoints (`/frontend-data-api/*`) with sliding-window rate limiting and live injury integration.

> [!NOTE]
> **Related Documentation & Runbooks:**
> - **Architecture Deep Dives:** [`docs/nba_prediction_integration.md`](../../docs/nba_prediction_integration.md) · [`docs/early_season_transitions.md`](../../docs/early_season_transitions.md)
> - **Frontend Counterparts:** [`frontend/src/api/README.md`](../../frontend/src/api/README.md) · [`frontend/src/lib/README.md`](../../frontend/src/lib/README.md)
> - **Key Entry Points:** [`main.py`](main.py) · [`routes.py`](routes.py) · [`schemas.py`](schemas.py) · [`rate_limit.py`](rate_limit.py) · [`model_loader.py`](model_loader.py) · [`services/game_full.py`](services/game_full.py) · [`services/frontend_data.py`](services/frontend_data.py) · [`services/paper_trading.py`](services/paper_trading.py)

## Business Rules & Invariants
- **Layered Separation:** [`routes.py`](routes.py) handles FastAPI routing, automatic injury override enrichment (`_with_injury_report`), and exception-to-HTTP mapping (`_run_endpoint`); all domain logic lives under `services/`.
- **Sliding-Window Rate Limiting (`rate_limit.py`):** `RateLimitMiddleware` enforces per-client IP buckets (`RATE_LIMIT_PREDICT_MAX`, `RATE_LIMIT_DATA_API_MAX`, `RATE_LIMIT_DEFAULT_MAX`) via `RateLimiter`; `x-forwarded-for` is trusted only when `RATE_LIMIT_TRUST_X_FORWARDED_FOR=true`.
- **Frontend Data Token Guard:** `/frontend-data-api/*` (`data_router`) enforces `require_data_token` (`X-Data-Token` vs `NBA_DATA_API_TOKEN` when configured) and reads strictly from `data/frontend_store/` SQLite files (`services/frontend_data.py`).
- **Pre-Tip Paper Ledger Integrity (`services/paper_trading.py`):** `append_records` enforces first-write-wins immutability on `paper_ledger_2026_27.jsonl`; live API predictions log separately to `shadow_predictions_log.jsonl` (`services/shadow_logger.py`).
- **Startup Warmup (`main.py`):** `lifespan` preloads models (`init_model`), frontend SQLite caches (`warm_up_cache`), and current-season player datasets.
- **Change rule:** Any route change in [`routes.py`](routes.py) requires updating `frontend/src/api/` or `frontend/src/lib/` and running `python3 scripts/check_api_endpoints.py`.

## API (`routes.py`)
- `GET /health` — liveness probe.
- `GET /model-status` — active model release, versions, and holdout metadata (`ModelStatusResponse`).
- `POST /predict/win-probability` — calibrated home/away win probability (`WinProbRequest` / `WinProbResponse`).
- `POST /predict/score` — projected pace, team ratings, total, margin, and 80% intervals (`ScorePredictionRequest` / `ScorePredictionResponse`).
- `POST /predict/players` — per-player PTS/REB/AST projections (`ScorePredictionRequest` / `PlayerPredictionResponse`).
- `POST /predict/game_full` — unified win, score, reconciled player projections, injury report, and attributions (`GameFullRequest` / `GameFullResponse`).
- `POST /predict/explain` — SHAP feature attributions for win and score (`ShapExplanationRequest` / `ShapExplanationResponse`).
- `GET /frontend-data-api/{seasons,weeks,games,games/{game_id},play-by-play/{game_id},game-quarters/{game_id},game-results,players/{player_id},player-profiles,player-season-averages,team-rosters,trades,multi-team-players,injury-report,injury-changes,injuries,paper-trading,backtest-calibration}` — read-only SQLite store, injury, and evaluation feeds.
- `POST /frontend-data-api/{games/{game_id}/refresh,games/refresh-batch,snapshot-publish}` & matching `GET` status routes — on-demand single-game ingestion and snapshot publishing.
