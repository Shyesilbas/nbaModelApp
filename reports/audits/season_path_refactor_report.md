# Season Path Refactoring Audit Report

This report summarizes the modifications, architectural changes, and validation results of the season path parameterization (Cross-Season Infrastructure Phase 1).

---

## 1. Summary of Changes

To allow the data pipeline and machine learning workflows to support multiple seasons (starting with the 2024-25 pilot season), we eliminated hardcoded paths and centralized path resolution.

### Centralized Helpers Created:
- **[season_utils.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/season_utils.py)**: Provides canonical string formatting and conversion functions for season inputs (e.g. `2025-26` vs `2025_26`).
- **[data_paths.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/data_paths.py)**: centralizes all file and folder path resolutions for raw data, features, processed tables, and datasets. Resolves defaults based on `config/data_sources.yaml`.

### Configuration Introduced:
- **[data_sources.yaml](file:///Users/serhat/agProjects/nbaModelApp/config/data_sources.yaml)**: Config-driven roots and current season mapping.

### Files Parameterized & Modified:
1. **[main.py](file:///Users/serhat/agProjects/nbaModelApp/main.py)**: Added `--season` argument to argument parser. Resolved raw, features, and model-ready files dynamically.
2. **[build_matchup_features.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/build_matchup_features.py)**: Parameterized matchup builders and player feature calculators.
3. **[train_win_probability_v2.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/train_win_probability_v2.py)**: Adjusted output dataset name and reports based on the season argument.
4. **[prepare_score_model.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/prepare_score_model.py)**: Parameterized scoring model trainer, output models, metrics, and report filenames.
5. **[validate_benchmark_models.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/validate_benchmark_models.py)**: Enabled custom season resolution on training data loading.
6. **[train_win_probability_colab.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/train_win_probability_colab.py)**: Parametrized training source dataset path.
7. **[run_feature_pruning_ablation.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/run_feature_pruning_ablation.py)**: Converted candidate lists to dynamically resolved dataset paths.
8. **[tune_rf_win_model.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/tune_rf_win_model.py)**: Modified RF hyperparameter tuner output paths.

### Documentation & Stubs Created:
- **[canonical_data_schema.md](file:///Users/serhat/agProjects/nbaModelApp/docs/data/canonical_data_schema.md)**: Conceptual schema definitions for all database tables.
- **[roster_snapshot_generator.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/ingest/roster_snapshot_generator.py)**: Function stubs and signatures for sequential transaction simulation and roster snapshots.

---

## 2. Hardcoded Paths Removed / Normalized

- `data/processed/team_model_ready_v2_2025_26.csv` ➡️ Parameterized via `paths.team_model_ready_v2`
- `data/raw/player_games/nba_player_games_2025_26_regular_and_playoffs.csv` ➡️ Parameterized via `paths.player_games_raw`
- `data/raw/team_games/nba_team_games_2025_26_regular_and_playoffs.csv` ➡️ Parameterized via `paths.team_games_raw`
- `data/raw/schedule/nba_schedule_2025_26.csv` ➡️ Parameterized via `paths.raw_schedule`
- `data/raw/schedule/nba_finals_upcoming_2025_26.csv` ➡️ Parameterized via `paths.raw_finals_schedule`
- `data/features/team_games_features_2025_26.csv` ➡️ Parameterized via `paths.team_features`
- `data/processed/game_results_2025_26.csv` ➡️ Parameterized via `paths.game_results`
- `data/processed/upcoming_games_context_2025_26.csv` ➡️ Parameterized via `paths.upcoming_context`

### Remaining Hardcoded Paths:
- **`data/production/core_players.csv`**: Retained as-is inside `scripts/build_matchup_features.py` for backward compatibility with 2025-26 active production models, but will transition to dynamic snapshot queries in Phase 2.
- **`models/production/*`**: Retained as-is inside production configuration mapping files (`config/production_artifacts.yaml`) to avoid breaking deployed ML models.

---

## 3. How to Run the Current Pipeline

The current season pipeline defaults to `2025-26`. You can run commands exactly as before:

```bash
# Diagnostic Freshness Check (No data mutated)
python3 main.py --check-data-freshness

# Run Sync Pipeline
python3 main.py --sync-pipeline

# Run Pre-Model Readiness Pipeline
python3 main.py --pre-model-readiness
```

Or you can explicitly provide the season argument:
```bash
python3 main.py --pre-model-readiness --season 2025-26
```

---

## 4. How the Future 2024-25 Pilot Season Will Plug In

When 2024-25 data collection is ready to begin, all pipeline commands can target the historical season by passing the `--season` CLI flag:

```bash
# Sync pipeline for pilot season
python3 main.py --sync-pipeline --season 2024-25

# Train win probability model for pilot season
python3 scripts/train_win_probability_v2.py --season 2024-25

# Train score predictions for pilot season
python3 scripts/prepare_score_model.py --season 2024-25
```

All output CSVs, metadata JSONs, reports, and models will save with `_2024_25` file tokens automatically, preventing any overwrite of `2025-26` production systems.

---

## 5. Risks and Next Steps

1. **Roster snaps integration**: Phase 2 must replace static `core_players.csv` with a fully functional sequential transaction log parser (`roster_snapshot_generator.py`).
2. **Decay fallbacks**: Establishing baseline parameters and decay strategies for early-season predictions to prevent cold-start failures.
