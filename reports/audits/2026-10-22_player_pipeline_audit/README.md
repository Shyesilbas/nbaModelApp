# Player Pipeline Audit (2026-10-22)

End-to-end review of the PLAYER projection chain: training dataset, training, live features, minutes and usage
redistribution, team-score scaling. Measured by replaying the live code over 2025-26 with the holdout models
(`models/experimental/holdout_eval`, fitted without 2025-26). Code in `code/`, outputs in untracked
`data/experimental/player_audit/`. Unless stated, MAE is on players who actually played.

## Findings

| # | Problem | Fix | Evidence |
|---|---|---|---|
| 1 | Live current-season rows came from `features/player_features.csv`: no `USG_PCT`, so `USG_PCT_EMA_10` stayed at last season's value | Rows built from raw box scores with usage from the training code (`season_rows_from_raw`, `add_usage_pct`) | Replay below |
| 2 | Same file has no opponent-allowance columns: `OPP_POS_*_ALLOWED_LAST_10` was NaN whenever the opponent had played this season (and one game stale otherwise) | Allowance = mean of the opponent's last 10 games before the date, from raw logs with the training function (`opponent_allowance`, `position_totals_by_game`) | NaN 100% -> 0% in the replay |
| 3 | The on-demand game refresh appends raw games but never rebuilds `player_features.csv` (2026-10-21: 1 of 3 games) | Live path no longer reads that file | |
| 4 | Default rotation capped at 10 per team and every projection scaled to fit 240 minutes: a third of the players who played got 0, the rest were cut ~8% | Top 10 plus anyone averaging 12+ minutes (max 13); stats move only with the player's own override minutes, 240 fit is display only | Teams use 10.7 players a game; 12+ minute players play over half the time |
| 5 | A rotation player who skipped the previous game was OUT for WIN/SCORE but fully projected by PLAYER | Same default OUT in the player path (`_with_assumed_out`), UI can still mark him ACTIVE | Such a player plays the next game 27% of the time (92% otherwise) |
| 6 | Players who left the team (signed elsewhere, not yet in a box score) counted as absences in `ABS_DELTA` | Live rotation limited to the current roster (`current_roster_ids`) | All 2026-10-23 "assumed out" players were departures; not testable on past seasons (end-of-season roster files) |
| 7 | An OUT player's production was handed over twice (teammates' extra minutes scaled their stats, and 70% of his points were added again): GSW projected 160.3 PTS healthy, 171.5 without Podziemski | Inherited minutes no longer scale stats; the usage pool alone moves 70% PTS / 60% REB, AST | GSW 160.3 -> 159.0 without him |
| 8 | Player PTS (and REB/AST, by the points ratio) were rescaled to the team score | Removed (`scale_factor` stays 1.0 in the API) | Table below |
| 9 | Postseason flag from a month rule (April 12+) | From the schedule (`scheduled_is_playoff`) | |
| 10 | Rookies without a box score copied another player's form (earlier fix, 847e617) | Rookie per-minute rates | |

Tested and rejected: zeroing the default `ABS_DELTA` for a team's games 2-5 (training rows carry 0 there) made WIN
worse, Brier 0.2256 -> 0.2306 over 324 games of 2021-22..2025-26; only the offseason gap keeps that rule.

## Replay, 2025-26, 171 games (3,714 player-games)

| Stage | PTS | REB | AST |
|---|---:|---:|---:|
| Model on stored training rows (reference) | 4.709 | 1.913 | 1.369 |
| Old live data, raw model | 4.780 | 1.958 | 1.379 |
| **New live data, raw model** | **4.707** | **1.910** | **1.367** |
| Old end-to-end (10-man cap, 240 scaling, team-score scaling) | 5.326 | 2.091 | 1.425 |

## Rotation default and team-score scaling, 85 games (1,885 players who played)

| Setup | PTS MAE | without the 94 assumed-out who played | Team sum vs actual team points |
|---|---:|---:|---:|
| Assumed-out off, no scaling | 5.261 | 5.269 | 26.2 |
| Assumed-out off, team-score scaling | 5.502 | 5.500 | 9.9 |
| **Assumed-out on, no scaling (shipped)** | 5.561 | **5.148** | 26.5 |
| Assumed-out on, team-score scaling | 5.594 | 5.183 | 10.6 |

Assumed-out costs the 5% of cases where such a player plays anyway, but the metric cannot see the 73% who sit
(a projection of ~15 PTS for a player who does not play); teammates improve 5.27 -> 5.15. Team-score scaling
fixes the team sum but biases every player low by 2.2 PTS. Trade-off kept: the per-player projections are
conditional on playing, so a team's projected points sum to ~15% above its score.

## Window length (`code/window_exp.py`)

Form windows rebuilt with W games and the model retrained, walk-forward 2023-24..2025-26:

| W | PTS | REB | AST |
|---|---:|---:|---:|
| 3 | 4.620 | 1.953 | 1.378 |
| 5 | 4.559 | 1.928 | 1.353 |
| 10 (production) | 4.512 | 1.901 | 1.335 |
| 20 | 4.491 | 1.887 | 1.326 |

Shorter is worse in every season and stat; 20 is better in all 9 cells (needs a retrain, not done).

## Open

- Roster coverage in the replay is 95% because 2025-26 roster files are end-of-season snapshots; live 2026-27
  rosters covered every player of the first games.
- 21% of players who played are still projected DNP (12.7 min, 5.2 PTS on average): who plays from the bench is
  not predictable from form alone.
