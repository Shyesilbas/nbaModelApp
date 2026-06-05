# Schedule Layer Report — 2025-26 NBA Season

> Generated: 2026-06-06

## 1. Schedule Summary

- **Total rows in combined schedule**: 1,322
- **Upcoming games (from 2026-06-06 onwards)**: 5
- **Total playoff games (IS_PLAYOFF = True)**: 92

### Season Type Distribution

| Season Type | Game Count |
| :--- | ---: |
| Regular Season | 1,230 |
| Playoffs | 81 |
| PlayIn | 6 |
| NBA Finals | 5 |

## 2. Generated Files

| Dataset | Path | Format |
| :--- | :--- | :---: |
| Combined Schedule | `data/processed/schedule_combined_2025_26.csv` | CSV |
| Combined Schedule | `data/processed/schedule_combined_2025_26.parquet` | Parquet |
| Upcoming Games Context | `data/processed/upcoming_games_context_2025_26.csv` | CSV |
| Upcoming Games Context | `data/processed/upcoming_games_context_2025_26.parquet` | Parquet |

## 3. Frontend JSON Exports

| File | Path |
| :--- | :--- |
| Full Schedule | `frontend/public/data/schedule.json` |
| Upcoming Games Context | `frontend/public/data/upcoming_games_context.json` |

## 4. Missing Fields Summary (Combined Schedule)

| Column | Null Count |
| :--- | ---: |
| `HOME_TEAM_NAME` | 1,317 |
| `AWAY_TEAM_NAME` | 1,317 |
| `GAME_STATUS` | 1,317 |
| `PLAYOFF_ROUND` | 1,317 |
| `SERIES_GAME_NUMBER` | 1,317 |
| `HOME_SERIES_WINS` | 1,322 |
| `AWAY_SERIES_WINS` | 1,322 |
| `IS_ELIMINATION_GAME` | 1,322 |
| `CAN_CLINCH_SERIES` | 1,322 |
| `ARENA` | 1,322 |
| `LOCATION` | 1,322 |

> **Note**: Fields like `HOME_SERIES_WINS`, `AWAY_SERIES_WINS`, `IS_ELIMINATION_GAME`, and `CAN_CLINCH_SERIES` are intentionally null for upcoming games — they will be enriched as the series progresses.

## 5. Source Files (Local — Do Not Re-fetch)

| Source | Path | Notes |
| :--- | :--- | :--- |
| Main Schedule | `data/raw/schedule/nba_schedule_2025_26.csv` | Played games: Regular Season, Play-In, Playoffs |
| NBA Finals (Upcoming) | `data/raw/schedule/nba_finals_upcoming_2025_26.csv` | 5 upcoming Finals games — manually corrected fallback data |

## 6. Limitations

- **No live refresh**: Data was collected from Colab and is static. Re-run `--build-schedule-context` after updating source CSVs.
- **Series metadata**: `HOME_SERIES_WINS`, `AWAY_SERIES_WINS`, `IS_ELIMINATION_GAME`, `CAN_CLINCH_SERIES` are null for upcoming Finals games and must be updated manually or via a future API integration.
- **ARENA / LOCATION**: Not available in the current Colab export; these columns are null across all rows.
- **Team features**: Upcoming game context uses the *last available* V2 model-ready row per team. This is a historical snapshot, not a live pre-game projection.

## 7. Model Prediction Status

> [!IMPORTANT]
> **No model training has been performed. No predictions have been added. No win probabilities or betting language are present in any output.**
> This schedule layer is for context visualisation only.
