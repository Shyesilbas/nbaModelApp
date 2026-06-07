# Full Rebuild Runbook — 2025-26 Season

This runbook provides step-by-step instructions to completely rebuild all features, datasets, and production models of the NBA prediction project from raw files, assuming all generated/processed directories are deleted or empty.

---

## Prerequisites
*   Python 3 installed (`python3`).
*   Virtual environment activated and packages installed (`pip install -r ml-service/requirements.txt`).
*   Java runtime (`java` 17+) and Maven installed (if rebuilding the Spring Boot backend JAR).
*   Node.js (`npm` 18+) installed (if launching/building the frontend Vite dashboard).

---

## Rebuild Pipeline Sequence

### Step 1: Initialize Project Directories
Ensure the base directories exist before starting:
```bash
mkdir -p data/raw/team_games
mkdir -p data/raw/player_games
mkdir -p data/raw/schedule
mkdir -p data/features
mkdir -p data/processed
mkdir -p data/production
mkdir -p data/analysis
mkdir -p models/production
mkdir -p reports/audits
```

---

### Step 2: Ingest Schedule & Fetch Completed Games
Update the league schedule and scrape/verify all raw games:
```bash
python3 main.py --update-data
```
*   **Responsible Module:** `UpdateDataService` & `nba_api_client.py`.
*   **Action:** Refreshes [nba_schedule_2025_26.csv](file:///Users/serhat/agProjects/nbaModelApp/data/raw/schedule/nba_schedule_2025_26.csv) and fetches any missing team and player game logs, saving them under `data/raw/`.

---

### Step 3: Run Roster and Core Player Discovery
Evaluate rosters and establish canonical player identifiers:
```bash
python3 main.py --run-roster-analysis
```
*   **Action:** Evaluates player minutes across the season, generating:
    *   `data/analysis/team_rosters.csv`
    *   `data/analysis/core_players.csv` (the top 5 ranked players per franchise)
    *   `data/analysis/star_candidates.csv`
    *   `data/analysis/multi_team_players.csv`
*   **Post-Action Copy:** Copy the core players file to its production storage path:
    ```bash
    cp data/analysis/core_players.csv data/production/core_players.csv
    ```

---

### Step 4: Execute Pre-Model Readiness Pipeline
Build all base team features, matchup split forms, and pivot game results:
```bash
python3 main.py --pre-model-readiness
```
*   **Action:** Runs the following sequence:
    1.  `--sync-pipeline`: Generates team/player feature CSV/Parquet files in `data/features/`.
    2.  `--fetch-boxscores`: Normalizes matchup strings and pivots raw team box scores to generate [game_results_2025_26.csv](file:///Users/serhat/agProjects/nbaModelApp/data/processed/game_results_2025_26.csv).
    3.  `--build-model-dataset`: Builds opponent-aware team feature datasets in `data/processed/`.
    4.  `--build-schedule-context`: Merges schedule, upcoming context, and exports JSONs.
    5.  `--export-frontend-data`: Exports all static JSON files to the Vite public data directory.

---

### Step 5: Train and Calibrate Win Probability Model V2
Build player-attendance aggregates and train the win classifier:
```bash
python3 scripts/train_win_probability_v2.py
```
*   **Action:**
    *   Combines the opponent-aware team features, player features, and `core_players.csv` to generate [team_win_model_ready_v2_player_features.csv](file:///Users/serhat/agProjects/nbaModelApp/data/processed/team_win_model_ready_v2_player_features.csv).
    *   Trains and cross-validates multiple classifiers, selecting the best one (Logistic Regression).
    *   Outputs the production pickle [win_probability_model.pkl](file:///Users/serhat/agProjects/nbaModelApp/models/win_probability_model.pkl) and feature mapping [feature_columns.json](file:///Users/serhat/agProjects/nbaModelApp/models/feature_columns.json).
    *   Generates backtest prediction tables and summary plots under `reports/`.

---

### Step 6: Train Score Prediction Model V2
Build game-perspective score datasets and train regression models:
```bash
python3 scripts/prepare_score_model.py
```
*   **Action:**
    *   Merges features to construct [team_score_model_ready_v2_player_features.csv](file:///Users/serhat/agProjects/nbaModelApp/data/processed/team_score_model_ready_v2_player_features.csv).
    *   Trains two Random Forest Regressors for home and away scores.
    *   Evaluates direct vs derived margin/total targets.
    *   Saves [home_score_model_v2.pkl](file:///Users/serhat/agProjects/nbaModelApp/models/home_score_model_v2.pkl), [away_score_model_v2.pkl](file:///Users/serhat/agProjects/nbaModelApp/models/away_score_model_v2.pkl), and `score_model_v2_metadata.json` containing intervals.

---

### Step 7: Launch Application Stack
Run the startup script to load the models, backend, and dashboard:
```bash
./scripts/start_all.sh
```
*   **Action:** Launches the FastAPI ML service on port `8001`, the Java Spring Boot backend on port `8080`, and the Vite dev server.
