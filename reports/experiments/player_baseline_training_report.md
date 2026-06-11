# Player Baseline Training Report (V2 Dataset)

## Dataset Summary
- **Train Rows**: 28240
- **Test Rows**: 27943
- **Feature Count**: 22

## Best Models
- **TARGET_PTS**: ridge (MAE: 4.61)
- **TARGET_REB**: ridge (MAE: 1.97)
- **TARGET_AST**: ridge (MAE: 1.38)
- **TARGET_PRA**: ridge (MAE: 6.08)

## Metrics Table
| Target     | Model             |     MAE |    RMSE |       R2 |
|:-----------|:------------------|--------:|--------:|---------:|
| TARGET_PTS | ridge             | 4.61043 | 6.03121 | 0.519588 |
| TARGET_PTS | random_forest     | 4.67499 | 6.09514 | 0.509348 |
| TARGET_PTS | gradient_boosting | 4.65365 | 6.08247 | 0.511387 |
| TARGET_REB | ridge             | 1.97388 | 2.57929 | 0.399827 |
| TARGET_REB | random_forest     | 1.98251 | 2.58894 | 0.39533  |
| TARGET_REB | gradient_boosting | 1.98774 | 2.59554 | 0.392243 |
| TARGET_AST | ridge             | 1.37548 | 1.86223 | 0.472048 |
| TARGET_AST | random_forest     | 1.38943 | 1.87792 | 0.463115 |
| TARGET_AST | gradient_boosting | 1.38999 | 1.88027 | 0.461775 |
| TARGET_PRA | ridge             | 6.07836 | 7.82156 | 0.577875 |
| TARGET_PRA | random_forest     | 6.1997  | 7.95863 | 0.562951 |
| TARGET_PRA | gradient_boosting | 6.1597  | 7.92157 | 0.567011 |

## TARGET_PTS - Top 20 Feature Importances (ridge)
| Feature           |   Importance |
|:------------------|-------------:|
| MIN_EMA_10        | 14.6696      |
| MIN_TREND         | 13.901       |
| MIN_EMA_5         | 13.7384      |
| IS_PLAYOFF        |  0.801984    |
| PTS_LAST_10       |  0.716746    |
| MIN_LAST_10       |  0.53506     |
| MIN_LAST_5        |  0.273094    |
| AST_LAST_5        |  0.241204    |
| IS_B2B            |  0.170955    |
| IS_HOME           |  0.128832    |
| PTS_LAST_5        |  0.0745759   |
| MIN_LAST_3        |  0.0702563   |
| OPP_TEAM_PACE     |  0.0483169   |
| MIN_STD_LAST_10   |  0.0421174   |
| DAYS_REST         |  0.0286303   |
| PLUS_MINUS_LAST_5 |  0.0282367   |
| REB_LAST_5        |  0.0270272   |
| TEAM_PACE         |  0.0259357   |
| OPP_ELO           |  0.00134622  |
| ELO_DIFF          |  0.000846141 |

### TARGET_PTS - Phase 6.2 New Feature Importances
| Feature       |   Importance |
|:--------------|-------------:|
| MIN_EMA_10    | 14.6696      |
| MIN_EMA_5     | 13.7384      |
| OPP_TEAM_PACE |  0.0483169   |
| TEAM_PACE     |  0.0259357   |
| ELO_DIFF      |  0.000846141 |
| TEAM_ELO      |  0.00050008  |

## TARGET_REB - Top 20 Feature Importances (ridge)
| Feature            |   Importance |
|:-------------------|-------------:|
| MIN_EMA_10         |  4.40137     |
| MIN_TREND          |  4.19315     |
| MIN_EMA_5          |  4.1337      |
| REB_LAST_5         |  0.792057    |
| MIN_LAST_5         |  0.173766    |
| IS_PLAYOFF         |  0.12034     |
| MIN_LAST_10        |  0.0798629   |
| IS_B2B             |  0.0666481   |
| PTS_LAST_10        |  0.0439284   |
| AST_LAST_5         |  0.0415276   |
| MIN_STD_LAST_10    |  0.0179802   |
| OPP_TEAM_PACE      |  0.0155893   |
| PTS_LAST_5         |  0.014664    |
| DAYS_REST          |  0.013541    |
| PLUS_MINUS_LAST_5  |  0.0106661   |
| IS_HOME            |  0.00942834  |
| MIN_LAST_3         |  0.00630909  |
| TEAM_PACE          |  0.00571825  |
| OPP_ELO            |  0.000565652 |
| BLOWOUT_RISK_PROXY |  0.000395104 |

