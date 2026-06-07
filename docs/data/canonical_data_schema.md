# Canonical Data Schema Specifications

This document defines the schema designs for the future canonical database tables to support a multi-season predictives database.

---

## 1. Core Entities

### teams
Represents NBA franchise entities.
- `team_id` (TEXT, PK): Canonical team identifier.
- `abbreviation` (TEXT): Canonical team abbreviation (e.g. 'LAL').
- `name` (TEXT): Franchise name.
- `city` (TEXT): Team city.

### players
Represents players who have played or are currently playing in the league.
- `player_id` (TEXT, PK): Canonical player identifier.
- `display_name` (TEXT): Formatted player name.
- `draft_year` (INTEGER): Year player was drafted.
- `attributes` (JSON): Miscellaneous biographical/physical attributes.

### games
Core game-level metadata table.
- `game_id` (TEXT, PK): Unique identifier for the game.
- `season` (TEXT): Normalized season (e.g. '2025-26').
- `season_type` (TEXT): 'Regular Season', 'PlayIn', 'Playoffs', etc.
- `game_date` (DATE): Date the game was played.
- `home_team_id` (TEXT, FK -> teams): Home team identifier.
- `away_team_id` (TEXT, FK -> teams): Away team identifier.
- `home_score` (INTEGER): Total points scored by home team (null if upcoming).
- `away_score` (INTEGER): Total points scored by away team (null if upcoming).
- `is_playoff` (BOOLEAN): Boolean indicating postseason status.
- `extra` (JSON): Arena, attendance, duration, or other source tags.

---

## 2. Ingest Logs & Box Scores

### team_game_logs
Chronological logs of completed team-level performances.
- `log_id` (TEXT, PK): Unique log row ID.
- `game_id` (TEXT, FK -> games): Game identifier.
- `team_id` (TEXT, FK -> teams): Team identifier.
- `game_date` (DATE): Date of game.
- `win` (BOOLEAN): Win outcome.
- `points` (INTEGER): Team points.
- `opponent_id` (TEXT, FK -> teams): Opponent identifier.
- `is_home` (BOOLEAN): Home status.
- `rest_days` (INTEGER): Team rest days.

### player_game_logs
Aggregated player stats for a game log.
- `log_id` (TEXT, PK)
- `game_id` (TEXT, FK -> games)
- `player_id` (TEXT, FK -> players)
- `team_id` (TEXT, FK -> teams)
- `minutes` (DOUBLE)
- `pts` (INTEGER)
- `ast` (INTEGER)
- `reb` (INTEGER)

### player_box_scores
Granular player box scores per game.
- `box_score_id` (TEXT, PK)
- `game_id` (TEXT, FK -> games)
- `player_id` (TEXT, FK -> players)
- `team_id` (TEXT, FK -> teams)
- `minutes` (DOUBLE)
- `points` (INTEGER)
- `rebounds` (INTEGER)
- `assists` (INTEGER)
- `steals` (INTEGER)
- `blocks` (INTEGER)
- `plus_minus` (DOUBLE)
- `roster_role` (TEXT): 'Starter' or 'Bench'.
- `source_meta` (JSON): Extracted source metrics.

### team_box_scores
Granular team-level box scores.
- `box_score_id` (TEXT, PK)
- `game_id` (TEXT, FK -> games)
- `team_id` (TEXT, FK -> teams)
- `points` (INTEGER)
- `rebounds` (INTEGER)
- `assists` (INTEGER)
- `steals` (INTEGER)
- `blocks` (INTEGER)

---

## 3. Rosters, Transactions, and Injuries

### rosters_snapshots
Daily active roster state per team.
- `snapshot_id` (TEXT, PK)
- `team_id` (TEXT, FK -> teams)
- `snapshot_date` (DATE)
- `players` (JSON): List of active `player_id` mappings, roles, and expected minutes.
- `derived_fields` (JSON): Rollup stats of roster depth.

### transactions
Player movement and transaction ledger.
- `tx_id` (TEXT, PK)
- `player_id` (TEXT, FK -> players)
- `from_team_id` (TEXT, FK -> teams)
- `to_team_id` (TEXT, FK -> teams)
- `effective_date` (DATE)
- `type` (TEXT): 'Trade', 'Signing', 'Waiver', etc.
- `metadata` (JSON): Details of transaction.

### injuries
Injury ledger tracking player health.
- `injury_id` (TEXT, PK)
- `player_id` (TEXT, FK -> players)
- `injury_date` (DATE)
- `return_date` (DATE): Null if ongoing.
- `status` (TEXT): 'Out', 'Questionable', 'Probable', etc.
- `details` (TEXT): Injury description.

---

## 4. Metadata and Mappings

### schedule_metadata
Future schedule items and details.
- `schedule_id` (TEXT, PK)
- `game_date` (DATE)
- `home_team_id` (TEXT, FK -> teams)
- `away_team_id` (TEXT, FK -> teams)
- `status` (TEXT): 'Scheduled', 'Postponed', etc.

### id_mappings
Cross-walk table between external stats APIs (e.g. NBA API, Basketball Reference) and canonical IDs.
- `mapping_id` (TEXT, PK)
- `canonical_id` (TEXT): Target canonical identifier.
- `entity_type` (TEXT): 'player', 'team', or 'game'.
- `source_system` (TEXT): 'nba_api', 'bball_ref', etc.
- `source_id` (TEXT): External ID string.
