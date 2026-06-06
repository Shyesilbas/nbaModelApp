Prediction pipeline: daily update & deployment architecture

Overview
- Purpose: transform the existing win_probability_model (version 1) into a production-ready prediction system that can generate matchup probabilities in real-time and be backtested historically.

Daily update workflow (automated)
1. Game finishes
   - Source ingestion process appends the new game and boxscore to raw/ and processed/ stores (data/raw, data/processed).
2. Dataset update
   - ETL job updates data/processed/game_results_YYYY_YY.csv and data/features/team_games_features_YYYY_YY.parquet.
   - Validate that all features use only historical games (GAME_DATE < next-day predictions).
3. Feature refresh
   - Recompute team-level rolling features (last-5, last-10, home/away splits, H2H aggregates) into data/features.
4. Model retrain (optional, scheduled)
   - If retrain is enabled: run scripts/prepare_win_probability_model.py on the updated processed dataset; saves models/win_probability_model.pkl and models/feature_columns.json.
5. Deployment
   - New model artifact pushed to artifact store (models/) and a small integration test runs:
     - Run scripts/backtest_predictions.py on recent window and ensure metrics don't regress beyond thresholds.
   - On success, rotate model symlink/alias to new artifact and notify downstream systems.

Design considerations
- Leakage prevention: all feature builders filter source games with GAME_DATE < prediction_date. Validation checks are run in build_matchup_features.py and in ETL.
- Idempotency: daily jobs are idempotent: re-running for same date produces same artifacts.
- Monitoring: track prediction distribution drift, calibration (Brier score), and backtest metrics nightly.
- Rollback: keep previous model artifacts for quick rollback if post-deploy checks fail.

Operational notes
- Storage: keep data/processed and data/features in parquet for fast reads.
- API: expose scripts/predict_matchup.py behind a lightweight service (Flask/FastAPI) that calls the same functions to avoid duplication.
- Security: do not commit secrets. Model artifacts are versioned in models/ with metadata (training date and metrics).

Limitations
- This design does not retrain or change the model automatically unless scheduled; per instructions, no new models or player/score models are added.

Contact
- Maintainer: repository owner
