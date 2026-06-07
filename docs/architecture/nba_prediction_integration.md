NBA Prediction Integration

Architecture
- Frontend (React) -> Spring Boot Backend -> FastAPI ML service
- ML service hosts the win_probability_model.pkl and reuses scripts/build_matchup_features.py

Local run
1. Start ML service (recommended using Docker):
   docker build -t nba-ml-service ./ml-service
   docker run -p 8001:8001 -v $(pwd)/models:/app/models:ro -v $(pwd)/scripts:/app/scripts:ro nba-ml-service

2. Start Spring Boot backend:
   cd backend/spring-boot-app
   mvn spring-boot:run

3. Start frontend:
   cd frontend
   npm install
   npm run dev

API contracts
- POST /predict/win-probability (ML service)
  Request: { home_team, away_team, prediction_date }
  Response: { home_team, away_team, predicted_winner, home_win_probability, away_win_probability, confidence_bucket, model_version, prediction_date }

- POST /api/nba/predictions/win-probability (Spring Boot)
  Proxies the ML service; frontend should call this endpoint.

Error scenarios
- 503 ML service unavailable: backend returns 503 with friendly error message.
- 400 Invalid request: invalid/missing fields.
- 503 Missing model file: ML service returns 503 if model artifact missing.
- 400 Not enough historical games: ML service returns 400 with message.

Deployment notes
- Do NOT embed pickle into JVM — keep ML service separate.
- Version and metadata stored in models/model_metadata.json; include in responses.
- Add monitoring: health endpoint /health on ML service, readiness probe for deployments.
