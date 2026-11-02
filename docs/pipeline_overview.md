# NBA Pipeline Overview

This document describes the end-to-end data flow, feature engineering, model dataset assembly, and inference delivery in the NBA Predictor platform.

---

## 1. Data Ingestion

- **Season-Scoped Storage**: Raw files are partitioned per season under `data/season={YYYY-YY}/raw/` to ensure deterministic isolation.
- **Team Game Logs**: Fetched via `LeagueGameLog` (`nba_api`) into `team_games.csv` and `team_boxscores.csv`.
- **Player Game Logs**: Fetched via `LeagueGameLog` into `player_games.csv` and `player_boxscores.csv`.
- **Schedule**: Stored in `schedule.csv` and combined with upcoming fixtures into `schedule_combined.csv`.
- **Starter Flags**: `LeagueGameLog` has no starter column; `src/ingestion/starters_fetcher.py` reads per-game starters from `BoxScoreTraditionalV3` (append-only, next to `player_games.csv`). Historical seasons: `scripts/backfill_starters.py`.
- **Transactions**: `src/ingestion/ingest_transactions.py` (official NBA player movement feed, refreshed by `--update-data`) and `scripts/ingest/ingest_espn_transactions.py` write to `data/reference/`. `src/analysis/roster_transactions.py` applies trades, signings and waivers to the season roster for live player predictions and the frontend live roster.
- **Write safety and contracts**: ingestion writes go through `src/ingestion/atomic_io.py` (temp file + `os.replace`). Raw team/player logs and team model-ready datasets are checked by `src/validation/contracts.py` before they are written; a violation stops the run and keeps the previous file.
- **Dynamic Updates**: Daily updates run via `python3 main.py --update-data`, detecting missing completed games with randomized jitter and exponential backoff to handle API limits. The update also records starters and then runs `scripts/refresh_current_season_views.py` (live roster, frontend JSON, player profiles, SQLite store).

---

## 2. Cleaning & Standardization

- Dates are standardized to ISO `YYYY-MM-DD`.
- Game identifiers (`GAME_ID`) are formatted as 10-digit zero-padded strings.
- Minutes in player logs are converted from `MM:SS` string notation into floating-point numbers.
- Venue and matchup strings are normalized symmetrically to eliminate home/away indexing discrepancies.

---

## 3. Data Layer (CSV & Frontend Store)

1. **CSV pipeline data**: one CSV per table in every layer (raw, features, processed, analysis, training). Parquet copies were removed on 2026-10-21: 14 of 119 had gone stale and readers needed "newer of the two" logic; reads are fast enough as CSV (e.g. `team_model_ready_v3_2025_26` 95 ms).
   - `player_model_ready.csv`: 165,988 player-game records.
2. **Frontend Store (`data/frontend_store/`)**, the frontend's only data source:
   - One SQLite file per season (`season_YYYY_YY.db`: games feed, box scores, game details, player game logs and averages, PBP moments, rosters, movers) plus `global.db` (seasons, player profiles, season averages, trades). Built by `scripts/build_frontend_store.py` (`src/frontend_store/`) straight from `data/`; each file is built in a temp file and swapped in atomically.
   - A season is **closed** once a team has won four Finals games. A closed season's file is built once and then skipped (unless `STORE_VERSION` changes or `--force`), so past seasons cost nothing on daily updates. Measured: closed season ~20-30 s once, active season ~3 s, global ~2 s.
   - Served by `src/api/services/frontend_data.py` under `/frontend-data-api/*` (games, weeks, game detail, play-by-play, players, player profiles/averages, seasons, rosters, movers, trades, game results). Not tracked in git; `frontend/public/data/` no longer exists.

---

## 4. Feature Engineering & Leakage Prevention

### Team Features (V3 - 189 Features)
- **Continuous Elo Engine**: Dynamic K-factor with historical carryover and in-memory rating state caching.
- **Dean Oliver Four Factors**: Rolling eFG%, turnover percentage, offensive rebound rate, and free throw rate.
- **Shooting & Pace Metrics**: 3-point regression delta, havoc rate, foul rate, FT margin, and paint share.
- **Schedule Fatigue**: Days rest, back-to-back flags, travel distance (Haversine formula), and timezone differentials.
- **Core Player Availability** (`TEAM_CORE_*` / `OPP_CORE_*`, not used by production models): per game, the top 3/5 players by importance over the team's previous 20 games (min 3 played, traded players excluded), whether each plays, their expected (window-average) minutes and their shift(1) rolling stats. Rewritten on 2026-10-21; the previous version picked cores from full-season averages and used the game's actual minutes.

### Player Features (V4 USG)
- **Usage Rate Trends**: Rolling 5, 10, and 20-game Exponential Moving Averages (`USG_PCT_EMA_5`, `USG_PCT_TREND`).
- **Defense vs Position**: Opponent allowances segmented by position group (Guards, Wings, Bigs).
- **Minutes Expectations**: Rolling form projections used to avoid post-tipoff minutes leakage.

### Leakage Controls
- **Observed Affiliation Events (Stints)**: Historical trades are reconstructed strictly by timeline to prevent future roster assignment leakage.
- **Walk-Forward Splits**: All rolling features apply `shift(1)` to ensure zero lookahead bias.

---

## 5. Dataset Assembly Layers

- **Team Model-Ready V3**: `data/training/team_model_ready_{YYYY_YY}.csv`. Built by `scripts/rebuild_training_data.py` for all seasons, by `--bootstrap-season` for a new season, and refreshed daily for the in-progress season by `--update-data`.
- **Player Model-Ready V4**: `data/training/player_model_ready.csv`.
- **Score Model Dataset**: Joint features combining pace, ratings, travel, and rest indicators.

---

## 6. Model Inference & Serving Architecture

1. **Active Production Models**:
   - **WIN Probability (v15)**: Uncalibrated logistic regression on 11 features (Elo diff, home, clean net rating diff, win-rate diff, rest diff, back-to-backs, ABS_DIFF roster availability, missing rotation minutes, rotation continuity, active lineup Game Score) plus an early-season Elo blend (`docs/early_season_transitions.md`).
   - **SCORE Prediction (v15)**: Ridge regressors for pace (2 features), each side's offensive rating (4 features each) and the margin (11 features: WIN inputs plus rotation features), with a Ridge residual correction; trained on actual points.
   - **PLAYER Projection (v15)**: LightGBM regressors for PTS, REB, AST (L1 median objectives) on 24 features including position flags, the opponent's allowance to the player's position and team rotation context.
2. **Serving**:
   - FastAPI ML service (`src/api`). Measured warm WIN prediction: p50 ~430 ms, p95 ~820 ms, dominated by feature building (log loading and form roll-forward), not the model call.
   - React 19 dashboard; all data requests go to `/frontend-data-api/*` (`frontend/src/lib/dataCache.ts`).
