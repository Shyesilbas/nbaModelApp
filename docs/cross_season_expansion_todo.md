Cross-Season Expansion: TODO

Goal: prepare ingestion and schema for adding historical seasons to improve rolling features and training data.

Required raw tables:
- games (game_id, game_date, season, season_type, home_team, away_team, home_score, away_score, playoff flags)
- player_box_scores (game_id, player_id, team_id, minutes, points, rebounds, assists, plus_minus, lineup_role)
- rosters (team_id, player_id, season, roster_snapshot_date, contract/trade flags)
- transactions (transaction_id, player_id, from_team, to_team, date, type)
- schedule (game_id, date, home, away)

Canonical IDs:
- team_id: NBA canonical team id (use existing TEAM_ID in processed data)
- player_id: canonical player id stable across seasons
- game_id: canonical league game id

Trade handling:
- Transactions table stores timestamped moves.
- For rolling computations, use roster snapshots as-of prediction_date. Apply transactions with effective_date <= prediction_date to build the roster.
- Preserve historical player-team assignments per game in player_box_scores.

Roster snapshot handling:
- Store snapshots at daily granularity or after each transaction.
- Snapshot includes expected lineup for next day and minutes projections when available.
- Use snapshot to compute "expected core availability" features without leaking future game info.

Leakage-free rolling computation rules:
- For any prediction_date, only include games with game_date < prediction_date.
- Shift rolling features by 1 game relative to the target game (exclude target game's stats).
- For aggregated player stats (team core), use minutes/appearance filters anchored to dates strictly before prediction_date.

Chronological validation strategy:
- Use season-aware expanding-window cross validation (train on seasons up to S, test on season S+1).
- Also use game-level chronological folds within-season for fine-grained checks.
- Reserve most recent season as holdout for final validation.

Next steps:
1. Define ETL scripts to ingest raw tables into canonical normalized schema.
2. Implement daily roster snapshot generator using transactions and box scores.
3. Add cross-season unit tests for rolling computations and leakage checks.
