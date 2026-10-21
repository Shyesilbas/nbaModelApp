# Project Status

This file tracks the overall status of the project.

## Current Phase

**Phase 5: Cross-Season Model Training & Validation** (release v11 production artifacts active (WIN, SCORE, PLAYER); Elo train-serve scale aligned; OOF margin integration complete)

**Phase 7: Efficiency / Strength Features** — parked/blocked (production release v11 promotion complete; no further Phase 7 promotion yet)

## Active Production Models

| Model | Artifact | Status |
|-------|----------|--------|
| WIN | `models/production/win_model.pkl` | **ACTIVE** — uncalibrated logistic regression, 8 features (Elo diff, home, clean net rating diff, win-rate diff, rest diff, back-to-backs, **ABS_DIFF roster availability**) |
| SCORE home/away/total/margin | `models/production/score_model_*.pkl` | **ACTIVE** — Ridge pace (2 features) and offensive-rating models (own/opponent roster availability added), Ridge margin on the WIN inputs incl. ABS_DIFF, Ridge residual correction; actual-point targets |
| PLAYER PTS/REB/AST | `models/production/player_model_*.pkl` | **ACTIVE** — LightGBM per target, 21 features incl. position flags and opponent allowance to the position; no residual correction |

All three are trained on 2020-21..2025-26. Honest walk-forward (2021-22..2025-26, true availability known): WIN Brier 0.2106 vs 0.2157 for Elo + home court; SCORE total MAE 14.90 vs 14.95 and margin MAE 10.83 vs 11.41 for last-10 real points; PLAYER MAE PTS 4.54 / REB 1.91 / AST 1.32 vs EMA-10 4.63 / 1.93 / 1.33 (`reports/evaluation/multi_season_walk_forward_backtest.md`).

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
- [X] WIN promotion compatibility audit (rapor silindi)
- [X] Promote cross-season WIN candidate to production
- [X] Retrain WIN/SCORE/PLAYER v8 production artifacts
- [X] Remove service-side sklearn warning for WIN artifact load
- [X] Remove static home/away split features from WIN model schema
- [X] Promote WIN v9 strength-aware candidate after segment evaluation
- [X] Comprehensive cross-season model quality, leakage and train-serve skew audit (rapor silindi)
- [X] Fix ContinuousEloEngine margin calculation scale mismatch between training and live inference
- [X] Remove box-score `PLAYED_COUNT` leakage from score model contract (`score.yaml`)
- [X] Export and integrate 5-Fold OOF score margins into WIN probability model
- [X] Promote V10.1 production models (WIN & SCORE) upon explicit user approval
- [X] Multi-season expanding-window walk-forward backtest across 5 unseen seasons (2021-22 to 2025-26), now on the production configurations with strong baselines
- [X] 2026-10-20 model review: pruned WIN to 7 features, removed early-season feature shrink (train-serve skew), actual-point SCORE targets (overtime was undercounted ~13 pts), 2-feature SCORE sub-models, PLAYER explicit feature list + opponent position allowance, retired PLAYER Ridge correction, fixed F-G position mapping, release models now include the validation season, training Elo computed from the full raw game log (matches live Elo), stale parquet caches no longer served, SHAP explanations fixed for linear models
- [X] 2026-10-20 roster availability in WIN/SCORE: `ABS_DELTA`/`ABS_DIFF` (`src/features/roster_absence.py`) = sum over rotation players of (availability tonight - share of the last 15 games played) x game score. Training uses the box score; live inference uses `player_status_overrides` (OUT = 0, RESTRICTED = factor) and, for players nobody mentioned, assumes whoever played the previous game plays. Walk-forward: WIN Brier -0.0032 and margin MAE -0.13 with true availability (better in all 5 seasons), still no worse than before with the carry-forward default. Marking a rotation player OUT now moves win probability, margin and score (e.g. BOS-NYK 2026-03-10: Tatum + Brown OUT, P(BOS) 0.674 -> 0.562). Rebuilt by `scripts/rebuild_training_data.py`
- [X] Multi-season feature ablation study across 4,407 test games
- [X] 2026-10-21 players without any NBA box score (rookies): their candidate row copied another player's form (template leak), so an ACTIVE starter rookie got ~50 PRA. Now they are projected as first-60-day rookie per-minute rates x projected minutes (`NO_HISTORY_PER_MIN` in `src/api/services/player_projection.py`), and frontend-store season averages and the player modal's recent form exclude preseason games
- [X] 2026-10-21 early-season transitions (inference only, no retrain; `reports/backtests/2026-10-21_early_season/`): SCORE pace/rating inputs start at last season's team means (75% weight vs the league mean) and hand over to current form over 6 games (total MAE 15.41 -> 14.72 for teams with 0 games, 15.93 -> 15.09 at 1-2; before this every opener was ~226); PLAYER projections take 40% of last season's per-game average at a player's first game, fading out over 3 games (first-game PTS MAE 4.48 -> 4.32); at season start `ABS_DELTA` moves only with overrides and the rotation spans last season (opening-game WIN Brier 0.2294 -> 0.2227). 3-5 game windows lose to 10 (total MAE 15.07-15.23 vs 14.92); an EWMA span 10-20 would gain 0.06 and needs a SCORE retrain
- [X] Live shadow prediction logging store (`src/api/services/shadow_logger.py`) and KS-test drift monitor (`monitor_shadow_and_drift.py`)

## Next Steps

1. Monitor live shadow predictions and feature drift in the API (`src/api`) for the 2026-27 season.
2. Next accuracy gains need new information (injury/lineup data, market lines); feature pruning has reached the pregame-data ceiling.
3. Phase 7 efficiency/strength feature work remains parked until explicitly resumed.
4. **Fixed:** API, CLI, daily schedule, WinPredictor and SHAP now share one early-season blend (`src/inference/win_blend.py`). README labels which probability each metric measures. Tracked in `reports/audits/2026-10-21_api_cli_win_probability_mismatch.md`; pick up after the structure cleanup.

