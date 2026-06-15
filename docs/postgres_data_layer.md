# PostgreSQL Data Layer

PostgreSQL is the query and analysis layer for the local NBA data lake. The root `data/` directory remains the source of truth; PostgreSQL stores selected, queryable datasets plus normalized play-by-play tables.

## Start PostgreSQL

```bash
docker compose up -d postgres
```

Default connection:

```text
postgresql://postgres:postgres@127.0.0.1:5432/secondhand
```

Override with `DATABASE_URL` when needed.

## Initialize Schema

```bash
PYTHONPATH=. python3 scripts/db/init_db.py
```

Schemas:

- `raw`: normalized play-by-play payloads, events, and quarter scores.
- `mart`: selected Parquet datasets exposed through typed SQL views.
- `meta`: manifests, import logs, and coverage metadata.

## Import Data

Import selected Parquet datasets only:

```bash
PYTHONPATH=. python3 scripts/db/import_mart.py --all
```

Import one season:

```bash
PYTHONPATH=. python3 scripts/db/import_mart.py --season 2024-25
```

Available mart datasets:

- `game_results`
- `team_games`
- `player_games`
- `team_boxscores`
- `player_boxscores`
- `team_features`
- `player_features`
- `team_model_ready_v2`

Play-by-play data is stored in:

- `raw.play_by_play_payloads`
- `raw.play_by_play_events`
- `raw.quarter_scores`

## Validate Counts

```bash
PYTHONPATH=. python3 scripts/db/validate_db_counts.py
```

## Example Queries

```sql
select season, game_date, away_team, home_team, away_score, home_score
from mart.games
where season = '2024-25'
order by game_date desc
limit 10;
```

```sql
select game_date, player_name, matchup, pts, reb, ast
from mart.player_game_logs
where season = '2024-25'
order by pts desc
limit 10;
```

```sql
select game_id, period, clock, team, player_name, action_type, points_scored, score_margin, description
from raw.play_by_play_events
where season = '2024-25'
  and period = 4
  and abs(score_margin) <= 5
  and points_scored > 0
order by game_id, event_index
limit 25;
```
