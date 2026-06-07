# Project Structure Cleanup Report

## Created Directories

- `models/production`
- `models/experimental`
- `models/archive`
- `reports/production`
- `reports/experiments`
- `reports/audits`
- `reports/archive`
- `data/production`
- `data/experimental`
- `data/archive`
- `data/canonical`
- `scripts/training`
- `scripts/inference`
- `scripts/features`
- `scripts/experiments`
- `scripts/ingest`
- `scripts/audit`
- `scripts/archive`
- `docs/architecture`
- `docs/data`
- `docs/experiments`
- `docs/archive`

## Files Copied Into New Structure

- Production model artifacts copied to `models/production`
- Experimental model artifacts copied to `models/experimental`
- Production datasets copied to `data/production`
- Experimental datasets copied to `data/experimental`
- High-level reports copied into `reports/production`, `reports/experiments`, and `reports/audits`
- Core docs copied into `docs/architecture`, `docs/data`, and `docs/experiments`

## Compatibility Kept In Place

- Original model files remain in `models/`
- Original datasets remain in `data/processed`, `data/analysis`, `data/features`, and `data/raw`
- Original reports remain in `reports/`
- Existing scripts continue to work through fallback path loading

## Production-Critical Artifacts

- `models/production/win_probability_model.pkl`
- `models/production/feature_columns.json`
- `models/production/model_metadata.json`
- `models/production/home_score_model_v2.pkl`
- `models/production/away_score_model_v2.pkl`
- `models/production/direct_total_points_model_v2.pkl`
- `models/production/direct_point_diff_model_v2.pkl`
- `models/production/score_model_v2_metadata.json`
- `data/production/core_players.csv`

## Experimental Artifacts

- `models/experimental/win_probability_model_v2.pkl`
- `models/experimental/win_probability_model_v2_fixed.pkl`
- `models/experimental/win_probability_v2_metadata.json`
- `models/experimental/win_probability_v2_fixed_metadata.json`
- `data/experimental/team_win_model_ready_v3_ema_experimental.csv`
- `data/experimental/team_score_model_ready_v3_ema_experimental.csv`

## Candidates For Later Archival

- Older report variants in `reports/`
- Legacy model files in the top-level `models/`
- Legacy processed datasets in `data/processed`

## Broken References Found

- `scripts/predict_matchup.py` previously hard-coded top-level model paths.
- `scripts/predict_score.py` previously hard-coded top-level score model paths.
- `ml-service/app/model_loader.py` previously hard-coded top-level model paths.
- `scripts/build_matchup_features.py` previously hard-coded `data/core_players.csv`.

These were updated to prefer `config/production_artifacts.yaml` with fallback to the legacy locations.

## Second Pass (Legacy Reports Classification)

A second pass was executed to exhaustively classify and organize the experimental reports that were originally mixed into `reports/production/` or left raw in `reports/`.

The following reports were cleanly moved to `reports/experiments/`:
- `ema_experiment_report.md` (from `reports/production/` to `reports/experiments/`)
- `feature_pruning_ablation_report.md` (from `reports/production/` to `reports/experiments/`)
- `feature_pruning_summary.md` (from `reports/production/` to `reports/experiments/`)
- `rf_hyperparameter_tuning_report.md` (from `reports/production/` to `reports/experiments/`)
- `win_probability_v2_report.md` (from `reports/production/` to `reports/experiments/`)

The [Artifact Registry](file:///Users/serhat/agProjects/nbaModelApp/ARTIFACT_REGISTRY.md) has been updated, and the safety validator remains fully functional.
