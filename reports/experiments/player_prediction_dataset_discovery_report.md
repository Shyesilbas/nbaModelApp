# Player Prediction Dataset Discovery Report

## Audit Context
- **Objective:** Determine the feasibility of predicting individual player statistics (PTS, REB, AST, PRA).
- **Constraints:** Do not touch production files. Use only pre-game data to avoid leakage.

## Discovery Audit Answers

1. **Which player-level files exist?**
   - Raw: `nba_player_games_2024_25_regular_and_playoffs.csv`, `nba_player_games_2025_26_regular_and_playoffs.csv`
   - Features: `player_games_features_2024_25.csv`, `player_games_features_2025_26.csv` (Note: The `2024_25` file in `data/features/` contained `22025` data. The true 2024-25 feature file is under `data/experimental/`).
   - Production/Registry: `core_players.csv`, `player_registry_2024_25.csv`

2. **Which seasons are available?**
   - 2024-25 and 2025-26.

3. **Row counts per season.**
   - 2024-25: ~28,240 rows
   - 2025-26: ~27,943 rows

4. **Do player rows contain the expected base stats?**
   - Yes: `Player_ID`, `PLAYER_NAME`, `MATCHUP`, `Game_ID`/`GAME_ID`, `GAME_DATE`, `MIN`, `PTS`, `REB`, `AST`.

5. **Are 2024-25 and 2025-26 player GAME_IDs standardized?**
   - No. Some were 10-digit zero-padded strings, others were integers (where leading zeros were dropped). A standardization step (`.zfill(10)`) was required during dataset building.

6. **Are there existing rolling player features?**
   - Yes: `PTS_LAST_5`, `PTS_LAST_10`, `MIN_LAST_5`, `REB_LAST_5`, `AST_LAST_5`, `PLUS_MINUS_LAST_5`.

7. **Are rolling features leakage-free with shift(1)?**
   - Yes, inspecting `src/features/player_features.py` confirms that `.shift(1)` is explicitly applied prior to rolling averages.

8. **Are traded players handled correctly?**
   - Yes. Rolling logic groups purely by `Player_ID` and sorts by chronological `GAME_DATE`.

9. **Which file should be canonical input for player prediction?**
   - We selected the pre-computed `player_games_features_YYYY_YY.csv` (using the correct experimental paths for 2024-25) as the canonical input, to inherit the safe rolling features and match context.

## Conclusion
Player stat prediction is highly feasible given the current structured and leakage-free features.
