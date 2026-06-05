# NBA Machine Learning Project: Preprocessing & Feature Engineering

This repository contains a clean, professional, and modular Python structure for loading, validating, cleaning, and engineering features from NBA game log data.

## Project Goal
The target is to build an end-to-end Machine Learning pipeline using real NBA data to predict game outcomes and player performances. This phase implements the foundation: directory structure, data loading, basic data validation, date cleaning, and robust feature engineering.

> [!WARNING]
> **Model Training is Intentionally Not Implemented Yet.**
> This codebase currently focuses entirely on data processing and feature engineering to ensure high-quality, leakage-free datasets before training any predictive models.

---

## Current Dataset State
The project is designed to process the following datasets from the 2025-26 NBA Regular Season and Playoffs:

1. **Team Game Logs** (`nba_team_games_2025_26_regular_and_playoffs.csv`):
   - **Records**: 2622 rows (2460 Regular Season, 162 Playoffs)
   - **Columns**: 29 columns including `SEASON_ID`, `TEAM_ID`, `MATCHUP`, `WL`, `PTS`, `SEASON_TYPE`, and base stats.
   
2. **Player Game Logs** (`nba_player_games_2025_26_regular_and_playoffs.csv`):
   - **Records**: 27757 rows (25923 Regular Season, 1834 Playoffs)
   - **Columns**: 29 columns including `Player_ID`, `Game_ID`, `GAME_DATE`, `MATCHUP`, `WL`, `PTS`, `MIN`, `REB`, `AST`, `PLUS_MINUS`, and `PLAYER_NAME`.

---

## Folder Structure
```
nba-ml-project/
├── data/
│   ├── raw/
│   │   ├── team_games/
│   │   │   └── (Place raw team games CSV here)
│   │   └── player_games/
│   │       └── (Place raw player games CSV here)
│   ├── processed/
│   │   ├── team_model_ready_2025_26.csv/.parquet     # V1 Dataset
│   │   ├── team_model_ready_v2_2025_26.csv/.parquet  # V2 Opponent-Aware
│   │   └── team_model_ready_v3_2025_26.csv/.parquet  # V3 Core Availability
│   ├── features/
│   │   ├── team_games_features_2025_26.csv/.parquet
│   │   └── player_games_features_2025_26.csv/.parquet
│   └── analysis/
│       ├── team_rosters.csv/.parquet                 # Structured rosters
│       ├── core_players.csv/.parquet                 # Core/secondary groups
│       ├── star_candidates.csv/.parquet              # Star rankings
│       ├── multi_team_players.csv/.parquet           # Traded players
│       └── player_name_lookup.csv/.parquet           # Normalized lookup
├── notebooks/
├── src/
│   ├── ingestion/
│   │   └── data_loader.py
│   ├── processing/
│   │   ├── validation.py
│   │   ├── cleaning.py
│   │   ├── mock_generator.py
│   │   └── model_dataset_builder.py
│   ├── features/
│   │   ├── team_features.py
│   │   ├── player_features.py
│   │   ├── opponent_features.py
│   │   └── core_player_availability_features.py
│   ├── analysis/
│   │   └── roster_analysis.py
│   ├── training/
│   └── evaluation/
├── models/
├── outputs/
│   ├── analysis/             # Active human-readable reports
│   │   ├── team_roster_report.md
│   │   ├── core_player_report.md
│   │   ├── star_player_candidates.md
│   │   └── team_model_ready_v3_report.md
│   ├── archive/              # Deprecated and older reports/outputs
│   │   ├── old_reports/
│   │   └── deprecated_outputs/
│   └── README.md             # Explains outputs layout
├── requirements.txt
├── README.md
└── .gitignore
```

---

## Engineered Features

### Team-Level Features
- **`IS_HOME`**: Derived from `MATCHUP` (`True` if matchup contains "vs.", `False` if "@").
- **`OPPONENT_ABBREVIATION`**: Extracted from the end of the `MATCHUP` text.
- **`IS_PLAYOFF`**: Evaluates whether the game belongs to the playoffs based on `SEASON_TYPE`.
- **`WIN`**: Binary indicator (`1` if `WL == "W"`, else `0`).
- **`DAYS_REST`**: The difference in days since the team's previous game.
- **`IS_B2B`**: `True` if `DAYS_REST == 1` (back-to-back game).
- **`PTS_LAST_5` / `PTS_LAST_10`**: Rolling average points scored in the team's previous 5/10 games.
- **`WINRATE_LAST_5` / `WINRATE_LAST_10`**: Rolling win-rate over the team's previous 5/10 games.

### Player-Level Features
- **`IS_HOME`**, **`OPPONENT_ABBREVIATION`**, **`IS_PLAYOFF`**, **`WIN`**
- **`DAYS_REST`**: Rest days since the player's previous game log.
- **`IS_B2B`**: `True` if player rest is exactly 1 day.
- **`PTS_LAST_5` / `PTS_LAST_10`**: Rolling average points scored in the player's previous 5/10 games.
- **`MIN_LAST_5`**: Rolling average of minutes played.
- **`REB_LAST_5`**: Rolling average of total rebounds.
- **`AST_LAST_5`**: Rolling average of assists.
- **`PLUS_MINUS_LAST_5`**: Rolling average of plus-minus.

> [!IMPORTANT]
> **No Data Leakage**: All rolling features are grouped by the respective entity (Team or Player), sorted chronologically, and explicitly shifted using `.shift(1)` so that the current game's statistics are never included in the rolling averages.

---

## Getting Started

### 1. Installation
Install the project dependencies (minimal package footprint):
```bash
pip install -r requirements.txt
```

### 2. Prepare Data
Put your downloaded CSV logs into the raw folders:
- Team logs: `data/raw/team_games/nba_team_games_2025_26_regular_and_playoffs.csv`
- Player logs: `data/raw/player_games/nba_player_games_2025_26_regular_and_playoffs.csv`

### 3. Run Pipeline
To run the full validation and feature engineering pipeline on your files, execute:
```bash
python main.py
```

### 4. Run Roster & Importance Discovery Analysis
To run roster discovery, automatic core player detection, and league-wide star candidates rankings, run:
```bash
python main.py --run-roster-analysis
```
This discovers player groupings dynamically, saves structured datasets to `data/analysis/` in CSV and Parquet, and writes human-readable markdown reports to `outputs/analysis/`.

### 5. Build Model-Ready Datasets (V1, V2, V3)
To compile the pre-game prediction datasets with scheduling, rolling, and core player availability features:
*   **Build V1 & V2 datasets**:
    ```bash
    python main.py --build-model-dataset
    ```
*   **Build V3 dataset (Core Availability Aware)**:
    ```bash
    python main.py --build-v3-dataset
    ```
This saves datasets under `data/processed/` and exports validation logs and warnings inside the `outputs/` folder structure.

### 6. Running with Synthetic/Mock Data (Testing)
If you do not have the CSV datasets on your machine yet, you can test the pipeline end-to-end using synthetic data logs. The script will automatically trigger mock generation if the directories are empty, or you can force it using:
```bash
python main.py --mock
```
This generates mock data, validates it, runs all features, and saves output files to `data/features/`.

### 7. Running the NBA Intelligence Lab Dashboard
We built a premium, dark-mode React analytics dashboard to explore the generated team rosters, core players, star candidates, and dataset health metrics prior to training our ML models.

To run the dashboard:
1. **Export the datasets to JSON**:
   ```bash
   python3 scripts/export_frontend_data.py
   ```
2. **Navigate to the frontend folder and start Vite**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
3. Open [http://localhost:5173](http://localhost:5173) in your web browser.

