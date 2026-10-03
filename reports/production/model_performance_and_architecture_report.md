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
- Projected team statistics for win models are derived from player projections of available players on roster snapshot $T$, rather than actual game statistics.

---

## 3. Feature Engineering Design

Feature engineering is organized into four levels of abstraction:

### 3.1 Team Rolling Averages
Rolling features are computed over 5-game and 10-game historical windows (shifted by 1 game via `shift(1)` to prevent leakage):
- **Offensive/Defensive Ratings**: Points scored and allowed per 100 possessions.
- **Pace**: Possessions per 48 minutes.
- **Days Rest & Back-to-Back (B2B)**: Days of rest since the last game, and binary indicators for back-to-back schedules.

### 3.2 Core Player Availability Features
We join dynamic availability indicators of top 3 and top 5 core players to the team feature vectors:
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

### 4.1 Win Probability Model (V10 / V9 Production Artifact)
- **Active Production Artifact**: `models/production/win_probability_model_v10.pkl` (and `v9` alias).
- **Algorithm**: LightGBM Classifier wrapped in `CalibratedClassifierCV(method='isotonic', cv=3)`.
- **Feature Set**: 87 pre-game features (`feature_columns_v10.json`), including `SCORE_PRED_MARGIN` (22.2% gain), `NET_RTG_DIFF_LAST_10` (20.6% gain), `ELO_DIFF` (12.7% gain), plus team-level bottom-up player projected totals (`TEAM_V3_PROJ_*`, `OPP_V3_PROJ_*`), Four Factors deltas, havoc rates, and playoff interaction features.
- **Venue Sanitization**: Dropped 12 static venue split features (`HOME_PTS_LAST_5`, `AWAY_PTS_LAST_5`, etc.) in favor of symmetric venue delta terms.

### 4.2 Score Prediction Model (V10 / V9 Production Artifact)
- **Structure**: Four independent XGBoost regression models:
  1. `score_model_v10_pace.pkl`: Pace estimator (possessions per 48 min).
  2. `score_model_v10_home_rtg.pkl`: Home Offensive Rating estimator.
  3. `score_model_v10_away_rtg.pkl`: Away Offensive Rating estimator.
  4. `score_model_v10_margin.pkl`: Expected Margin estimator.
- **Post-Processing Calibration**: Two Out-Of-Fold (OOF) trained Ridge regression residual models:
  - `score_model_v10_ridge_total.pkl`: Calibrates game total residuals based on schedule fatigue, back-to-backs, and playoff indicators.
  - `score_model_v10_ridge_margin.pkl`: Calibrates margin residuals based on rest advantage differentials.

### 4.3 Player Performance Model (V9 Production Artifact)
- **Structure**: LightGBM regressors trained independently for PTS, REB, and AST:
  - `player_v9_lgb_pts.pkl`, `player_v9_lgb_reb.pkl`, `player_v9_lgb_ast.pkl`
- **Features**: 38 pre-game player features (`player_v9_features.pkl`) including usage rate exponential moving averages (`USG_PCT_EMA_5`, `USG_PCT_EMA_10`), minutes expectations (`MIN_EMA_10`), and opponent defensive allowances by position group.
- **Post-Processing Calibration**: OOF Ridge regression models (`player_v9_ridge_pts.pkl`, etc.) adjusting for player position group, minutes tier, and playoff intensity.

---

## 5. Model Performance Evolution

Transition from V8 to V10 focused on eliminating feature leakage, expanding the cross-season training baseline across 6 seasons, and incorporating bottom-up player projections into game-level models.

### 5.1 Key Improvements
- **Bottom-Up Roster Integration**: Incorporating player projection aggregations directly into team match-up models dynamically captures the scoring gap caused by injuries.
- **Post-Processing Ridge Layer**: Corrects systematic bias in schedule-dense weeks (e.g. back-to-back rest disadvantages) and playoff pace reduction.
- **Reciprocal Mirror Consistency**: Validated that $P(\text{home}) + P(\text{away}) \approx 1.0$ across 5,140 game pairs with mean absolute discrepancy of only 0.018.

---

## 6. Empirical Performance Metrics Across 6 Seasons

