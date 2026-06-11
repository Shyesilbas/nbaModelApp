# Player Prediction Baseline Training Report

## Dataset Summary
- **Train Rows**: 28240
- **Test Rows**: 27943
- **Feature Count**: 10

## Best Models
- **TARGET_PTS**: ridge (MAE: 4.66)
- **TARGET_REB**: ridge (MAE: 1.98)
- **TARGET_AST**: ridge (MAE: 1.38)
- **TARGET_PRA**: ridge (MAE: 6.16)

## Excluded Columns
- **Metadata**: PLAYER_ID, Player_ID, PLAYER_NAME, GAME_ID, GAME_DATE, TEAM_ID, TEAM_ABBREVIATION, MATCHUP, OPPONENT_ABBREVIATION, SEASON_ID, VIDEO_AVAILABLE, SEASON_TYPE
- **Raw/Leakage**: MIN, PTS, REB, AST, PRA, PLUS_MINUS, WL, WIN, FGM, FGA, FG_PCT, FG3M, FG3A, FG3_PCT, FTM, FTA, FT_PCT, OREB, DREB, STL, BLK, TOV, PF

## Metrics Table
| Target     | Model                      |     MAE |    RMSE |       R2 |
|:-----------|:---------------------------|--------:|--------:|---------:|
| TARGET_PTS | ridge                      | 4.66296 | 6.10398 | 0.507924 |
| TARGET_PTS | random_forest              | 4.67318 | 6.12257 | 0.504923 |
| TARGET_PTS | gradient_boosting          | 4.6655  | 6.11427 | 0.506264 |
| TARGET_PTS | ridge (Top 50 Players)     | 5.23417 | 6.83177 | 0.464651 |
| TARGET_PTS | ridge (Core Players)       | 4.66262 | 6.10367 | 0.507956 |
| TARGET_PTS | ridge (Playoffs)           | 4.23786 | 5.65603 | 0.592077 |
| TARGET_PTS | ridge (Regular Season)     | 4.69282 | 6.13422 | 0.501121 |
| TARGET_PTS | ridge (High Minutes (>20)) | 5.2502  | 6.73176 | 0.392734 |
| TARGET_REB | ridge                      | 1.9788  | 2.59166 | 0.394058 |
| TARGET_REB | random_forest              | 1.98503 | 2.60074 | 0.389805 |
| TARGET_REB | gradient_boosting          | 1.97886 | 2.59181 | 0.393987 |
| TARGET_REB | ridge (Top 50 Players)     | 2.12856 | 2.79639 | 0.440558 |
| TARGET_REB | ridge (Core Players)       | 1.97871 | 2.5916  | 0.394076 |
| TARGET_REB | ridge (Playoffs)           | 1.93093 | 2.53032 | 0.460999 |
| TARGET_REB | ridge (Regular Season)     | 1.98216 | 2.59591 | 0.388616 |
| TARGET_REB | ridge (High Minutes (>20)) | 2.1086  | 2.7259  | 0.349331 |
| TARGET_AST | ridge                      | 1.38057 | 1.87368 | 0.465539 |
| TARGET_AST | random_forest              | 1.38751 | 1.8795  | 0.462213 |
| TARGET_AST | gradient_boosting          | 1.38257 | 1.87578 | 0.464339 |
| TARGET_AST | ridge (Top 50 Players)     | 1.53673 | 2.02894 | 0.498351 |
| TARGET_AST | ridge (Core Players)       | 1.38053 | 1.87367 | 0.465546 |
| TARGET_AST | ridge (Playoffs)           | 1.19902 | 1.67303 | 0.525283 |
| TARGET_AST | ridge (Regular Season)     | 1.39332 | 1.88697 | 0.460847 |
| TARGET_AST | ridge (High Minutes (>20)) | 1.59881 | 2.10551 | 0.407775 |
| TARGET_PRA | ridge                      | 6.16425 | 7.95043 | 0.563851 |
| TARGET_PRA | random_forest              | 6.20501 | 7.99067 | 0.559424 |
| TARGET_PRA | gradient_boosting          | 6.1678  | 7.95258 | 0.563615 |
| TARGET_PRA | ridge (Top 50 Players)     | 6.66303 | 8.57187 | 0.544278 |
| TARGET_PRA | ridge (Core Players)       | 6.16364 | 7.94974 | 0.563897 |
| TARGET_PRA | ridge (Playoffs)           | 5.77065 | 7.45722 | 0.650706 |
| TARGET_PRA | ridge (Regular Season)     | 6.1919  | 7.98393 | 0.556307 |
| TARGET_PRA | ridge (High Minutes (>20)) | 6.66302 | 8.48044 | 0.442988 |

