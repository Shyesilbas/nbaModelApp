# Player Prediction V3 Training Report

## Evaluation Metrics
Train: 2024-25 Season | Test: 2025-26 Season

### TARGET_PTS
- **Ridge** -> MAE: `4.620`, RMSE: `6.040`, R²: `0.518`
- **GBDT** -> MAE: `4.634`, RMSE: `6.060`, R²: `0.515`
- **RandomForest** -> MAE: `4.664`, RMSE: `6.088`, R²: `0.511`

### TARGET_REB
- **Ridge** -> MAE: `1.972`, RMSE: `2.580`, R²: `0.399`
- **GBDT** -> MAE: `1.974`, RMSE: `2.580`, R²: `0.399`
- **RandomForest** -> MAE: `1.981`, RMSE: `2.586`, R²: `0.397`

### TARGET_AST
- **Ridge** -> MAE: `1.377`, RMSE: `1.864`, R²: `0.471`
- **GBDT** -> MAE: `1.380`, RMSE: `1.871`, R²: `0.467`
- **RandomForest** -> MAE: `1.388`, RMSE: `1.875`, R²: `0.465`

### TARGET_PRA
- **Ridge** -> MAE: `6.088`, RMSE: `7.837`, R²: `0.576`
- **GBDT** -> MAE: `6.131`, RMSE: `7.894`, R²: `0.570`
- **RandomForest** -> MAE: `6.195`, RMSE: `7.942`, R²: `0.565`

## Feature Importance (GBDT)
Top 15 most important features for each target, assessing the impact of V3 Opponent Matchup metrics.

### TARGET_PTS Top 15 Features
1. `PTS_LAST_10`: 0.8526 
1. `PTS_LAST_5`: 0.0509 
1. `MIN_EMA_5`: 0.0376 
1. `MIN_EMA_10`: 0.0064 
1. `AST_LAST_5`: 0.0061 
1. `DAYS_REST`: 0.0050 
1. `PLAYER_ID`: 0.0048 
1. `MIN_LAST_3`: 0.0042 
1. `MIN_TREND`: 0.0036 
1. `ELO_DIFF`: 0.0027 
1. `TEAM_ELO`: 0.0025 
1. `OPP_ELO`: 0.0023 
1. `BLOWOUT_RISK_PROXY`: 0.0023 
1. `PLUS_MINUS_LAST_5`: 0.0021 
1. `MIN_STD_LAST_10`: 0.0017 

### TARGET_REB Top 15 Features
1. `REB_LAST_5`: 0.9109 
1. `PLAYER_ID`: 0.0146 
1. `MIN_EMA_5`: 0.0093 
1. `PTS_LAST_10`: 0.0080 
1. `MIN_EMA_10`: 0.0058 
1. `DAYS_REST`: 0.0052 
1. `OPP_ELO`: 0.0041 
1. `MIN_LAST_10`: 0.0039 
1. `MIN_TREND`: 0.0036 
1. `MIN_LAST_3`: 0.0036 
1. `MIN_STD_LAST_10`: 0.0031 
1. `PLUS_MINUS_LAST_5`: 0.0030 
1. `BLOWOUT_RISK_PROXY`: 0.0027 
1. `OPP_TEAM_PACE`: 0.0025 
1. `TEAM_ELO`: 0.0022 

### TARGET_AST Top 15 Features
1. `AST_LAST_5`: 0.9035 
1. `PTS_LAST_10`: 0.0193 
1. `MIN_EMA_5`: 0.0126 
1. `MIN_EMA_10`: 0.0067 
1. `PLAYER_ID`: 0.0061 
1. `PLUS_MINUS_LAST_5`: 0.0055 
1. `OPP_GUARD_AST_ALLOWED_LAST_10`: 0.0045 ⭐ V3 MATCHUP
1. `OPP_ELO`: 0.0038 
1. `REB_LAST_5`: 0.0036 
1. `DAYS_REST`: 0.0032 
1. `MIN_LAST_10`: 0.0029 
1. `PTS_LAST_5`: 0.0028 
1. `OPP_WING_AST_ALLOWED_LAST_10`: 0.0025 ⭐ V3 MATCHUP
1. `TEAM_PACE`: 0.0022 
1. `MIN_STD_LAST_10`: 0.0022 

### TARGET_PRA Top 15 Features
1. `PTS_LAST_10`: 0.7145 
1. `MIN_EMA_5`: 0.1143 
1. `REB_LAST_5`: 0.0390 
1. `MIN_EMA_10`: 0.0316 
1. `PTS_LAST_5`: 0.0310 
1. `AST_LAST_5`: 0.0297 
1. `MIN_LAST_3`: 0.0063 
1. `DAYS_REST`: 0.0054 
1. `PLAYER_ID`: 0.0040 
1. `OPP_ELO`: 0.0029 
1. `BLOWOUT_RISK_PROXY`: 0.0029 
1. `MIN_TREND`: 0.0023 
1. `IS_PLAYOFF`: 0.0018 
1. `ELO_DIFF`: 0.0018 
1. `OPP_TEAM_PACE`: 0.0017 
