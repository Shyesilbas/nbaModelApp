# Score V8 Residual Analysis

Chronological holdout: games after 2025-04-06. Signed error is `prediction - actual`.

## Focus Segment Residuals
| segment | games | total_mae | total_bias | margin_mae | margin_bias | pace_mae | pace_bias | home_rtg_mae | home_rtg_bias | away_rtg_mae | away_rtg_bias |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| overall | 1022 | 14.8537 | -0.4425 | 12.2611 | -0.1713 | 3.4759 | 0.0671 | 8.7510 | -0.4435 | 9.1649 | -0.2064 |
| home_b2b | 152 | 15.7562 | -2.1703 | 12.9367 | 2.3917 | 3.7311 | 0.2533 | 9.4305 | -0.3517 | 9.2397 | -2.4521 |
| away_b2b | 157 | 15.0927 | -1.3628 | 12.3688 | 0.1191 | 3.7039 | 0.2964 | 8.8482 | -0.9750 | 9.9978 | -1.2265 |
| either_b2b | 253 | 15.3629 | -2.5455 | 12.8824 | 1.2448 | 3.6393 | 0.1293 | 9.2008 | -0.9146 | 9.7970 | -2.0312 |
| away_rest_advantage | 185 | 15.6631 | -2.4058 | 12.9228 | 1.3771 | 3.2938 | -0.1609 | 9.0092 | -0.5705 | 9.9412 | -1.5218 |
| home_rest_advantage | 205 | 14.3653 | -1.5798 | 12.3630 | -1.0251 | 3.5067 | -0.2810 | 8.3558 | -0.8965 | 9.4869 | -0.1569 |
| playoffs | 165 | 14.9505 | 4.8014 | 13.8294 | -0.9929 | 3.5895 | 0.5620 | 9.1910 | 1.1024 | 9.6744 | 2.4322 |
| small_winrate_gap | 349 | 14.1577 | 0.4628 | 12.9740 | -0.0814 | 3.6766 | 0.0213 | 8.8198 | 0.1628 | 9.4630 | 0.1612 |

## Largest Signed Biases
| segment | games | total_bias | total_bias_abs | margin_bias | margin_bias_abs | pace_bias | pace_bias_abs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| playoffs | 165 | 4.8014 | 4.8014 | -0.9929 | 0.9929 | 0.5620 | 0.5620 |
| either_b2b | 253 | -2.5455 | 2.5455 | 1.2448 | 1.2448 | 0.1293 | 0.1293 |
| away_rest_advantage | 185 | -2.4058 | 2.4058 | 1.3771 | 1.3771 | -0.1609 | 0.1609 |
| home_b2b | 152 | -2.1703 | 2.1703 | 2.3917 | 2.3917 | 0.2533 | 0.2533 |
| home_rest_advantage | 205 | -1.5798 | 1.5798 | -1.0251 | 1.0251 | -0.2810 | 0.2810 |
| missing_core_home | 585 | -1.5520 | 1.5520 | 0.7744 | 0.7744 | -0.0593 | 0.0593 |
| regular_season | 857 | -1.4521 | 1.4521 | -0.0131 | 0.0131 | -0.0282 | 0.0282 |
| large_winrate_gap | 352 | -1.4314 | 1.4314 | -0.4564 | 0.4564 | -0.1051 | 0.1051 |
| away_b2b | 157 | -1.3628 | 1.3628 | 0.1191 | 0.1191 | 0.2964 | 0.2964 |
| missing_core_away | 599 | -1.2300 | 1.2300 | -0.8475 | 0.8475 | -0.1352 | 0.1352 |

## Interpretation

- If total bias is near zero but MAE is high, the problem is variance/noise, not a simple global correction.
- If pace bias is large in a segment, pace feature/model should be targeted before rating models.
- If margin model bias differs from raw rating margin bias, reconciliation is contributing to directional error.