## Error Examples (Best Models)
### TARGET_PTS Over-Predictions (Predicted > Actual)
| GAME_DATE   | PLAYER_NAME           |   TARGET_PTS |    PRED |   ERROR |
|:------------|:----------------------|-------------:|--------:|--------:|
| 2025-10-26  | Anthony Edwards       |            5 | 31.952  | 26.952  |
| 2025-10-25  | Aaron Gordon          |           17 | 42.9614 | 25.9614 |
| 2025-11-30  | Keyonte George        |            0 | 24.4262 | 24.4262 |
| 2026-04-02  | Luka Dončić           |           12 | 36.0736 | 24.0736 |
| 2025-12-03  | Giannis Antetokounmpo |            2 | 25.6604 | 23.6604 |
| 2025-11-08  | Jalen Green           |            2 | 24.8188 | 22.8188 |
| 2025-11-05  | Cam Thomas            |            0 | 22.0724 | 22.0724 |
| 2026-01-14  | Jalen Brunson         |            4 | 25.8439 | 21.8439 |
| 2025-12-20  | Luka Dončić           |           12 | 33.4311 | 21.4311 |
| 2026-02-05  | Luka Dončić           |           10 | 31.1013 | 21.1013 |
| 2026-04-21  | Victor Wembanyama     |            5 | 25.9232 | 20.9232 |
| 2026-01-03  | Alperen Sengun        |            0 | 20.8198 | 20.8198 |
| 2025-10-24  | DeMar DeRozan         |            7 | 27.6233 | 20.6233 |
| 2026-02-22  | Deni Avdija           |            0 | 20.471  | 20.471  |
| 2026-02-25  | Jamal Murray          |            2 | 22.3692 | 20.3692 |
| 2026-01-10  | Keyonte George        |            4 | 24.0583 | 20.0583 |
| 2025-10-27  | Aaron Gordon          |            9 | 28.9354 | 19.9354 |
| 2026-01-13  | Stephen Curry         |            7 | 26.7556 | 19.7556 |
| 2026-03-17  | Nikola Jokić          |            8 | 27.6902 | 19.6902 |
| 2026-02-07  | Keyonte George        |            5 | 24.4834 | 19.4834 |

### TARGET_PTS Under-Predictions (Predicted < Actual)
| GAME_DATE   | PLAYER_NAME          |   TARGET_PTS |     PRED |    ERROR |
|:------------|:---------------------|-------------:|---------:|---------:|
| 2026-03-10  | Bam Adebayo          |           83 | 20.5816  | -62.4184 |
| 2025-10-23  | Aaron Gordon         |           50 |  9.42809 | -40.5719 |
| 2025-10-21  | Luka Dončić          |           43 |  9.57481 | -33.4252 |
| 2026-01-29  | Cooper Flagg         |           49 | 16.0856  | -32.9144 |
| 2026-03-25  | Jamal Murray         |           53 | 20.984   | -32.016  |
| 2025-10-22  | Anthony Edwards      |           41 |  9.42809 | -31.5719 |
| 2025-10-22  | Victor Wembanyama    |           40 |  9.42809 | -30.5719 |
| 2025-10-22  | Tyrese Maxey         |           40 |  9.42809 | -30.5719 |
| 2025-12-28  | Kawhi Leonard        |           55 | 25.2217  | -29.7783 |
| 2026-01-14  | Brice Sensabaugh     |           43 | 13.2596  | -29.7404 |
| 2026-04-03  | Cooper Flagg         |           51 | 21.3925  | -29.6075 |
| 2025-10-21  | Alperen Sengun       |           39 |  9.42809 | -29.5719 |
| 2026-01-17  | Anthony Edwards      |           55 | 25.8182  | -29.1818 |
| 2025-12-03  | Jamal Murray         |           52 | 22.8397  | -29.1603 |
| 2025-11-25  | CJ McCollum          |           46 | 16.8983  | -29.1017 |
| 2026-04-08  | Terrence Shannon Jr. |           33 |  3.93703 | -29.063  |
| 2025-12-31  | Julian Champagnie    |           36 |  7.02864 | -28.9714 |
| 2026-02-01  | Jarrett Allen        |           40 | 11.5691  | -28.4309 |
| 2025-12-25  | Nikola Jokić         |           56 | 27.7339  | -28.2661 |
| 2025-11-12  | Nikola Jokić         |           55 | 26.8714  | -28.1286 |

