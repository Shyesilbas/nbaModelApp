Player Minutes Prediction Model V1 — Design Document

Goal

Design a first-version model that predicts expected minutes for each core player in the upcoming game. The minutes model will feed downstream Win and Score models (as features) and help improve availability and expected production estimators.

Scope

- Predict minute expectation for core rotation players (e.g., projected starting 8–10 players per team).
- Offline design only: dataset, targets, features, evaluation metrics. No training or implementation yet.

1) Dataset

- Granularity: player x game row (one row per player per game opportunity). Keep game_datetime (UTC), team_id, opponent_id, home_flag.

- Inclusion rules:
  - Include all players who played at least one minute in the season OR are on the active roster within the previous N days (N=30) to capture call-ups.
  - Optionally, maintain a separate dataset of "core" players per team defined as top-8 by season-average minutes or expected_minutes from previous week.

- Required raw columns (per-player-per-game):
  - player_id, team_id, opponent_id, game_id, game_datetime, home_flag
  - minutes_played (actual), starter_flag (binary if available), lineup_id (if available)
  - basic box: pts, ast, reb, to, usage, fouls
  - game context: back_to_back_prev, rest_days, travel_flag, altitude_flag, game_number_in_season
  - team context: team_minutes_available (sum expected minutes), opponent_defense_rating, team_pace
  - injury/availability: injured_flag, scratch_flag, injury_category

- Historical features source windows:
  - recent 3 games, 7 games, 14 games rolling means
  - career & season averages
  - EMA versions for minutes & usage (see EMA design doc)

2) Target(s)

- Primary target: minutes_next_game (continuous, minutes played in next game; range 0–48)
- Secondary targets (optional):
  - minutes_class (bucketed: 0, 0<min<=6, 6<min<=15, 15<min<=25, >25) for classification metrics
  - starter_probability (binary prob of starting)

- Censoring & treatment of DNP
  - Label DNPs as 0 minutes but maintain a reason code (coach decision vs injury). Consider modeling censored outcomes if injury-driven.

3) Candidate features (explainable groups)

A) Recent workload and availability
  - rolling_minutes_3, rolling_minutes_7, rolling_minutes_14
  - games_played_last_7 (count)
  - minutes_std_last_14 (stability)
  - days_since_last_game, back_to_back_prev (0/1), rest_days

B) Role & starter indicators
  - starter_flag_last_game, fraction_games_started_last_14
  - average_rotation_rank (if available), nights_as_starter_this_season

C) Opponent & matchup
  - opponent_matchup_minutes_pressure: opponent typical minutes vs matching position (proxy)
  - opponent_defensive_pace

D) Team context
  - team_player_minutes_sum_last_game (how minutes distributed)
  - injuries_on_team_count (missing core minutes)
  - minutes_vacated_by_injuries (estimated)

E) Coach & schedule signals
  - coach_resting_tendency (empirical % games resting starters in back-to-backs)
  - travel_distance_prev_day, timezone_shift

F) Advanced signals (if available)
  - foul_rates_last_7 (players more likely to exit early)
  - minutes_of_similar_players (peer minutes distribution)

G) Identifiers & embeddings
  - player_id embedding, team_id embedding, matchup embedding (home vs away)

4) Feature engineering notes

- Normalize minutes by 48-minute game and team pace where appropriate.
- For young players with sparse history, use shrinkage to season-prior or position-prior to avoid overfit.
- One-hot encode small-cardinality categorical features; consider target-encoding for player/team IDs with out-of-time smoothing.

5) Model family (design expectation)

- Start with gradient-boosted trees (LightGBM/XGBoost) for robust handling of missingness and non-linearities.
- Consider two-stage architecture: classification (will play > 0) then regression (minutes | play) to handle heavy zero-inflation.
- Later: consider sequence or hierarchical models (RNN or transformer over last N games) or multitask learning joint with availability probability.

6) Evaluation metrics & targets

Primary metrics
  - MAE (minutes) — primary
  - RMSE (minutes)
  - R^2 (explained variance)

Secondary / calibration
  - Brier score / log-loss for will_play > 0 classification
  - Calibration plots of predicted minutes vs actual across deciles
  - Top-K accuracy for starters: top-5 predicted minutes contains actual starters

Operational metrics
  - Downstream impact: difference in Win/Score model metrics when replacing current minutes proxy with predicted minutes (shadow run).

7) Cross-validation strategy

- Temporal split: train on historical games up to date T, validate on subsequent contiguous block.
- Rolling-origin CV with player-holdout folds to ensure generalization for players who change teams.
- Evaluate per-team and per-player buckets (regular starters vs bench) to ensure error uniformity.

8) Baselines

- Baseline A: last-game minutes
- Baseline B: rolling mean of last 7 games
- Baseline C: simple classifier/regressor cascade (will_play then mean-minutes)

9) Success criteria for V1

- MAE improvement at least 10% vs rolling-7 baseline on validation set for core players.
- Good calibration (mean predicted minutes within ±0.5 minutes of observed in calibration bins).
- Positive downstream change (or at least non-negative) on Win/Score model when used as feature in shadow run.

10) Privacy & bias considerations

- Avoid using demographic or sensitive attributes unrelated to play (irrelevant here). Monitor for biases across player roles and minutes.

11) Next steps (non-training)

- Implement data extraction and feature table for player-game rows.
- Compute baseline heuristics and evaluate to establish MAE baseline.
- Prepare model training scaffolding and evaluation harness (temporal CV).

End of design.
