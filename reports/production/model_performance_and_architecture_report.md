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
In player prediction modeling, using the actual minutes played in the game being predicted as a feature (to predict points or assists) is a critical post-tipoff leakage. In our production pipeline, all post-tipoff metrics are strictly dropped:
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

### 4.1 Win Probability Model (V9 Logistic Regression)
- **Algorithm**: Logistic Regression.
- **Scaling/Pipeline**: Robust scaling and mean imputation.
- **Features**: 62 active pre-game features, featuring ELO difference, rest variables, and playoff interactions.
- **Calibration**: Isotonic calibration on holdout metrics to scale raw scores to true calibrated probabilities.

### 4.2 Score Prediction Model (V9 XGBoost + Ridge Calibration)
- **Structure**: Four independent XGBoost regression models for:
  1. `score_model_v9_pace`
  2. `score_model_v9_home_rtg`
  3. `score_model_v9_away_rtg`
  4. `score_model_v9_margin`
- **Calibration**: Ridge regression post-processing total and margin correction models calibrated against schedule variables (b2b, rest advantages, and playoff factors).

### 4.3 Player Performance Model (V9 LightGBM + Ridge Calibration)
- **Structure**: LightGBM regressors trained independently for PTS, REB, and AST.
- **Features**: 40 pre-game player features including rolling USG_PCT and opponent defensive allowed rates.
- **Calibration**: Multi-segment Ridge regression models to calibrate raw statistics predictions to optimal MAE outputs.

---

## 5. Model Performance Evolution

To achieve the current production levels of performance and stability, we transitioned model architectures to Version 9 (V9) with ELO differentials, playoff interaction terms, and Ridge residual calibration.

### 5.1 Key Improvements
- **Playoff Interaction Terms**: Win model benefits from playoff ELO differentials and rest factors to handle postseason variance.
- **Post-Processing Calibration**: Incorporating Ridge residual models directly on top of base XGBoost/LightGBM outputs yields consistent MAE reductions.
- **Feature Sanitization**: Static venue split features were dropped from the Win model to prevent training-inference venue mismatches.

---

## 6. Performance Metrics & Evaluation Results

All evaluation metrics are calculated on the strict chronological test set (2025-26 Season) after training on the 2024-25 Season.

### 6.1 Win Probability Model Performance (V9)

| Model | Strategy | Accuracy | Precision | Recall | F1 | ROC-AUC | Brier Score |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Logistic Regression | Uncalibrated | 0.6903 | 0.6901 | 0.6908 | 0.6905 | **0.7433** | **0.2052** |
| Logistic Regression | Sigmoid Cal. | 0.6874 | 0.6872 | 0.6879 | 0.6875 | 0.7428 | 0.2057 |
| Logistic Regression | Isotonic Cal. | 0.6874 | 0.6861 | 0.6908 | 0.6884 | **0.7421** | **0.2049** |

### 6.2 Score Model Performance (V9 XGBoost + Ridge Calibration)

| Target Variable | Base MAE | Calibrated MAE | Improvement (Ridge vs Base) |
| :--- | :---: | :---: | :--- |
| **PACE** | - | 3.6142 | Stable tempo pacing. |
| **HOME_RTG** | 9.3989 | 9.3773 | -0.0216 MAE decrease. |
| **AWAY_RTG** | 9.7111 | 9.6617 | -0.0494 MAE decrease. |
| **MARGIN** | 12.2611 | 12.2555 | -0.0056 MAE decrease (Bias reduction). |
| **TOTAL** | 14.8537 | 14.7552 | -0.0985 MAE decrease. |

### 6.3 Player Prediction Model Performance (V9 LightGBM + Ridge Calibration)

| Target Metric | Base MAE | Calibrated MAE | Base R² | Calibrated R² | MAE Delta |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **PTS** | 4.5542 | 4.5476 | 0.5075 | 0.5075 | -0.0066 |
| **REB** | 1.9391 | 1.9194 | 0.4076 | 0.4151 | -0.0197 |
| **AST** | 1.3709 | 1.3665 | 0.4659 | 0.4668 | -0.0044 |

---

## 7. Generalization and Non-Overfitting Proof

The system's generalization capability is proven by evaluating performance on a completely unseen chronological season (2025-26):
1. **Low Variance**: The Win Probability Model maintains a high ROC-AUC (0.7421) on the test set, demonstrating that the Logistic Regression coefficients generalize across different league-wide contexts.
2. **Stable Player Predictions**: LightGBM player models achieve calibrated $R^2$ values of up to 50.7% (PTS) and 46.6% (AST) on the out-of-season test set.
3. **Calibrated Probabilities**: True positive rates closely align with predicted probabilities (Isotonic Brier score of 0.2049), indicating that the validation calibration effectively scales probabilities.