### TARGET_REB Over-Predictions (Predicted > Actual)
| GAME_DATE   | PLAYER_NAME           |   TARGET_REB |     PRED |    ERROR |
|:------------|:----------------------|-------------:|---------:|---------:|
| 2025-10-24  | OG Anunoby            |            2 | 12.3896  | 10.3896  |
| 2026-01-05  | Karl-Anthony Towns    |            1 | 11.1667  | 10.1667  |
| 2026-03-18  | Josh Giddey           |            0 |  9.79884 |  9.79884 |
| 2025-11-30  | Andre Drummond        |            1 | 10.6128  |  9.61278 |
| 2026-04-06  | Victor Wembanyama     |            5 | 14.1365  |  9.13647 |
| 2026-03-26  | Karl-Anthony Towns    |            3 | 12.1096  |  9.1096  |
| 2025-12-25  | Anthony Davis         |            3 | 12.0774  |  9.07735 |
| 2026-01-23  | Alperen Sengun        |            1 |  9.95204 |  8.95204 |
| 2025-10-29  | Zion Williamson       |            0 |  8.82644 |  8.82644 |
| 2025-11-28  | Andre Drummond        |            4 | 12.7901  |  8.79013 |
| 2025-10-31  | Deandre Ayton         |            0 |  8.57493 |  8.57493 |
| 2026-03-22  | Jakob Poeltl          |            0 |  8.55659 |  8.55659 |
| 2026-02-09  | Bobby Portis          |            0 |  8.35436 |  8.35436 |
| 2026-05-10  | Victor Wembanyama     |            4 | 12.2919  |  8.29191 |
| 2025-11-12  | P.J. Washington       |            0 |  8.15927 |  8.15927 |
| 2026-02-22  | Deni Avdija           |            0 |  7.94654 |  7.94654 |
| 2025-12-29  | Bobby Portis          |            2 |  9.84448 |  7.84448 |
| 2026-01-11  | Kel'el Ware           |            1 |  8.77084 |  7.77084 |
| 2025-12-03  | Giannis Antetokounmpo |            1 |  8.7602  |  7.7602  |
| 2025-12-22  | Isaiah Jackson        |            0 |  7.72932 |  7.72932 |

### TARGET_REB Under-Predictions (Predicted < Actual)
| GAME_DATE   | PLAYER_NAME            |   TARGET_REB |     PRED |    ERROR |
|:------------|:-----------------------|-------------:|---------:|---------:|
| 2025-12-28  | Scottie Barnes         |           25 |  7.15103 | -17.849  |
| 2026-04-10  | Oscar Tshiebwe         |           22 |  6.63588 | -15.3641 |
| 2026-03-13  | Mitchell Robinson      |           22 |  6.63651 | -15.3635 |
| 2026-04-12  | Derik Queen            |           22 |  6.99358 | -15.0064 |
| 2026-05-18  | Victor Wembanyama      |           24 |  9.82262 | -14.1774 |
| 2026-04-01  | Jericho Sims           |           20 |  6.03744 | -13.9626 |
| 2025-11-05  | Jeremiah Robinson-Earl |           15 |  1.4388  | -13.5612 |
| 2026-04-10  | Jonas Valančiūnas      |           17 |  3.53276 | -13.4672 |
| 2025-11-08  | Jarred Vanderbilt      |           18 |  4.53325 | -13.4668 |
| 2026-04-04  | Kel'el Ware            |           19 |  5.60144 | -13.3986 |
| 2026-03-21  | Isaiah Hartenstein     |           20 |  6.60477 | -13.3952 |
| 2025-11-23  | Andre Drummond         |           24 | 10.652   | -13.348  |
| 2026-04-05  | Luke Kennard           |           16 |  2.75386 | -13.2461 |
| 2026-02-02  | Dominick Barlow        |           16 |  2.83538 | -13.1646 |
| 2026-01-02  | Ariel Hukporti         |           16 |  2.87033 | -13.1297 |
| 2025-11-08  | Trendon Watford        |           17 |  3.87652 | -13.1235 |
| 2026-01-07  | Neemias Queta          |           20 |  6.88709 | -13.1129 |
| 2026-05-03  | Jarrett Allen          |           19 |  5.90176 | -13.0982 |
| 2026-03-21  | Bam Adebayo            |           21 |  8.11565 | -12.8843 |
| 2026-03-02  | Hugo González          |           16 |  3.13013 | -12.8699 |

