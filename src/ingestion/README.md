# Ingestion Domain

Fetches raw NBA game logs, schedules, box scores, confirmed starting lineups, player transactions, and official NBA injury reports with rate-limit backoff and atomic disk writes.

> [!NOTE]
> **Related Documentation & Runbooks:**
> - **Architecture Deep Dives:** [`docs/pipeline_overview.md`](../../docs/pipeline_overview.md) · [`docs/season_onboarding_guide.md`](../../docs/season_onboarding_guide.md)
> - **Key Entry Points:** [`update_data_service.py`](update_data_service.py) · [`nba_api_client.py`](nba_api_client.py) · [`nba_injury_report.py`](nba_injury_report.py) · [`starters_fetcher.py`](starters_fetcher.py) · [`boxscore_service.py`](boxscore_service.py) · [`atomic_io.py`](atomic_io.py) · [`ingest_transactions.py`](ingest_transactions.py)

## Business Rules & Invariants
- **Crash-Safe Atomic Writes:** All ingestion CSV and text writes must pass through `write_csv_atomic` or `write_text_atomic` (temp file + `os.replace`) after schema checks so partial downloads never corrupt existing raw files.
- **Rate-Limit Resilience:** Every external `nba_api` request goes through `call_nba_api` with randomized jitter (`0.6-1.2s`), 120s timeout, and exponential backoff (`max_retries = 5`), keeping default `nba_api` headers to avoid CDN blocks.
- **Starter Flag Recovery:** `LeagueGameLog` omits starter indicators; `fetch_game_starters` and `collect_starters` query `BoxScoreTraditionalV3` via `fetch_boxscore_v3_frames` and append `player_starters.csv` alongside `player_games.csv`.
- **Official Injury Report Parsing:** `InjuryReport` (`fetch_report`, `parse_report`, `to_overrides`) fetches and parses official NBA PDF injury bulletins into deterministic status overrides (`OUT`, `DOUBTFUL`, `QUESTIONABLE`, `PROBABLE`) for live inference.
- **Change rule:** Never re-fetch completed historical seasons unless explicitly requested; incremental updates via `UpdateDataService` must detect only missing completed game IDs and preserve raw source semantics.

## Raw Data Outputs Owned
- `data/season=<YYYY-YY>/raw/`: `team_games.csv`, `player_games.csv`, `player_starters.csv`, `schedule.csv`, `finals_schedule.csv`, `boxscores/{team_boxscores,player_boxscores}.csv`, `play_by_play/`.
- `data/reference/`: `player_movement.csv` (updated by `ingest_transactions`).
