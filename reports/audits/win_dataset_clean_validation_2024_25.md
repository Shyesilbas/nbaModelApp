# Win Dataset Clean Validation Report (2024-25)

## 1. Audit of `clean_win_dataset_2024_25.py`

An audit of [clean_win_dataset_2024_25.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/data_processing/clean_win_dataset_2024_25.py) confirms the following:
* **Columns Removed**:
  * **21 Leakage Columns**: `WL`, `MIN`, `PTS`, `FGM`, `FGA`, `FG_PCT`, `FG3M`, `FG3A`, `FG3_PCT`, `FTM`, `FTA`, `FT_PCT`, `OREB`, `DREB`, `REB`, `AST`, `STL`, `BLK`, `TOV`, `PF`, and `PLUS_MINUS`.
  * **5 Forbidden Player Columns**: `PLAYER_ID`, `PLAYER_NAME`, `IS_CORE`, `EXPECTED_POINTS`, and `EXPECTED_PRA` (if present).
* **WIN Target Preservation**: The target column `WIN` is preserved and explicitly included in the output schema.
* **Leakage Verification**: All 21 current-game boxscore leakage columns are successfully excluded from the final selection.

---

## 2. Experimental Clean Win Dataset

* **Output Path**: [team_win_model_ready_v2_2024_25_clean.csv](file:///Users/serhat/agProjects/nbaModelApp/data/experimental/team_win_model_ready_v2_2024_25_clean.csv)
* **Row Count**: 2,460 rows (exactly 1,230 games × 2 teams per game).
* **Roster Features**: Preserved (e.g., `HOME_CORE_PLAYERS_AVAILABLE_COUNT`, `AWAY_TOP1_AVAILABLE`, etc.).
* **Rolling Features**: Preserved (e.g., `PTS_LAST_5`, `WINRATE_LAST_10`, etc.).
* **Leakage Columns**: All 21 leakage columns have been removed.

---

## 3. Schema Comparison

We compared the clean experimental dataset schema against the production schema in [team_win_model_ready_v2_player_features.csv](file:///Users/serhat/agProjects/nbaModelApp/data/production/team_win_model_ready_v2_player_features.csv).

### Missing Columns in Clean Experimental (Present in Production)
There are **18 missing columns** in the clean experimental dataset, all of which are opponent-specific rolling features (`OPP_*` columns):
1. `OPP_AWAY_PTS_ALLOWED_LAST_5`
2. `OPP_AWAY_PTS_LAST_5`
3. `OPP_AWAY_WINRATE_LAST_5`
4. `OPP_DAYS_REST`
5. `OPP_H2H_GAMES_LAST_5`
6. `OPP_H2H_PTS_ALLOWED_LAST_5`
7. `OPP_H2H_PTS_LAST_5`
8. `OPP_H2H_WINRATE_LAST_5`
9. `OPP_HOME_PTS_ALLOWED_LAST_5`
10. `OPP_HOME_PTS_LAST_5`
11. `OPP_HOME_WINRATE_LAST_5`
12. `OPP_IS_B2B`
13. `OPP_PTS_ALLOWED_LAST_10`
14. `OPP_PTS_ALLOWED_LAST_5`
15. `OPP_PTS_LAST_10`
16. `OPP_PTS_LAST_5`
17. `OPP_WINRATE_LAST_10`
18. `OPP_WINRATE_LAST_5`

### Extra Columns in Clean Experimental (Not in Production)
There are **3 extra columns** in the clean experimental dataset:
1. `PTS_ALLOWED` (Target leakage: represents opponent's current game score)
2. `SEASON_ID` (Metadata)
3. `SEASON_TYPE` (Metadata)

### Columns Requiring Mapping / Transformation
To align the clean experimental dataset with the production schema:
1. **Drop Extra Columns**: `PTS_ALLOWED` (must be dropped as it is current-game target leakage), `SEASON_ID`, and `SEASON_TYPE`.
2. **Construct Opponent Features**: Use a self-merge on `GAME_ID` (where `TEAM_ID != TEAM_ID_opp`) to map the opponent team's rolling features into the 18 `OPP_*` features.
3. **Reorder Columns**: Align the final column order to match the production dataset column sequence.

---

## 4. Final Verification Summary

* **Clean Dataset Row Count**: 2,460
* **Leakage Removed?**: Yes (all 21 boxscore outcome columns and `PTS_ALLOWED` are removed/flagged).
* **Schema Parity Achieved?**: No (requires opponent self-merge to build `OPP_*` columns and dropping extra metadata/leakage columns).
* **Ready for Cross-Season Merge?**: No (must apply the opponent mapping step first to establish identical schemas).
