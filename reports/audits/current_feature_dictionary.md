# Current Feature Dictionary — 2025-26 Season

This dictionary documents the features used in **Win Model V1**, **Win Model V2**, and **Score Model V2**.

---

## 1. Team-Level Base Features

### IS_HOME
*   **Source:** Raw matchup string in team logs.
*   **Formula:** `1 if 'vs.' in MATCHUP else 0`
*   **Created in:** [team_features.py](file:///Users/serhat/agProjects/nbaModelApp/src/features/team_features.py)
*   **Used by:** Win Model V1, Win Model V2.
*   **Dependency Chain:** `nba_team_games.csv` ➡️ `build_team_features`

### DAYS_REST
*   **Source:** `GAME_DATE` in team logs.
*   **Formula:** `(current_game_date - last_game_date).days` (clipped/filled for first game).
*   **Created in:** [team_features.py](file:///Users/serhat/agProjects/nbaModelApp/src/features/team_features.py)
*   **Used by:** Win Model V1, Win Model V2, Score Model V2.
*   **Dependency Chain:** `nba_team_games.csv` ➡️ `build_team_features`

### IS_B2B
*   **Source:** `DAYS_REST`.
*   **Formula:** `1 if DAYS_REST == 1 else 0`
*   **Created in:** [team_features.py](file:///Users/serhat/agProjects/nbaModelApp/src/features/team_features.py)
*   **Used by:** Win Model V1, Win Model V2, Score Model V2.
*   **Dependency Chain:** `nba_team_games.csv` ➡️ `build_team_features`

---

## 2. Team Rolling Form Features

### PTS_LAST_5 / PTS_LAST_10
*   **Source:** `PTS` column in team logs.
*   **Formula:** `df['PTS'].shift(1).rolling(W).mean()` where `W` in `[5, 10]`.
*   **Created in:** [team_features.py](file:///Users/serhat/agProjects/nbaModelApp/src/features/team_features.py)
*   **Used by:** Win Model V1, Win Model V2, Score Model V2.
*   **Dependency Chain:** `nba_team_games.csv` ➡️ `build_team_features`

### WINRATE_LAST_5 / WINRATE_LAST_10
*   **Source:** `WL` column (Win/Loss indicator) in team logs.
*   **Formula:** `df['WL'].map({'W': 1, 'L': 0}).shift(1).rolling(W).mean()` where `W` in `[5, 10]`.
*   **Created in:** [team_features.py](file:///Users/serhat/agProjects/nbaModelApp/src/features/team_features.py)
*   **Used by:** Win Model V1, Win Model V2, Score Model V2.
*   **Dependency Chain:** `nba_team_games.csv` ➡️ `build_team_features`

### PTS_ALLOWED_LAST_5 / PTS_ALLOWED_LAST_10
*   **Source:** Symmetrical match opponent score.
*   **Formula:** Opponent actual points scored, shifted by 1 game: `df['OPP_PTS'].shift(1).rolling(W).mean()` where `W` in `[5, 10]`.
*   **Created in:** [team_features.py](file:///Users/serhat/agProjects/nbaModelApp/src/features/team_features.py)
*   **Used by:** Win Model V1, Win Model V2, Score Model V2.
*   **Dependency Chain:** `nba_team_games.csv` ➡️ `build_team_features`

---

## 3. Home / Away Split Features

### HOME_WINRATE_LAST_5 / HOME_PTS_LAST_5 / HOME_PTS_ALLOWED_LAST_5
*   **Source:** Chronological subsets where `IS_HOME == 1`.
*   **Formula:** `df[df['IS_HOME'] == 1][COL].shift(1).rolling(5).mean()`, followed by team-level chronological forward-fill `ffill()`.
*   **Created in:** [team_features.py](file:///Users/serhat/agProjects/nbaModelApp/src/features/team_features.py)
*   **Used by:** Win Model V1, Win Model V2, Score Model V2.
*   **Dependency Chain:** `nba_team_games.csv` ➡️ `build_team_features`

### AWAY_WINRATE_LAST_5 / AWAY_PTS_LAST_5 / AWAY_PTS_ALLOWED_LAST_5
*   **Source:** Chronological subsets where `IS_HOME == 0`.
*   **Formula:** `df[df['IS_HOME'] == 0][COL].shift(1).rolling(5).mean()`, followed by team-level chronological forward-fill `ffill()`.
*   **Created in:** [team_features.py](file:///Users/serhat/agProjects/nbaModelApp/src/features/team_features.py)
*   **Used by:** Win Model V1, Win Model V2, Score Model V2.
*   **Dependency Chain:** `nba_team_games.csv` ➡️ `build_team_features`

---

## 4. Head-to-Head (H2H) Franchise Features

### H2H_GAMES_LAST_5
*   **Source:** Chronological subset of games between same two franchises.
*   **Formula:** Count of historical matchups: `df_h2h.shift(1).rolling(5).count()` (returns actual count, capped at 5).
*   **Created in:** [team_features.py](file:///Users/serhat/agProjects/nbaModelApp/src/features/team_features.py)
*   **Used by:** Win Model V1, Win Model V2, Score Model V2.
*   **Dependency Chain:** `nba_team_games.csv` ➡️ `build_team_features`

### H2H_WINRATE_LAST_5
*   **Source:** H2H outcomes between same two franchises.
*   **Formula:** Average wins: `df_h2h['WL'].map({'W': 1, 'L': 0}).shift(1).rolling(5).mean()`.
*   **Created in:** [team_features.py](file:///Users/serhat/agProjects/nbaModelApp/src/features/team_features.py)
*   **Used by:** Win Model V1, Win Model V2, Score Model V2.
*   **Dependency Chain:** `nba_team_games.csv` ➡️ `build_team_features`

### H2H_PTS_LAST_5 / H2H_PTS_ALLOWED_LAST_5
*   **Source:** Scores of matchups between same two franchises.
*   **Formula:** Average points scored or allowed in matchup subset, shifted by 1.
*   **Created in:** [team_features.py](file:///Users/serhat/agProjects/nbaModelApp/src/features/team_features.py)
*   **Used by:** Win Model V1, Win Model V2, Score Model V2.
*   **Dependency Chain:** `nba_team_games.csv` ➡️ `build_team_features`

---

## 5. Player Availability Features (Unique to Win V2 & Score V2)

### HOME_CORE_PLAYERS_AVAILABLE_COUNT / AWAY_CORE_PLAYERS_AVAILABLE_COUNT
*   **Source:** `core_players.csv` and player box scores.
*   **Formula:** `sum(is_available(player_i))` for the 5 core players of the team.
    *   *Proxy check:* `is_available` is `True` if player logged $>0$ minutes in any of the team's last 3 games prior to date `T`.
*   **Created in:** [train_win_probability_v2.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/train_win_probability_v2.py) / [build_matchup_features.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/build_matchup_features.py)
*   **Used by:** Win Model V2, Score Model V2.
*   **Dependency Chain:** `core_players.csv` + `nba_player_games.csv` ➡️ `build_matchup_features`

### HOME_CORE_PLAYERS_MISSING_COUNT / AWAY_CORE_PLAYERS_MISSING_COUNT
*   **Source:** `core_players.csv` and player box scores.
*   **Formula:** `5 - CORE_PLAYERS_AVAILABLE_COUNT`.
*   **Created in:** [train_win_probability_v2.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/train_win_probability_v2.py) / [build_matchup_features.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/build_matchup_features.py)
*   **Used by:** Win Model V2, Score Model V2.
*   **Dependency Chain:** `core_players.csv` + `nba_player_games.csv` ➡️ `build_matchup_features`

### HOME_TOP[1-3]_AVAILABLE / AWAY_TOP[1-3]_AVAILABLE
*   **Source:** `core_players.csv` and player box scores.
*   **Formula:** `1 if is_available(player_rank_i) else 0` where `i` in `[1, 2, 3]` based on `CORE_RANK` in `core_players.csv`.
*   **Created in:** [train_win_probability_v2.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/train_win_probability_v2.py) / [build_matchup_features.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/build_matchup_features.py)
*   **Used by:** Win Model V2, Score Model V2.
*   **Dependency Chain:** `core_players.csv` + `nba_player_games.csv` ➡️ `build_matchup_features`

---

## 6. Player Expected Production Features (Unique to Win V2 & Score V2)

### EXPECTED_MIN / EXPECTED_PTS / EXPECTED_AST / EXPECTED_REB / EXPECTED_PRA
*   **Source:** Player box scores.
*   **Formula:** 10-game rolling averages of minutes, points, assists, rebounds, and PRA (PTS + REB + AST) computed strictly on games played prior to date `T`.
    *   *Symmetrical Aggregations:*
        *   `CORE_EXPECTED_MIN_SUM`: Sum of expected minutes for all 5 core players.
        *   `TOP3_EXPECTED_MIN_SUM`: Sum of expected minutes for top 3 ranked players.
        *   `CORE_MINUTES_SHARE`: `CORE_EXPECTED_MIN_SUM / 240.0`
        *   `CORE_EXPECTED_[PTS/AST/REB/PRA]_SUM`: Sum of rolling stats for all 5 core players.
        *   `TOP3_EXPECTED_[PTS/AST/REB/PRA]_SUM`: Sum of rolling stats for top 3 ranked players.
        *   `MISSING_CORE_EXPECTED_[MIN/PTS/AST/REB/PRA]`: Sum of expected stats for core players marked unavailable.
*   **Created in:** [train_win_probability_v2.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/train_win_probability_v2.py) / [build_matchup_features.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/build_matchup_features.py)
*   **Used by:** Win Model V2, Score Model V2.
*   **Dependency Chain:** `core_players.csv` + `nba_player_games.csv` ➡️ `build_matchup_features`
