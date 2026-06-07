# NBA Team Score Prediction Model Report

> Generated: 2026-06-06 23:24:22

## 1. Overview
This report documents the performance of the baseline regression models trained to predict NBA scores:
- **`HOME_PTS`**: Predicted Home Team Score (model-driven)
- **`AWAY_PTS`**: Predicted Away Team Score (model-driven)
- **`POINT_DIFF`**: Predicted Margin (derived: Home - Away)
- **`TOTAL_POINTS`**: Predicted Total Points (derived: Home + Away)

## 2. Dataset Specifications
- **Source Feature Dataset**: `/Users/serhat/agProjects/nbaModelApp/data/processed/team_model_ready_v2_2025_26.csv`
- **Total Matchups (games)**: `879`
- **Train Samples (80%)**: `704`
- **Test Samples (20%)**: `175` (Chronological split)
- **Features Count**: `33` (Leakage-free, pre-game team rolling features, collinear H2H/IS_HOME columns excluded)

## 3. Best Selected Models
- **Home Score Model**: `Ridge Regression`
- **Away Score Model**: `Random Forest Regressor`

## 4. Evaluation Metrics (Best Combined Model on Test Set)
| Target | MAE | RMSE | R² |
| :--- | :---: | :---: | :---: |
| `HOME_PTS` | 10.045 | 12.623 | 0.213 |
| `AWAY_PTS` | 9.850 | 12.522 | 0.167 |
| `POINT_DIFF` | 13.583 | 16.614 | 0.200 |
| `TOTAL_POINTS` | 14.663 | 18.874 | 0.184 |

## 5. Model Comparison (All Tested Architectures)
| Algorithm | Target | MAE | RMSE | R² |
| :--- | :--- | :---: | :---: | :---: |
| Linear Regression | `HOME` | 10.057 | 12.648 | 0.210 |
| Linear Regression | `AWAY` | 10.665 | 13.324 | 0.057 |
| Linear Regression | `POINT_DIFF` | 13.927 | 17.096 | 0.153 |
| Linear Regression | `TOTAL_POINTS` | 15.323 | 19.565 | 0.123 |
| Ridge Regression | `HOME` | 10.045 | 12.623 | 0.213 |
| Ridge Regression | `AWAY` | 10.594 | 13.278 | 0.064 |
| Ridge Regression | `POINT_DIFF` | 13.862 | 17.044 | 0.158 |
| Ridge Regression | `TOTAL_POINTS` | 15.287 | 19.513 | 0.128 |
| Random Forest Regressor | `HOME` | 10.293 | 13.051 | 0.159 |
| Random Forest Regressor | `AWAY` | 9.850 | 12.522 | 0.167 |
| Random Forest Regressor | `POINT_DIFF` | 13.655 | 16.961 | 0.166 |
| Random Forest Regressor | `TOTAL_POINTS` | 14.940 | 19.146 | 0.160 |
| Gradient Boosting | `HOME` | 10.672 | 13.272 | 0.130 |
| Gradient Boosting | `AWAY` | 9.891 | 12.628 | 0.153 |
| Gradient Boosting | `POINT_DIFF` | 14.097 | 17.249 | 0.138 |
| Gradient Boosting | `TOTAL_POINTS` | 15.009 | 19.331 | 0.144 |

## 6. Files Created
- [home_score_model.pkl](file:///Users/serhat/agProjects/nbaModelApp/models/home_score_model.pkl) (Best Home model pipeline)
- [away_score_model.pkl](file:///Users/serhat/agProjects/nbaModelApp/models/away_score_model.pkl) (Best Away model pipeline)
- [score_model_metadata.json](file:///Users/serhat/agProjects/nbaModelApp/models/score_model_metadata.json) (Metrics and metadata)

## 7. Inference usage
```bash
python scripts/predict_score.py --home LAL --away BOS --prediction-date 2026-03-15
```
