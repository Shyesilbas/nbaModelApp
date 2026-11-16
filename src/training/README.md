# Training Domain

Trains WIN, SCORE, and PLAYER production models from YAML feature contracts and training manifests while enforcing pre-fit collinearity guards, expanding-window validation, and provenance tracking.

> [!NOTE]
> **Related Documentation & Runbooks:**
> - **Architecture Deep Dives:** [`docs/reports/nba_models_comprehensive_report.md`](../../docs/reports/nba_models_comprehensive_report.md) · [`docs/artifact_registry.md`](../../docs/artifact_registry.md) · [`docs/reporting_and_validation_guide.md`](../../docs/reporting_and_validation_guide.md)
> - **Key Entry Points:** [`win_trainer.py`](win_trainer.py) · [`score_trainer.py`](score_trainer.py) · [`player_trainer.py`](player_trainer.py) · [`feature_contract.py`](feature_contract.py) · [`feature_guards.py`](feature_guards.py) · [`training_manifest.py`](training_manifest.py) · [`validation_utils.py`](validation_utils.py) · [`segment_evaluation.py`](segment_evaluation.py) · [`provenance.py`](provenance.py)

## Business Rules & Invariants
- **Feature Contract Enforcement:** `FeatureContract` (`load_feature_contract`, `resolve_feature_list`) binds trainers to explicit ordered feature lists in `config/features/{win,score,player}.yaml`, failing fast (`FeatureContractError`) on missing or mismatched columns.
- **Pre-Fit Feature Matrix Guards:** `check_feature_matrix` blocks or warns on constant columns, `>50%` missingness, near-duplicate pairs (`NEAR_DUPLICATE_ABS_CORR = 0.98`), and exact linear combinations (`LINEAR_DEPENDENCE_R2 = 0.9999` via `linear_dependent_features`).
- **Temporal & Expanding-Window Splits:** `expanding_window_date_splits`, `season_holdout_train_test_split`, and `chronological_train_test_split` enforce strict chronological ordering; the active season `2026-27` is never included in training or tuning splits.
- **Production Model Architectures (`v15`):**
  - `WinModelTrainer`: Uncalibrated `LogisticRegression` (`SimpleImputer` + `StandardScaler`), 11 features.
  - `ScoreModelTrainer`: Ridge pace (2), home/away offensive rating (4 each), margin (11), temporal OOF residual corrections, and split regular/playoff 80% conformal radii on actual points.
  - `PlayerModelTrainer`: LightGBM (`objective: l1`, median) per target (`pts`, `reb`, `ast`), 24 features.
- **Provenance & Manifest Governance:** `load_training_manifest` validates `TrainingManifest` seasons and promotion thresholds; `build_training_provenance` hashes input datasets (`sha256_file`) into metadata JSONs.
- **Change rule:** Never promote experimental artifacts into `models/production/` without passing multi-season walk-forward skill gates and regenerating benchmark reports via `scripts/refresh_reports.py`.
