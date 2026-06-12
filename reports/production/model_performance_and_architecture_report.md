# NBA Game Outcome and Player Statistics Prediction Model Architecture and Evaluation Report

## Abstract
This report details the engineering design, preprocessing pipelines, feature representations, validation paradigms, and model evaluation metrics of the NBA prediction system. The platform consists of three core machine learning components: a Win Probability Model, a Score Prediction Model, and an individual Player Performance Model. To prevent data leakage and ensure real-world generalization, we establish strict chronological validation boundaries, observed roster affiliation event logs, and pre-game feature boundaries. 

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
Traditional K-Fold cross-validation or random splits suffer from time-series leakage: predicting a game in November using features containing future rolling averages from February. To prove the model generalizes and does not memorize season-specific trends, we implement a strict **Chronological Split**:
- **Train Set**: 2024-25 NBA Season (Regular and Playoffs).
- **Test / Validation Set**: 2025-26 NBA Season.

This split acts as a strict temporal boundary. Any model that simply memorizes team identifiers or specific game results will fail on the test set due to the distribution shift between seasons.

### 2.2 Observed Roster Affiliations (Stints) & Snapshotting
A major source of leakage in roster-aware modeling is team affiliation: assigning a player to a team's roster for a historical game when they were traded to that team months later. 
Since the official NBA transactions API is stubbed out, we reconstruct the transaction log chronologically by scanning player game logs:
1. Contiguous stint windows (`start_date` to `end_date`) are calculated when a player changes their observed team.
2. For any prediction day $T$, we query only roster snapshots valid on or before $T$:
   $$\text{Roster}(T) = \{P \mid \text{start\_date}_P \le T \le \text{end\_date}_P\}$$
3. This guarantees that roster composition changes (trades, releases, signings) are resolved dynamically day-by-day and prevents future roster leaks.

### 2.3 Pre-Game Feature Boundaries
In player prediction modeling, using the actual minutes played in the game being predicted as a feature (to predict points or assists) is a critical post-tipoff leakage. In our V4 pipeline, all post-tipoff metrics are strictly dropped:
- Projected minutes for player models are estimated using an Exponential Moving Average (EMA) of previous games.
- Projected team statistics for win models are derived from player projections of available players on roster snapshot $T$, rather than actual game statistics.

---

## 3. Feature Engineering Design

Feature engineering is organized into four levels of abstraction:

### 3.1 Team Rolling Averages
Rolling features are computed over 5-game and 10-game historical windows (shifted by 1 game to prevent leakage):
- **Offensive/Defensive Ratings**: Points scored and allowed per 100 possessions.
- **Pace**: Possessions per 48 minutes.
- **Days Rest & Back-to-Back (B2B)**: Days of rest since the last game, and binary indicators for back-to-back schedules.

### 3.2 Core Player Availability Features
We join the dynamic availability of top 3 and top 5 core players to the team feature vectors:
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

### 4.1 Win Probability Model (Logistic Regression)
- **Algorithm**: Logistic Regression.
- **Scaling/Pipeline**: Robust scaling and mean imputation.
- **Calibration**: CalibratedClassifierCV using Sigmoid or Isotonic methods on a dedicated validation fold. This converts logits into true calibrated probabilities.

### 4.2 Score Prediction Model (V4 XGBoost)
- **Structure**: Four independent XGBoost regression models:
  1. `score_model_v4_pace`: Predicts game pace.
  2. `score_model_v4_home_rtg`: Predicts home team offensive rating.
  3. `score_model_v4_away_rtg`: Predicts away team offensive rating.
  4. `score_model_v4_margin`: Predicts margin.
- **Tuning**: Hyperparameters are optimized using a randomized cross-validated grid search (`RandomizedSearchCV`).

### 4.3 Player Performance Model (V4 LightGBM)
- **Structure**: LightGBM regressors trained independently for PTS, REB, and AST.
- **Features**: 41 pre-game player features including rolling USG_PCT and opponent defensive allowed rates.

---

## 5. Iterative Model Performance Improvements (V3 vs. V4 Evolution)

To achieve the current production levels of performance and stability, we transitioned the model architectures and features from Version 3 (V3) to Version 4 (V4) by applying targeted additions, removals, and tuning.

### 5.1 Additions (What We Added and Why)
- **Player-to-Team Projection Aggregations (Win Model)**: In V3, the win model used only historical team-level statistics. In V4, we mathematically aggregate pre-game player statistical projections (sum and average for PTS, REB, AST, PRA) of available players from roster snapshots. This dynamically captures star absences (e.g. Luka Doncic, Anthony Davis) and adjustment in team strength.
- **Usage Rate (USG_PCT) Rolling Features (Player Model)**: Added short-term (3-game) and long-term (10-game) EMA and trend usage rate indicators. This captures offensive redistribution when key teammates are missing, raising $R^2$ values significantly.
- **Opponent Allowed Stats by Position (Player Model)**: Grouped opponent defensive history against specific positions (Big, Wing, Guard). For example, if a team allowed high rebounds to "Bigs" over their last 10 games, the model exploits this matchup vulnerability for starting centers.
- **Geographic Distance and Timezone travel fatigue (Score Model)**: Incorporated travel distance (Haversine calculations stadium-to-stadium) and timezone shifts. This fatigue factor increased the accuracy of Away Off_Rtg and Margin predictions.

