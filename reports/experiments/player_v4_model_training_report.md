# Player Prediction V4 Training Report

## Summary
We trained and evaluated five different algorithms on the V4 player dataset incorporating Usage Rate (USG_PCT) rolling features and position-allowed metrics.

## Model Comparison Metrics
Train Set: 2024-25 Season | Test Set: 2025-26 Season

### TARGET_PTS
| Model | MAE | RMSE | R² |
|---|---|---|---|
| LightGBM | 4.5838 | 5.9963 | 0.5251 |
| XGBoost | 4.5903 | 6.0001 | 0.5245 |
| Ridge_Baseline | 4.5994 | 6.0096 | 0.5230 |
| RidgeCV | 4.5995 | 6.0096 | 0.5230 |
| RandomForest | 4.6238 | 6.0242 | 0.5207 |

### TARGET_REB
| Model | MAE | RMSE | R² |
|---|---|---|---|
| LightGBM | 1.9669 | 2.5791 | 0.3999 |
| XGBoost | 1.9708 | 2.5843 | 0.3975 |
| Ridge_Baseline | 1.9714 | 2.5793 | 0.3998 |
| RidgeCV | 1.9714 | 2.5793 | 0.3998 |
| RandomForest | 1.9785 | 2.5841 | 0.3976 |

### TARGET_AST
| Model | MAE | RMSE | R² |
|---|---|---|---|
| LightGBM | 1.3709 | 1.8638 | 0.4712 |
| XGBoost | 1.3750 | 1.8669 | 0.4694 |
| Ridge_Baseline | 1.3759 | 1.8626 | 0.4718 |
| RidgeCV | 1.3759 | 1.8626 | 0.4718 |
| RandomForest | 1.3861 | 1.8703 | 0.4674 |

## Feature Importance (XGBoost)
Top 15 most important features for each target, assessing the predictive power of Usage Rate features.

### TARGET_PTS Top 15 Features
1. `PTS_LAST_10`: 0.6278 
2. `MIN_EMA_5`: 0.0534 
3. `PTS_LAST_5`: 0.0311 
4. `MIN_EMA_10`: 0.0264 
5. `USG_PCT_EMA_10`: 0.0198 ⭐ USG_PCT
6. `USG_PCT_EMA_5`: 0.0189 ⭐ USG_PCT
7. `USG_PCT_LAST_10`: 0.0129 ⭐ USG_PCT
8. `MIN_LAST_3`: 0.0122 
9. `PLAYER_ID`: 0.0095 
10. `MIN_LAST_10`: 0.0086 
11. `ELO_DIFF`: 0.0084 
12. `DAYS_REST`: 0.0083 
13. `USG_PCT_LAST_3`: 0.0080 ⭐ USG_PCT
14. `IS_PLAYOFF`: 0.0074 
15. `OPP_WING_PTS_ALLOWED_LAST_10`: 0.0074 

### TARGET_REB Top 15 Features
1. `REB_LAST_5`: 0.4753 
2. `MIN_EMA_5`: 0.0280 
3. `MIN_EMA_10`: 0.0241 
4. `PLAYER_ID`: 0.0196 
5. `MIN_LAST_3`: 0.0178 
6. `PTS_LAST_10`: 0.0156 
7. `MIN_LAST_10`: 0.0156 
8. `IS_PLAYOFF`: 0.0156 
9. `DAYS_REST`: 0.0150 
10. `OPP_UNKNOWN_REB_ALLOWED_LAST_10`: 0.0146 
11. `USG_PCT_EMA_10`: 0.0146 ⭐ USG_PCT
12. `MIN_LAST_5`: 0.0145 
13. `ELO_DIFF`: 0.0144 
14. `OPP_WING_AST_ALLOWED_LAST_10`: 0.0143 
15. `TEAM_ELO`: 0.0143 

### TARGET_AST Top 15 Features
1. `AST_LAST_5`: 0.4670 
2. `MIN_EMA_5`: 0.0289 
3. `USG_PCT_EMA_10`: 0.0264 ⭐ USG_PCT
4. `MIN_EMA_10`: 0.0262 
5. `USG_PCT_LAST_10`: 0.0250 ⭐ USG_PCT
6. `MIN_LAST_3`: 0.0182 
7. `MIN_LAST_10`: 0.0169 
8. `PTS_LAST_10`: 0.0168 
9. `OPP_GUARD_AST_ALLOWED_LAST_10`: 0.0167 
10. `PLAYER_ID`: 0.0161 
11. `USG_PCT_EMA_5`: 0.0160 ⭐ USG_PCT
12. `OPP_BIG_REB_ALLOWED_LAST_10`: 0.0154 
13. `OPP_WING_PTS_ALLOWED_LAST_10`: 0.0143 
14. `OPP_ELO`: 0.0139 
15. `IS_PLAYOFF`: 0.0135 
