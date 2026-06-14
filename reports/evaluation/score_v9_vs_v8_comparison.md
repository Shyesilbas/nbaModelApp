# SCORE V9 vs V8 Model Segment Comparison Report

Chronological split test set: games after 2025-04-06.
V9 uses the full train set with Ridge residual post-processing calibration applied.
V8 is the current production model without post-processing calibration.

## Performance Comparison

### Total Score Metrics
| segment | games | v8_total_mae | v9_total_mae | total_mae_delta | v8_total_bias | v9_total_bias |
| --- | --- | --- | --- | --- | --- | --- |
| overall | 1022 | 14.8537 | 14.7452 | -0.1086 | -0.4425 | -0.8694 |
| home_b2b | 152 | 15.7562 | 15.6606 | -0.0955 | -2.1703 | -1.6742 |
| away_b2b | 157 | 15.0927 | 15.0838 | -0.0090 | -1.3628 | -1.4675 |
| either_b2b | 253 | 15.3629 | 15.3000 | -0.0630 | -2.5455 | -2.1851 |
| away_rest_advantage | 185 | 15.6631 | 15.6002 | -0.0629 | -2.4058 | -1.3277 |
| home_rest_advantage | 205 | 14.3653 | 14.1792 | -0.1861 | -1.5798 | -1.3964 |
| playoffs | 165 | 14.9505 | 14.3996 | -0.5509 | 4.8014 | -0.4542 |

### Margin Metrics
| segment | games | v8_margin_mae | v9_margin_mae | margin_mae_delta | v8_margin_bias | v9_margin_bias |
| --- | --- | --- | --- | --- | --- | --- |
| overall | 1022 | 12.2611 | 12.2426 | -0.0185 | -0.1713 | -0.1206 |
| home_b2b | 152 | 12.9367 | 12.8602 | -0.0765 | 2.3917 | 1.2327 |
| away_b2b | 157 | 12.3688 | 12.3860 | 0.0171 | 0.1191 | 1.3972 |
| either_b2b | 253 | 12.8824 | 12.8308 | -0.0516 | 1.2448 | 1.2547 |
| away_rest_advantage | 185 | 12.9228 | 12.8651 | -0.0577 | 1.3771 | 0.0748 |
| home_rest_advantage | 205 | 12.3630 | 12.3739 | 0.0109 | -1.0251 | -0.2138 |
| playoffs | 165 | 13.8294 | 13.7606 | -0.0688 | -0.9929 | -0.0533 |

## Summary Findings
- Overall Total MAE delta: -0.10856
- Overall Margin MAE delta: -0.01853
- Playoff Total Bias reduction: from 4.8014 to -0.4542
- Playoff Margin Bias reduction: from -0.9929 to -0.0533