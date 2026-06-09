
# Win Dataset Analysis Report: Grain, Scope, and Features

## 1. Grain Status Confirmation

- **Total Rows**: 2636
- **Unique GAME_ID**: 1318
- **Unique TEAM_ID**: 30
- **Unique GAME_ID + TEAM_ID**: 2636
- **Duplicate Team-Game Rows**: 0

**Conclusion**: 
This dataset is officially verified as **Team-Game Grain**. There are no duplicate rows per team per game. This is NOT a player-level grain bug.

## 2. Row Count and Season Scope

**Expected vs Actual**:
Expected regular season rows: 2460
Actual dataset rows: 2636

**GAME_ID Prefix Distribution**:
{'002': 2460, '004': 164, '005': 12}
*(Key: 001=Preseason, 002=Regular Season, 003=All-Star, 004=Playoffs, 005=Play-In)*

**SEASON_TYPE Distribution**:
{'Regular Season': 2460, 'Playoffs': 162, 'PlayIn': 12, 'NBA Finals': 2}

**Explanation**: 
The dataset has 2636 rows instead of 2460 because it likely contains playoff (004) or play-in (005) games, in addition to regular season (002).

**Recommendation**: 
We recommend option (c): **Create separate datasets for regular season and playoffs**. The pacing, minutes, and strategies change significantly between regular season and playoffs, and regular season data alone is cleaner to use as a baseline for predictive models without introducing playoff-specific variance.

## 3. Feature Mapping

**Target Column**:
['WIN']

**Leakage Columns (MUST DROP from Model Features)**:
These are post-game box score stats that will leak the result of the game if included in X during training.
['WL', 'PTS', 'PLUS_MINUS', 'REB', 'AST', 'STL', 'BLK', 'TOV', 'PF', 'FGM', 'FGA', 'FG_PCT', 'FG3M', 'FG3A', 'FG3_PCT', 'FTM', 'FTA', 'FT_PCT', 'OREB', 'DREB', 'MIN']

**Metadata Columns (Safe to keep in dataframe, exclude from X)**:
['GAME_ID', 'TEAM_ID', 'TEAM_ABBREVIATION', 'TEAM_NAME', 'MATCHUP', 'GAME_DATE', 'SEASON_ID', 'SEASON_TYPE']

**Safe Pre-Game Features**:
These are roster aggregates or pre-game knowledge. Safe for model training.
['IS_HOME', 'OPPONENT_ABBREVIATION', 'IS_PLAYOFF', 'DAYS_REST', 'IS_B2B', 'PTS_LAST_5', 'PTS_LAST_10', 'WINRATE_LAST_5', 'WINRATE_LAST_10', 'PTS_ALLOWED', 'PTS_ALLOWED_LAST_5', 'PTS_ALLOWED_LAST_10', 'HOME_WINRATE_LAST_5', 'HOME_PTS_LAST_5', 'HOME_PTS_ALLOWED_LAST_5', 'AWAY_WINRATE_LAST_5', 'AWAY_PTS_LAST_5', 'AWAY_PTS_ALLOWED_LAST_5', 'H2H_GAMES_LAST_5', 'H2H_WINRATE_LAST_5', 'H2H_PTS_LAST_5', 'H2H_PTS_ALLOWED_LAST_5', 'HOME_CORE_PLAYERS_AVAILABLE_COUNT', 'HOME_CORE_PLAYERS_MISSING_COUNT', 'HOME_TOP1_AVAILABLE', 'HOME_TOP2_AVAILABLE', 'HOME_TOP3_AVAILABLE', 'HOME_CORE_EXPECTED_MIN_SUM', 'HOME_TOP3_EXPECTED_MIN_SUM', 'HOME_CORE_MINUTES_SHARE', 'HOME_CORE_EXPECTED_PTS_SUM', 'HOME_CORE_EXPECTED_AST_SUM', 'HOME_CORE_EXPECTED_REB_SUM', 'HOME_CORE_EXPECTED_PRA_SUM', 'HOME_TOP3_EXPECTED_PTS_SUM', 'HOME_TOP3_EXPECTED_AST_SUM', 'HOME_TOP3_EXPECTED_REB_SUM', 'HOME_TOP3_EXPECTED_PRA_SUM', 'HOME_MISSING_CORE_EXPECTED_MIN', 'HOME_MISSING_CORE_EXPECTED_PTS', 'HOME_MISSING_CORE_EXPECTED_AST', 'HOME_MISSING_CORE_EXPECTED_REB', 'HOME_MISSING_CORE_EXPECTED_PRA', 'AWAY_CORE_PLAYERS_AVAILABLE_COUNT', 'AWAY_CORE_PLAYERS_MISSING_COUNT', 'AWAY_TOP1_AVAILABLE', 'AWAY_TOP2_AVAILABLE', 'AWAY_TOP3_AVAILABLE', 'AWAY_CORE_EXPECTED_MIN_SUM', 'AWAY_TOP3_EXPECTED_MIN_SUM', 'AWAY_CORE_MINUTES_SHARE', 'AWAY_CORE_EXPECTED_PTS_SUM', 'AWAY_CORE_EXPECTED_AST_SUM', 'AWAY_CORE_EXPECTED_REB_SUM', 'AWAY_CORE_EXPECTED_PRA_SUM', 'AWAY_TOP3_EXPECTED_PTS_SUM', 'AWAY_TOP3_EXPECTED_AST_SUM', 'AWAY_TOP3_EXPECTED_REB_SUM', 'AWAY_TOP3_EXPECTED_PRA_SUM', 'AWAY_MISSING_CORE_EXPECTED_MIN', 'AWAY_MISSING_CORE_EXPECTED_PTS', 'AWAY_MISSING_CORE_EXPECTED_AST', 'AWAY_MISSING_CORE_EXPECTED_REB', 'AWAY_MISSING_CORE_EXPECTED_PRA']
