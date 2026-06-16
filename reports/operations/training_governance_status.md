# Training Governance Status

Updated: 2026-06-15

## Current State

Training is now manifest-driven. The main control file is `config/training_manifest.yaml`.

The accepted governance baseline is documented in `reports/operations/model_governance_golden_audit.md`.

The manifest currently defines:

- Train seasons for WIN and SCORE: `2020-21`, `2021-22`, `2022-23`, `2023-24`
- Calibration season: `2024-25`
- Validation season: `2025-26`
- Internal holdout: named season holdout using `calibration_season`
- Enabled models: WIN, SCORE, PLAYER
- Promotion thresholds and required evaluation segments
- Feature contract paths for each model family

WIN and SCORE no longer train from an implicit `team_model_ready_v3_*.csv` glob. They resolve the exact train plus calibration season files listed by the manifest. Missing or empty files fail the run before model training starts.

For WIN, the current governance policy trains the final non-production candidate on completed seasons before the external validation season and keeps `2025-26` as external validation only. Chronological quantile split is retained for diagnostics, not as the primary governance policy.

## Feature Contracts

Feature policy is versioned separately from trainer code:

- WIN: `config/features/win_v9.yaml`
- SCORE: `config/features/score_v9.yaml`
- PLAYER: `config/features/player_v9.yaml`

These contracts declare target columns, feature lists or feature derivation policy, excluded metadata columns, required context columns, and defaultable columns.

The trainers write the active feature contract snapshot into experimental artifact metadata:

- `models/experimental/model_metadata.json`
- `models/experimental/score_model_v9_metadata.json`
- `models/experimental/player_v9_metadata.json`

## What Happens During Training

`scripts/run_training_workflow.py --dry-run` performs the full workflow:

1. Rebuild the manifest-scoped PLAYER dataset.
2. Run `scripts/retrain_pipeline.py --dry-run`.

`scripts/retrain_pipeline.py` performs the following training steps:

1. Load and validate `config/training_manifest.yaml`.
2. Resolve expected team season datasets from `train_seasons` plus `calibration_season`.
3. Validate dataset existence, non-empty status, and required columns.
4. Load model-specific feature contracts.
5. Train PLAYER, then SCORE, then WIN candidate artifacts into `models/experimental/`.
6. For each trainer, compute season-holdout calibration metrics on `calibration_season`.
7. Refit final candidate models on all train plus calibration rows after holdout evaluation.
8. Evaluate production champion vs experimental challenger on the manifest `validation_season`.
9. Compute segment metrics for overall, regular season, playoffs, home, away, close games, favorites, and underdogs.
10. Evaluate promotion eligibility against manifest thresholds.
11. Write a run report under `reports/evaluation/training_run_YYYYMMDD_HHMMSS.md`.

Promotion is blocked when threshold checks fail, even if the script is run without `--dry-run`.

## Latest Verified Run

Latest verified dry run:

- Report: `reports/evaluation/training_run_20260615_133315.md`
- Result: challenger was not promotion eligible
- Threshold eligibility: `True`
- Promotion allowed: `False`
- Main blocking gate: champion/challenger comparison
- Challenger WIN Brier: `0.2065`
- Champion WIN Brier: `0.2019`

The dry run completed end to end and generated experimental metadata with manifest and feature contract snapshots.

The verified command was:

```bash
PYTHONPATH=. python3 scripts/run_training_workflow.py --dry-run
```

Season-holdout metadata from the latest artifacts:

| Model | Fit rows | Calibration rows | Fit seasons | Calibration season |
| --- | ---: | ---: | --- | --- |
| WIN | 6748 | 1748 | `2020-21` through `2023-24` | `2024-25` |
| SCORE pace | 3374 | 871 | `2020-21` through `2023-24` | `2024-25` |
| PLAYER PTS | 109050 | 28240 | `2020-21` through `2023-24` | `2024-25` |

## Feature Count Clarification

The model-ready CSV files contain more columns than the models actually use. Several columns are IDs, dates, labels, raw targets, result fields, or other metadata that must not become model features.

Current actual artifact feature counts:

| Model | Active feature count | Source |
| --- | ---: | --- |
| WIN v9 challenger | 62 | `models/experimental/feature_columns_v9.json` |
| WIN v8 base schema | 50 | `models/production/feature_columns_v8.json` |
| PLAYER v9 | 40 | `models/experimental/player_v9_features.pkl` |
| SCORE pace | 12 | `score_model_v9_metadata.json` |
| SCORE home offensive rating | 15 | `score_model_v9_metadata.json` |
| SCORE away offensive rating | 17 | `score_model_v9_metadata.json` |
| SCORE margin | 18 | `score_model_v9_metadata.json` |

This means a dataset can have many more columns than the model feature count. The feature contract decides which columns are eligible for the model.

For WIN, the current v9 schema is production `feature_columns_v8.json` plus v9 derived strength features. Some projection features are defaulted when player projection coverage is unavailable for the selected train seasons. That behavior is explicit in `config/features/win_v9.yaml` and recorded in metadata as `imputed_missing_required_features`.

For PLAYER, the contract uses an exclude-list strategy: metadata columns and targets are removed, and the remaining eligible numeric/context columns become features. The resulting current feature count is 40.

For SCORE, each submodel has its own compact feature list. SCORE does not use one large shared feature matrix; pace, home rating, away rating, and margin each train on their own configured feature set.

