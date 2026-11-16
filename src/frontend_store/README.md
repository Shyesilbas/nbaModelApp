# Frontend Store Domain

Compiles pipeline CSVs and play-by-play logs into atomic, read-only per-season (`season_YYYY_YY.db`) and cross-season (`global.db`) SQLite databases served to the frontend.

> [!NOTE]
> **Related Documentation & Runbooks:**
> - **Architecture Deep Dives:** [`docs/pipeline_overview.md`](../../docs/pipeline_overview.md) · [`docs/nba_prediction_integration.md`](../../docs/nba_prediction_integration.md)
> - **Frontend Counterparts:** [`frontend/README.md`](../../frontend/README.md) · [`frontend/src/lib/README.md`](../../frontend/src/lib/README.md)
> - **Key Entry Points:** [`store.py`](store.py) · [`builders.py`](builders.py) · [`season_status.py`](season_status.py) · [`player_history.py`](player_history.py) · [`quarter_breakdown.py`](quarter_breakdown.py) · [`pbp_moments.py`](pbp_moments.py) · [`export_trades.py`](export_trades.py)

## Business Rules & Invariants
- **Single Frontend Data Source:** All historical schedules, box scores, player histories, quarter breakdowns, PBP moments, and trade boards served via `/frontend-data-api/*` originate from `data/frontend_store/` (overridable via `FRONTEND_STORE_DIR`).
- **Atomic Temp-File Replacement (`store.py`):** `build_db` creates a temporary SQLite database, executes `SEASON_SCHEMA` or `GLOBAL_SCHEMA`, runs `VACUUM`, sets `0644` permissions, and swaps via `os.replace` so API readers (`connect_ro`) never observe partial writes.
- **Sealed Closed-Season Optimization (`season_status.py`):** `finals_winner` and `season_status` mark a historical season `closed` once a team wins 4 Finals games; `season_store_is_current` skips rebuilding closed seasons unless `STORE_VERSION` (`"2"`) changes or `--force` is passed.
- **Change rule:** Any schema or payload shape change in [`builders.py`](builders.py), [`player_history.py`](player_history.py), [`quarter_breakdown.py`](quarter_breakdown.py), or [`pbp_moments.py`](pbp_moments.py) requires bumping `STORE_VERSION` in [`store.py`](store.py) so closed seasons rebuild once.

## SQLite Stores Owned
- `data/frontend_store/season_{YYYY_YY}.db`: `meta`, `docs`, `games`, `game_details`, `team_boxscores`, `player_boxscores`, `player_games`, `pbp_moments`.
- `data/frontend_store/global.db`: `meta`, `docs` (seasons list, player profiles, cross-season averages, `build_trades`).