### TARGET_REB - Phase 6.2 New Feature Importances
| Feature       |   Importance |
|:--------------|-------------:|
| MIN_EMA_10    |  4.40137     |
| MIN_EMA_5     |  4.1337      |
| OPP_TEAM_PACE |  0.0155893   |
| TEAM_PACE     |  0.00571825  |
| TEAM_ELO      |  0.000370672 |
| ELO_DIFF      |  0.000194982 |

## TARGET_AST - Top 20 Feature Importances (ridge)
| Feature           |   Importance |
|:------------------|-------------:|
| MIN_EMA_10        |  2.03757     |
| MIN_TREND         |  1.93212     |
| MIN_EMA_5         |  1.86923     |
| AST_LAST_5        |  0.746623    |
| IS_PLAYOFF        |  0.257343    |
| MIN_LAST_5        |  0.103887    |
| IS_HOME           |  0.0640257   |
| MIN_LAST_10       |  0.0434061   |
| PTS_LAST_10       |  0.0296392   |
| REB_LAST_5        |  0.0271536   |
| PTS_LAST_5        |  0.0182435   |
| PLUS_MINUS_LAST_5 |  0.0176049   |
| MIN_LAST_3        |  0.0157237   |
| OPP_TEAM_PACE     |  0.0127163   |
| MIN_STD_LAST_10   |  0.0114535   |
| IS_B2B            |  0.00995847  |
| TEAM_PACE         |  0.00737101  |
| DAYS_REST         |  0.00719952  |
| OPP_ELO           |  0.000490235 |
| ELO_DIFF          |  0.00038429  |

### TARGET_AST - Phase 6.2 New Feature Importances
| Feature       |   Importance |
|:--------------|-------------:|
| MIN_EMA_10    |  2.03757     |
| MIN_EMA_5     |  1.86923     |
| OPP_TEAM_PACE |  0.0127163   |
| TEAM_PACE     |  0.00737101  |
| ELO_DIFF      |  0.00038429  |
| TEAM_ELO      |  0.000105946 |

## TARGET_PRA - Top 20 Feature Importances (ridge)
| Feature           |   Importance |
|:------------------|-------------:|
| MIN_EMA_10        |  21.1085     |
| MIN_TREND         |  20.0263     |
| MIN_EMA_5         |  19.7413     |
| IS_PLAYOFF        |   1.17967    |
| AST_LAST_5        |   0.946299   |
| REB_LAST_5        |   0.79193    |
| PTS_LAST_10       |   0.790314   |
| MIN_LAST_10       |   0.658329   |
| MIN_LAST_5        |   0.550747   |
| IS_B2B            |   0.227645   |
| IS_HOME           |   0.202286   |
| MIN_LAST_3        |   0.0922891  |
| PTS_LAST_5        |   0.0781553  |
| OPP_TEAM_PACE     |   0.0766225  |
| MIN_STD_LAST_10   |   0.071551   |
| PLUS_MINUS_LAST_5 |   0.0565077  |
| DAYS_REST         |   0.0493708  |
| TEAM_PACE         |   0.039025   |
| OPP_ELO           |   0.0024021  |
| ELO_DIFF          |   0.00142541 |

### TARGET_PRA - Phase 6.2 New Feature Importances
| Feature       |   Importance |
|:--------------|-------------:|
| MIN_EMA_10    | 21.1085      |
| MIN_EMA_5     | 19.7413      |
| OPP_TEAM_PACE |  0.0766225   |
| TEAM_PACE     |  0.039025    |
| ELO_DIFF      |  0.00142541  |
| TEAM_ELO      |  0.000976698 |

## Final Verdict
**NEEDS_MORE_FEATURE_ENGINEERING**

V2 PTS MAE is 4.61. The new Minute and Game Script features helped, but the MAE is still not low enough. Opponent position-based defense mappings (e.g. OPP_PTS_ALLOWED_TO_POSITION) are strictly necessary before proceeding to inference.