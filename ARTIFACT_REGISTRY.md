# Artifact Registry

## Production Models

| Path | Purpose | Status | Safe to delete? | Notes |
|---|---|---:|---:|---|
| `models/production/win_probability_model.pkl` | Current production win probability model | production | no | Primary winner signal |
| `models/production/feature_columns.json` | Feature contract for win model | production | no | Must stay aligned with production model |
| `models/production/model_metadata.json` | Win model metadata | production | no | Track training info and notes |
| `models/production/home_score_model_v2.pkl` | Home score model V2 | production | no | Part of score prediction stack |
| `models/production/away_score_model_v2.pkl` | Away score model V2 | production | no | Part of score prediction stack |
| `models/production/direct_total_points_model_v2.pkl` | Total points model V2 | production | no | Optional direct total selection |
| `models/production/direct_point_diff_model_v2.pkl` | Margin model V2 | production | no | Optional direct margin selection |
| `models/production/score_model_v2_metadata.json` | Score model metadata | production | no | Defines feature set and interval offsets |

## Experimental Models

| Path | Purpose | Status | Safe to delete? | Notes |
|---|---|---:|---:|---|
| `models/experimental/win_probability_model_v2.pkl` | Win model V2 candidate | experimental | no | Keep until reviewed |
| `models/experimental/win_probability_model_v2_fixed.pkl` | Fixed V2 candidate | experimental | no | Experimental calibration/corrections |
| `models/experimental/win_probability_v2_metadata.json` | V2 metadata | experimental | no | Experimental contract |
| `models/experimental/win_probability_v2_fixed_metadata.json` | Fixed V2 metadata | experimental | no | Experimental contract |
| `models/experimental/win_probability_v2_feature_columns.json` | V2 feature contract | experimental | no | Experimental contract |
| `models/experimental/win_probability_v2_fixed_feature_columns.json` | Fixed V2 feature contract | experimental | no | Experimental contract |

## Production Datasets

| Path | Purpose | Status | Safe to delete? | Notes |
|---|---|---:|---:|---|
| `data/production/core_players.csv` | Stable core players source of truth | production | no | Also mirrored in `data/canonical` |
| `data/production/team_win_model_ready_v2_player_features.csv` | Win model production dataset | production | no | Current stable dataset |
| `data/production/team_score_model_ready_v2_player_features.csv` | Score model production dataset | production | no | Current stable dataset |

## Experimental Datasets

| Path | Purpose | Status | Safe to delete? | Notes |
|---|---|---:|---:|---|
| `data/experimental/team_win_model_ready_v3_ema_experimental.csv` | EMA win experiment dataset | experimental | no | Keep for comparison |
| `data/experimental/team_score_model_ready_v3_ema_experimental.csv` | EMA score experiment dataset | experimental | no | Keep for comparison |

## Important Reports

| Path | Purpose | Status | Safe to delete? | Notes |
|---|---|---:|---:|---|
| `reports/audits/nba_prediction_model_audit.md` | High-level audit | production | no | Retain for reference |
| `reports/audits/cross_season_readiness_report.md` | Cross-season readiness | audit | no | Guides future season work |
| `reports/experiments/ema_experiment_report.md` | EMA experiment summary | experimental | no | Experimental reference |
| `reports/experiments/feature_pruning_ablation_report.md` | Feature ablation experiment | experimental | no | Details on removed/pruned features |
| `reports/experiments/feature_pruning_summary.md` | Feature pruning summary | experimental | no | Key insights from feature selection |
| `reports/experiments/rf_hyperparameter_tuning_report.md` | RF tuning experiment | experimental | no | Random Forest hyperparameter sweep results |
| `reports/experiments/win_probability_v2_report.md` | Win model v2 candidate report | experimental | no | Baseline vs candidate comparison |
| `reports/production/win_probability_deployment_report.md` | Deployment notes | production | no | Production context |
| `reports/audits/season_2024_25_pilot_ingestion_plan.md` | Ingestion plan for 2024-25 pilot | audit | no | Blueprint for next phase |

## Important Docs

| Path | Purpose | Status | Safe to delete? | Notes |
|---|---|---|---|---|
| `docs/architecture/nba_prediction_integration.md` | System integration overview | production | no | Active architecture reference |
| `docs/data/cross_season_schema_design.md` | Cross-season data schema design | experimental | no | Future season planning |
| `docs/data/canonical_ingestion_contract.md` | Database schemas and validation rules | audit | no | Source contract for ingest tables |
| `docs/experiments/cross_season_expansion_todo.md` | Cross-season work list | experimental | no | Planning document |

## Ingestion & Audit Infrastructure Scripts

| Path | Purpose | Status | Safe to delete? | Notes |
|---|---|---|---|---|
| `scripts/ingest/roster_snapshot_generator.py` | Generates active daily rosters | infrastructure | no | Prevents historical leakage |
| `scripts/ingest/validate_canonical_tables.py` | Schema validators | infrastructure | no | Run on all canonical tables |
| `scripts/audit/validate_cross_season_phase2.py` | Phase 2 structural validation script | audit | no | Validates Phase 2 files and signatures |
