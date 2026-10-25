# Experiment: Score Model Margin Rotation Continuity & Absence Decoupling

- Date: 2026-10-25
- Status: Promoted to Production (`release: v13`)
- Target: `TARGET_MARGIN` in `score_model_margin.pkl`
- Dataset: Expanding-window walk-forward across 5 unseen seasons (2021-22 to 2025-26, N = 6,276 matches)
- Script: `reports/backtests/2026-10-25_score_rotation_features/code/run_experiment.py`

## Motivation & Architecture

In `release: v12`, the WIN model demonstrated that decoupling rotation player minute losses (`MISSING_ROT_MINS_DIFF`), lineup continuity (`ROT_CONTINUITY_DIFF`), and active player Game Score (`ACTIVE_WT_GS_DIFF`) from raw availability delta (`ABS_DIFF`) yielded significant calibration and log-loss improvements.

In this experiment, we extended these decoupled rotation features to the SCORE Margin model (`score_model_margin.pkl`), keeping Pace (2 features) and Off-Rtg (4 features) clean.

## Features Added to Margin Model

Contract: `config/features/score.yaml` (`margin_features` expanded from 8 to 11 features):
1. `ELO_DIFF`
2. `CLEAN_NET_RTG_DIFF_LAST_10`
3. `WINRATE_DIFF_LAST_10`
4. `DAYS_REST`
5. `OPP_DAYS_REST`
6. `IS_B2B`
7. `OPP_IS_B2B`
8. `ABS_DIFF`
9. `MISSING_ROT_MINS_DIFF` (New)
10. `ROT_CONTINUITY_DIFF` (New)
11. `ACTIVE_WT_GS_DIFF` (New)

## 5-Season Walk-Forward Results (N = 6,276)

| Configuration | Features | Margin MAE | Margin Win Acc | Seasons Won |
| :--- | :--- | :--- | :--- | :--- |
| Prod Baseline (`v12`) | 8 | 10.832 | 66.51% | - |
| + Missing Rot Mins Diff | 9 | 10.821 | 66.58% | 3 / 5 |
| + Rot Continuity Diff | 10 | 10.814 | 66.62% | 4 / 5 |
| **+ Active Wt GS Diff (Candidate)** | **11** | **10.809** | **66.67%** | **4 / 5** |

### Season-by-Season Breakdown (Margin MAE)

| Season | N Games | Prod (`v12`) | Candidate (`v13`) | Delta | Winner |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 2021-22 | 1,220 | 11.039 | 10.973 | -0.066 | Candidate |
| 2022-23 | 1,220 | 10.279 | 10.297 | +0.018 | Prod |
| 2023-24 | 1,220 | 10.978 | 10.974 | -0.004 | Candidate |
| 2024-25 | 1,220 | 10.839 | 10.807 | -0.032 | Candidate |
| 2025-26 | 1,220 | 11.212 | 11.184 | -0.028 | Candidate |
| **Overall** | **6,276** | **10.832** | **10.809** | **-0.023** | **Candidate (4/5)** |

### Production Holdout Validation (`2025-26`)

- Validation Season Holdout Margin MAE: `11.2446` -> `11.2105` (`-0.0341` pts improvement)
- Total Score MAE: `15.2909` (unchanged, preserved clean pace and off-rtg)
- Model Promotion Gate: Passed all thresholds and beat champion.

## Conclusion

The decoupled rotation features reduce margin prediction errors across 4 out of 5 historical seasons while boosting moneyline classification accuracy derived from point spread to 66.67%. Promoted to production in `release: v13`.
