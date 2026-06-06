# NBA ML Project — Local Data Ingestion Report

> Generated: 2026-06-06

## 1. Overview of Ingestion Architecture

All NBA data fetching logic has been migrated from Colab into the local project. Four modules in `src/ingestion/` provide a complete, self-updating data pipeline:

### Module Summary

| Module | Purpose | Key Methods |
| :--- | :--- | :--- |
| `nba_api_client.py` | Centralized API wrapper | Rate-limited calls with jittered sleep (0.6–1.5s) and exponential backoff retries (up to 5 attempts) |
| `team_games_fetcher.py` | Team game log ingestion | `fetch_team_games_for_season()`, `fetch_missing_team_games_by_game_ids()`, `append_team_games_to_raw_dataset()` |
| `player_games_fetcher.py` | Player game log ingestion | `fetch_player_games_for_season()`, `fetch_missing_player_games_by_game_ids()`, `append_player_games_to_raw_dataset()` |
| `schedule_fetcher.py` | League schedule sync | `fetch_schedule_for_season()`, `update_schedule_files()` |

## 2. CLI Commands

```bash
# Diagnostic only — no data mutation
python3 main.py --startup-check

# Full pipeline — fetch missing games, rebuild features, export frontend
python3 main.py --update-data
```

### `--update-data` Pipeline Steps

1. Refresh schedule via `ScheduleLeagueV2`
2. Run data freshness check to find missing completed game IDs
3. Fetch missing team and player game logs (with `BoxScoreTraditionalV2` fallback)
4. Append and deduplicate raw CSV + Parquet datasets
5. Re-run feature sync pipeline
6. Rebuild Enhanced V2 dataset
7. Re-export frontend JSON files
8. Generate `data_update_report.md`

## 3. API Robustness

| Feature | Implementation |
| :--- | :--- |
| Rate limiting | Jittered sleep (0.6–1.5s) between calls |
| Retries | Exponential backoff, max 5 attempts |
| Fallback | `BoxScoreTraditionalV2` for failed `LeagueGameLog` calls |
| Headers | Uses `nba_api` default headers (custom headers trigger Akamai 403) |
| Type safety | `SEASON_ID` cast to `int` for Parquet compatibility |

## 4. Season Type Support

The pipeline handles all NBA season types:

| Season Type | Code | Supported |
| :--- | :--- | :---: |
| Regular Season | `Regular Season` | ✅ |
| Play-In Tournament | `PlayIn` | ✅ |
| Playoffs | `Playoffs` | ✅ |
| NBA Finals | `NBA Finals` | ✅ |

## 5. Data Deduplication Strategy

- **Team games**: Deduplicated on `TEAM_ID` + `GAME_ID`
- **Player games**: Deduplicated on `Player_ID` + `Game_ID`
- Deduplication runs after every append operation to prevent duplicate rows from re-fetching

## 6. Current Dataset Status

| Dataset | Rows | Format |
| :--- | ---: | :--- |
| Raw team games | 2,636 | CSV + Parquet |
| Raw player games | 27,902 | CSV + Parquet |
| Team features | 2,636 | CSV + Parquet |
| V2 model-ready | 1,758 | CSV + Parquet |
| V3 model-ready | 1,758 | CSV + Parquet |
| Freshness status | OK | JSON + Markdown |
