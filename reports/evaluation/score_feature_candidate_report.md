# Score Schedule-Stress Feature Candidate Evaluation

Chronological split: train <= 2025-04-06, test > 2025-04-06.

## Candidate Additions

- `REST_DIFF`
- `ABS_REST_DIFF`
- `HOME_REST_ADVANTAGE`
- `AWAY_REST_ADVANTAGE`
- `EITHER_B2B`
- `B2B_ASYMMETRY`
- `HOME_B2B_ONLY`
- `AWAY_B2B_ONLY`
- `TRAVEL_REST_INTERACTION`
- `OPP_TRAVEL_REST_INTERACTION`
- `TIMEZONE_REST_INTERACTION`
- `OPP_TIMEZONE_REST_INTERACTION`
- `PLAYOFF_REST_DIFF`
- `PLAYOFF_EITHER_B2B`

## Focus Segment Comparison
| segment | games | base_total_mae | cand_total_mae | total_delta | base_margin_mae | cand_margin_mae | margin_delta | base_home_mae | cand_home_mae | home_delta | base_away_mae | cand_away_mae | away_delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| overall | 1022 | 14.85372 | 15.58212 | 0.72840 | 12.31129 | 12.89162 | 0.58032 | 9.39508 | 9.84021 | 0.44513 | 9.70782 | 10.18084 | 0.47302 |
| home_b2b | 152 | 15.75618 | 16.64665 | 0.89047 | 12.92398 | 13.59745 | 0.67347 | 10.21815 | 10.76820 | 0.55005 | 9.61174 | 10.06438 | 0.45264 |
| away_b2b | 157 | 15.09273 | 16.19159 | 1.09885 | 12.22201 | 13.00939 | 0.78738 | 9.66836 | 10.29084 | 0.62247 | 9.77315 | 10.42130 | 0.64815 |
| either_b2b | 253 | 15.36293 | 16.29457 | 0.93164 | 12.82833 | 13.53295 | 0.70462 | 9.82278 | 10.39789 | 0.57511 | 9.91131 | 10.42536 | 0.51406 |
| away_rest_advantage | 185 | 15.66308 | 16.36868 | 0.70560 | 13.14624 | 13.64508 | 0.49884 | 9.41942 | 9.87849 | 0.45908 | 10.49460 | 10.90190 | 0.40729 |
| home_rest_advantage | 205 | 14.36532 | 15.28927 | 0.92395 | 12.33302 | 12.94386 | 0.61084 | 9.23276 | 9.72832 | 0.49556 | 9.66375 | 10.17087 | 0.50712 |
| playoffs | 165 | 14.95049 | 15.50982 | 0.55933 | 13.91322 | 14.27930 | 0.36608 | 9.84747 | 10.19777 | 0.35030 | 10.75945 | 11.08651 | 0.32706 |

## Decision
- Decision: `reject`.
- Overall total MAE delta: 0.72840.
- Either-B2B total MAE delta: 0.93164.
