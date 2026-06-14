# Win Feature Candidate Evaluation

Chronological split: train <= 2025-04-06, test > 2025-04-06.

## Candidate Additions

- `PRE_GAME_ELO`
- `OPP_PRE_GAME_ELO`
- `ELO_DIFF`
- `ABS_ELO_DIFF`
- `WINRATE_DIFF_LAST_10`
- `ABS_WINRATE_DIFF_LAST_10`
- `REST_DIFF`
- `IS_CLOSE_STRENGTH`
- `PLAYOFF_ELO_DIFF`
- `PLAYOFF_ABS_ELO_DIFF`
- `PLAYOFF_REST_DIFF`
- `CLOSE_STRENGTH_REST_DIFF`

## Focus Segment Comparison
| segment | rows | base_auc | cand_auc | auc_delta | base_brier | cand_brier | brier_delta | base_acc | cand_acc | acc_delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| overall | 2044 | 0.73188 | 0.74334 | 0.01146 | 0.20875 | 0.20527 | -0.00348 | 0.66879 | 0.69031 | 0.02153 |
| playoffs | 330 | 0.67611 | 0.68823 | 0.01212 | 0.22659 | 0.22898 | 0.00239 | 0.63636 | 0.64242 | 0.00606 |
| small_winrate_gap | 698 | 0.63109 | 0.65006 | 0.01897 | 0.23742 | 0.23307 | -0.00435 | 0.59742 | 0.62894 | 0.03152 |
| low_conf_50_55 | 322 | 0.53022 | 0.57245 | 0.04223 | 0.24923 | 0.24690 | -0.00232 | 0.51143 | 0.56832 | 0.05689 |
| either_b2b | 506 | 0.70670 | 0.71192 | 0.00522 | 0.21743 | 0.21553 | -0.00190 | 0.65613 | 0.65415 | -0.00198 |
| large_winrate_gap | 704 | 0.81775 | 0.82378 | 0.00603 | 0.17513 | 0.17065 | -0.00448 | 0.73295 | 0.75852 | 0.02557 |

## Decision
- Decision: `promote_candidate_for_v9_training`.
- Overall AUC delta: 0.01146.
- Overall Brier delta: -0.00348.
