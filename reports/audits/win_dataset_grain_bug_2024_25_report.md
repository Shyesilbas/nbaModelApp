# Win Dataset Grain Bug 2024-25 Report

## 1. Audit of `data/experimental/team_win_model_ready_v2_2024_25.csv`

- **Row Count**: 2636
- **Unique GAME_ID Count**: 1318
- **Rows per GAME_ID Distribution**: The dataset does not have exactly 2 rows per GAME_ID.
- **`PLAYER_ID` / `PLAYER_NAME` Columns**: Not present.
- **Row Representation**: Each row represents a team-game.
- **Aggregate Roster/Player Columns**: Present.
- **Conclusion**: The dataset is at the team-game level. The initial bug report's claim of player-level columns was incorrect. The primary issue is the row count and the fact that there are not exactly 2 rows per game. This is a data integrity issue that needs to be resolved. The problem is likely in the `_apply_gameid_remap_if_needed` function in `scripts/train_win_probability_v2.py` which is causing this discrepancy.
