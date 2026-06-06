# NBA Prediction Model Audit Report

## Executive Summary

This audit report evaluates the machine learning models implemented in the NBA Prediction application: the **Win Probability Model** and the **Score Prediction Model V2**.

- **Win Probability Model Usability**: **Production-usable**. The calibrated Logistic Regression model achieves **64.29% accuracy** and a **0.7254 ROC-AUC** on the test set. It behaves reliably at high-confidence levels (accuracy reaches **82.22%** when confidence is $\ge 70\%$).
- **Score Prediction Model V2 Usability**: **Production-usable** only when presented as **prediction ranges** (intervals) rather than exact values. V2 incorporates player availability and expected stats, reducing Mean Absolute Error (MAE) compared to V1, and comfortably beats naive baselines by ~1.5 points.
- **Winner Prediction Source of Truth**: The **Win Probability Model** must remain the primary source of truth for match winner predictions. It is explicitly trained and calibrated on binary outcomes, whereas the score model winner is derived from margin and has higher variance.
- **Score/Total/Margin Source of Truth**: The **Score Prediction Model V2** using **derived logic** (`derived` margin and `derived` total points) must be used. Derived margin and total points yield lower validation errors than the direct modeling counterparts.
- **Single Highest-Priority Improvement**: **Cross-Season Training Data Expansion**. The models currently train on a single season (2025-26), limiting dataset size and robustness. Incorporating multiple historical seasons will stabilize model decision boundaries and improve accuracy.

---

## 1. Model Inventory

The prediction system is comprised of the following artifacts:

| Category | File Path | Description |
| :--- | :--- | :--- |
| **Win Probability Models** | `models/win_probability_model.pkl` | Calibrated Logistic Regression pipeline. |
| | `models/logistic_regression.pkl` | Base Logistic Regression model. |
| | `models/random_forest.pkl` | Random Forest classifier baseline. |
| **Score Prediction Models** | `models/home_score_model_v2.pkl` | Home score Random Forest regressor. |
| | `models/away_score_model_v2.pkl` | Away score Random Forest regressor. |
| | `models/direct_total_points_model_v2.pkl` | Direct total points Random Forest regressor. |
| | `models/direct_point_diff_model_v2.pkl` | Direct point margin Gradient Boosting regressor. |
| **Metadata Files** | `models/model_metadata.json` | Training info and metrics for the Win model. |
| | `models/score_model_v2_metadata.json` | Training info, baselines, and intervals for Score V2. |
| **Feature Definitions** | `models/feature_columns.json` | Features list for the Win probability model (38 features). |
| **Prediction Scripts** | `scripts/predict_win_probability.py` | Command-line script to predict win probability. |
| | `scripts/predict_score.py` | Command-line script to predict scores and margin ranges. |

---

## 2. Win Probability Model Report

- **Model Type**: Logistic Regression (Sigmoid scaler + StandardScaler preprocessing pipeline).
- **Training Dataset**: `data/processed/team_model_ready_v2_2025_26.csv`
- **Dataset Size**: 1758 rows, 38 features.
- **Target Column**: `WIN` (binary, 1 for home win, 0 for home loss).
- **Train/Test Strategy**: Chronological split (80% train/validation, 20% test). Validation subset used for calibration tuning.

### Metrics Summary

| Set / Calibration | Accuracy | Precision | Recall | F1-Score | ROC-AUC | Brier Score |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **5-Fold Cross-Validation** | 0.6439 | 0.6429 | 0.6474 | 0.6449 | 0.7110 | N/A |
| **Test (Uncalibrated - Best)** | **0.6429** | **0.6563** | **0.6000** | **0.6269** | **0.7254** | **0.2099** |
| **Test (Sigmoid Calibrated)** | 0.6429 | 0.6562 | 0.6000 | 0.6269 | 0.7254 | 0.2100 |
| **Test (Isotonic Calibrated)** | 0.6543 | 0.7596 | 0.4514 | 0.5663 | 0.7196 | 0.2104 |

*Sigmoid and Isotonic calibrations did not improve the Brier score over the uncalibrated Logistic Regression, so the uncalibrated classifier was selected as the final model.*

### Confusion Matrix (Test Split)
```
            Predicted Loss    Predicted Win
Actual Loss      120 (TN)          55 (FP)
Actual Win        70 (FN)         105 (TP)
```

### Confidence Bucket Accuracy
- **Toss-up (50-55% probability)**: 71 samples, **46.48%** accuracy.
- **Slight edge (55-60% probability)**: 51 samples, **50.98%** accuracy.
- **Moderate confidence (60-70% probability)**: 93 samples, **59.14%** accuracy.
- **Strong confidence (70%+ probability)**: 135 samples, **82.22%** accuracy.

