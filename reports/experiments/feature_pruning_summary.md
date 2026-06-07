# Feature Pruning Candidate Summary

This report lists candidate features for pruning based on duplicates, high correlations (pearson/spearman), and near-constant statistics, combined with existing permutation importance reports.

- Win features analyzed: 77
- Score features analyzed: 81
- Candidate rows written to: reports/feature_pruning_candidates.csv
- Correlated pairs (|r|>=0.90) written to: reports/feature_correlation_clusters.csv

Top 20 removal candidates (heuristic score):

| feature                        |       std |   nonzero_frac | duplicate_of   |   max_abs_pearson |   max_abs_spearman |   num_high_corr_90 |   num_strong_corr_95 |   perm_mean_importance | dataset   | dup_flag   |   score |
|:-------------------------------|----------:|---------------:|:---------------|------------------:|-------------------:|-------------------:|---------------------:|-----------------------:|:----------|:-----------|--------:|
| HOME_CORE_MINUTES_SHARE        |  0.223276 |       1        |                |          1        |           1        |                  3 |                    2 |             0.00537797 | win       | False      | 5.90872 |
| AWAY_CORE_MINUTES_SHARE        |  0.223276 |       1        |                |          1        |           1        |                  3 |                    2 |             0.00965829 | win       | False      | 5.84316 |
| HOME_CORE_EXPECTED_PRA_SUM     | 44.919    |       1        |                |          0.984942 |           0.981723 |                  4 |                    3 |             0.00977642 | win       | False      | 5.55912 |
| AWAY_CORE_EXPECTED_PRA_SUM     | 44.919    |       1        |                |          0.984942 |           0.981723 |                  4 |                    3 |             0.0141897  | win       | False      | 5.49152 |
| AWAY_MISSING_CORE_EXPECTED_PRA | 49.2996   |       0.997156 |                |          0.991201 |           0.989986 |                  4 |                    3 |             0.00684741 | win       | False      | 5.4293  |
| HOME_MISSING_CORE_EXPECTED_PRA | 49.2996   |       0.997156 |                |          0.991201 |           0.989986 |                  4 |                    3 |             0.0103923  | win       | False      | 5.375   |
| AWAY_MISSING_CORE_EXPECTED_PTS | 30.7011   |       0.995449 |                |          0.991201 |           0.989986 |                  3 |                    2 |             0.0141019  | win       | False      | 4.5598  |
| HOME_MISSING_CORE_EXPECTED_PTS | 30.7011   |       0.995449 |                |          0.991201 |           0.989986 |                  3 |                    2 |             0.0149809  | win       | False      | 4.54633 |
| H2H_WINRATE_LAST_5             |  0.424135 |       0.652446 |                |          0.99997  |           0.999992 |                  1 |                    1 |             0.00549933 | win       | False      | 4.39885 |
| H2H_GAMES_LAST_5               |  1.17726  |       1        |                |          0.998357 |           0.998498 |                  1 |                    1 |             0.00430607 | win       | False      | 4.3871  |
| OPP_H2H_WINRATE_LAST_5         |  0.424135 |       0.652446 |                |          0.99997  |           0.999992 |                  1 |                    1 |             0.00834442 | win       | False      | 4.35527 |
| OPP_H2H_GAMES_LAST_5           |  1.17726  |       1        |                |          0.998357 |           0.998498 |                  1 |                    1 |             0.00692405 | win       | False      | 4.347   |
| AWAY_MISSING_CORE_EXPECTED_AST |  7.50359  |       0.996587 |                |          0.951643 |           0.946294 |                  3 |                    1 |             0.0108711  | win       | False      | 4.03428 |
| HOME_MISSING_CORE_EXPECTED_AST |  7.50359  |       0.996587 |                |          0.951643 |           0.946294 |                  3 |                    1 |             0.0136264  | win       | False      | 3.99208 |
| HOME_CORE_EXPECTED_MIN_SUM     | 53.5864   |       1        |                |          1        |           1        |                  3 |                    2 |             0.00608541 | win       | False      | 3.90679 |
| AWAY_CORE_EXPECTED_MIN_SUM     | 53.5864   |       1        |                |          1        |           1        |                  3 |                    2 |             0.00874923 | win       | False      | 3.86598 |
| AWAY_MISSING_CORE_EXPECTED_MIN | 59.8895   |       0.999431 |                |          0.982342 |           0.979379 |                  4 |                    2 |             0.0107902  | win       | False      | 3.83472 |
| HOME_MISSING_CORE_EXPECTED_MIN | 59.8895   |       0.999431 |                |          0.982342 |           0.979379 |                  4 |                    2 |             0.0113527  | win       | False      | 3.82611 |
| H2H_PTS_LAST_5                 | 10.7217   |       1        |                |          0.999727 |           0.999765 |                  1 |                    1 |             0.022632   | win       | False      | 3.72581 |
| H2H_PTS_ALLOWED_LAST_5         | 10.7276   |       1        |                |          0.999727 |           0.999765 |                  1 |                    1 |             0.0264362  | win       | False      | 3.66731 |