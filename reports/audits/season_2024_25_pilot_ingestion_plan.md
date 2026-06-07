# 2024-25 Pilot Ingestion Plan

This document details the blueprint for testing the multi-season ingestion pipeline using the 2024-25 NBA season as our pilot dataset.

---

## 1. Expected Raw Files & Directory Structure

To keep raw data isolated and season-parameterized, we will store 2024-25 source files in:
- `data/raw/season=2024-25/nba_games.csv`
- `data/raw/season=2024-25/nba_team_games.csv`
- `data/raw/season=2024-25/nba_player_games.csv`
- `data/raw/season=2024-25/transactions.csv`
- `data/raw/season=2024-25/injuries.csv`

---

## 2. Ingestion Automation Status

The ingestion layer utilizes a combination of newly implemented canonical stubs and existing extraction modules:

- **Active Scripts to Reuse**:
  - `src/ingestion/team_games_fetcher.py` and `src/ingestion/nba_api_client.py` (needs to accept `--season` parameters).
- **Stub Scripts to Implement in the Next Phase**:
  - `scripts/ingest/ingest_games.py`
  - `scripts/ingest/ingest_teams.py`
  - `scripts/ingest/ingest_players.py`
  - `scripts/ingest/ingest_transactions.py`
  - `scripts/ingest/ingest_injuries.py`

---

## 3. Data Integrity & Validation Rules

Before 2024-25 datasets are loaded into the feature generators:
1. Run `scripts/ingest/validate_canonical_tables.py` routines to verify column configurations, uniqueness constraints, and missing keys.
2. Generate daily roster snapshots using `scripts/ingest/roster_snapshot_generator.py` and execute the integrity validator to confirm there are no duplicate players on the same day.

---

## 4. Pipeline Comparison & Success Criteria

Before moving beyond the 2024-25 pilot to cover 5+ seasons:
- **Parity Check**: Generate features for 2025-26 using the new roster-snapshot architecture and compare `row-by-row` with the legacy static `core_players.csv` dataset. The values must match exactly where player trades did not occur.
- **Leakage Prevention**: Verify that no transaction or box score metric from date $T$ is visible to game predictions on date $< T$.
- **Downstream Stability**: Confirm that the ML training pipelines (`prepare_win_probability_model.py`) run successfully and validate without errors on the newly prepared merged features.