## PLAYER Season Coverage

PLAYER season coverage is now manifest-scoped. Rebuild the player dataset with:

```bash
PYTHONPATH=. python3 scripts/build_training_player_dataset.py --include-validation-season
```

The manifest now requires PLAYER dataset coverage for `2020-21` through `2025-26`. If this validation fails, regenerate `data/experimental/player_model_ready_v4_usg.csv` before retraining.

The dataset may contain the validation season for evaluation and projection feature generation, but `PlayerModelTrainer` filters fitting and final refit to manifest `train_seasons`. This keeps `2025-26` as the external champion/challenger validation season while still allowing evaluation rows to exist in the shared player model-ready file.

Current rebuilt PLAYER dataset:

- Total rows: `165988`
- Training rows used by PLAYER trainer: `137290`
- Full `SEASON_ID` coverage: `2020-21` through `2025-26`, including regular season, play-in, and playoff prefixes

## How To Change Training

### Add A New Season

To add a new historical fit season:

1. Build or verify team data at `data/processed/team_model_ready_v3_YYYY_YY.csv`.
2. Build or verify player feature data at `data/season=YYYY-YY/features/player_features.csv`.
3. Add the season to `train_seasons` in `config/training_manifest.yaml`.
4. Add the season to `models.player.required_seasons`.
5. Run:

```bash
PYTHONPATH=. python3 scripts/run_training_workflow.py --dry-run
```

To roll the timeline forward, use this pattern:

- Move the old `calibration_season` into `train_seasons`.
- Set the next completed season as `calibration_season`.
- Set the current or target evaluation season as `validation_season`.
- Ensure PLAYER `required_seasons` includes train, calibration, and validation seasons.

Example future shape:

```yaml
train_seasons:
  - "2020-21"
  - "2021-22"
  - "2022-23"
  - "2023-24"
  - "2024-25"
calibration_season: "2025-26"
validation_season: "2026-27"
```

### Change PLAYER Training

Use `config/features/player_v9.yaml` for target/exclusion/context policy:

- Add a new target under `targets`.
- Add non-feature metadata columns under `exclude_columns`.
- Add required columns under `required_context_columns`.

After changing PLAYER feature policy or season scope, rebuild via:

```bash
PYTHONPATH=. python3 scripts/run_training_workflow.py --dry-run
```

The workflow rebuilds `data/experimental/player_model_ready_v4_usg.csv` before training unless `--skip-player-dataset-rebuild` is passed.

PLAYER artifact outputs:

- `models/experimental/player_v9_features.pkl`
- `models/experimental/player_v9_lgb_pts.pkl`
- `models/experimental/player_v9_lgb_reb.pkl`
- `models/experimental/player_v9_lgb_ast.pkl`
- `models/experimental/player_v9_ridge_pts.pkl`
- `models/experimental/player_v9_ridge_reb.pkl`
- `models/experimental/player_v9_ridge_ast.pkl`
- `models/experimental/player_v9_metadata.json`

### Change SCORE Training

Use `config/features/score_v9.yaml`.

SCORE has separate feature lists for:

- `pace_features`
- `base_off_rtg_features`
- `away_extra_features`
- `margin_extra_features`

SCORE artifact outputs:

- `models/experimental/score_model_v9_pace.pkl`
- `models/experimental/score_model_v9_home_rtg.pkl`
- `models/experimental/score_model_v9_away_rtg.pkl`
- `models/experimental/score_model_v9_margin.pkl`
- `models/experimental/score_model_v9_ridge_total.pkl`
- `models/experimental/score_model_v9_ridge_margin.pkl`
- `models/experimental/score_model_v9_metadata.json`

### Change WIN Training

Use `config/features/win_v9.yaml`.

Common changes:

- Add required static/base features through the referenced base feature file or contract.
- Add derived feature names under `derived_features`.
- Add safe defaults under `defaultable_features`.
- Change projection behavior under `projection_features`.

If a new derived feature requires calculation, update `src/features/win_strength_features.py` or `src/training/win_trainer.py`.

WIN artifact outputs:

- `models/experimental/win_probability_model_v9.pkl`
- `models/experimental/feature_columns_v9.json`
- `models/experimental/model_metadata.json`

### Change Promotion Rules

Edit `config/training_manifest.yaml`:

- `promotion_thresholds`
- `required_segments`

Promotion requires:

1. Challenger passes manifest thresholds.
2. Challenger passes the champion/challenger gate.
3. Non-dry-run mode is used.
4. The operator confirms with `y` or `yes`.

If all gates pass, `scripts/retrain_pipeline.py` copies approved files from `models/experimental/` to `models/production/`. That is the live production artifact location used by inference services.

Dry-run mode never copies files to production.

### Where Outputs Go

| Output | Path |
| --- | --- |
| Rebuilt PLAYER dataset | `data/experimental/player_model_ready_v4_usg.csv` |
| Candidate model artifacts | `models/experimental/` |
| Production model artifacts after promotion | `models/production/` |
| Training run report | `reports/evaluation/training_run_YYYYMMDD_HHMMSS.md` |
| Training governance reference | `reports/operations/training_governance_status.md` |

## Operational Rule

When changing training behavior, update these files together:

- `config/training_manifest.yaml`
- relevant `config/features/*_v9.yaml`
- trainer code only when a new feature derivation or model lifecycle step is required
- this report when the training governance contract changes