### TARGET_AST Over-Predictions (Predicted > Actual)
| GAME_DATE   | PLAYER_NAME             |   TARGET_AST |     PRED |    ERROR |
|:------------|:------------------------|-------------:|---------:|---------:|
| 2026-03-17  | Cade Cunningham         |            0 | 10.3699  | 10.3699  |
| 2026-04-12  | Nikola Jokić            |            1 |  9.29233 |  8.29233 |
| 2025-10-28  | James Harden            |            1 |  8.86759 |  7.86759 |
| 2026-01-18  | Jamal Murray            |            2 |  9.60352 |  7.60352 |
| 2025-10-29  | Trae Young              |            1 |  8.4229  |  7.4229  |
| 2026-03-18  | Josh Giddey             |            3 | 10.4037  |  7.40372 |
| 2026-02-01  | Jusuf Nurkić            |            1 |  7.90907 |  6.90907 |
| 2026-02-24  | Jalen Johnson           |            0 |  6.73376 |  6.73376 |
| 2026-01-05  | Jalen Brunson           |            0 |  6.63074 |  6.63074 |
| 2025-11-23  | Deni Avdija             |            1 |  7.57516 |  6.57516 |
| 2026-02-26  | Jalen Suggs             |            0 |  6.56003 |  6.56003 |
| 2026-03-17  | Shai Gilgeous-Alexander |            2 |  8.55598 |  6.55598 |
| 2025-12-20  | Luka Dončić             |            2 |  8.5299  |  6.5299  |
| 2025-12-07  | Vince Williams Jr.      |            0 |  6.51775 |  6.51775 |
| 2026-01-07  | Deni Avdija             |            2 |  8.50447 |  6.50447 |
| 2026-01-09  | Tyrese Maxey            |            1 |  7.41921 |  6.41921 |
| 2025-12-27  | Darius Garland          |            1 |  7.39999 |  6.39999 |
| 2025-11-15  | Ja Morant               |            2 |  8.39342 |  6.39342 |
| 2025-10-24  | Jalen Johnson           |            1 |  7.37615 |  6.37615 |
| 2026-01-07  | Kevin Durant            |            0 |  6.37501 |  6.37501 |

### TARGET_AST Under-Predictions (Predicted < Actual)
| GAME_DATE   | PLAYER_NAME           |   TARGET_AST |    PRED |     ERROR |
|:------------|:----------------------|-------------:|--------:|----------:|
| 2026-04-12  | Ryan Nembhard         |           23 | 5.01648 | -17.9835  |
| 2026-02-03  | Isaiah Collier        |           22 | 6.49073 | -15.5093  |
| 2026-01-07  | Daniss Jenkins        |           15 | 2.332   | -12.668   |
| 2025-11-14  | Giannis Antetokounmpo |           18 | 5.55085 | -12.4492  |
| 2026-03-25  | Andrew Nembhard       |           19 | 7.05984 | -11.9402  |
| 2025-11-20  | Vince Williams Jr.    |           15 | 3.7725  | -11.2275  |
| 2025-11-19  | Pat Spencer           |           13 | 2.07986 | -10.9201  |
| 2026-03-21  | Reed Sheppard         |           14 | 3.32004 | -10.68    |
| 2025-11-01  | Cade Cunningham       |           18 | 7.36647 | -10.6335  |
| 2025-10-27  | Trae Young            |           17 | 6.56007 | -10.4399  |
| 2025-11-26  | Vince Williams Jr.    |           17 | 6.59445 | -10.4056  |
| 2026-02-07  | Nikola Jokić          |           17 | 6.63526 | -10.3647  |
| 2025-12-27  | Andrew Nembhard       |           16 | 5.66092 | -10.3391  |
| 2026-04-27  | Nikola Jokić          |           16 | 5.72159 | -10.2784  |
| 2026-03-24  | Malik Monk            |           14 | 3.87738 | -10.1226  |
| 2025-10-22  | Davion Mitchell       |           12 | 1.92015 | -10.0799  |
| 2025-11-12  | Daniss Jenkins        |           12 | 1.92679 | -10.0732  |
| 2025-11-18  | LeBron James          |           12 | 1.98754 | -10.0125  |
| 2026-04-12  | Nikola Topić          |           14 | 4.09968 |  -9.90032 |
| 2026-03-10  | Josh Giddey           |           17 | 7.10636 |  -9.89364 |

