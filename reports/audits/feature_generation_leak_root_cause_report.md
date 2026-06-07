### Root Cause Report — 2024-25 Feature Files Contained 2025-26 Data

#### Summary
- 2025-26 raw inputs were loaded while output paths were parameterized with the user-requested `2024-25` season token. This led to 2025-26 features being written into `team_games_features_2024_25.*` and `player_games_features_2024_25.*`.
- The mismatch stems from missing `season` propagation into raw data loaders, which then default to `current_season = 2025-26`.

#### Evidence and Exact Code Paths
1) Loaders default to current season when `season` is not provided:

```
File: src/ingestion/data_loader.py
48: def load_team_games(data_dir: str = "data/raw/team_games", season: Optional[str] = None) -> pd.DataFrame:
...
59:     from scripts.data_paths import get_data_paths
60:     paths = get_data_paths(season)
61:     default_name = os.path.basename(paths.team_games_raw)
```

```
File: scripts/data_paths.py
38:     default_season = config.get("current_season", "2025-26")
39:     if not season:
40:         season = default_season
42:     season = normalize_season(season)
43:     token = season_to_file_token(season)
```

- When `season=None`, `get_data_paths(None)` resolves paths for `2025-26` by default.

2) The main pipeline constructed output filenames using the CLI `--season` token but did not pass that season into the loaders:

```
File: main.py (feature engineering path)
371-377: df_team_clean/df_player_clean prepared
378-381: df_team_features = build_team_features(df_team_clean); df_player_features = build_player_features(df_player_clean)
...
390-395: paths = get_data_paths(args.season); token = season_to_file_token(normalize_season(args.season or "2025-26"))
...
401-405: if experimental: team_csv = f"...team_games_features_{token}.csv" else: team_csv = paths.team_features
```

- Critically, the data was loaded earlier by:

```
File: main.py
515: df_team_raw = load_team_games(args.raw_team_dir)            # season NOT passed
...  (similar for player: load_player_games(args.raw_player_dir))
```

- Because `season` was omitted, `load_team_games()` and `load_player_games()` fell back to `current_season` (2025-26) for their expected raw filenames. The resulting features therefore contain 2025-26 content.
- Meanwhile, the output filenames were parameterized from `args.season` (e.g., `2024-25`), causing 2025-26 features to be saved under `*_2024_25.*` names.

#### Why This Happened
- The Season parameter was inconsistently propagated: it was used for output path construction but not for raw input resolution.
- The `get_data_paths()` utility intentionally defaults to the configured `current_season` (2025-26). Without explicit `season` in the loaders, inputs drift to 2025-26 while the output token may represent a different season.

#### Impacted Artifacts
- `data/features/team_games_features_2024_25.csv` and `.parquet`
- `data/features/player_games_features_2024_25.csv` and `.parquet`

Both actually contain 2025-26 data as evidenced by:
- `GAME_DATE` range around 2025-10-21 → 2026-06-05
- `GAME_ID` prefixes `225...` / `425...` (2025-26 season convention)

#### Remediation Plan Applied in This Task
- Do not touch production artifacts.
- Regenerate 2024-25 features by explicitly loading `season="2024-25"` raw sources and writing only to experimental paths:
  - `data/experimental/team_games_features_2024_25.{csv,parquet}`
  - `data/experimental/player_games_features_2024_25.{csv,parquet}`
- Validate:
  - Date bounds `2024-10-22 → 2025-06-22`
  - `GAME_ID` prefixes `00224... / 00424...`
  - Row counts comparable to raw sources
  - Rolling features remain leakage-free via `shift(1)`

#### Longer-Term Preventive Actions (not executed here)
- Ensure all pipeline entry points pass `season` into loaders consistently.
- Add guardrails: before saving, assert that inferred season from `GAME_ID`/dates matches the output token.
- Add CI checks that compare sample date ranges and `GAME_ID` prefixes against the target season.
