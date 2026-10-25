# Decoupled Rotation Continuity & Missing Minutes for NBA Win Model

## Objective
Evaluate whether decomposing the composite `ABS_DIFF` feature into decoupled components:
1. `MISSING_ROT_MINS_DIFF`: Expected minutes missing from regular rotation players ($\ge 20$ min/game over recent 15 games).
2. `ROT_CONTINUITY_DIFF`: Cohesion / continuity metric measuring the share of expected rotation minutes active tonight.
3. `ACTIVE_WT_GS_DIFF`: Average Hollinger Game Score of tonight's active rotation weighted by recent playing time.

This directly mirrors the successful feature decoupling methodology in the Premier League model (where separating pure missing minutes from minute-weighted player quality eliminated noisy variance and delivered all-time best scoring rules).

## Method
- **Protocol**: Strict expanding-window walk-forward validation across 5 unseen historical NBA seasons (`2021-22` through `2025-26`, $N = 6,276$ games).
- **Baselines**:
  - Saf Elo + Home baseline (`Brier: 0.2158`, `Log-Loss: 0.6207`).
  - Production v11 (8 features: `IS_HOME`, `IS_B2B`, `OPP_IS_B2B`, `ABS_DIFF`, `ELO_DIFF`, `WINRATE_DIFF_LAST_10`, `REST_DIFF`, `CLEAN_NET_RTG_DIFF_LAST_10`).
- **Classifier**: Logistic Regression with Standard Scaler and Mean Imputer.
- **Reproducibility**: `code/run_experiment.py`.

## Walk-Forward Benchmark (5 Seasons, N = 6,276 Games)

| Configuration | Features | Log-Loss | Brier Score | ROC-AUC | Accuracy | Delta LL vs Prod |
|---|---|---:|---:|---:|---:|---:|
| 1. Baseline (Elo + Home) | 2 | 0.6207 | 0.2158 | 0.7029 | 65.47% | - |
| 2. Production v11 | 8 | 0.6088 | 0.2106 | 0.7196 | 66.65% | 0.0000 (ref) |
| 3. + ROT_CONTINUITY_DIFF | 9 | 0.6088 | 0.2107 | 0.7196 | 66.59% | +0.0000 |
| 4. + MISSING_ROT_MINS_DIFF | 9 | 0.6078 | 0.2102 | 0.7205 | 66.62% | -0.0010 |
| 5. + BOTH (ROT_CONT + MISS_MINS) | 10 | 0.6078 | 0.2103 | 0.7204 | 66.48% | -0.0010 |
| 6. + ACTIVE_WT_GS_DIFF | 9 | 0.6074 | 0.2102 | 0.7209 | 66.83% | -0.0014 |
| 7. + ALL THREE ROTATION FEATS | 11 | **0.6065** | **0.2098** | **0.7217** | 66.25% | **-0.0023** |
| 8. Decoupled (replace ABS_DIFF) | 10 | **0.6065** | **0.2098** | 0.7216 | **66.30%** | **-0.0023** |

## Per-Season Breakdown (Log-Loss)

| Season | Test Games | Prod v11 | Candidate 7 (11 feats) | Candidate 8 (10 feats) | Delta vs Prod |
|---|---:|---:|---:|---:|---:|
| **2021-22** | 1,256 | 0.6244 | 0.6205 | 0.6205 | -0.0039 |
| **2022-23** | 1,248 | 0.6395 | 0.6400 | 0.6399 | +0.0004 |
| **2023-24** | 1,259 | 0.5981 | 0.5972 | 0.5974 | -0.0009 |
| **2024-25** | 1,256 | 0.5952 | 0.5901 | 0.5900 | -0.0051 |
| **2025-26** | 1,257 | 0.5871 | 0.5849 | 0.5851 | -0.0022 |
| **Overall** | **6,276** | **0.6088** | **0.6065** | **0.6065** | **-0.0023** |

## Statistical Significance (Paired 10,000-Iteration Bootstrap)
- **Mean Delta Log-Loss**: `-0.002306`
- **Bootstrap 95% CI Log-Loss**: `[-0.004794, +0.000134]`
- **Probability of Improvement $P(\text{Cand} < \text{Prod})$**: **`96.72%`**
- **Mean Delta Brier Score**: `-0.000827`
- **Bootstrap 95% CI Brier Score**: `[-0.001916, +0.000245]`
- **Probability of Improvement $P(\text{Cand} < \text{Prod})$**: **`93.52%`**

## Interpretation & Next Steps
1. The decoupled rotation metrics allow L2 regularized logistic regression to independently weight pure minute share disruption (`MISSING_ROT_MINS_DIFF`, coeff `+0.2116`), roster continuity/chemistry (`ROT_CONTINUITY_DIFF`, coeff `+0.0728`), and active lineup quality (`ACTIVE_WT_GS_DIFF`, coeff `+0.1794`).
2. Candidate 8 (10 features, cleanly replacing `ABS_DIFF`) eliminates multicollinearity while matching Candidate 7 at **`0.6065`** Log-Loss and **`0.2098`** Brier Score across all 6,276 unseen games.
3. Train-serve parity must be implemented in `src/features/roster_absence.py` and `src/features/build_matchup_features.py`.
