# Final Roster Feature Leakage Audit

## Feature Source Trace

The roster-derived features are generated in two main scripts, depending on the context (training vs. inference), but both ultimately use the same core function: `compute_player_features_for_inference` located in `scripts/build_matchup_features.py`.

1.  **Training Data Generation**: For the `win_dataset`, the features are generated within `scripts/train_win_probability_v2.py`. This script iterates through each game in the input dataset and calls `compute_player_features_for_inference` for each matchup.
2.  **Score Model Data Generation**: For the `score_dataset`, the features are generated within `src/processing/build_player_features.py`, which also calls `compute_player_features_for_inference`.
3.  **Inference/API Generation**: For real-time predictions, `scripts/build_matchup_features.py` is called directly.

The source datasets used are:
*   `data/raw/player_games_raw.csv`: Contains individual player statistics for each game.
*   `data/raw/team_games_raw.csv`: Contains team-level game information.
*   `data/production/core_players.csv` or `data/experimental/player_registry_2024_25.csv`: Defines which players are considered "core" or "top" for each team.

## Calculation Logic

The logic for all `EXPECTED` features follows a consistent pattern inside `compute_player_features_for_inference`:

1.  For a given game (`prediction_date`), the function loads the raw player game logs.
2.  It filters these logs to include **only games played strictly before the `prediction_date`**. The key line of code is:
    ```python
    df_player_hist = df_player_games[df_player_games["GAME_DATE"] < pred_dt]
    ```
3.  For each player on the roster, it takes their historical data (`df_player_hist`), sorts it by date, and selects the **last 10 games**.
4.  It then calculates the `mean()` of the desired statistic (MIN, PTS, AST, REB) over these last 10 games.
    ```python
    p_recent = p_games.sort_values("GAME_DATE", ascending=True).tail(10)
    exp_min = float(p_recent["MIN"].mean())
    exp_pts = float(p_recent["PTS"].mean())
    # ... and so on for AST, REB, PRA
    ```
5.  These individual player `exp_` values are then summed up for the "CORE" and "TOP3" player groups to create the final features (e.g., `HOME_CORE_EXPECTED_MIN_SUM`).

## Leakage Analysis

The generation logic was inspected for the following potential sources of data leakage:

1.  **Exact source dataset used**: SAFE. The function uses raw, historical game logs.
2.  **Exact formula used**: SAFE. A simple 10-game rolling average is used.
3.  **Whether values are generated strictly from information available BEFORE tipoff**: SAFE. The `< pred_dt` filter is strictly enforced, ensuring no data from the game day or the future is used.
4.  **Whether any same-game box score information leaks into them**: SAFE. The target game's data is excluded by the date filter.
5.  **Whether any future-game information leaks into them**: SAFE. The date filter prevents this.
6.  **Whether any rolling calculation accidentally includes the current game**: SAFE. The use of a strict less-than operator (`<`) prevents the current game from being included in the rolling average calculation.
7.  **Whether any player statistics from the target game are used**: SAFE. No statistics from the game being predicted are used to generate the features for that same game.

## Verdict Per Feature

All audited roster-derived features are classified as **SAFE PRE-GAME FEATURE**. This includes all variations of:
*   `HOME_CORE_EXPECTED_*`
*   `HOME_TOP3_EXPECTED_*`
*   `AWAY_CORE_EXPECTED_*`
*   `AWAY_TOP3_EXPECTED_*`

The logic is sound and consistently applies a leakage-free method of calculating player potential based on a trailing window of performance.

## Overall Verdict

**A) SAFE TO START CROSS-SEASON MERGE**