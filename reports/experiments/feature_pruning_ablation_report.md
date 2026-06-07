# Feature Pruning Ablation Report

Top results by dataset:

## WIN

| dataset   | group_removed                                                                                                               | model    |   roc_auc |    brier |   accuracy |   precision |   recall |       f1 |   n_features_removed |   n_features_remaining |
|:----------|:----------------------------------------------------------------------------------------------------------------------------|:---------|----------:|---------:|-----------:|------------:|---------:|---------:|---------------------:|-----------------------:|
| win       | WINRATE_LAST_10                                                                                                             | rf       |  0.75434  | 0.203949 |   0.683712 |    0.684411 | 0.681818 | 0.683112 |                    1 |                     75 |
| win       | AWAY_TOP2_AVAILABLE                                                                                                         | logistic |  0.751277 | 0.203701 |   0.672348 |    0.671698 | 0.674242 | 0.672968 |                    1 |                     75 |
| win       | HOME_TOP2_AVAILABLE                                                                                                         | logistic |  0.75099  | 0.203795 |   0.674242 |    0.674242 | 0.674242 | 0.674242 |                    1 |                     75 |
| win       | AWAY_TOP1_AVAILABLE                                                                                                         | logistic |  0.750875 | 0.203767 |   0.670455 |    0.670455 | 0.670455 | 0.670455 |                    1 |                     75 |
| win       | HOME_TOP1_AVAILABLE                                                                                                         | logistic |  0.750746 | 0.203753 |   0.668561 |    0.667925 | 0.670455 | 0.669187 |                    1 |                     75 |
| win       | HOME_TOP3_AVAILABLE                                                                                                         | logistic |  0.750359 | 0.203935 |   0.674242 |    0.674242 | 0.674242 | 0.674242 |                    1 |                     75 |
| win       | AWAY_TOP3_AVAILABLE                                                                                                         | logistic |  0.750258 | 0.20387  |   0.672348 |    0.671698 | 0.674242 | 0.672968 |                    1 |                     75 |
| win       | HOME_MISSING_CORE_EXPECTED_AST;HOME_MISSING_CORE_EXPECTED_MIN;HOME_MISSING_CORE_EXPECTED_PRA;HOME_MISSING_CORE_EXPECTED_PTS | logistic |  0.750215 | 0.204426 |   0.659091 |    0.659091 | 0.659091 | 0.659091 |                    4 |                     72 |
| win       | AWAY_WINRATE_LAST_5                                                                                                         | logistic |  0.750187 | 0.203949 |   0.672348 |    0.671698 | 0.674242 | 0.672968 |                    1 |                     75 |
| win       | OPP_AWAY_WINRATE_LAST_5                                                                                                     | logistic |  0.750029 | 0.203949 |   0.672348 |    0.670412 | 0.67803  | 0.6742   |                    1 |                     75 |

