# NBA Game Outcome and Player Statistics Prediction Model Architecture and Evaluation Report

## Abstract
This report details the engineering design, preprocessing pipelines, feature representations, validation paradigms, and model evaluation metrics of the active NBA prediction system. The platform consists of three core machine learning components: a Win Probability Model, a Score Prediction Model, and an individual Player Performance Model. To prevent data leakage and ensure real-world generalization, we establish strict chronological validation boundaries, observed roster affiliation event logs, and pre-game feature boundaries. 

---

## 1. Data Ingestion, Processing & Cleaning

### 1.1 Ingestion Service Architecture
All raw data is fetched dynamically from the official NBA API using the `UpdateDataService` and the `nba_api` client. The ingestion pipeline resolves two primary endpoints:
- `LeagueGameLog`: Used for bulk ingestion of historical team and player stats for designated seasons.
- `BoxScoreTraditionalV2`: Used during incremental updates to download individual box scores for matches not yet recorded locally.

To bypass Akamai CDN rate limits and prevent requests from being blocked, the client uses a randomized delay (jittered sleep between 0.6 and 1.2 seconds) and an exponential backoff policy that retries failed calls up to 5 times.

### 1.2 Date & ID Standardization
Raw log dates are formatted into standard ISO date formats (`YYYY-MM-DD`). Game identifiers (`GAME_ID`) are cast to strings, stripped of float decimals, and zero-padded to a length of 10 digits to match the official NBA API specification.

### 1.3 Core Player Identification & Importance Score
To model the impact of player absences on team performance, we compute a data-driven **Importance Score** for each player based on their season-to-date statistical averages. 
Let $M$ be the average minutes played, $P$ be average points, $A$ be average assists, and $R$ be average rebounds. The Importance Score is calculated as:

$$\text{Importance Score} = (M \times 0.5) + (P \times 1.0) + (A \times 0.8) + (R \times 0.6)$$

Players are sorted descending by their Importance Score per team:
- **Ranks 1 to 3** are tagged as `IS_TOP3_CORE` (franchise stars).
- **Ranks 4 to 5** are tagged as `IS_TOP5_CORE` (key rotation players).

---

## 2. Preventing Data Leakage & Proof of Roster Generalization

Data leakage occurs when target or post-tipoff information is accidentally leaked into training features, resulting in optimistically biased metrics that degrade in live inference. We prevent leakage using three core designs:

### 2.1 Chronological Out-of-Sample Partitioning (Strict Split)
Traditional K-Fold cross-validation or random splits suffer from time-series leakage: predicting a game in November using features containing future rolling averages from February. To prove the model generalizes and does not memorize season-specific trends, our evaluation enforces strict chronological splits across seasons.

### 2.2 Observed Roster Affiliations (Stints) & Snapshotting
A major source of leakage in roster-aware modeling is team affiliation: assigning a player to a team's roster for a historical game when they were traded to that team months later. 
Since the official NBA transactions API is stubbed out, we reconstruct the transaction log chronologically by scanning player game logs:
1. Contiguous stint windows (`start_date` to `end_date`) are calculated when a player changes their observed team.
2. For any prediction day $T$, we query only roster snapshots valid on or before $T$:
   $$\text{Roster}(T) = \{P \mid \text{start\_date}_P \le T \le \text{end\_date}_P\}$$
3. This guarantees that roster composition changes (trades, releases, signings) are resolved dynamically day-by-day and prevents future roster leaks.

### 2.3 Pre-Game Feature Boundaries
In player prediction modeling, using the actual minutes played in the game being predicted as a feature is a critical post-tipoff leakage. In our production pipeline, all post-tipoff metrics are strictly dropped:
- Projected minutes for player models are estimated using an Exponential Moving Average (EMA) of previous games.
- Game-level models (WIN, SCORE) use no player projections: aggregated player projections were trained on overlapping outcomes and are excluded until date-safe out-of-fold versions exist.

---

## 3. Feature Engineering Design

Feature engineering is organized into four levels of abstraction:

### 3.1 Team Rolling Averages
Rolling features are computed over 5-game and 10-game historical windows (shifted by 1 game via `shift(1)` to prevent leakage):
- **Offensive/Defensive Ratings**: Points scored and allowed per 100 possessions.
- **Pace**: Possessions per 48 minutes.
- **Days Rest & Back-to-Back (B2B)**: Days of rest since the last game, and binary indicators for back-to-back schedules.

