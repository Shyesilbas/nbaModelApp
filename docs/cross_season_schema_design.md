Cross-Season Schema Design (canonical)

Tables (recommended):

1) games
- game_id TEXT PRIMARY KEY
- season TEXT
- season_type TEXT
- game_date DATE
- home_team_id TEXT
- away_team_id TEXT
- home_score INTEGER
- away_score INTEGER
- is_playoff BOOL
- extra JSON (venue, notes)

2) teams
- team_id TEXT PRIMARY KEY
- abbreviation TEXT
- name TEXT

3) players
- player_id TEXT PRIMARY KEY
- display_name TEXT
- attributes JSON

4) player_box_scores
- id TEXT PRIMARY KEY
- game_id TEXT (FK -> games)
- player_id TEXT (FK -> players)
- team_id TEXT
- minutes FLOAT
- pts INTEGER
- ast INTEGER
- reb INTEGER
- plus_minus FLOAT
- roster_role TEXT
- source_meta JSON

5) rosters_snapshots
- snapshot_id TEXT
- team_id TEXT
- snapshot_date DATE
- players JSON (list of player_id + role + expected_minutes)
- derived_fields JSON

6) transactions
- tx_id TEXT PRIMARY KEY
- player_id TEXT
- from_team TEXT
- to_team TEXT
- effective_date DATE
- type TEXT
- metadata JSON

7) schedule
- id TEXT
- game_date DATE
- home_team TEXT
- away_team TEXT

Considerations for leakage-free rolling computation:
- All rolling features must be computed from games where game_date < prediction_date.
- For per-team aggregations, transform games into long-format (team perspective) and compute groupby(team).apply(ewm/rolling).shift(1)
- When combining with roster snapshots, join on team + prediction_date using snapshot_date <= prediction_date and choose the latest snapshot before prediction_date.

Canonical ID policies:
- Persist mapping tables from external IDs to canonical player_id/team_id.
- Never overwrite historical mappings; new mappings should append with validity windows.

Trade and roster edge cases:
- Mid-game trades should be attributed by effective_date < game_date; document any manual exceptions.
- Injuries: keep injury events in a separate table with start/end dates and source reliability scores.

Validation and QA:
- Unit tests to ensure no row in training set has any data from prediction_date or after.
- Tests for ewm/rolling shift semantics.
- Tests to detect duplicate / conflicting roster snapshots.
