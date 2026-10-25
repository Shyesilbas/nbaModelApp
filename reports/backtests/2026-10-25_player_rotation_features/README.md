# Experiment: Player Props Rotation Context & Absence Decoupling

- Date: 2026-10-25
- Status: Promoted to Production (`release: v14`)
- Target: `TARGET_PTS`, `TARGET_REB`, `TARGET_AST`
- Dataset: Expanding-window walk-forward across 5 unseen seasons (2021-22 to 2025-26, N = 140,378 player-game rows)
- Script: `reports/backtests/2026-10-25_player_rotation_features/code/run_experiment.py`

## Motivation & Architecture

In `v12` (WIN model) and `v13` (SCORE margin model), decoupling rotation absence into missing rotation minutes (`MISSING_ROT_MINS`), lineup continuity (`ROT_CONTINUITY`), and active lineup Game Score (`ACTIVE_WT_GS`) delivered significant performance gains.

In NBA basketball, an individual player's expected output is heavily determined by team rotation context. When high-minute regular rotation teammates are missing:
1. Remaining players receive elevated minutes.
2. Shot attempts, possession usage, and playmaking opportunities shift to remaining starters and rotation reserves.
3. Defensive focus and rebound opportunities adapt to the active lineup configuration.

In this experiment, we extended the explicit feature contract from 21 to 24 features by integrating:
- `MISSING_ROT_MINS`: Minute share lost by regular rotation players (>= 20 min/game over last 15 games).
- `ROT_CONTINUITY`: Ratio of active rotation minutes to expected rotation baseline.
- `ACTIVE_WT_GS`: Average Hollinger Game Score of the active roster weighted by minutes.

## 5-Season Expanding Walk-Forward Benchmark (N = 140,378 Player Games)

### PTS (Points)
- EMA-10 Baseline: `4.6316`
- Production Baseline (`v13`, 21 feats): `4.5373`
- **Candidate (`v14`, 24 feats): `4.4613` (-0.0760 pts MAE improvement, won 5/5 seasons)**

### REB (Rebounds)
- EMA-10 Baseline: `1.9271`
- Production Baseline (`v13`, 21 feats): `1.9104`
- **Candidate (`v14`, 24 feats): `1.8839` (-0.0265 reb MAE improvement, won 5/5 seasons)**

### AST (Assists)
- EMA-10 Baseline: `1.3317`
- Production Baseline (`v13`, 21 feats): `1.3214`
- **Candidate (`v14`, 24 feats): `1.3057` (-0.0157 ast MAE improvement, won 5/5 seasons)**

---

## Season-by-Season Breakdown

| Season | Test Rows | PTS (Prod / Cand) | REB (Prod / Cand) | AST (Prod / Cand) |
| :--- | :---: | :---: | :---: | :---: |
| 2021-22 | 28,050 | 4.5517 / **4.4845** | 1.9344 / **1.9104** | 1.3001 / **1.2869** |
| 2022-23 | 27,740 | 4.5940 / **4.5046** | 1.9199 / **1.8905** | 1.3007 / **1.2817** |
| 2023-24 | 28,206 | 4.4716 / **4.4105** | 1.8887 / **1.8615** | 1.3367 / **1.3207** |
| 2024-25 | 28,240 | 4.5587 / **4.4752** | 1.9168 / **1.8886** | 1.3333 / **1.3177** |
| 2025-26 | 28,698 | 4.5104 / **4.4318** | 1.8922 / **1.8689** | 1.3356 / **1.3215** |
| **Overall** | **140,378** | **4.5373 / 4.4613** | **1.9104 / 1.8839** | **1.3214 / 1.3057** |

---

## Production Holdout Validation (`2025-26`)

- PTS Holdout MAE: `4.5078` -> `4.4329` (`-0.0749` improvement)
- REB Holdout MAE: `1.8939` -> `1.8707` (`-0.0232` improvement)
- AST Holdout MAE: `1.3341` -> `1.3213` (`-0.0128` improvement)

## Train-Serve Parity Guarantee

- Training: `src/processing/player_dataset_builder.py` attaches pregame team rotation features (`MISSING_ROT_MINS`, `ROT_CONTINUITY`, `ACTIVE_WT_GS`) to each player-game row.
- Live Pre-game Inference: `src/api/services/player_projection.py` dynamically calls `live_roster_metrics` for home and away teams, passing user overrides (`OUT`, `RESTRICTED`) and carry-forward injury states directly to each player feature matrix before running LightGBM inference.