### 5.2 Removals (What We Removed to Stop Leakage)
- **Post-Tipoff attendance features (`PLAYED_COUNT` / `MINUTES_SUM` in V3 Win Model)**: In V3, player presence was resolved using the actual box score of the game being predicted (future information). This caused severe training leakage (inflated validation scores) but failed in production where lineups are unknown. V4 completely dropped these, replacing them with dynamic roster snapshot lookups and pre-game projections.
- **Player Projections in the Pace Model (Score Model)**: Removed aggregated player projections from the Pace model. Pace is primarily determined by team style of play and rest variables, and adding individual player projections introduced excessive noise, destabilizing predictions.

### 5.3 Performance Delta (V3 vs V4 Comparison)
The table below highlights the performance improvements achieved through this transition:

| Model / Metric | V3 Performance | V4 Performance | Improvement Detail |
| :--- | :---: | :---: | :--- |
| **Win Model (ROC-AUC)** | 0.6943 | **0.7048** | Better generalization due to projected player features. |
| **Win Model (Brier Score)** | 0.2217 | **0.2190** | Calibration alignment (Sigmoid) reduces probability error. |
| **Player PTS (MAE)** | 4.8210 | **4.5815** | Usage rate and opponent position allowed features capture form. |
| **Player AST (MAE)** | 1.5540 | **1.3745** | Roster adjustment and matchup weaknesses resolved. |

---

## 6. Performance Metrics & Evaluation Results

All evaluation metrics are calculated on the strict chronological test set (2025-26 Season) after training on the 2024-25 Season.

### 6.1 Win Probability Model Performance

| Model | Accuracy | Precision | Recall | F1 | ROC-AUC | Brier Score |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Logistic Regression | 0.6422 | 0.6420 | 0.6428 | 0.6424 | **0.7048** | **0.2190** |
| Random Forest Baseline | 0.6206 | 0.6188 | 0.6280 | 0.6234 | 0.6730 | 0.2280 |
| Gradient Boosting Baseline | 0.6172 | 0.6238 | 0.5904 | 0.6067 | 0.6584 | 0.2354 |

### 6.2 Score Model Performance (XGBoost V4)

| Target | MAE | RMSE | R² |
| :--- | :---: | :---: | :---: |
| HOME_PTS (Derived) | 10.3788 | 13.0262 | 0.0349 |
| AWAY_PTS (Derived) | 10.2220 | 12.8719 | 0.0685 |
| POINT_DIFF (Derived) | 12.7421 | 16.1897 | 0.0856 |
| TOTAL_POINTS (Derived) | 16.0895 | 20.2146 | 0.0288 |

### 6.3 Player Prediction Model Performance (LightGBM V4)

| Target | MAE | RMSE | R² |
| :--- | :---: | :---: | :---: |
| PTS | 4.5815 | 5.9974 | 0.5250 |
| REB | 1.9658 | 2.5760 | 0.4014 |
| AST | 1.3745 | 1.8684 | 0.4686 |

---

## 7. Key Feature Importances

### 7.1 Player Points (PTS) Prediction Importance (XGBoost)
1. `PTS_LAST_10` (Weight: 0.6405) — Primary player form factor.
2. `MIN_EMA_5` (Weight: 0.0536) — Captures recent playing time trends.
3. `PTS_LAST_5` (Weight: 0.0327) — Short-term scoring volume.
4. `USG_PCT_EMA_5` (Weight: 0.0199) — Usage rate changes indicating changes in offensive load.

### 7.2 Player Assists (AST) Prediction Importance (XGBoost)
1. `AST_LAST_5` (Weight: 0.4846) — Primary passing volume metric.
2. `MIN_EMA_5` (Weight: 0.0276) — Expected minutes proxy.
3. `USG_PCT_EMA_10` (Weight: 0.0268) — Long-term usage rate proxy.
4. `OPP_GUARD_AST_ALLOWED_LAST_10` (Weight: 0.0183) — Opponent defensive rating against guards.

---

## 8. Generalization and Non-Overfitting Proof
The system's generalization capability is proven by evaluating performance on a completely unseen chronological season (2025-26):
1. **Low Variance**: The Win Probability Model maintains a high ROC-AUC (0.7048) on the test set, demonstrating that the Logistic Regression coefficients generalize across different league-wide contexts.
2. **Stable Player Predictions**: LightGBM player models achieve $R^2$ values of up to 52.5% on the out-of-season test set, demonstrating that the usage rate (USG_PCT) and rolling stats capture structural player output rather than noise.
3. **Calibrated Probabilities**: True positive rates closely align with predicted probabilities (Brier score of 0.2190), indicating that the validation calibration (Sigmoid) effectively scales probabilities.
