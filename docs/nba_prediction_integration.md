# NBA Prediction & Service Integration

This document outlines the API contracts, client integration patterns, and operational configurations for the FastAPI ML inference service and React dashboard.

---

## 1. System Architecture

```text
React 19 Frontend (Vite)
       │
       ▼ (HTTP / REST)
FastAPI ML Service (Port 8001)
       │
       ├──► SQLite Store (`data/frontend/nba_frontend.db` - Sub-1ms Box Scores & Logs)
       ├──► Model Predictors (WIN v10.1, SCORE v10, PLAYER v9 - Sub-20ms Inference)
       └──► Continuous Elo & Roster Snapshot Caches
```

---

## 2. Launching Services

### Quick Start (Recommended)
Use the single-command startup script to launch both the FastAPI backend and the Vite frontend:
```bash
./scripts/start_all.sh
```
- **ML Service**: `http://127.0.0.1:8001` (Interactive Swagger at `/docs`)
- **Frontend Dashboard**: `http://localhost:5173`

### Manual Execution
```bash
# ML Service
cd ml-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001

# Frontend Dashboard
cd frontend
npm install
npm run dev
```

---

## 3. API Endpoints & Contracts

### Production & Governance
- `GET /health`: Liveness and readiness probe.
- `GET /model-status`: Returns metadata for active production models:
  - **WIN Probability**: logistic regression, 7 features (2025-26 holdout ROC-AUC `0.745`, Brier `0.205`).
  - **SCORE Model**: Ridge pace / rating / margin models + Ridge residual correction (2025-26 holdout total MAE `15.31`, margin MAE `11.45`).
  - **PLAYER Model**: LightGBM per target (2025-26 holdout MAE PTS `4.51`, REB `1.89`, AST `1.33`).

### Schedule & Frontend Data APIs
- `GET /frontend-data-api/weeks?season=YYYY-YY`:
  - Returns deterministically partitioned 28-week calendar slices with `start_date`, `end_date`, and `game_count`.
- `GET /frontend-data-api/games?season=YYYY-YY&start_date=...&end_date=...`:
  - Date-bounded game indexing for week-by-week lazy fetching (~25 KB payload).
- `GET /frontend-data-api/games/{game_id}`:
  - Fetches complete box score, quarter lines, and individual player stats from `nba_frontend.db`.
- `GET /frontend-data-api/players/{player_id}/history?season=YYYY-YY`:
  - Sub-millisecond player game logs retrieved directly from SQLite.

### Matchup & Prediction APIs
- `POST /predict/win-probability`:
  - Request: `{"home_team": "LAL", "away_team": "BOS", "prediction_date": "2026-10-15"}`
  - Response: Predicted winner, home/away probabilities, confidence tier, and model version.
- `POST /predict/score`:
  - Request: `{"home_team": "LAL", "away_team": "BOS", "prediction_date": "2026-10-15"}`
  - Response: Predicted pace, offensive ratings, expected total, margin, and projected score.
- `POST /predict/players`:
  - Request: `{"game_id": "0012600001", "home_team": "LAL", "away_team": "BOS", "prediction_date": "2026-10-15"}`
  - Response: Individual PTS, REB, AST projections for active rotation players.
- `POST /predict/game_full`:
  - Unified endpoint returning combined win probability, score projections, player projections, and key match-up signal attributions.

---

## 4. Production Hardening & Security

The service includes built-in sliding-window rate limiting and CORS configuration:
```bash
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
RATE_LIMIT_PREDICT_MAX=30
RATE_LIMIT_DATA_API_MAX=120
RATE_LIMIT_FRONTEND_DATA_MAX=300
RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_TRUST_X_FORWARDED_FOR=true
```

- Public endpoints (`/health`, `/docs`, `/openapi.json`) are exempt from rate limiting.
- Prediction endpoints and data queries are bucketed separately to prevent denial-of-service.
