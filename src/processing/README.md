# Processing Domain

Standardizes raw game logs, cleans play-by-play events into on-court stints, assembles upcoming matchup contexts, and compiles model-ready CSV datasets for WIN, SCORE, and PLAYER training.

> [!NOTE]
> **Related Documentation & Runbooks:**
> - **Architecture Deep Dives:** [`docs/pipeline_overview.md`](../../docs/pipeline_overview.md) · [`docs/ai_compact_game_payload.md`](../../docs/ai_compact_game_payload.md)
> - **Key Entry Points:** [`model_dataset_builder.py`](model_dataset_builder.py) · [`player_dataset_builder.py`](player_dataset_builder.py) · [`rebuild_training_data.py`](rebuild_training_data.py) · [`cleaning.py`](cleaning.py) · [`pbp_lineups.py`](pbp_lineups.py) · [`pbp_cleaner.py`](pbp_cleaner.py) · [`upcoming_context_service.py`](upcoming_context_service.py) · [`compact_game_payload.py`](compact_game_payload.py)

## Business Rules & Invariants
- **Single-Table CSV Architecture:** Every processed and training layer writes one canonical CSV per table (no Parquet shadows that can drift).
- **Preseason Exclusion & ID Normalization:** `drop_preseason` and `is_preseason_mask` strip preseason rows (game IDs starting with `001`) before modeling datasets are built. `GAME_ID` values are normalized to 10-digit zero-padded strings (`norm_game_id`).
- **Symmetrical Standardization:** [`cleaning.py`](cleaning.py) converts dates to ISO `YYYY-MM-DD`, parses `MM:SS` minutes into floats (`clean_minutes_column`), and standardizes home/away matchups (`normalize_game_matchups`).
- **Play-by-Play Stint Extraction:** [`pbp_lineups.py`](pbp_lineups.py) (`extract_stints`, `player_games_from_stints`) reconstructs 5-on-5 lineups and game stints from cached play-by-play JSONs with quality validation (`quality_check`, `game_quality`).
- **Offline Dataset Builders:** `build_team_model_dataset_v3` outputs `data/training/team_model_ready_{YYYY_YY}.csv` (WIN/SCORE rows) and `build_player_dataset_v4` outputs `data/training/player_model_ready.csv` (PLAYER rows). `rebuild_season` rebuilds training datasets cleanly from raw logs.
- **Change rule:** Any column transformation added in `model_dataset_builder.py` or `player_dataset_builder.py` must be mirrored identically in live feature generation (`src/features/build_matchup_features.py` or `src/api/services/player_projection.py`) to preserve train-serve parity.

## Processed Data Owned
- `data/season=<YYYY-YY>/processed/`: `game_results.csv`, `schedule_combined.csv`, `upcoming_games_context.csv`, `team_model_ready_v2.csv`.
- `data/training/`: `team_model_ready_{YYYY_YY}.csv`, `player_model_ready.csv`, `pbp_situational_features.csv`.
