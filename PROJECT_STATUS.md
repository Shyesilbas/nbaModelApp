# Project Status

This file tracks the overall status of the project.

## Current Phase

**Phase 5: Cross-Season Model Training & Validation** (WIN promotion gate complete; cross-season WIN is now production)

**Phase 7: Efficiency / Strength Features** — parked/blocked (production WIN promotion complete; no further Phase 7 promotion yet)

## Active Production Models

| Model | Artifact | Status |
|-------|----------|--------|
| WIN | `models/production/win_probability_model.pkl` | **ACTIVE** — cross_season_win_logistic_regression, 80 features, v2026-06-10T13-21-30Z |
| SCORE home/away/total/margin | `models/production/*_score_model_v2.pkl` | **ACTIVE** — unchanged |

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

## Next Steps

1. Monitor live WIN predictions and calibration after the cross-season promotion.
2. Phase 7 efficiency/strength feature work remains parked until explicitly resumed.
