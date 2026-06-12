# 2020-21 Season Data Ingestion and Bootstrap Guide

This document describes the end-to-end workflow to ingest, process, and bootstrap the 2020-21 NBA season. It details how the pipeline fetches the fixtures, box scores, trades, and core rosters dynamically and lists the exact commands to execute.

---

## 1. Do We Get Everything for 2020-21?

Yes. Thanks to the dynamic parameterization refactoring, the pipeline successfully retrieves and constructs all required features for past seasons like 2020-21 directly from the official NBA APIs. Below is a breakdown of what data is collected and how it is resolved:

1. **Fixtures / Schedules**: 
   - Dynamically requested via the `ScheduleLeagueV2` API endpoint for the `2020-21` season.
   - Automatically split and stored as `data/raw/schedule/nba_schedule_2020_21.csv` and `data/raw/schedule/nba_finals_upcoming_2020_21.csv`.
2. **Box Scores (Team and Player Game Logs)**:
   - Since no local files exist for `2020-21` in `data/raw/`, the ingestion service detects this and triggers bulk fetches using the `LeagueGameLog` API endpoint in both team (`T`) and player (`P`) modes.
   - Outputs are saved as `data/raw/team_games/nba_team_games_2020_21_regular_and_playoffs.csv` and `data/raw/player_games/nba_player_games_2020_21_regular_and_playoffs.csv`.
3. **Core Players / Ranks**:
   - Discovered dynamically by running the roster analysis pipeline on the downloaded player logs.
   - Ranks top 3 and top 5 players per team by calculating an Importance Score from their average minutes, points, assists, and rebounds.
   - Saves output directly to [core_players.csv](file:///Users/serhat/agProjects/nbaModelApp/data/production/core_players.csv) for use by downstream features and the microservice.
4. **Trades and Affiliations**:
   - Because the transaction feed scraper is a stub, the system uses stint-based observed player-team affiliations.
   - Chronological analysis of player logs determines which players played for which teams and when. If a trade occurred, start and end dates are resolved.
   - For seasons other than 2024-25, features fall back to the active `core_players.csv` layout.

---

## 2. Ingestion and Bootstrapping Command Flow

To successfully prepare the 2020-21 season from scratch, run the following commands in order:

### Step 1: Bulk Fetch Raw Data and Schedules
Fetch the league schedule and download all raw team and player game logs in bulk from the NBA API.
```bash
PYTHONPATH=. python3 main.py --season 2020-21 --update-data
```
* **What it does**: Hits the API, downloads schedules/logs, and saves them under the `2020_21` suffix.

### Step 2: Compute Core Rosters
Parse the newly downloaded player game logs to identify each team's core roster and rank players by importance.
```bash
PYTHONPATH=. python3 main.py --season 2020-21 --run-roster-analysis
```
* **What it does**: Saves ranked roster outputs under `data/analysis/` and automatically copies `core_players.csv` to `data/production/` and `data/canonical/`.

### Step 3: Extract Roster Affiliations (Observed Trades)
Extract stints and trade events from chronological player records.
```bash
PYTHONPATH=. python3 scripts/ingest/build_observed_affiliation_events.py --season 2020-21
```
* **What it does**: Analyzes player logs to generate `data/experimental/observed_affiliation_events_2020_21.csv`.

### Step 4: Run Roster Snapshotting and Daily Metrics
Assemble the daily rosters and verify their structural integrity.
```bash
PYTHONPATH=. python3 scripts/ingest/roster_snapshot_generator.py
```

### Step 5: Run Roster & Ingestion Audit Checks
Verify that the generated datasets are structured correctly and adhere to boundaries.
```bash
PYTHONPATH=. python3 scripts/audit/validate_project_structure.py
PYTHONPATH=. python3 scripts/audit/validate_season_path_refactor.py
```

### Step 6: Bootstrap Season Features and Manifest
Execute feature engineering, opponent matchup joins, and generate a final training-ready dataset.
```bash
PYTHONPATH=. python3 main.py --season 2020-21 --bootstrap-season
```
* **What it does**: 
  - Syncs rolling features (`team_games_features_2020_21.csv`).
  - Performs opponent-aware feature joins.
  - Cleans NaN values and outputs `data/processed/team_model_ready_v2_2020_21.csv`.
  - Writes the final build description to `data/manifests/season_2020_21_manifest.json`.

---

## 3. Key Outputs to Validate

Once the steps are complete, confirm the presence and sanity of the following files:

- **Raw Files**:
  - `data/raw/schedule/nba_schedule_2020_21.csv`
  - `data/raw/team_games/nba_team_games_2020_21_regular_and_playoffs.csv`
  - `data/raw/player_games/nba_player_games_2020_21_regular_and_playoffs.csv`
- **Processed Files**:
  - `data/processed/game_results_2020_21.csv` (matchup score summaries)
  - `data/processed/team_model_ready_v2_2020_21.csv` (the training dataset)
- **Rosters**:
  - `data/production/core_players.csv` (updated with 2020-21 ranks)
  - `data/experimental/observed_affiliation_events_2020_21.csv` (inferred stints/trades)
- **Manifest**:
  - `data/manifests/season_2020_21_manifest.json` (summarizes all outputs)
