# Player Prediction V4 Training Report

## Summary
We trained and evaluated five different algorithms on the V4 player dataset incorporating Usage Rate (USG_PCT) rolling features and position-allowed metrics.

## Model Comparison Metrics
Train Set: 2024-25 Season | Test Set: 2025-26 Season

### TARGET_PTS
| Model | MAE | RMSE | R² |
|---|---|---|---|
| LightGBM | 4.5815 | 5.9974 | 0.5250 |
| XGBoost | 4.5916 | 6.0040 | 0.5239 |
| Ridge_Baseline | 4.5982 | 6.0095 | 0.5230 |
| RidgeCV | 4.5982 | 6.0095 | 0.5230 |
| RandomForest | 4.6225 | 6.0237 | 0.5208 |

### TARGET_REB
| Model | MAE | RMSE | R² |
|---|---|---|---|
| LightGBM | 1.9658 | 2.5760 | 0.4014 |
| XGBoost | 1.9721 | 2.5835 | 0.3978 |
| Ridge_Baseline | 1.9730 | 2.5795 | 0.3997 |
| RidgeCV | 1.9730 | 2.5795 | 0.3997 |
| RandomForest | 1.9772 | 2.5820 | 0.3986 |

### TARGET_AST
| Model | MAE | RMSE | R² |
|---|---|---|---|
| XGBoost | 1.3744 | 1.8658 | 0.4700 |
| LightGBM | 1.3745 | 1.8684 | 0.4686 |
| Ridge_Baseline | 1.3749 | 1.8624 | 0.4719 |
| RidgeCV | 1.3749 | 1.8624 | 0.4719 |
| RandomForest | 1.3838 | 1.8692 | 0.4681 |

## Feature Importance (XGBoost)
Top 15 most important features for each target, assessing the predictive power of Usage Rate features.

### TARGET_PTS Top 15 Features
1. `PTS_LAST_10`: 0.6405 
2. `MIN_EMA_5`: 0.0536 
3. `PTS_LAST_5`: 0.0327 
4. `MIN_EMA_10`: 0.0280 
5. `USG_PCT_EMA_5`: 0.0199 ⭐ USG_PCT
6. `USG_PCT_EMA_10`: 0.0196 ⭐ USG_PCT
7. `MIN_LAST_3`: 0.0123 
8. `USG_PCT_LAST_10`: 0.0112 ⭐ USG_PCT
9. `PLAYER_ID`: 0.0091 
10. `IS_PLAYOFF`: 0.0090 
11. `USG_PCT_LAST_3`: 0.0090 ⭐ USG_PCT
12. `ELO_DIFF`: 0.0081 
13. `AST_LAST_5`: 0.0079 
14. `DAYS_REST`: 0.0079 
15. `MIN_LAST_10`: 0.0077 

### TARGET_REB Top 15 Features
1. `REB_LAST_5`: 0.4959 
2. `MIN_EMA_5`: 0.0270 
3. `MIN_EMA_10`: 0.0230 
4. `PLAYER_ID`: 0.0197 
5. `IS_PLAYOFF`: 0.0192 
6. `MIN_LAST_3`: 0.0185 
7. `DAYS_REST`: 0.0166 
8. `PTS_LAST_10`: 0.0164 
9. `OPP_TEAM_PACE`: 0.0160 
10. `USG_PCT_EMA_10`: 0.0160 ⭐ USG_PCT
11. `ELO_DIFF`: 0.0152 
12. `TEAM_ELO`: 0.0151 
13. `OPP_BIG_AST_ALLOWED_LAST_10`: 0.0150 
14. `MIN_LAST_5`: 0.0140 
15. `OPP_GUARD_AST_ALLOWED_LAST_10`: 0.0137 

### TARGET_AST Top 15 Features
1. `AST_LAST_5`: 0.4846 
2. `MIN_EMA_5`: 0.0276 
3. `USG_PCT_EMA_10`: 0.0268 ⭐ USG_PCT
4. `MIN_EMA_10`: 0.0247 
5. `USG_PCT_LAST_10`: 0.0244 ⭐ USG_PCT
6. `MIN_LAST_3`: 0.0202 
7. `OPP_GUARD_AST_ALLOWED_LAST_10`: 0.0183 
8. `PTS_LAST_10`: 0.0176 
9. `PLAYER_ID`: 0.0169 
10. `USG_PCT_EMA_5`: 0.0167 ⭐ USG_PCT
11. `MIN_LAST_10`: 0.0160 
12. `OPP_BIG_REB_ALLOWED_LAST_10`: 0.0153 
13. `OPP_ELO`: 0.0142 
14. `USG_PCT_STD_LAST_10`: 0.0141 ⭐ USG_PCT
15. `OPP_WING_REB_ALLOWED_LAST_10`: 0.0135 
