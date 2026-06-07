# EMA Experiment Report

## Summary results

| task   | variant   | model    |    roc_auc |      brier |   accuracy |         f1 |   n_features |           mae |          rmse |         r2 |
|:-------|:----------|:---------|-----------:|-----------:|-----------:|-----------:|-------------:|--------------:|--------------:|-----------:|
| win    | baseline  | logistic |   0.74944  |   0.204337 |   0.670455 |   0.670455 |           76 | nan           | nan           | nan        |
| win    | baseline  | rf       |   0.729296 |   0.211349 |   0.657197 |   0.661682 |           76 | nan           | nan           | nan        |
| win    | baseline  | gboost   |   0.716684 |   0.214485 |   0.660985 |   0.65643  |           76 | nan           | nan           | nan        |
| win    | ema_3     | logistic |   0.742482 |   0.207672 |   0.664773 |   0.650888 |          102 | nan           | nan           | nan        |
| win    | ema_3     | rf       |   0.735243 |   0.210221 |   0.685606 |   0.690299 |          102 | nan           | nan           | nan        |
| win    | ema_3     | gboost   |   0.71116  |   0.216894 |   0.664773 |   0.664137 |          102 | nan           | nan           | nan        |
| win    | ema_5     | logistic |   0.745251 |   0.206925 |   0.668561 |   0.64503  |          102 | nan           | nan           | nan        |
| win    | ema_5     | rf       |   0.732251 |   0.211886 |   0.676136 |   0.683919 |          102 | nan           | nan           | nan        |
| win    | ema_5     | gboost   |   0.727258 |   0.210601 |   0.668561 |   0.67167  |          102 | nan           | nan           | nan        |
| win    | ema_10    | logistic |   0.751951 |   0.20517  |   0.666667 |   0.640816 |          102 | nan           | nan           | nan        |
| win    | ema_10    | rf       |   0.74119  |   0.208851 |   0.676136 |   0.669246 |          102 | nan           | nan           | nan        |
| win    | ema_10    | gboost   |   0.738507 |   0.207745 |   0.676136 |   0.658683 |          102 | nan           | nan           | nan        |
| win    | ema_all   | logistic |   0.729081 |   0.219139 |   0.655303 |   0.617647 |          154 | nan           | nan           | nan        |
| win    | ema_all   | rf       |   0.74071  |   0.208989 |   0.679924 |   0.687616 |          154 | nan           | nan           | nan        |
| win    | ema_all   | gboost   |   0.720644 |   0.213623 |   0.642045 |   0.634429 |          154 | nan           | nan           | nan        |
| score  | baseline  | ridge    | nan        | nan        | nan        | nan        |           79 |   6.21142e-05 |   7.82112e-05 |   1        |
| score  | baseline  | rf       | nan        | nan        | nan        | nan        |           79 |   1.51417     |   2.77527     |   0.961671 |
| score  | baseline  | gboost   | nan        | nan        | nan        | nan        |           79 |   0.914068    |   1.43317     |   0.989778 |
| score  | ema_3     | ridge    | nan        | nan        | nan        | nan        |          105 |   7.07997e-05 |   8.63854e-05 |   1        |
| score  | ema_3     | rf       | nan        | nan        | nan        | nan        |          105 |   1.55167     |   2.83206     |   0.960126 |
| score  | ema_3     | gboost   | nan        | nan        | nan        | nan        |          105 |   0.983766    |   1.52591     |   0.988424 |
| score  | ema_5     | ridge    | nan        | nan        | nan        | nan        |          105 |   7.10641e-05 |   8.69412e-05 |   1        |
| score  | ema_5     | rf       | nan        | nan        | nan        | nan        |          105 |   1.58833     |   2.89426     |   0.958355 |
| score  | ema_5     | gboost   | nan        | nan        | nan        | nan        |          105 |   0.968935    |   1.47696     |   0.989155 |
| score  | ema_10    | ridge    | nan        | nan        | nan        | nan        |          105 |   6.82378e-05 |   8.44298e-05 |   1        |
| score  | ema_10    | rf       | nan        | nan        | nan        | nan        |          105 |   1.55799     |   2.84931     |   0.959639 |
| score  | ema_10    | gboost   | nan        | nan        | nan        | nan        |          105 |   0.963982    |   1.48024     |   0.989107 |
| score  | ema_all   | ridge    | nan        | nan        | nan        | nan        |          157 |   7.70207e-05 |   9.44477e-05 |   1        |
| score  | ema_all   | rf       | nan        | nan        | nan        | nan        |          157 |   1.59716     |   2.89262     |   0.958402 |
| score  | ema_all   | gboost   | nan        | nan        | nan        | nan        |          157 |   0.975303    |   1.53407     |   0.9883   |


## Top EMA feature importances (ema_all)

| feature                     |   importance |
|:----------------------------|-------------:|
| OPP_PTS_EMA_3               |   0.00657187 |
| AWAY_PTS_EMA_10             |   0.005328   |
| OPP_AWAY_PTS_EMA_3          |   0.00517603 |
| H2H_WINRATE_EMA_3           |   0.00505652 |
| PTS_ALLOWED_EMA_5           |   0.00465246 |
| OPP_HOME_WINRATE_EMA_5      |   0.00445711 |
| PTS_ALLOWED_EMA_3           |   0.0043927  |
| AWAY_PTS_EMA_5              |   0.0041869  |
| WINRATE_EMA_10              |   0.00414306 |
| AWAY_WINRATE_EMA_5          |   0.00413198 |
| AWAY_WINRATE_EMA_10         |   0.00411258 |
| OPP_HOME_PTS_ALLOWED_EMA_10 |   0.00392707 |
| OPP_H2H_PTS_EMA_3           |   0.003855   |
| HOME_PTS_ALLOWED_EMA_10     |   0.00359413 |
| PTS_ALLOWED_EMA_10          |   0.00355062 |
| AWAY_PTS_ALLOWED_EMA_5      |   0.00343324 |
| OPP_HOME_PTS_EMA_5          |   0.00340696 |
| HOME_PTS_ALLOWED_EMA_5      |   0.00339664 |
| AWAY_PTS_EMA_3              |   0.00336588 |
| OPP_H2H_PTS_ALLOWED_EMA_10  |   0.0033185  |