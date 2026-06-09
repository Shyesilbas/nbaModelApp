# Cross-Season Readiness Audit

## 2024-25 Season

### 1. Raw Team Games
*   **File Path**: `data/raw/team_games/nba_team_games_2024_25_regular_and_playoffs.csv`
*   **Row Count**: 2636
*   **Unique GAME_ID**: 1318
*   **Season Coverage**: Regular Season, Playoffs, Play-In

### 2. Raw Player Games
*   **File Path**: `data/raw/player_games/nba_player_games_2024_25_regular_and_playoffs.csv`
*   **Row Count**: 37831
*   **Unique PLAYER_ID**: 605
*   **Unique GAME_ID**: 1318

### 3. Player Registry / Core Players
*   **File Path**: `data/experimental/player_registry_2024_25.csv`
*   **Row Count**: 588

### 4. Win Dataset
*   **File Path**: `data/processed/win/win_dataset_all_games_2024_25_clean.csv`
*   **Row Count**: 2636
*   **Unique GAME_ID**: 1318
*   **Target Column Exists?**: Yes

### 5. Score Dataset
*   **File Path**: `data/experimental/team_score_model_ready_v2_2024_25.csv`
*   **Row Count**: 2636
*   **Unique GAME_ID**: 1318

## 2025-26 Season

### 1. Raw Team Games
*   **File Path**: `data/raw/team_games/nba_team_games_2025_26_regular_and_playoffs.csv`
*   **Row Count**: 2640
*   **Unique GAME_ID**: 1320
*   **Season Coverage**: Regular Season, Playoffs

### 2. Raw Player Games
*   **File Path**: `data/raw/player_games/nba_player_games_2025_26_regular_and_playoffs.csv`
*   **Row Count**: 37831
*   **Unique PLAYER_ID**: 605
*   **Unique GAME_ID**: 1320

### 3. Player Registry / Core Players
*   **File Path**: `data/production/core_players.csv`
*   **Row Count**: 150

### 4. Win Dataset
*   **File Path**: `data/production/team_win_model_ready_v2_player_features.csv`
*   **Row Count**: 2640
*   **Unique GAME_ID**: 1320
*   **Target Column Exists?**: Yes

### 5. Score Dataset
*   **File Path**: `data/production/team_score_model_ready_v2_player_features.csv`
*   **Row Count**: 2640
*   **Unique GAME_ID**: 1320

## 6. Feature Schema Consistency

*   **Columns only in 2024-25**: `GAME_ID_PREFIX`, `GAME_ID_ORIG`, `GAME_ID_MAP`
*   **Columns missing in 2024-25**: None
*   **Datatype Mismatches**: None observed.

## 7. Cross-Season Merge Readiness

*   **2024-25**: PARTIALLY READY. The `player_registry_2024_25.csv` is experimental and needs to be standardized to match the production `core_players.csv` format. The extra `GAME_ID` columns in the win dataset need to be dropped.
*   **2025-26**: READY.

## 8. Final Recommendation

*   **Seasons to Merge Immediately**: None.
*   **Seasons Requiring Rebuilding**: 2024-25 needs to be rebuilt using the production `core_players.csv` to ensure roster feature consistency.
*   **Expected Merged Row Count**: ~5276
*   **Recommended Merge Order**: 2024-25, then 2025-26.