All metrics below are computed directly on the active production artifacts evaluated across each complete NBA season.

### 6.1 Win Probability Model Performance

| Season | Evaluated Rows | Accuracy | ROC-AUC | Brier Score | Log Loss | ELO-Only Baseline AUC | Score Margin AUC | Home Win% |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **2020-21** | 1,456 | 68.96% | 0.7802 | 0.1947 | 0.5691 | 0.6438 | 0.6674 | 56.59% |
| **2021-22** | 1,766 | 69.08% | 0.7820 | 0.1917 | 0.5620 | 0.6179 | 0.6606 | 53.68% |
| **2022-23** | 1,760 | 71.19% | 0.7728 | 0.1965 | 0.5734 | 0.6463 | 0.6608 | 57.39% |
| **2023-24** | 1,766 | 71.52% | 0.7941 | 0.1862 | 0.5481 | 0.6190 | 0.6516 | 53.91% |
| **2024-25** | 1,760 | 71.82% | 0.8116 | 0.1799 | 0.5332 | 0.6388 | 0.6602 | 54.72% |
| **2025-26** | 1,772 | **70.94%** | **0.8028** | **0.1828** | **0.5393** | 0.6419 | 0.6604 | 55.76% |

### 6.2 Score Model Performance (XGBoost + Ridge Calibration)

| Season | Games | Pace MAE | Home RTG MAE | Away RTG MAE | Raw Total MAE | Calibrated Total MAE | Raw Margin MAE | Calibrated Margin MAE | Naive Margin Baseline |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **2020-21** | 728 | 3.32 | 8.51 | 8.12 | 13.94 | 14.01 | 10.58 | 10.61 | 12.42 |
| **2021-22** | 883 | 3.20 | 8.29 | 8.25 | 13.66 | 13.45 | 10.93 | 10.88 | 12.80 |
| **2022-23** | 880 | 3.32 | 8.13 | 8.34 | 13.97 | 13.86 | 10.04 | 10.00 | 11.67 |
| **2023-24** | 883 | 3.11 | 8.26 | 8.65 | 13.63 | 13.49 | 11.19 | 11.16 | 13.29 |
| **2024-25** | 877 | 3.40 | 8.58 | 8.35 | 13.93 | 13.89 | 10.67 | 10.63 | 13.22 |
| **2025-26** | 884 | 3.60 | 8.96 | 9.54 | 15.55 | 15.43 | 12.15 | 12.14 | 13.87 |

### 6.3 Player Prediction Model Performance (LightGBM + Ridge Calibration)

| Target Metric | 2020-21 MAE (R²) | 2021-22 MAE (R²) | 2022-23 MAE (R²) | 2023-24 MAE (R²) | 2024-25 MAE (R²) | 2025-26 MAE (R²) | 5-Game Rolling Baseline MAE |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **PTS** | 4.48 (0.554) | 4.51 (0.538) | 4.56 (0.570) | 4.45 (0.584) | 4.53 (0.553) | 4.54 (0.531) | 4.65 |
| **REB** | 1.92 (0.465) | 1.93 (0.455) | 1.93 (0.449) | 1.90 (0.475) | 1.93 (0.459) | 1.94 (0.405) | 1.98 |
| **AST** | 1.29 (0.537) | 1.30 (0.528) | 1.31 (0.539) | 1.34 (0.532) | 1.33 (0.516) | 1.36 (0.474) | 1.39 |

---

## 7. Audit Findings & Known Limitations

Detailed diagnostics and shift tests are tracked in `reports/audits/model_quality_leakage_and_governance_audit.md`.

1. **Clean Feature Boundaries**: Shift tests confirmed that all rolling features in team and player models strictly precede game time via `shift(1)`.
2. **Train-Serve Elo Discrepancy**: Due to a missing single-game `PTS` column in `team_model_ready_v3_*.csv`, training Elo updates defaulted to zero margin, suppressing the MOV multiplier to `0.2` ($\sigma = 59.14$). In live inference, real `PTS` is used, producing a wider Elo spread ($\sigma = 191.31$).
3. **Score Model Coupling in WIN**: The WIN model derives 22.2% of its feature gain from `SCORE_PRED_MARGIN`, linking game outcome probability directly to the score component engine.
