# Experiment: Player Props Unified L1 Median Objectives & Tree Regularization

- Date: 2026-10-25
- Status: Promoted to Production (`release: v15`)
- Targets: `TARGET_PTS`, `TARGET_REB`, `TARGET_AST`
- Dataset: Expanding-window walk-forward across 5 unseen seasons (2021-22 to 2025-26, N = 140,378 player-game rows)

## Motivation & Architecture

In sports player props markets, lines are set and evaluated under Mean Absolute Error (MAE), which mathematically targets the conditional median.

Prior to `v15`, `player_model_reb.pkl` and `player_model_ast.pkl` used the standard regression objective (L2 loss / mean squared error), which models the conditional mean. Because basketball counting statistics are discrete and right-skewed with long positive tails (e.g. triple-double nights, 18-assist games), L2 regression over-predicts the median and incurs higher MAE.

In this experiment, we evaluated unified L1 loss objectives (`objective: l1`) across PTS, REB, and AST alongside tree regularization (`num_leaves: 20, min_child_samples: 50` for PTS).

## 5-Season Expanding Walk-Forward Benchmark (N = 140,378)

| Target | EMA-10 Baseline | Prod (`v14` L2) | Candidate (`v15` L1) | MAE Improvement | Seasons Won |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Sayı (PTS)** | 4.6316 | 4.4616 | **4.4603** | **-0.0013 sayı** | 5 / 5 |
| **Ribaund (REB)** | 1.9271 | 1.8839 | **1.8639** | **-0.0200 rib** | **5 / 5 (100%)** |
| **Asist (AST)** | 1.3317 | 1.3057 | **1.2792** | **-0.0265 ast** | **5 / 5 (100%)** |

---

## Season-by-Season Breakdown (REB & AST)

### Ribaund (REB MAE)
| Season | N Games | EMA-10 Base | v14 Prod (L2) | v15 Cand (L1) | Delta | Winner |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| 2021-22 | 27,894 | 1.9449 | 1.9104 | **1.8908** | -0.0195 | L1 (Cand) |
| 2022-23 | 27,651 | 1.9356 | 1.8905 | **1.8694** | -0.0211 | L1 (Cand) |
| 2023-24 | 28,105 | 1.8976 | 1.8615 | **1.8422** | -0.0194 | L1 (Cand) |
| 2024-25 | 28,134 | 1.9424 | 1.8886 | **1.8674** | -0.0213 | L1 (Cand) |
| 2025-26 | 28,594 | 1.9153 | 1.8689 | **1.8501** | -0.0188 | L1 (Cand) |
| **Overall** | **140,378** | **1.9271** | **1.8839** | **1.8639** | **-0.0200** | **L1 (5/5)** |

### Asist (AST MAE)
| Season | N Games | EMA-10 Base | v14 Prod (L2) | v15 Cand (L1) | Delta | Winner |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| 2021-22 | 27,894 | 1.3023 | 1.2869 | **1.2564** | -0.0305 | L1 (Cand) |
| 2022-23 | 27,651 | 1.3085 | 1.2817 | **1.2533** | -0.0284 | L1 (Cand) |
| 2023-24 | 28,105 | 1.3500 | 1.3199 | **1.2962** | -0.0237 | L1 (Cand) |
| 2024-25 | 28,134 | 1.3486 | 1.3177 | **1.2934** | -0.0244 | L1 (Cand) |
| 2025-26 | 28,594 | 1.3484 | 1.3215 | **1.2960** | -0.0255 | L1 (Cand) |
| **Overall** | **140,378** | **1.3317** | **1.3057** | **1.2792** | **-0.0265** | **L1 (5/5)** |

---

## Production Holdout Validation (`2025-26`)

- PTS Holdout MAE: `4.4329` -> `4.4326` (`-0.0003`)
- REB Holdout MAE: `1.8707` -> `1.8503` (`-0.0205` improvement)
- AST Holdout MAE: `1.3213` -> `1.2962` (`-0.0251` improvement)
