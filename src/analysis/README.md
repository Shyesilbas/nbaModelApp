# Analysis Domain

Discovers core team rotation players, applies official player movements (trades, signings, waivers) to season rosters, and refreshes live display rosters for the active season.

> [!NOTE]
> **Related Documentation & Runbooks:**
> - **Architecture Deep Dives:** [`docs/season_onboarding_guide.md`](../../docs/season_onboarding_guide.md) · [`docs/project_status.md`](../../docs/project_status.md)
> - **Key Entry Points:** [`roster_analysis.py`](roster_analysis.py) · [`roster_transactions.py`](roster_transactions.py) · [`live_roster_refresh.py`](live_roster_refresh.py)

## Business Rules & Invariants
- **Bootstrap Roster vs Live Roster Isolation:** Bootstrap rosters (`analysis/team_rosters.csv` and `analysis/core_players.csv`) are built at season start and tracked in git for `2026-27`; `build_live_roster` writes display updates solely to `analysis/team_rosters_live.csv` so model and prediction inputs remain untouched.
- **Regular-Season Filtering:** `_regular_season_games` includes only regular-season logs (`002` game ID prefix or `SEASON_TYPE == "regular season"`), excluding preseason noise from rotation importance calculations.
- **Chronological Movement Replay:** `load_season_movements`, `apply_movements`, and `roster_as_of` apply trades, signings, and waivers from `data/reference/player_movement.csv` chronologically up to a target date.
- **Accent-Folded Name Matching:** `normalize_player_name` ensures consistent player resolution across official injury PDFs, transaction feeds, and box score tables.
- **Change rule:** Never overwrite `data/season=2026-27/analysis/team_rosters.csv`, `core_players.csv`, or `team_elo_initial.json` automatically during daily refresh jobs.

## Analysis Artifacts Owned
- `data/season=<YYYY-YY>/analysis/`: `core_players.csv`, `team_rosters.csv`, `team_rosters_live.csv`, `observed_affiliation_events.csv`, `team_elo_initial.json`.
