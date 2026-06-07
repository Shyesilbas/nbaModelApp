Cross-Season Expansion Plan — 5+ NBA Seasons

Objective

Collect and integrate 5+ NBA seasons into the pipeline while ensuring all engineered features are leakage-free and robust to trades and roster churn. Provide a chronological training/validation/test plan to evaluate models over time.

1) Data sources and items to collect

- Data sources (prioritized):
  - NBA Stats API / Stats.NBA.com (where available)
  - Basketball-Reference (box scores, schedules, rosters, transactions)
  - SportVU / Second Spectrum feeds (if available) for advanced tracking
  - Official schedule files (team travel, arenas, game datetimes)

- Required data items per game (canonical minimal set):
  - game_id, game_datetime (UTC), home_team_id, away_team_id, venue_id
  - box_score per team and player (PTS, REB, AST, MIN, FG attempts/makes, turnovers, plus-minus)
  - play-by-play (for advanced features and lineup segmentation)
  - roster snapshot per team per date (player_id, jersey, position, status)
  - transactions history (trade_date, from_team_id, to_team_id) and injury/inactive reports with timestamps
  - schedule metadata: travel legs, timezone, arena altitude

- Storage schema
  - Raw tables: games, box_scores, play_by_play, rosters, transactions, injuries, schedule_meta
  - Feature tables: per-player-per-game-features, per-team-per-game-features, lineup-features
  - All tables indexed by game_datetime and entity id. Include source and ingestion timestamp columns.

2) Preserving leakage-free rolling features

- Principle: any rolling/EMA/statistic for a given (player/team) at game G must be computed using only data with game_datetime < G.game_datetime.

- Implementation rules
  - Use a strict cutoff: compute features by merging historical aggregates computed up to T_cutoff = game_datetime - epsilon (epsilon=1 second).
  - Use time-aware groupby/rolling (pandas: groupby.apply with rolling on DatetimeIndex) or SQL window functions with WHERE event_time < game_time.
  - Persist intermediate per-entity cumulative aggregates (cumulative_count, cumulative_sum, last_seen) to speed rollups — but always keyed by cutoff time.
  - For daily-batched pipelines, ensure job runs after last known game of previous day; for live predictions, compute features on-the-fly with same cutoff rule.

- Handling cold-start and early-season small-sample issues
  - Use season-prior or career-prior shrinkage: Empirical Bayes smoothing (alpha) blending season_avg and rolling_avg with weight proportional to sample size.
  - Keep 'games_played_in_season' to gate reliability and create "low-confidence" flags.

3) Handling player trades

- Player canonical id remains constant across teams (NBA player_id).
- Maintain player-team affiliation timeline table: player_team_affiliations(player_id, team_id, start_date, end_date).
- When computing team-level aggregates that depend on players (e.g., "expected_minutes_of_core"), compute both:
  - player-in-team features (player's historical per-team stats computed using games where player was on that team) and
  - player-global features (player's career/season stats regardless of team) as fallback.
- For a traded player in team A -> team B: features for team B at first game should use player's global/previous-team stats but do NOT include future games with team B. For features requiring team chemistry (lineup synergy), use only games where player played with that team.

- Transaction window features
  - Add "days_since_trade" and "games_played_with_team" counters to model adaptation after trade.

4) Handling team roster changes (injuries, call-ups, rest)

- Maintain roster snapshots per team per date; compute roster_diff for each game comparing last snapshot.
- Create "rotation stability" signals: fraction of minutes returning players provided in last N games.
- For injury-driven features, create conservative availability signals (injury_prob) derived from injury reports and days_out history.

5) Chronological train/validation/test strategy

- Core principle: never mix future-season information into prior-season training. Use strictly chronological splits.

- Recommended approaches
  - Option A: Holdout-by-season (simple)
    - Use earliest K-2 seasons for training, K-1 for validation, final season K as test. Example using 5 seasons: train seasons 1-3, val season 4, test season 5.
    - Pros: clear separation; simple to explain. Cons: single test season may be noisy.

  - Option B: Rolling origin cross-validation (preferred)
    - Use expanding window CV: iterate i from min_train_seasons to N-1: train on seasons[0:i], validate on season[i], test on season[i+1] (or employ nested folds).
    - Example: with 5 seasons S1..S5: folds: (train S1 -> val S2 -> test S3), (train S1-2 -> val S3 -> test S4), (train S1-3 -> val S4 -> test S5).
    - Pros: measures temporal generalization; uses more data for both validation and test. Cons: computationally heavier.

- Temporal granularity
  - For in-season evaluation (backtests), also use sliding-date validation windows (e.g., hold last 10% of games as validation) to assess short-term drift.

- Evaluation per-season and aggregated: track metrics per-season and pooled across seasons; compute stability (std) of metrics to detect performance degradation across eras.

6) Data quality & engineering considerations

- Timezones: canonicalize all datetimes to UTC; store original timezone for travel features.
- Game ordering: game_datetime may not monotonically increase for a team due to international games or corrections — rely on official timestamps.
- Missingness handling: mark and backfill cautiously; never fabricate historical values.

7) Backtesting and deployment

- Recompute all rolling features in backtest exactly as in production (same code path) — store both raw and feature table snapshots per game to enable exact reproducibility.
- Maintain a feature release registry mapping feature name -> pipeline version.
- For production, precompute features up to the previous game and cache by team/game for fast scoring.

8) Operational timeline for 5-season integration (milestones)

- M0: Ingest raw data for seasons 1..5 into raw tables (schema validation).
- M1: Implement time-aware rolling feature computation and offline verification scripts (per-entity cumulative aggregates).
- M2: Build player-team affiliation history and trade handling logic.
- M3: Compute and persist full feature tables for all games; run audit tests verifying no leakage.
- M4: Run rolling-origin CV experiments and produce per-season metrics.
- M5: Deploy new production feature store and run shadow predictions (no model retrain).

9) Notes on legal / licensing

- Verify data source terms (especially SportVU / proprietary APIs). If necessary, use public Basketball-Reference for initial expansion.

10) Deliverables

- Ingested raw data for 5 seasons in canonical tables.
- Feature computation scripts with unit tests for leakage-free guarantees.
- A reproducible backtest that uses the exact same feature pipeline as production.

End of plan.