### TARGET_PRA Over-Predictions (Predicted > Actual)
| GAME_DATE   | PLAYER_NAME           |   TARGET_PRA |    PRED |   ERROR |
|:------------|:----------------------|-------------:|--------:|--------:|
| 2025-10-26  | Anthony Edwards       |            6 | 42.5677 | 36.5677 |
| 2025-10-25  | Aaron Gordon          |           20 | 56.0346 | 36.0346 |
| 2025-12-03  | Giannis Antetokounmpo |            4 | 39.3701 | 35.3701 |
| 2026-02-22  | Deni Avdija           |            0 | 34.2819 | 34.2819 |
| 2025-11-30  | Keyonte George        |            3 | 36.3119 | 33.3119 |
| 2026-02-24  | Jalen Johnson         |            8 | 41.2468 | 33.2468 |
| 2026-01-03  | Alperen Sengun        |            1 | 33.2215 | 32.2215 |
| 2026-02-05  | Luka Dončić           |           16 | 47.9695 | 31.9695 |
| 2025-12-20  | Luka Dončić           |           19 | 50.7964 | 31.7964 |
| 2026-02-25  | Jamal Murray          |            3 | 34.712  | 31.712  |
| 2026-01-14  | Jalen Brunson         |            4 | 35.6715 | 31.6715 |
| 2025-11-05  | Bam Adebayo           |            3 | 33.1275 | 30.1275 |
| 2025-12-25  | Anthony Davis         |            6 | 36.1021 | 30.1021 |
| 2026-04-21  | Victor Wembanyama     |           10 | 39.9859 | 29.9859 |
| 2025-10-29  | Anthony Davis         |            8 | 37.4999 | 29.4999 |
| 2026-03-17  | Cade Cunningham       |            8 | 37.0231 | 29.0231 |
| 2025-11-08  | Jalen Green           |            4 | 31.9652 | 27.9652 |
| 2026-01-17  | Naz Reid              |            0 | 27.3552 | 27.3552 |
| 2026-03-18  | Josh Giddey           |           12 | 39.3464 | 27.3464 |
| 2026-04-02  | Luka Dončić           |           23 | 50.2582 | 27.2582 |

### TARGET_PRA Under-Predictions (Predicted < Actual)
| GAME_DATE   | PLAYER_NAME           |   TARGET_PRA |     PRED |    ERROR |
|:------------|:----------------------|-------------:|---------:|---------:|
| 2026-03-10  | Bam Adebayo           |           95 | 32.7643  | -62.2357 |
| 2025-10-21  | Luka Dončić           |           64 | 15.2857  | -48.7143 |
| 2025-10-23  | Aaron Gordon          |           60 | 15.0585  | -44.9415 |
| 2026-02-01  | Jarrett Allen         |           62 | 19.5681  | -42.4319 |
| 2025-10-21  | Alperen Sengun        |           57 | 15.0585  | -41.9415 |
| 2025-10-22  | Victor Wembanyama     |           56 | 15.0585  | -40.9415 |
| 2025-10-22  | Giannis Antetokounmpo |           56 | 15.2857  | -40.7143 |
| 2025-12-25  | Nikola Jokić          |           87 | 47.1164  | -39.8836 |
| 2026-02-07  | Stephon Castle        |           64 | 24.8952  | -39.1048 |
| 2026-05-18  | Victor Wembanyama     |           68 | 29.289   | -38.711  |
| 2025-11-12  | Paul Reed             |           47 |  9.66755 | -37.3325 |
| 2026-01-29  | Cooper Flagg          |           62 | 25.3244  | -36.6756 |
| 2025-11-19  | Peyton Watson         |           47 | 11.2514  | -35.7486 |
| 2025-10-23  | Pascal Siakam         |           51 | 15.2857  | -35.7143 |
| 2026-04-05  | Rayan Rupert          |           53 | 17.622   | -35.378  |
| 2025-10-27  | Lauri Markkanen       |           68 | 32.7512  | -35.2488 |
| 2025-10-22  | Anthony Edwards       |           49 | 15.0585  | -33.9415 |
| 2026-02-02  | Dominick Barlow       |           44 | 10.3275  | -33.6725 |
| 2026-04-08  | Terrence Shannon Jr.  |           40 |  6.51735 | -33.4827 |
| 2025-11-23  | Jett Howard           |           40 |  6.67692 | -33.3231 |

## Final Verdict
**PLAYER_BASELINE_NEEDS_FEATURES**
The MAE is likely too high for frontend display. The model relies heavily on basic rolling metrics. We need richer opponent-defense context, pace adjustments, and better minutes-projection before it is production-ready.