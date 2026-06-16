NBA Prediction Integration

Architecture
- Frontend (React) -> FastAPI ML service
- The ML service hosts production model artifacts and reuses the shared matchup feature builder.

Local run
1. Start ML service (recommended using Docker):
   PYTHONPATH=. python3 scripts/export_backend_runtime_bundle.py --out-dir .deploy/backend-runtime
   docker build -f ml-service/Dockerfile -t nba-ml-service .
   docker run -p 8001:8001 nba-ml-service

2. Start frontend:
   cd frontend
   npm install
   npm run dev

API contracts
- POST /predict/win-probability (ML service)
  Request: { home_team, away_team, prediction_date }
  Response: { home_team, away_team, predicted_winner, home_win_probability, away_win_probability, confidence_bucket, model_version, prediction_date }

- POST /predict/game_full (ML service)
  Request: { game_id?, home_team_id, away_team_id, prediction_date, home_score_prediction?, away_score_prediction? }
  Response: score prediction, win probability, player projections, scale factors, and optional explanation payload.

- GET /model-status (ML service)
  Response: active win and score model metadata.

Error scenarios
- 400 Invalid request: invalid/missing fields.
- 503 Missing model file: ML service returns 503 if model artifact missing.
- 400 Not enough historical games: ML service returns 400 with message.

Deployment notes
- Keep model inference in the Python/FastAPI service.
- Version and metadata stored in models/model_metadata.json; include in responses.
- Add monitoring: health endpoint /health on ML service, readiness probe for deployments.
