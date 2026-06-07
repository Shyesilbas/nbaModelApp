# NBA Score Prediction Model V2 Report (Player Availability & Impact)

> Generated: 2026-06-06 23:35:22

## 1. Overview
This report documents the performance of the V2 NBA Score Prediction Model, which adds player availability proxies and expected minutes/offensive contributions on top of team rolling aggregates.

> [!NOTE]
> **Availability Proxy definition:** Official injury reports are not available, so availability is approximated using a recent-participation proxy: a core player is **available** if they played $>0$ minutes in at least one of their team's last 3 games. Otherwise, they are marked as **missing**.

## 2. Model Evaluation (V1 vs V2 Comparison)
The models are evaluated using a chronological split (80% train, 20% test). Below is the evaluation summary:

| Target | Metric | V1 Baseline | V2 (Player Features) | Improved? |
| :--- | :---: | :---: | :---: | :---: |
| `HOME_PTS` | MAE | 10.045 | 9.623 | Yes |
| | RMSE | 12.623 | 12.390 | |
| | R² | 0.213 | 0.242 | |
| `AWAY_PTS` | MAE | 9.850 | 9.688 | Yes |
| | RMSE | 12.522 | 12.451 | |
| | R² | 0.167 | 0.177 | |
| `POINT_DIFF` | MAE | 13.583 | 12.950 | Yes |
| `TOTAL_POINTS` | MAE | 14.663 | 14.647 | Yes |

## 3. Direct vs Derived Model Comparison
- **POINT_DIFF (Margin):**
  - Direct Model MAE: `13.226`
  - Derived Model MAE (HOME_PTS - AWAY_PTS): `12.950`
  - Primary Margin Prediction logic selected: **`derived`**
- **TOTAL_POINTS (Total):**
  - Direct Model MAE: `14.742`
  - Derived Model MAE (HOME_PTS + AWAY_PTS): `14.647`
  - Primary Total Prediction logic selected: **`derived`**

## 4. Comparison with Naive Baselines
To verify production-readiness, the selected V2 models are compared against naive rolling averages:

| Target | Naive Method | Naive MAE | V2 ML MAE | Beats Naive? |
| :--- | :--- | :---: | :---: | :---: |
| `HOME_PTS` | Home Team `PTS_LAST_10` | 11.182 | 9.623 | Yes |
| `AWAY_PTS` | Away Team `OPP_PTS_LAST_10` | 11.877 | 9.688 | Yes |
| `TOTAL_POINTS` | Rolling sum of averages | 18.105 | 14.647 | Yes |
| `POINT_DIFF` | Rolling diff of averages | 14.475 | 12.950 | Yes |
| `POINT_DIFF` | Win-Probability Derived margin | 13.834 | 12.950 | Yes |

## 5. Prediction Intervals (Empirical Residual Distribution)
Based on the chronological test split errors, the empirical 80% prediction intervals (10th and 90th percentiles of residuals) are:
- **HOME_PTS:** `[-16.7, +15.3]` points
- **AWAY_PTS:** `[-16.5, +14.9]` points
- **TOTAL_POINTS:** `[-23.2, +21.1]` points
- **POINT_DIFF (Margin):** `[-19.6, +17.7]` points

## 6. Accuracy Error Buckets (Test Split)
| Target | Within ±5 pts | Within ±10 pts | Within ±15 pts | Within ±20 pts |
| :--- | :---: | :---: | :---: | :---: |
| `HOME_PTS` | 37.1% | 58.3% | 75.4% | N/A |
| `AWAY_PTS` | 36.0% | 59.4% | 76.0% | N/A |
| `POINT_DIFF` | 21.1% | 46.9% | 66.9% | N/A |
| `TOTAL_POINTS` | N/A | 44.6% | 62.9% | 74.9% |

## 7. Consistency Report with Win Probability Model
- **Agreement Rate on Winner Prediction:** `82.86%`

### Example Disagreement Cases:
- **Date:** 2026-04-23 | **Matchup:** ATL vs NYK | Actual: HOME (109-108)
  - Win Prob Model: AWAY (prob: 0.497)
  - Score Model: HOME (margin: +1.1)
- **Date:** 2026-04-25 | **Matchup:** ATL vs NYK | Actual: AWAY (98-114)
  - Win Prob Model: AWAY (prob: 0.457)
  - Score Model: HOME (margin: +0.1)
- **Date:** 2026-04-20 | **Matchup:** CLE vs TOR | Actual: HOME (115-105)
  - Win Prob Model: AWAY (prob: 0.365)
  - Score Model: HOME (margin: +1.4)
- **Date:** 2026-04-12 | **Matchup:** DAL vs CHI | Actual: HOME (149-128)
  - Win Prob Model: HOME (prob: 0.618)
  - Score Model: AWAY (margin: -1.2)
- **Date:** 2026-04-18 | **Matchup:** DEN vs MIN | Actual: HOME (116-105)
  - Win Prob Model: AWAY (prob: 0.457)
  - Score Model: HOME (margin: +2.3)

## 8. Final Decision & Recommendations
### Did core-player features improve the score model?
Yes. Adding player availability and expected stats features improved the prediction accuracy across `HOME_PTS`, `AWAY_PTS`, `POINT_DIFF`, `TOTAL_POINTS`.

### Which target improved the most?
The target that improved the most was **`POINT_DIFF`**, which saw a decrease of `0.633` in MAE.

### Is V2 good enough for backend/frontend integration?
Yes, V2 is ready for integration as it meaningfully beats the naive rolling average baselines on chronological validation.

### Should score prediction be displayed as exact score or score range?
Score predictions **MUST** be displayed as **score ranges** (prediction intervals) rather than exact values. Due to the high natural variance of basketball games, predictions have a typical MAE of ~10 points, making exact numbers misleadingly confident.

### Should win-probability model remain the primary winner signal?
Yes, the win-probability model **MUST** remain the primary winner predictor. The score model is only used for expected score, total, and margin estimates. This prevents inconsistent winner signals and leverages the calibrated classifier trained specifically on outcomes.
