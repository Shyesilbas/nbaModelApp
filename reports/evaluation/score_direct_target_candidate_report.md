# Score Direct Target Candidate Evaluation

Candidate predicts direct `TOTAL_POINTS` and `POINT_DIFF`, then reconciles scores mathematically.
Chronological split: train <= 2025-04-06, test > 2025-04-06.

## Focus Segment Comparison
| segment | games | base_total_mae | cand_total_mae | total_delta | base_margin_mae | cand_margin_mae | margin_delta | base_home_mae | cand_home_mae | home_delta | base_away_mae | cand_away_mae | away_delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| overall | 1022 | 14.85372 | 15.49141 | 0.63769 | 12.31129 | 12.78791 | 0.47661 | 9.39508 | 9.79005 | 0.39498 | 9.70782 | 10.12431 | 0.41649 |
| home_b2b | 152 | 15.75618 | 16.65416 | 0.89798 | 12.92398 | 13.79163 | 0.86766 | 10.21815 | 10.65620 | 0.43804 | 9.61174 | 10.33640 | 0.72466 |
| away_b2b | 157 | 15.09273 | 16.17565 | 1.08291 | 12.22201 | 13.03321 | 0.81119 | 9.66836 | 10.17056 | 0.50219 | 9.77315 | 10.34824 | 0.57509 |
| either_b2b | 253 | 15.36293 | 16.30209 | 0.93916 | 12.82833 | 13.58847 | 0.76014 | 9.82278 | 10.30777 | 0.48499 | 9.91131 | 10.52852 | 0.61721 |
| away_rest_advantage | 185 | 15.66308 | 16.39875 | 0.73568 | 13.14624 | 13.47150 | 0.32526 | 9.41942 | 9.83241 | 0.41299 | 10.49460 | 11.02508 | 0.53047 |
| home_rest_advantage | 205 | 14.36532 | 15.16151 | 0.79619 | 12.33302 | 12.85675 | 0.52372 | 9.23276 | 9.78719 | 0.55442 | 9.66375 | 10.06271 | 0.39896 |
| playoffs | 165 | 14.95049 | 14.82700 | -0.12349 | 13.91322 | 14.12707 | 0.21385 | 9.84747 | 9.92150 | 0.07403 | 10.75945 | 10.79331 | 0.03386 |
| small_winrate_gap | 349 | 14.15765 | 14.61476 | 0.45711 | 13.17153 | 13.63022 | 0.45869 | 9.59626 | 9.85831 | 0.26206 | 9.75303 | 10.10976 | 0.35673 |

## Decision
- Decision: `reject`.
- Overall total MAE delta: 0.63769.
- Overall margin MAE delta: 0.47661.
