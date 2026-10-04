# NBA Pipeline Overview

This document describes the end-to-end data flow, feature engineering, model dataset assembly, and inference delivery in the NBA Predictor platform.

---

## 1. Data Ingestion

- **Season-Scoped Storage**: Raw files are partitioned per season under `data/season={YYYY-YY}/raw/` to ensure deterministic isolation.
- **Team Game Logs**: Fetched via `LeagueGameLog` (`nba_api`) into `team_games.csv` and `team_boxscores.csv`.
- **Player Game Logs**: Fetched via `LeagueGameLog` into `player_games.csv` and `player_boxscores.csv`.
- **Schedule**: Stored in `schedule.csv` and combined with upcoming fixtures into `schedule_combined.csv` and `.parquet`.
- **Dynamic Updates**: Daily updates run via `python3 main.py --update-data`, detecting missing completed games with randomized jitter and exponential backoff to handle API limits.

---

## 2. Cleaning & Standardization

- Dates are standardized to ISO `YYYY-MM-DD`.
- Game identifiers (`GAME_ID`) are formatted as 10-digit zero-padded strings.
- Minutes in player logs are converted from `MM:SS` string notation into floating-point numbers.
- Venue and matchup strings are normalized symmetrically to eliminate home/away indexing discrepancies.

---

## 3. High-Performance Data Layer (Parquet & SQLite)

The platform utilizes a dual storage architecture for speed and efficiency:
1. **ZSTD-Compressed Parquet Layer**:
   - `team_model_ready_v3_{YYYY_YY}.parquet`: 12x faster read throughput and 76% disk compression.
   - `player_model_ready_v4_usg.parquet`: 165,988 player-game records optimized for vectorized column scans.
2. **High-Speed SQLite Store (`data/frontend/nba_frontend.db`)**:
   - Compiled via `scripts/build_frontend_db.py`.
   - Uses Write-Ahead Logging (`PRAGMA journal_mode=WAL;`) and indexed B-trees (`idx_tb_game_season`, `idx_pb_game_player`).
   - Powers sub-millisecond (<1ms) lookups for game details, team box scores, and historical player logs with zero startup memory overhead.

---

## 4. Feature Engineering & Leakage Prevention

### Team Features (V3 - 189 Features)
- **Continuous Elo Engine**: Dynamic K-factor with historical carryover and in-memory rating state caching.
- **Dean Oliver Four Factors**: Rolling eFG%, turnover percentage, offensive rebound rate, and free throw rate.
- **Shooting & Pace Metrics**: 3-point regression delta, havoc rate, foul rate, FT margin, and paint share.
- **Schedule Fatigue**: Days rest, back-to-back flags, travel distance (Haversine formula), and timezone differentials.
- **Core Player Availability**: Real-time availability rates for Top 3 and Top 5 core players.

### Player Features (V4 USG)
- **Usage Rate Trends**: Rolling 5, 10, and 20-game Exponential Moving Averages (`USG_PCT_EMA_5`, `USG_PCT_TREND`).
- **Defense vs Position**: Opponent allowances segmented by position group (Guards, Wings, Bigs).
- **Minutes Expectations**: Rolling form projections used to avoid post-tipoff minutes leakage.

### Leakage Controls
- **Observed Affiliation Events (Stints)**: Historical trades are reconstructed strictly by timeline to prevent future roster assignment leakage.
- **Walk-Forward Splits**: All rolling features apply `shift(1)` to ensure zero lookahead bias.

---

## 5. Dataset Assembly Layers

- **Team Model-Ready V3**: `data/processed/team_model_ready_v3_{YYYY_YY}.csv` (and `.parquet`).
- **Player Model-Ready V4**: `data/experimental/player_model_ready_v4_usg.csv` (and `.parquet`).
- **Score Model Dataset**: Joint features combining pace, ratings, travel, and rest indicators.

---

## 6. Model Inference & Serving Architecture

1. **Active Production Models**:
   - **WIN Probability (v10.1)**: Calibrated LightGBM (Isotonic) with Out-of-Fold score margins and continuous Elo.
   - **SCORE Prediction (v10)**: 4-way XGBoost regressors (Pace, Home Off_Rtg, Away Off_Rtg, Margin) with Ridge residual calibration.
   - **PLAYER Projection (v9)**: LightGBM regressors for PTS, REB, AST with Ridge position/minutes calibration.
2. **Serving**:
   - FastAPI ML service (`ml-service/app`) providing sub-20ms point inference.
   - React 19 dashboard with week-by-week lazy fetching (~25 KB payload vs 1.2 MB full season).
