# Canonical Ingestion Contract

This document outlines the strict specifications, schemas, naming conventions, and validation constraints for the NBA model app's database schema.

---

## 1. Canonical Table Catalog

The following tables constitute the canonical source-of-truth dataset layer:

| Table Name | Primary Key | Key Fields | Description |
| :--- | :---: | :---: | :--- |
| `games` | `game_id` | `game_id` | Match metadata, date, scores (completed only) |
| `teams` | `team_id` | `team_id` | Static franchise info, abbreviations |
| `players` | `player_id` | `player_id` | Player biography details |
| `team_game_logs` | `log_id` | `game_id`, `team_id` | Team game results, stats, rest |
| `player_game_logs` | `log_id` | `game_id`, `player_id` | Player aggregated box stats |
| `team_box_scores` | `box_score_id` | `game_id`, `team_id` | Granular team-level match stats |
| `player_box_scores` | `box_score_id` | `game_id`, `player_id` | Granular player-level match stats |
| `transactions` | `tx_id` | `tx_id` | Movement, signings, trades ledger |
| `injuries` | `injury_id` | `injury_id` | Physical status logs and availability |
| `rosters_snapshots` | `snapshot_id` | `snapshot_date`, `team_id`, `player_id` | Daily active roster state per team |

---

## 2. Leakage Rules and Constraints

> [!WARNING]
> To prevent training data leakage, the following validation constraints must be strictly enforced:
> 
> 1. **Chronological Roster Isolation**: Future trades/signings/releases must never affect the active roster snapshot on date $T$.
> 2. **Box Score Separation**: Performance statistics (points, minutes, plus-minus) for date $T$ must never be visible to the feature generator prior to the tip-off timestamp.
> 3. **As-Of Ingestion timestamps**: Ingestion scripts must record transaction effective dates accurately. If a trade is finalized at 8:00 PM on date $T$, it cannot impact any game played at 7:00 PM on date $T$.

---

## 3. Partitioning Strategy

Data must be saved and cataloged using season-specific hierarchies to optimize queries and support modular expansions:

- Raw raw-data folder layout:
  `data/raw/games/season=YYYY-YY/games.parquet`
  `data/raw/player_game_logs/season=YYYY-YY/player_game_logs.parquet`
  `data/raw/transactions/season=YYYY-YY/transactions.parquet`

- Cleaned canonical folder layout:
  `data/canonical/season=YYYY-YY/games.parquet`
  `data/canonical/season=YYYY-YY/roster_snapshots.parquet`

---

## 4. Validation Guidelines

The validators implemented in `scripts/ingest/validate_canonical_tables.py` check:
- Presence of all required columns.
- Primary key and composite key uniqueness.
- Null violations in non-nullable identifier columns (`game_id`, `team_id`, `player_id`, `game_date`, `effective_date`).
