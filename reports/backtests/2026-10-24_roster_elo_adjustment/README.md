# Offseason roster adjustment to the opening Elo

Question: does the roster-turnover term in the opening Elo (`compute_offseason_roster_adjustment`) help,
and would a star-weighted talent measure or multi-season player ratings help more?

Method (`code/roster_elo_exp.py`, walk-forward 2021-22..2025-26, no leakage): opening Elo = chained earlier
seasons + adjustment. Player rating = per-game importance (0.5 MIN + PTS + 0.8 AST + 0.6 REB) from seasons
before S only. "Before" roster = each team's last regular-season game of S-1; "after" roster = team of first
appearance in the first 15 games of S. Talent = top-8 ratings (flat sum, star-weighted, or squared), adjustment =
z-score of the talent change x k Elo, clipped at 45. Score = home-win log loss of the Elo engine over season S.
"1s" = last season only, "3s" = 0.5/0.3/0.2 over the last three seasons.

| config | log loss, all games | log loss, both teams <= 20 games | seasons better (of 5) |
|---|---|---|---|
| no adjustment | 0.61940 | 0.62385 | - |
| flat 1s k15 (current method, leak-free) | 0.61906 | 0.62276 | 3 |
| flat 3s k15 | 0.61908 | 0.62266 | 4 |
| star 1s k15 | 0.61894 | 0.62245 | 4 |
| star 3s k15 | 0.61897 | 0.62245 | 4 |
| star 1s k25 (best) | 0.61893 | 0.62229 | 3 |

Full grid in `summary.csv`, per season in `results_by_season.csv`.

Findings
- Every roster adjustment beats none, but only by 0.0008-0.0016 log loss in the first 20 games (0.0002-0.0005 over the
  season). It is a small, real-looking gain, not a large one.
- Star weighting is slightly better than the flat sum (about 0.0003); differences between variants are within noise for 5 seasons.
- Multi-season ratings equal single-season ratings (0.62245 both for star k15): no gain from averaging.
- k between 15 and 25 is best; k=8 is too timid.

2026-27 under this method (signed roster x ratings from 2023-26): MIA +10.0 (star) / +7.0 (flat), CHA -14.2 / -8.6.
The production file has MIA -3.1, CHA +1.0, because its `IMPORTANCE_SCORE` column in the 2026-27 `team_rosters.csv`
is about 15% above the formula applied to its own columns (2025-26 file: ratio 1.0), which breaks the comparison.

Not applied: `data/season=2026-27/analysis/team_elo_initial.json` is a tracked bootstrap file and is unchanged.

## Player-rating variant (`code/player_rating_exp.py`, `player_rating_summary.csv`)

Roster LEVEL (z of star-weighted talent) on top of roster CHANGE, with 1/2/3-season player ratings
(opening = chained Elo + 15 x z(change) + k x z(level)):

| config | log loss, first 20 games | vs none | seasons better (of 5) |
|---|---|---|---|
| none | 0.62385 | - | - |
| 1s change only (k15) | 0.62245 | -0.00140 | 4 |
| 1s change + level k10 | 0.62189 | -0.00196 | 3 |
| 2s change + level k10 | 0.62224 | -0.00161 | 4 |
| 3s change + level k10 | 0.62223 | -0.00162 | 4 |

Level adds about 0.0002-0.0003 on top of change; 1, 2 and 3 seasons of player history are equivalent within noise.
Shipped: 2 seasons, change k15 + level k10 (4 of 5 seasons better, robust to a single odd season).
Production: `scripts/feature_engineering/build_initial_season_elo.py --season 2026-27 --write` (dry run by default);
the old file is kept as `team_elo_initial_before.json`. The 2026-27 `team_rosters.csv` `IMPORTANCE_SCORE`
column (480 of 621 rows 0-31% above the formula) is no longer used for Elo; ratings come from `player_games.csv`.
