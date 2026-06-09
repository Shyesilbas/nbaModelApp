# Full Pipeline Truth Audit Master Report

## 1. Which 2024-25 files are genuinely 2024-25?
The following raw and processed schedule/boxscore files correctly contain 2024-25 data (GAME_IDs start with `00224` or `00424` and dates span 2024-10 to 2025-06):
- `data/raw/boxscores/player/nba_player_boxscores_2024_25.csv/.parquet`
- `data/raw/boxscores/team/nba_team_boxscores_2024_25.csv/.parquet`
- `data/raw/schedule/nba_schedule_2024_25.csv`
- `data/raw/schedule/nba_finals_upcoming_2024_25.csv`
- `data/raw/team_games/nba_team_games_2024_25_regular_and_playoffs.csv/.parquet`
- `data/processed/schedule_combined_2024_25.csv/.parquet`
- `data/experimental/team_games_features_2024_25.parquet`

## 2. Which 2024-25-labeled files are actually 2025-26 or invalid?
Many experimental and feature datasets labeled `2024_25` are completely invalid because they actually contain 2025-26 data (or are empty):
- `data/experimental/team_win_model_ready_v2_2024_25.csv` (INVALID: Contains 2025-26 data)
- `data/experimental/team_win_model_ready_v2_2024_25_clean.csv` (INVALID: Contains 2025-26 data)
- `data/experimental/team_score_model_ready_v2_2024_25.csv` (INVALID: 0 rows)
- `data/features/player_games_features_2024_25.csv/.parquet` (INVALID: Contains 2025-26 data)
- `data/features/team_games_features_2024_25.csv/.parquet` (INVALID: Contains 2025-26 data)
- `data/processed/win/win_dataset_all_games_2024_25_clean.csv` (INVALID: Contains 2025-26 data)
- `data/processed/win/win_dataset_postseason_2024_25_clean.csv` (INVALID: Contains 2025-26 data)
- `data/processed/win/win_dataset_regular_2024_25_clean.csv` (INVALID: Contains 2025-26 data)

## 3. Which win dataset is the current best candidate?
`data/production/team_win_model_ready_v2_player_features.csv`
- **Evidence**: It has the correct grain (Team-Game, 1758 rows, exactly 2 rows per GAME_ID, no player IDs). It is LEAKAGE SAFE.

## 4. Which score dataset is the current best candidate?
`data/production/team_score_model_ready_v2_player_features.csv`
- **Evidence**: It has the correct grain (Game-Level, 879 rows, exactly 1 row per GAME_ID, no player IDs). Leakage features are present but excluded from model inputs.

## 5. Is the current 2024-25 win dataset valid?
**INVALID**. The dataset labeled `2024_25` actually contains 2025-26 game IDs (`00225`, `00425`) and dates (`2025-10` to `2026-06`).

## 6. Is the current 2024-25 score dataset valid?
**INVALID**. The file `team_score_model_ready_v2_2024_25.csv` exists but has 0 rows. 

## 7. Is there confirmed leakage?
**LEAKAGE PRESENT BUT EXCLUDED**. 
- The score datasets contain outcome leakage columns (`TOTAL_POINTS`, `HOME_PTS`, `AWAY_PTS`, `POINT_DIFF`), but these are completely excluded from the actual feature lists passed to the model.
- Win datasets are fully LEAKAGE SAFE (0 leakage columns present).

## 8. Is schema parity achieved?
**NOT ACHIEVED**. We lack a valid 2024-25 model-ready dataset to compare against the 2025-26 production schemas.

## 9. Are roster features consistent?
**CONSISTENT**. Datasets like `team_win_model_ready_v2_player_features.csv` successfully contain all 38 expected `HOME_` and `AWAY_` roster features (e.g., `CORE_PLAYERS_AVAILABLE_COUNT`, `TOP3_EXPECTED_MIN_SUM`) with a 0.00% null rate.

## 10. Is cross-season merge allowed right now?
**BLOCKED**. You cannot merge datasets when the 2024-25 data is either empty or actually comprised of duplicate 2025-26 data due to path resolution errors.

## 11. If not, list the exact blockers in priority order.
1. **Hardcoded Path/Season Overrides**: Code in `scripts/data_paths.py`, `scripts/season_utils.py`, `main.py`, and `scripts/prepare_score_model.py` hardcodes `2025_26` fallback paths. This causes commands intended to generate 2024-25 features to implicitly read 2025-26 data and save it with a 2024-25 label.
2. **Missing 2024-25 Model-Ready Data**: We need to successfully generate valid, non-empty 2024-25 win and score datasets using the correct season's raw data.
3. **No Schema Parity Checks**: Until we have two valid datasets, we cannot confirm their schemas align exactly before a merge.

## 12. Give the smallest safe next action.
**Smallest Action**: Refactor `scripts/data_paths.py` and `scripts/season_utils.py` to remove any hardcoded `2025_26` fallbacks. They must strictly obey the `season` argument passed through the pipeline. 

---
### Final Master Verdict: **BLOCKED**