### Win Model Feature Importance (Coefficients)

#### Top Positive Features (Increase Win Probability)
1. `OPP_PTS_ALLOWED_LAST_10` (+0.5756): Opponent's defensive form.
2. `H2H_GAMES_LAST_5` (+0.3228): Head-to-head game count.
3. `OPP_PTS_LAST_10` (+0.2702): Opponent offensive form.
4. `IS_HOME` (+0.2549): Home-court advantage.

#### Top Negative Features (Decrease Win Probability)
1. `PTS_ALLOWED_LAST_10` (-0.4477): Team defensive form.
2. `OPP_H2H_GAMES_LAST_5` (-0.3265): Opponent H2H games metric.
3. `OPP_AWAY_PTS_LAST_5` (-0.1923): Opponent away scoring form.
4. `PTS_LAST_10` (-0.1874): Team offensive form.

#### Low-Value / Zero-Value Features
- `IS_PLAYOFF` (0.0000): Zero coefficient, no impact.
- `IS_B2B` (-0.0145): Back-to-back indicator.
- `OPP_IS_B2B` (+0.0145): Opponent back-to-back indicator.

---

## 3. Score Prediction Model V2 Report

- **Model Selection**:
  - `HOME_PTS`: Random Forest Regressor
  - `AWAY_PTS`: Random Forest Regressor
  - `TOTAL_POINTS`: Derived (`HOME_PTS` + `AWAY_PTS` predictions)
  - `POINT_DIFF`: Derived (`HOME_PTS` - `AWAY_PTS` predictions)
- **Training Dataset**: `data/processed/team_score_model_ready_v2_player_features.csv`
- **Dataset Size**: 879 rows, 75 features (704 train, 175 test).
- **Train/Test Strategy**: Chronological split (80% train, 20% test).

### Performance Metrics Comparison (V1 vs V2 vs Naive)

| Target | Naive Baseline MAE | V1 Model MAE | V2 Model MAE | V2 Model RMSE | Improved? |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `HOME_PTS` | 11.182 | 10.045 | **9.623** | 12.390 | Yes |
| `AWAY_PTS` | 11.877 | 9.850 | **9.688** | 12.451 | Yes |
| `POINT_DIFF` | 14.475 | 13.583 | **12.950** | 16.196 | Yes |
| `TOTAL_POINTS` | 18.105 | 14.663 | **14.647** | 18.835 | Yes |

### Direct vs Derived Target Results
- **Margin (POINT_DIFF)**: Direct MAE is **13.226** vs Derived MAE is **12.950** (Derived selected).
- **Total (TOTAL_POINTS)**: Direct MAE is **14.742** vs Derived MAE is **14.647** (Derived selected).

### Empirical 80% Prediction Intervals
- **HOME_PTS**: `[-16.7, +15.3]` points
- **AWAY_PTS**: `[-16.5, +14.9]` points
- **TOTAL_POINTS**: `[-23.2, +21.1]` points
- **POINT_DIFF**: `[-19.6, +17.7]` points

### Error Bucket Performance

| Target | Within ±5 pts | Within ±10 pts | Within ±15 pts | Within ±20 pts |
| :--- | :---: | :---: | :---: | :---: |
| `HOME_PTS` | 37.1% | 58.3% | 75.4% | N/A |
| `AWAY_PTS` | 36.0% | 59.4% | 76.0% | N/A |
| `POINT_DIFF` | 21.1% | 46.9% | 66.9% | N/A |
| `TOTAL_POINTS` | N/A | 44.6% | 62.9% | 74.9% |

### Score Model Feature Categorization & Importance

The 75 features are grouped into 9 categories. Below are the top 20 strongest features across the home and away Random Forest models:

| Rank | Feature | Category | Home Importance | Away Importance |
| :---: | :--- | :--- | :---: | :---: |
| 1 | `OPP_PTS_ALLOWED_LAST_10` | opponent rolling form | **0.0638** | 0.0123 |
| 2 | `PTS_ALLOWED_LAST_10` | rolling team form | 0.0134 | **0.1084** |
| 3 | `OPP_PTS_ALLOWED_LAST_5` | opponent rolling form | **0.0480** | 0.0202 |
| 4 | `HOME_MISSING_CORE_EXPECTED_REB` | missing core player impact | 0.0101 | **0.0375** |
| 5 | `OPP_AWAY_PTS_LAST_5` | home/away split | 0.0259 | **0.0317** |
| 6 | `HOME_PTS_ALLOWED_LAST_5` | home/away split | 0.0230 | **0.0295** |
| 7 | `OPP_PTS_LAST_10` | opponent rolling form | 0.0214 | **0.0281** |
| 8 | `AWAY_PTS_LAST_5` | home/away split | **0.0275** | 0.0121 |
| 9 | `H2H_PTS_ALLOWED_LAST_5` | H2H features | 0.0233 | **0.0236** |
| 10 | `H2H_PTS_LAST_5` | H2H features | **0.0239** | 0.0205 |
| 11 | `AWAY_CORE_EXPECTED_PRA_SUM` | expected player production | **0.0224** | 0.0118 |
| 12 | `PTS_LAST_10` | rolling team form | **0.0223** | 0.0124 |
| 13 | `HOME_TOP3_EXPECTED_REB_SUM` | expected player production | **0.0210** | 0.0133 |
| 14 | `OPP_HOME_PTS_ALLOWED_LAST_5` | home/away split | **0.0209** | 0.0105 |
| 15 | `AWAY_TOP3_EXPECTED_REB_SUM` | expected player production | 0.0199 | **0.0206** |
| 16 | `HOME_TOP3_EXPECTED_AST_SUM` | expected player production | **0.0203** | 0.0098 |
| 17 | `AWAY_CORE_EXPECTED_REB_SUM` | expected player production | 0.0102 | **0.0201** |
| 18 | `OPP_PTS_LAST_5` | opponent rolling form | **0.0214** | 0.0195 |
| 19 | `HOME_PTS_LAST_5` | home/away split | **0.0228** | 0.0194 |
| 20 | `AWAY_CORE_EXPECTED_MIN_SUM` | expected minutes | 0.0135 | **0.0193** |

#### Weak / Redundant Features
- `IS_PLAYOFF` (0.000 importance in both models)
- `DAYS_REST` / `OPP_DAYS_REST` (< 0.01 importance)
- `IS_B2B` / `OPP_IS_B2B` (< 0.005 importance)

---

## 4. Cross-Model Comparison

- **Shared Features (33 features)**: Both models share all rolling team form, opponent rolling form, schedule, home/away splits, and basic head-to-head metrics.
- **Unique to Win Probability (5 features)**: `IS_HOME`, plus 4 symmetric opponent H2H metrics (`OPP_H2H_GAMES_LAST_5`, `OPP_H2H_WINRATE_LAST_5`, `OPP_H2H_PTS_LAST_5`, `OPP_H2H_PTS_ALLOWED_LAST_5`). Omitted in the score model as the home/away models process splits implicitly.
- **Unique to Score Prediction (42 features)**: All player-level availability, expected minutes, expected production, and missing player impact features.
- **Signal Agreement**: Both models agree strongly on the value of **team defensive form** (`PTS_ALLOWED_LAST_10` / `OPP_PTS_ALLOWED_LAST_10`), ranking them as top predictive signals.
- **Model Winner Predictions Agreement**: The win probability model and the score model agree on the predicted winner **82.86%** of the time. Disagreements occur primarily in close matchups (predicted margin $\le 2.0$ points), where the win probability model often predicts a slight advantage for the away team, but the score model forecasts a narrow home win.

---

## 5. Weakness Analysis

1. **Overfitting Risk**: The dataset contains under 1,000 unique matchups for the score model, all restricted to the 2025-26 season. The Random Forest models are highly prone to memorize specific matchup permutations.
2. **Weak Feature Groups**: Rest and schedule-based features (`IS_B2B`, `DAYS_REST`) show near-zero importance and coefficients in both models, failing to capture fatigue effectively.
3. **Head-to-Head Instability**: Head-to-head metrics are computed over a tiny sample size ($H2H\_GAMES\_LAST\_5 \le 1$ for many matchups), making them highly volatile.
4. **Data Sparsity in Playoffs**: `IS_PLAYOFF` is heavily imbalanced, leading to near-zero coefficients. The model has insufficient playoff training rows.
5. **Player Availability Proxy Limitations**: "Available" is approximated by looking at whether a player played $>0$ minutes in any of the last 3 games. This proxy fails to capture late-breaking scratch decisions, trades, or mid-game injuries.

---

## 6. Improvement Roadmap

A comprehensive roadmap is stored at [model_improvement_roadmap.md](file:///Users/serhat/agProjects/nbaModelApp/reports/model_improvement_roadmap.md). High-priority targets include cross-season data expansion, advanced scheduling/travel fatigue indices, and a hierarchical player minutes allocation model.
