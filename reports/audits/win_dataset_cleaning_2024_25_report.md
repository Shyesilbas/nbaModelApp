# Win Dataset Cleaning & Validation Report (2024-25)

## 1. Input Dataset Profile

- **Shape**: (2636, 95)
- **Season Distribution**:
SEASON_TYPE
Regular Season    2460
Playoffs           162
PlayIn              12
NBA Finals           2
- **GAME_ID Prefix Distribution**:
GAME_ID_PREFIX
002    2460
004     164
005      12
## 2. Initial Grain Status
- **Status**: ✅ PASSED
- **Rows**: 2636
- **Unique GAME_ID**: 1318
- **Unique TEAM_ID**: 30
- **Unique GAME_ID + TEAM_ID**: 2636

## 3. Column Management

- **Dropped Leakage Columns**: ['WL', 'MIN', 'PTS', 'FGM', 'FGA', 'FG_PCT', 'FG3M', 'FG3A', 'FG3_PCT', 'FTM', 'FTA', 'FT_PCT', 'OREB', 'DREB', 'REB', 'AST', 'STL', 'BLK', 'TOV', 'PF', 'PLUS_MINUS']
- **Metadata Columns**: ['SEASON_ID', 'TEAM_ID', 'TEAM_ABBREVIATION', 'TEAM_NAME', 'GAME_ID', 'GAME_DATE', 'MATCHUP', 'SEASON_TYPE', 'OPPONENT_ABBREVIATION']
- **Target Column**: WIN
- **Feature Columns**: ['IS_HOME', 'IS_PLAYOFF', 'DAYS_REST', 'IS_B2B', 'PTS_LAST_5', 'PTS_LAST_10', 'WINRATE_LAST_5', 'WINRATE_LAST_10', 'PTS_ALLOWED', 'PTS_ALLOWED_LAST_5', 'PTS_ALLOWED_LAST_10', 'HOME_WINRATE_LAST_5', 'HOME_PTS_LAST_5', 'HOME_PTS_ALLOWED_LAST_5', 'AWAY_WINRATE_LAST_5', 'AWAY_PTS_LAST_5', 'AWAY_PTS_ALLOWED_LAST_5', 'H2H_GAMES_LAST_5', 'H2H_WINRATE_LAST_5', 'H2H_PTS_LAST_5', 'H2H_PTS_ALLOWED_LAST_5', 'HOME_CORE_PLAYERS_AVAILABLE_COUNT', 'HOME_CORE_PLAYERS_MISSING_COUNT', 'HOME_TOP1_AVAILABLE', 'HOME_TOP2_AVAILABLE', 'HOME_TOP3_AVAILABLE', 'HOME_CORE_EXPECTED_MIN_SUM', 'HOME_TOP3_EXPECTED_MIN_SUM', 'HOME_CORE_MINUTES_SHARE', 'HOME_CORE_EXPECTED_PTS_SUM', 'HOME_CORE_EXPECTED_AST_SUM', 'HOME_CORE_EXPECTED_REB_SUM', 'HOME_CORE_EXPECTED_PRA_SUM', 'HOME_TOP3_EXPECTED_PTS_SUM', 'HOME_TOP3_EXPECTED_AST_SUM', 'HOME_TOP3_EXPECTED_REB_SUM', 'HOME_TOP3_EXPECTED_PRA_SUM', 'HOME_MISSING_CORE_EXPECTED_MIN', 'HOME_MISSING_CORE_EXPECTED_PTS', 'HOME_MISSING_CORE_EXPECTED_AST', 'HOME_MISSING_CORE_EXPECTED_REB', 'HOME_MISSING_CORE_EXPECTED_PRA', 'AWAY_CORE_PLAYERS_AVAILABLE_COUNT', 'AWAY_CORE_PLAYERS_MISSING_COUNT', 'AWAY_TOP1_AVAILABLE', 'AWAY_TOP2_AVAILABLE', 'AWAY_TOP3_AVAILABLE', 'AWAY_CORE_EXPECTED_MIN_SUM', 'AWAY_TOP3_EXPECTED_MIN_SUM', 'AWAY_CORE_MINUTES_SHARE', 'AWAY_CORE_EXPECTED_PTS_SUM', 'AWAY_CORE_EXPECTED_AST_SUM', 'AWAY_CORE_EXPECTED_REB_SUM', 'AWAY_CORE_EXPECTED_PRA_SUM', 'AWAY_TOP3_EXPECTED_PTS_SUM', 'AWAY_TOP3_EXPECTED_AST_SUM', 'AWAY_TOP3_EXPECTED_REB_SUM', 'AWAY_TOP3_EXPECTED_PRA_SUM', 'AWAY_MISSING_CORE_EXPECTED_MIN', 'AWAY_MISSING_CORE_EXPECTED_PTS', 'AWAY_MISSING_CORE_EXPECTED_AST', 'AWAY_MISSING_CORE_EXPECTED_REB', 'AWAY_MISSING_CORE_EXPECTED_PRA']

## 4. Output Files & Validation

**Regular**

- **File**: `data/processed/win/win_dataset_regular_2024_25_clean.csv`
- **Rows**: 2460
- **JSON**: `data/processed/win/win_dataset_regular_2024_25_clean.json`
### Validation for: `regular`

**Result**: ✅ PASSED

**Postseason**

- **File**: `data/processed/win/win_dataset_postseason_2024_25_clean.csv`
- **Rows**: 176
- **JSON**: `data/processed/win/win_dataset_postseason_2024_25_clean.json`
### Validation for: `postseason`

**Result**: ✅ PASSED

**All Games**

- **File**: `data/processed/win/win_dataset_all_games_2024_25_clean.csv`
- **Rows**: 2636
- **JSON**: `data/processed/win/win_dataset_all_games_2024_25_clean.json`
### Validation for: `all_games`

**Result**: ✅ PASSED


## 5. Final Decision

**SAFE TO PROCEED TO CROSS-SEASON MERGE ONLY AFTER USING CLEANED OUTPUTS**