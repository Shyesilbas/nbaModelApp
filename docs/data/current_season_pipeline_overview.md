# Current-Season Data Pipeline Overview (2025-26)

This document provides a detailed overview of the data pipelines currently implemented for the 2025-26 NBA prediction models.

---

## 1. Pipeline Architecture

The data pipeline progresses from raw data fetching to cleaned datasets, engineered features, and finally model training and inference.

```
+-----------------------------------------------------------+
|                      DATA INGESTION                       |
|  nba_api -> team_games / player_games / schedule / box    |
+-----------------------------------------------------------+
                              |
                              v
+-----------------------------------------------------------+
|                     CLEANING & SORTING                    |
|          Chronological sort, parsing MIN and dates        |
+-----------------------------------------------------------+
                              |
                              v
+-----------------------------------------------------------+
|                     FEATURE ENGINEERING                    |
|  Rolling stats (shift 1), Home/Away splits, H2H, Opponent |
+-----------------------------------------------------------+
                              |
                              v
+-----------------------------------------------------------+
|                    DATASET CONSTRUCTION                   |
|  Join team and player features + core_players.csv         |
+-----------------------------------------------------------+
                              |
                              v
+-----------------------------------------------------------+
|                     MODEL TRAINING                        |
|  Train Win (LogReg) & Score (RandomForest) models        |
+-----------------------------------------------------------+
```

---

## 2. Ingestion Layer

The ingestion modules reside under `src/ingestion/` and make rate-limited calls to the official NBA API:
*   [nba_api_client.py](file:///Users/serhat/agProjects/nbaModelApp/src/ingestion/nba_api_client.py): central client with jittered sleep (0.6 - 1.5s) and exponential backoff (up to 5 attempts) to avoid Akamai CDN blocks.
*   [team_games_fetcher.py](file:///Users/serhat/agProjects/nbaModelApp/src/ingestion/team_games_fetcher.py): fetches team logs via `LeagueGameLog`.
*   [player_games_fetcher.py](file:///Users/serhat/agProjects/nbaModelApp/src/ingestion/player_games_fetcher.py): fetches player logs.
*   [schedule_fetcher.py](file:///Users/serhat/agProjects/nbaModelApp/src/ingestion/schedule_fetcher.py): updates schedule via `ScheduleLeagueV2`.

---

## 3. Feature Generation Layer

Feature engineering is managed by:
*   [team_features.py](file:///Users/serhat/agProjects/nbaModelApp/src/features/team_features.py): engineers rolling averages for points, points allowed, win rates, home/away splits, and franchise head-to-heads.
*   [player_features.py](file:///Users/serhat/agProjects/nbaModelApp/src/features/player_features.py): engineers individual player rolling statistics.
*   [opponent_features.py](file:///Users/serhat/agProjects/nbaModelApp/src/features/opponent_features.py): maps opponent features onto the same row.

---

## 4. Dataset Building Layer

*   The datasets are constructed in [model_dataset_builder.py](file:///Users/serhat/agProjects/nbaModelApp/src/processing/model_dataset_builder.py).
*   **V2 Player Features Dataset:** For every match, player availability features are constructed using [core_players.csv](file:///Users/serhat/agProjects/nbaModelApp/data/production/core_players.csv) as the roster definition. A player is marked "available" if they played in at least one of their team's last 3 games. Active, top-3, and missing core player averages are computed strictly chronologically using historical games to prevent leakage.

---

## 5. Inference and Model Layer

Inference loads the saved weights using configurations from [production_artifacts.yaml](file:///Users/serhat/agProjects/nbaModelApp/config/production_artifacts.yaml).
*   **Win Probability:** Uses `LogisticRegression` pipeline predicting binary outcome `WIN`.
*   **Score Model:** Uses separate `RandomForestRegressor` models for `HOME_PTS` and `AWAY_PTS`. Derived margin and total are used because they yield lower errors than direct model targets.
*   **API:** A FastAPI service runs in `ml-service/` serving predictions on port `8001`.
*   **Frontend:** The Vite frontend calls the FastAPI service directly via `VITE_API_BASE_URL`, defaulting to `http://localhost:8001`.
