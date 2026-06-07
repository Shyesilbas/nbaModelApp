# Cross-Season Readiness Report

This report evaluates the scalability and readiness of the current codebase and pipelines to ingest, engineer, and model multiple historical NBA seasons (5+ seasons) identically.

---

## 1. Readiness Classification by Stage

| Processing Stage | Readiness Status | Rationale | Required Work |
| :--- | :---: | :--- | :--- |
| **1. Data Ingestion** | **PARTIAL** | Core scaper logic can query historical API endpoints, but the pipeline lacks automatic season-parameter routing. | Add automated multi-season loops to the downloaders and refactor file names to include season identifiers. |
| **2. Cleaning & Sorting** | **READY** | Standardizing datetime formats and sorting records chronologically operates correctly regardless of dataset scope. | None. |
| **3. Base Feature Engineering** | **PARTIAL** | Rolling metrics (`PTS_LAST_5`, splits, H2H) use season-agnostic formulas. However, early-season games suffer from cold starts without access to the prior season's ending form. | Implement cross-season bridge files so rolling stats carry over across season boundaries (e.g. from 2024-25 ending form). |
| **4. Player Feature Integration** | **NOT READY** | Currently relies on a static, single-season file ([core_players.csv](file:///Users/serhat/agProjects/nbaModelApp/data/production/core_players.csv)). This is invalid historically as players get traded, drafted, or retire. | Implement a transaction-driven Roster Snapshot Generator to build historical rosters as of any game date. |
| **5. Model Training** | **PARTIAL** | Chronological train/test split works, but season-aware cv pipelines (rolling-origin cv) do not exist. | Write expanding-window CV scripts that train on seasons $1..S$ and evaluate on season $S+1$. |
| **6. Inference Flow** | **PARTIAL** | Central prediction scripts like [build_matchup_features.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/build_matchup_features.py) have a `--season` argument, but defaults still fall back to hardcoded 2025-26 paths. | Clean up hardcoded paths in the data path resolver [data_paths.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/data_paths.py). |

---

## 2. Ingestion & Roster Gap Details

The most significant architectural hurdle is player roster shifts. During the 2025-26 season, the top 5 "core" players are considered fixed. Across 5 seasons, however, players migrate franchises regularly.
To prevent future leakage, the roster generator must build a list of players as of prediction date `T` using only:
*   A transaction ledger: `data/raw/transactions.csv` containing trade and contract dates.
*   A rule: Roster at `T` = Roster at `T-1` + transactions effective before `T`.

---

## 3. Recommended Multi-Season Storage Schema
Transition from flat files named `*_2025_26.csv` to a structured partition pattern:
*   `data/raw/games/season=2024-25/games.parquet`
*   `data/raw/player_games/season=2024-25/player_games.parquet`
*   `data/features/team_features.parquet` containing a categorical `SEASON` column for indexing.