### 3.2 Core Player Availability Features (not used by the production models)
These indicators exist in the team datasets but are excluded from every production feature contract:
- `TEAM_CORE_TOP3_AVAILABLE_RATE`: Ratio of top 3 core players who actually played.
- `TEAM_CORE_TOP3_PTS_LAST_5_SUM`: Sum of points scored by available top 3 players in their last 5 games.

### 3.3 Geographic Travel & Timezone Features
Travel fatigue is calculated using the geographic coordinates of team stadiums:
- **Haversine Distance**: Travel distance (in km) calculated between home and away team coordinates:
  $$d = 2R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$
- **Timezone Differences**: Time zone offset difference between cities.

### 3.4 Player-Specific and Matchup Features
For player prediction models:
- **Usage Rate (USG_PCT)**: Computed rolling features (`USG_PCT_EMA_5`, `USG_PCT_LAST_10`, `USG_PCT_TREND`) to capture changes in team offensive structure.
- **Defensive Allowed Stats by Position**: Rolling 10-game stats allowed by the opponent team to specific position groups (Big, Wing, Guard). For example, `OPP_BIG_REB_ALLOWED_LAST_10` indicates how many rebounds the opponent allowed to big men.

---

## 4. Model Architectures & Training Pipelines

All three models are retrained by `scripts/retrain_pipeline.py`. Each run fits a holdout copy without the validation season (2025-26) for the promotion gate, then a release model on every eligible season (2020-21..2025-26). The gate compares the holdout copy with the metrics recorded at the previous promotion (`models/production/clean_holdout_metrics.json`) and with simple pregame baselines.

### 4.1 Win Probability Model
- **Artifact**: `models/production/win_probability_model_v10.pkl` (and `v9` alias), features in `feature_columns_v10.json`, contract `config/features/win_v10.yaml`.
- **Algorithm**: `SimpleImputer -> StandardScaler -> LogisticRegression(C=1)`, uncalibrated. Logistic, L1 logistic and LightGBM are compared on expanding-window Brier; logistic wins and isotonic/sigmoid calibration does not improve it.
- **Features (7)**: `ELO_DIFF`, `IS_HOME`, `CLEAN_NET_RTG_DIFF_LAST_10`, `WINRATE_DIFF_LAST_10`, `REST_DIFF`, `IS_B2B`, `OPP_IS_B2B`, chosen by forward selection on walk-forward folds. `WINRATE_DIFF_LAST_10` has a negative coefficient on purpose: at equal Elo and net rating a higher win rate reflects close-game luck that regresses.
- **Elo**: pre-game Elo comes from the complete raw game log (the same chain live inference uses), not from the model-ready rows, which lack each team's first games of a season.
- **Serving**: the first 12 games of a season blend in the pure Elo probability (weight 0.4 decaying to 0); features themselves are not shrunk.

