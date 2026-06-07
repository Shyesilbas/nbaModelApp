# Leakage Audit Report — 2025-26 Season

This audit evaluates the leakage-prevention mechanisms across all feature families in the NBA prediction application.

---

## 1. Leakage-Prevention Principles

To ensure that the models are trained and run in realistic, pre-game environments, the pipeline enforces two strict rules:
1.  **Shift Operators (`.shift(1)`):** All rolling window averages are computed on historical series and shifted forward by 1 game. This ensures the features on game day `T` do not include any box score stats from game `T` itself.
2.  **Date Filtering (`< prediction_date`):** During dataset generation and inference, all historical queries are strictly filtered using the predicate `GAME_DATE < prediction_date` or `GAME_DATE < T`. This prevents any data from post-tipoff or future games from bleeding into the current game's features.

---

## 2. Feature Family Audit

### 2.1 Rolling Features (Team & Player Form)
*   **Enforcement Mechanism:** `.shift(1).rolling(W).mean()` inside `src/features/team_features.py` and `src/features/player_features.py`.
*   **Cutoff Logic:** Before computing rolling metrics, game logs are sorted chronologically (`sort_values('GAME_DATE')`). The `shift(1)` operation displaces the rolling windows forward by exactly one row.
*   **Leakage Risk:** **Low / Safe.** Chronological sorting is validated during startup checks to guarantee that the shift operates in a positive temporal direction.

### 2.2 Head-to-Head (H2H) Features
*   **Enforcement Mechanism:** Row subset filtering by franchise pair, sorted chronologically, and shifted.
*   **Cutoff Logic:** When evaluating H2H metrics for Team A vs Team B on date `T`, only games with `GAME_DATE < T` are selected. A rolling window of size 5 is computed on this subset and shifted forward.
*   **Leakage Risk:** **Low / Safe.** Pre-filtering game results strictly prior to date `T` guarantees that the H2H stats do not leak the outcome of the game being predicted.

### 2.3 Player Availability & Expected Stats Features
*   **Enforcement Mechanism:** Sub-queries filtered to `GAME_DATE < prediction_date` inside [build_matchup_features.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/build_matchup_features.py) and [train_win_probability_v2.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/train_win_probability_v2.py).
*   **Cutoff Logic:**
    *   **Availability Proxy:** A player's availability is derived from whether they played $>0$ minutes in any of the team's last 3 games strictly before `T`. The list of last 3 games is fetched using `GAME_DATE < T`.
    *   **Expected Stats:** rolling averages are computed using player box scores strictly filtered by `GAME_DATE < T`.
*   **Leakage Risk:** **Low / Safe.** By restricting all lookups to dates prior to the target game, the player metrics remain free of post-tipoff leakage.

---

## 3. Suspicious Findings & Risks Flagged

### 3.1 IS_PLAYOFF Variable Origin
*   **Status:** **Suspicious / Warning.**
*   **Details:** The `IS_PLAYOFF` flag in the win probability model currently has a coefficient of `0.0`. It is derived from scheduling files which are set ahead of time. While it doesn't cause post-tipoff leakage, there are very few playoff games in a single-season dataset, resulting in high sparsity.
*   **Recommendation:** Keep `IS_PLAYOFF` but normalize its usage using cross-season datasets where playoff representation is larger.

### 3.2 V3 Observed Player Participation Features
*   **Status:** **Critical Leakage Risk (If Used).**
*   **Details:** The `V3` experimental datasets contain features like `TEAM_CORE_TOP3_PLAYED_COUNT` or `TEAM_CORE_TOP3_MINUTES_SUM`. These are computed from the box scores of the game being predicted (i.e. post-tipoff observed statistics).
*   **Preventative Check:** The codebase correctly marks these datasets as **EXPLORATORY ONLY** and they are excluded from the production training pipelines.
*   **Recommendation:** Ensure that no production inference or training scripts ever import or merge the `v3` team datasets.

---

## 4. Cutoff-Enforcing Scripts

The following scripts contain the core SQL-equivalent filters that prevent leakage:
*   [build_matchup_features.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/build_matchup_features.py#L74-L77):
    ```python
    # Filtering to games strictly before prediction date to prevent leakage
    team_df = team_df[team_df["GAME_DATE"] < pred_dt].copy()
    games_df = games_df[games_df["GAME_DATE"] < pred_dt].copy()
    ```
*   [build_matchup_features.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/build_matchup_features.py#L288-L290):
    ```python
    # Filter strictly before to prevent leakage
    df_player_hist = df_player_games[df_player_games["GAME_DATE"] < pred_dt]
    df_team_hist = df_team_games[df_team_games["GAME_DATE"] < pred_dt]
    ```
*   [train_win_probability_v2.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/train_win_probability_v2.py):
    Applies the same time-aware filters when generating player availability metrics for historical games.
