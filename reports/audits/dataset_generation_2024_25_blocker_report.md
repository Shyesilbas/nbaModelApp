# 2024-25 Experimental Dataset Generation Blocker Report

## Summary

Score dataset generation for season 2024-25 produced 0 rows due to a `GAME_ID` namespace mismatch between engineered features and `game_results`.

## Evidence of Mismatch

- Team features file contains `GAME_ID` values beginning with prefixes like `225...` and `425...`.
- `game_results_2024_25.csv` contains `GAME_ID` values beginning with `224...`.
- Joins performed on `GAME_ID` therefore returned no matches, leading to empty datasets in downstream steps.

## Likely Root Cause

- Multiple upstream sources were used for 2024-25:
  - Team/Player feature engineering was derived from a schedule/gamelog feed that encoded a different `GAME_ID` namespace.
  - `game_results_2024_25.csv` was built from NBA boxscores (canonical official IDs begin with `224...` for season 2024-25).
- Because these pipelines used inconsistent sources, their `GAME_ID` keys do not align.

## Canonical Decision for 2024-25

- Canonical source of truth: Boxscores-derived IDs and results.
  - Rationale: `game_results` in 2024-25 is derived from boxscores and will be used to compute targets; therefore, features must align to the boxscore `GAME_ID` namespace.
  - This mirrors the 2025-26 production convention where team-level records and targets are boxscore-aligned.

## Fix Plan (Implemented in this change)

1. Add an audit script to validate `GAME_ID` alignment across raw team/player games, raw team/player boxscores, engineered features, and `game_results`.
2. Build boxscore-aligned experimental team and player features for 2024-25 with leakage-free rolling features (`shift(1)`):
   - `data/experimental/team_games_features_2024_25_boxscore_aligned.{csv,parquet}`
   - `data/experimental/player_games_features_2024_25_boxscore_aligned.{csv,parquet}`
3. Update dataset-only builders to prefer these aligned experimental features for `--season 2024-25 --output-scope experimental` if present.
4. Re-run dataset-only generation and validations for 2024-25 in experimental scope.

## Safety and Scope

- No production artifacts are modified.
- All outputs are written under `data/experimental/` and `reports/audits/` only for the 2024-25 season.
- No models are trained as part of this fix.