### 4.2 Score Prediction Model
- **Artifacts**: `score_model_v10_{pace,home_rtg,away_rtg,margin,ridge_total,ridge_margin}.pkl` and metadata; contract `config/features/score_v10.yaml`.
- **Structure**: standardized `RidgeCV` models
  1. Pace: `PACE_LAST_10`, `OPP_PACE_LAST_10`.
  2. Home and away offensive rating: `OFF_RTG_LAST_10`, `OPP_DEF_RTG_LAST_10` (from each side's row).
  3. Margin: the WIN inputs (`ELO_DIFF`, `CLEAN_NET_RTG_DIFF_LAST_10`, `WINRATE_DIFF_LAST_10`, rest days, back-to-backs).
- **Total** = pace x (home rating + away rating) / 100; home/away scores = (total +/- margin) / 2.
- **Residual correction**: Ridge models on playoff, back-to-back and rest-advantage indicators, fit on temporal out-of-fold residuals.
- **Targets** are actual final points from the box scores. `PACE x OFF_RTG / 100` was used before and undercounted overtime games by ~13 points because PACE is per 48 minutes.
- **Intervals**: conformal offsets from out-of-fold residuals against actual points (80%: total +/-24, margin +/-17.7).

### 4.3 Player Performance Model
- **Artifacts**: `player_v9_lgb_{pts,reb,ast}.pkl`, `player_v9_features.pkl`; contract `config/features/player_v9.yaml` (explicit feature list).
- **Structure**: one LightGBM regressor per target (L1 objective for PTS, which is right-skewed and scored on MAE).
- **Features (21)**: last-5 and EMA-10 per stat, per-minute production, minutes (last 3, EMA-10, trend), usage EMA-10, rest, home, playoff, position flags (`IS_GUARD`, `IS_BIG`) and the opponent's last-10 allowance to the player's position group (`OPP_POS_{PTS,REB,AST}_ALLOWED_LAST_10`, built by `add_player_matchup_features` for training and inference alike).
- **Positions** come from `data/canonical/player_metadata.csv`; the primary (first listed) official position decides (F-G -> WING).
- **No residual correction**: the former Ridge layer raised PTS MAE in every walk-forward season and was retired.

---

## 5. Changes in the 2026-10-20 Review

- WIN: 32 -> 7 features (two exact linear dependencies removed), early-season feature shrink removed from serving (it raised log loss in every bucket), training Elo aligned with live Elo (up to 13 points apart before).
- SCORE: actual-point targets, 2-feature pace/rating models (collinear pairs cancelled in SHAP), margin on the WIN inputs, release model now includes the validation season.
- PLAYER: explicit feature list, opponent position allowance and position flags, Ridge layer retired, F-G position mapping fixed, release model includes the validation season.
- Serving: stale parquet copies are no longer read when the CSV is newer, the player dataset cache refreshes with the data, explanations work for the linear models.

---

## 6. Empirical Performance (Walk-Forward)

Each season is predicted by models fitted only on earlier seasons (`python -m scripts.walk_forward_benchmark`, full report in `reports/evaluation/multi_season_walk_forward_backtest.md`). Baselines: Elo with home-court advantage; each side's last-10 points scored and allowed; each player's EMA-10.

### 6.1 Win Probability

| Season | Games | Accuracy | ROC-AUC | Brier | Elo AUC | Elo Brier |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| 2021-22 | 1,256 | 65.13% | 0.6903 | 0.2210 | 0.6919 | 0.2206 |
| 2022-23 | 1,248 | 62.74% | 0.6502 | 0.2277 | 0.6443 | 0.2290 |
| 2023-24 | 1,259 | 65.77% | 0.7271 | 0.2090 | 0.7169 | 0.2114 |
| 2024-25 | 1,256 | 66.48% | 0.7289 | 0.2084 | 0.7187 | 0.2118 |
| 2025-26 | 1,257 | 67.94% | 0.7389 | 0.2046 | 0.7362 | 0.2058 |

### 6.2 Score

| Season | Total MAE | Baseline Total MAE | Margin MAE | Baseline Margin MAE | 80% coverage (total) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| 2021-22 | 14.68 | 14.62 | 11.15 | 11.56 | 80.5% |
| 2022-23 | 14.89 | 14.97 | 10.29 | 10.57 | 80.3% |
| 2023-24 | 14.72 | 14.78 | 11.04 | 11.58 | 82.5% |
| 2024-25 | 14.92 | 15.02 | 10.97 | 11.50 | 80.5% |
| 2025-26 | 15.30 | 15.38 | 11.40 | 11.86 | 79.0% |

### 6.3 Player (MAE, model / EMA-10 baseline)

| Season | PTS | REB | AST |
| :--- | :---: | :---: | :---: |
| 2021-22 | 4.55 / 4.63 | 1.93 / 1.94 | 1.30 / 1.30 |
| 2022-23 | 4.59 / 4.69 | 1.92 / 1.94 | 1.30 / 1.31 |
| 2023-24 | 4.47 / 4.57 | 1.89 / 1.90 | 1.34 / 1.35 |
| 2024-25 | 4.56 / 4.66 | 1.92 / 1.94 | 1.33 / 1.35 |
| 2025-26 | 4.51 / 4.61 | 1.89 / 1.92 | 1.34 / 1.35 |

---

## 7. Known Limitations

1. **Near the pregame ceiling**: WIN beats Elo + home court by only ~0.002 Brier on average and SCORE totals match a last-10-points baseline; the margin model and player PTS carry the real gains. Further accuracy needs new information (injury/lineup data, market lines).
2. **Player opponent context is one game stale at serving time**: `_defense_context` takes the opponent's allowance from its last stored row, which excludes that opponent's most recent game.
3. **Opening 2026-27 Elo** includes a roster-turnover adjustment that the training seasons never had; early-season WIN predictions rely on it.
4. **The 2025-26 holdout has been used for many decisions**; the walk-forward averages above are the more reliable estimate.
