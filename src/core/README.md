# Core Domain

Provides cross-cutting path resolution, season parsing, manifest discovery, and production artifact routing across the entire repository.

> [!NOTE]
> **Related Documentation & Runbooks:**
> - **Architecture Deep Dives:** [`docs/pipeline_overview.md`](../../docs/pipeline_overview.md) · [`docs/artifact_registry.md`](../../docs/artifact_registry.md) · [`docs/season_onboarding_guide.md`](../../docs/season_onboarding_guide.md)
> - **Key Entry Points:** [`artifact_paths.py`](artifact_paths.py) · [`data_paths.py`](data_paths.py) · [`season_utils.py`](season_utils.py) · [`season_manifest.py`](season_manifest.py)

## Business Rules & Invariants
- **Centralized Path Resolution:** All season-scoped CSV, boxscore, feature, and analysis paths must come from `get_data_paths(season)` returning a `DataPaths` dataclass, or `team_training_csv(season)`. Never hardcode `data/season=...` strings in services or scripts.
- **Season Normalization & Boundary:** `normalize_season` converts compact or underscore tokens (e.g., `2026_27`, `2026-2027`) into canonical `YYYY-YY` form. `date_to_season` and `season_labels` assign August (`SEASON_START_MONTH = 8`) as the new-season boundary.
- **Default Season Precedence:** `get_default_season` checks `NBA_CURRENT_SEASON` environment variable first, then falls back to `current_season` in [`config/data_sources.yaml`](../../config/data_sources.yaml), raising `ValueError` if neither is configured.
- **Production Manifest & Override:** `production_release` reads the active release string (`v15`) from [`config/production_artifacts.yaml`](../../config/production_artifacts.yaml). `resolve_artifact_path` routes artifact lookups through `NBA_MODEL_DIR` when set (used by backtests and holdout replays) without altering the production manifest.
- **Change rule:** Any new season-level output file must be registered on `DataPaths` in [`data_paths.py`](data_paths.py) and verified with `scripts/audit/validate_project_structure.py`.

## Data & Artifacts Owned
- **Config Sources:** `config/production_artifacts.yaml`, `config/data_sources.yaml`.
- **Cross-Season Reference Constants:** `PLAYER_METADATA_CSV`, `PLAYER_MOVEMENTS_CSV`, `ESPN_TRANSACTIONS_CSV`, `PLAYER_TRAINING_CSV`, `PBP_SITUATIONAL_CSV`, and `EXPERIMENTAL_DIR`.
- **Season Manifests:** `write_season_manifest` writes `data/season=<YYYY-YY>/manifest.json` via `build_season_manifest` with UTC timestamp and produced artifact inventory.
