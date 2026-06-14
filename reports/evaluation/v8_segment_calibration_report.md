# V8 Segment & Calibration Evaluation

Evaluation is computed on the chronological holdout after 2025-04-06 for team models.

## Key Findings

- WIN is strongest when team-strength separation is clear: `large_winrate_gap` ROC-AUC is 0.8245 and Brier is 0.1717.
- WIN is weakest in toss-up contexts: `low_conf_50_55` ROC-AUC is 0.5525 and Brier is 0.2482.
- WIN playoff performance is materially weaker than regular season: playoff ROC-AUC is 0.6781 vs regular-season ROC-AUC 0.7519.
- SCORE error is worst in schedule-stress contexts, especially `home_b2b` total MAE 15.7562 and `away_rest_advantage` total MAE 15.6631.
- Calibration is not globally broken, but mid/high buckets need correction: 0.65-0.70 is overconfident by +0.0447, 0.70-1.00 is underconfident by -0.0278.

## Next Improvement Targets

1. Build an out-of-fold probability calibration layer and evaluate it against this report before promotion.
2. Add playoff-specific and close-team-strength features, because those are the weakest WIN segments.
3. Improve score model schedule-stress handling for B2B/rest-advantage segments.

## Win Segments
| segment | rows | accuracy | roc_auc | brier | avg_pred | actual_rate |
| --- | --- | --- | --- | --- | --- | --- |
| overall | 2044 | 0.6776 | 0.7407 | 0.2057 | 0.5000 | 0.5000 |
| all | 2044 | 0.6776 | 0.7407 | 0.2057 | 0.5000 | 0.5000 |
| regular_season | 1714 | 0.6867 | 0.7519 | 0.2017 | 0.5000 | 0.5000 |
| playoffs | 330 | 0.6303 | 0.6781 | 0.2261 | 0.5001 | 0.5000 |
| home_b2b | 309 | 0.6731 | 0.7218 | 0.2129 | 0.4630 | 0.4790 |
| away_b2b | 309 | 0.6731 | 0.7217 | 0.2130 | 0.5370 | 0.5210 |
| either_b2b | 506 | 0.6640 | 0.7181 | 0.2137 | 0.5000 | 0.5000 |
| home_rest_advantage | 390 | 0.6615 | 0.7386 | 0.2065 | 0.5472 | 0.5308 |
| away_rest_advantage | 390 | 0.6615 | 0.7387 | 0.2065 | 0.4529 | 0.4692 |
| large_winrate_gap | 704 | 0.7358 | 0.8245 | 0.1717 | 0.5000 | 0.5000 |
| small_winrate_gap | 698 | 0.6117 | 0.6402 | 0.2353 | 0.5000 | 0.5000 |
| missing_core_home | 1184 | 0.6900 | 0.7507 | 0.2003 | 0.4549 | 0.4459 |
| missing_core_away | 1184 | 0.6900 | 0.7507 | 0.2003 | 0.5452 | 0.5541 |
| low_conf_50_55 | 344 | 0.5436 | 0.5525 | 0.2482 | 0.5001 | 0.5000 |
| high_conf_65_plus | 1025 | 0.7649 | 0.8252 | 0.1699 | 0.5002 | 0.4995 |

## Win Calibration Buckets
| bucket | rows | avg_pred | actual_rate | calibration_error |
| --- | --- | --- | --- | --- |
| 0.00-0.40 | 669 | 0.2743 | 0.2691 | 0.0053 |
| 0.40-0.45 | 181 | 0.4238 | 0.3923 | 0.0315 |
| 0.45-0.50 | 171 | 0.4764 | 0.4561 | 0.0202 |
| 0.50-0.55 | 173 | 0.5235 | 0.5434 | -0.0199 |
| 0.55-0.60 | 180 | 0.5762 | 0.6056 | -0.0294 |
| 0.60-0.65 | 157 | 0.6228 | 0.6242 | -0.0014 |
| 0.65-0.70 | 146 | 0.6749 | 0.6301 | 0.0447 |
| 0.70-1.00 | 367 | 0.7896 | 0.8174 | -0.0278 |

## Score Segments
| segment | games | home_mae | away_mae | total_mae | margin_mae |
| --- | --- | --- | --- | --- | --- |
| overall | 1022 | 9.3951 | 9.7078 | 14.8537 | 12.3113 |
| all | 1022 | 9.3951 | 9.7078 | 14.8537 | 12.3113 |
| regular_season | 857 | 9.3080 | 9.5054 | 14.8351 | 12.0029 |
| playoffs | 165 | 9.8475 | 10.7594 | 14.9505 | 13.9132 |
| home_b2b | 152 | 10.2182 | 9.6117 | 15.7562 | 12.9240 |
| away_b2b | 157 | 9.6684 | 9.7732 | 15.0927 | 12.2220 |
| either_b2b | 253 | 9.8228 | 9.9113 | 15.3629 | 12.8283 |
| home_rest_advantage | 205 | 9.2328 | 9.6638 | 14.3653 | 12.3330 |
| away_rest_advantage | 185 | 9.4194 | 10.4946 | 15.6631 | 13.1462 |
| large_winrate_gap | 352 | 8.9995 | 9.8329 | 15.1132 | 11.8214 |
| small_winrate_gap | 349 | 9.5963 | 9.7530 | 14.1577 | 13.1715 |
| missing_core_home | 585 | 9.5031 | 9.7935 | 15.5734 | 11.8334 |
| missing_core_away | 599 | 9.5944 | 9.6891 | 15.2531 | 12.2686 |
