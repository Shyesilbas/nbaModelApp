# Player Prediction V8 Residual & Segment Analysis

Chronological holdout: player games after 2025-03-25.
Signed error is `prediction - actual` (positive bias means over-predicting).

## Holdout Segment Performance
| segment | rows | pts_mae | pts_bias | reb_mae | reb_bias | ast_mae | ast_bias |
| --- | --- | --- | --- | --- | --- | --- | --- |
| all | 33034 | 4.5011 | -0.1239 | 1.9317 | -0.0214 | 1.3371 | -0.0237 |
| regular_season | 29210 | 4.5389 | -0.1605 | 1.9466 | -0.0285 | 1.3565 | -0.0318 |
| playoffs | 3824 | 4.2125 | 0.1558 | 1.8179 | 0.0326 | 1.1884 | 0.0381 |
| home | 16583 | 4.4651 | -0.1486 | 1.9219 | -0.0094 | 1.3474 | -0.0334 |
| away | 16451 | 4.5374 | -0.0990 | 1.9415 | -0.0335 | 1.3266 | -0.0140 |
| position_guard | 17066 | 4.6947 | -0.1016 | 1.6964 | 0.1848 | 1.5035 | -0.1191 |
| position_wing | 9501 | 4.3039 | -0.1230 | 1.9544 | -0.0710 | 1.1675 | 0.0879 |
| position_big | 6467 | 4.2799 | -0.1841 | 2.5191 | -0.4927 | 1.1471 | 0.0640 |
| high_usage | 5317 | 5.8079 | -0.1310 | 2.1000 | -0.0088 | 1.8091 | 0.0017 |
| med_usage | 18230 | 4.6435 | -0.1704 | 1.9310 | -0.0229 | 1.3420 | -0.0417 |
| low_usage | 9405 | 3.4912 | -0.0362 | 1.8359 | -0.0292 | 1.0639 | -0.0062 |
| heavy_minutes | 7703 | 5.6562 | -0.1150 | 2.1665 | 0.0138 | 1.8063 | -0.0125 |
| rotation_minutes | 17766 | 4.5591 | -0.1546 | 1.9763 | -0.0379 | 1.3303 | -0.0371 |
| light_minutes | 7483 | 3.1804 | -0.0683 | 1.5815 | -0.0228 | 0.8741 | -0.0071 |

## Key Findings & Bias Observations

### 1. Position-Specific Bias Analysis
- **Guards**: PTS Bias = -0.1016, AST Bias = -0.1191
- **Wings**: PTS Bias = -0.1230, REB Bias = -0.0710
- **Bigs**: REB Bias = -0.4927, PTS Bias = -0.1841

### 2. Usage & Minutes Segment Analysis
- **High Usage players (>=25% USG)**: PTS Bias = -0.1310 (under-predicting star players if negative, over-predicting if positive).
- **Low Usage players (<15% USG)**: PTS Bias = -0.0362.
- **Heavy Minutes players (>=30 MIN)**: PTS Bias = -0.1150.

### 3. Playoff vs Regular Season Divergence
- **Regular Season**: PTS Bias = -0.1605, REB Bias = -0.0285, AST Bias = -0.0318
- **Playoffs**: PTS Bias = 0.1558, REB Bias = 0.0326, AST Bias = 0.0381
