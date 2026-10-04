# PostgreSQL Data Layer

PostgreSQL serves as the relational analysis, reporting, and SQL query layer for the NBA data lake. While the root `data/` directory and high-speed `nba_frontend.db` SQLite store serve real-time predictions and the web dashboard, PostgreSQL provides structured schemas for complex analytical joins and backtesting queries.

---

## 1. Start PostgreSQL Service

```bash
docker compose up -d postgres
```

Default connection string:
```text
postgresql://postgres:postgres@127.0.0.1:5432/secondhand
```
(Override with the `DATABASE_URL` environment variable if needed).

---

## 2. Initialize Schemas

```bash
PYTHONPATH=. python3 scripts/db/init_db.py
```

### Schema Layers:
- `raw`: Normalized play-by-play payloads, quarter lines, and individual possession events.
- `mart`: Typed SQL views exposing Parquet datasets for statistical modeling.
- `meta`: Ingestion logs, season manifests, and data coverage indicators.

---

## 3. Import Season Datasets

Import all available Parquet datasets across all seasons:
```bash
PYTHONPATH=. python3 scripts/db/import_mart.py --all
```

Or import a specific season:
```bash
PYTHONPATH=. python3 scripts/db/import_mart.py --season 2025-26
```

### Available Mart Datasets:
- `game_results`
- `team_games`
- `player_games`
- `team_boxscores`
- `player_boxscores`
- `team_features`
- `player_features`
- `team_model_ready_v3`

---

## 4. Validate Row Counts

```bash
PYTHONPATH=. python3 scripts/db/validate_db_counts.py
```

---

## 5. Analytical SQL Queries

### Recent Games & Scores
```sql
SELECT season, game_date, away_team, home_team, away_score, home_score
FROM mart.games
WHERE season = '2025-26'
ORDER BY game_date DESC
LIMIT 10;
```

### High-Scoring Player Performances
```sql
SELECT game_date, player_name, matchup, pts, reb, ast
FROM mart.player_game_logs
WHERE season = '2025-26'
ORDER BY pts DESC
LIMIT 10;
```

### Clutch-Time Play-by-Play Events (4th Quarter Close Games)
```sql
SELECT game_id, period, clock, team, player_name, action_type, points_scored, score_margin, description
FROM raw.play_by_play_events
WHERE season = '2025-26'
  AND period = 4
  AND abs(score_margin) <= 5
  AND points_scored > 0
ORDER BY game_id, event_index
LIMIT 25;
```
