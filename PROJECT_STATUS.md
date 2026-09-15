# Project Status

This file tracks the overall status of the project.

## Current Phase

**Phase 5: Cross-Season Model Training & Validation** (WIN v9, SCORE v9, and PLAYER v9 production artifacts active; chronological validation aligned)

**Phase 7: Efficiency / Strength Features** — parked/blocked (production WIN promotion complete; no further Phase 7 promotion yet)

## Active Production Models

| Model | Artifact | Status |
|-------|----------|--------|
| WIN | `models/production/win_probability_model_v9.pkl` | **ACTIVE** — v9 logistic regression (6-season V3 datasets: 2020-21 to 2025-26, strict train-only refit scope) |
| SCORE home/away/total/margin | `models/production/score_model_v9_*.pkl` | **ACTIVE** — v9 XGBoost + Ridge calibration with bottom-up player projections, Four Factors, and Continuous Elo (6-season V3 datasets: 2020-21 to 2025-26) |
| PLAYER PTS/REB/AST | `models/production/player_v9_lgb_*.pkl` and `player_v9_ridge_*.pkl` | **ACTIVE** — v9 LightGBM + Ridge calibration (6-season V4 datasets: 2020-21 to 2025-26) |

## Phase Status

- [X] 2024-25 raw data exists and is valid.
- [X] 2024-25 game_results exists and is valid.
- [X] Team features are regenerated correctly.
- [X] Player features are regenerated correctly.
- [X] Player GAME_ID was standardized from Game_ID to GAME_ID.
- [X] Team feature alignment with game_results: 100%.
- [X] Player feature alignment with game_results: 100%.
- [X] Dataset readiness: PASS 100/100.
- [X] Dynamic roster snapshot validation: PASS.
- [X] Known transfer validation passed for Luka, AD, Jimmy, Fox, Schroder, LaVine, Wiggins.
- [X] Generate 2024-25 experimental model-ready datasets
- [X] Validate generated datasets
- [X] Merge 2024-25 experimental datasets with 2025-26 production datasets
- [X] Train cross-season baseline WIN/SCORE models (strict season split)
- [X] WIN promotion compatibility audit (`reports/audits/win_model_promotion_report.md`)
- [X] Promote cross-season WIN candidate to production
- [X] Retrain WIN/SCORE/PLAYER v8 production artifacts
- [X] Remove service-side sklearn warning for WIN artifact load
- [X] Remove static home/away split features from WIN model schema
- [X] Promote WIN v9 strength-aware candidate after segment evaluation

## Next Steps

1. Monitor live WIN v9 and SCORE/PLAYER v9 predictions after promotion and validation cleanup.
2. Phase 7 efficiency/strength feature work remains parked until explicitly resumed.
