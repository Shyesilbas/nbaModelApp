# v7 vs v6 vs v5 Comparative Performance Report

Generated after resolving the feature engineering drift audit and retraining the active models.

## Summary

| Component | v5 | v6 | v7 | Trend |
|---|---:|---:|---:|---|
| WIN Accuracy | 0.6637 | 0.6422 | 0.6453 | v7 slightly better than v6, still below v5 reference |
| WIN ROC-AUC | 0.7413 | 0.7048 | 0.7073 | v7 slightly better than v6, below v5 reference |
| WIN Brier | 0.2073 | 0.2190 | 0.2173 | v7 better than v6, still below v5 reference |
| SCORE Pace MAE | 3.4936 | 3.4922 | 3.4922 | Essentially flat |
| SCORE Home RTG MAE | 8.8480 | 8.8633 | 8.8633 | Slightly worse than v5, flat vs v6 |
| SCORE Away RTG MAE | 8.7187 | 8.7217 | 8.7217 | Slightly worse than v5, flat vs v6 |
| SCORE Margin MAE | 11.9553 | 12.0253 | 12.0253 | Worse than v5, flat vs v6 |
| SCORE Derived Home MAE | 8.8833 | 8.9173 | 8.9173 | Slightly worse than v5, flat vs v6 |
| SCORE Derived Away MAE | 9.2437 | 9.2376 | 9.2376 | Flat vs v6, slightly worse than v5 |
| PLAYER PTS MAE | 4.5035 | 4.5031 | 4.5031 | Flat |
| PLAYER REB MAE | 1.9315 | 1.9313 | 1.9313 | Flat |
| PLAYER AST MAE | 1.3211 | 1.3211 | 1.3211 | Flat |

## Notes on Metric Sources

- WIN `v5` and `v6` references were taken from the existing audit and experiment reports in `reports/experiments/` and `reports/audits/`.
- SCORE `v5` and `v6` references were taken from `models/production/score_model_v5_metadata.json` and `models/production/score_model_v6_metadata.json`.
- PLAYER `v5` and `v6` references were taken from `models/production/player_v5_metadata.json` and `models/production/player_v6_metadata.json`.
- `v7` values were generated in this session and stored in `models/production/*_v7_*`.

## Interpretation

### WIN

The v7 WIN model fixes the venue mismatch and the 5-game vs 10-game inference drift, but it does not outperform the strongest historical v5 reference on discrimination or calibration.

- v7 improves over v6 on every WIN metric available here.
- The gain is modest, which suggests the schema fix removed noise but did not add enough signal to beat the earlier reference split.

### SCORE

The v7 SCORE models are effectively flat relative to v6 and slightly worse than v5 on the home/away derived targets.

- Pace is unchanged.
- Offensive rating and margin do not improve materially.
- The venue-aware changes did not yet produce a measurable score-model lift.

### PLAYER

Player v7 is numerically almost identical to v5/v6.

- The new version mostly reflects the same feature set and split behavior.
- No meaningful regression or improvement is visible at the current level of rounding.

## Verdict

| Component | Verdict |
|---|---|
| WIN | **Improved vs v6, not enough to beat v5 reference** |
| SCORE | **Flat to slightly worse** |
| PLAYER | **Flat** |
| Overall | **Schema correction succeeded, performance lift is limited** |

## Recommended Next Step

If the goal is to recover or exceed the earlier v5/v6 references, the next iteration should focus on:

1. Removing duplicated split features from the final WIN/SCORE schema.
2. Adding the new venue-aware columns as replacements, not just extra columns.
3. Re-running score and win training with tighter feature selection and cross-season validation.
4. Creating a single shared feature builder for training and inference to eliminate future drift.
