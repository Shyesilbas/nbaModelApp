# Early-Season Transition Backtest (2026-10-21)

Question: at the start of 2026-27 every SCORE prediction was ~226 total and 112-117 per team. Why, and does an
Elo/prior-based start that hands over to current-season form (as WIN already does) help SCORE, PLAYER and the
roster-availability feature? Also: would 3-4 game windows beat the 10-game windows?

Cause: the SCORE pace and offensive-rating inputs (`PACE_LAST_10`, `OFF_RTG_LAST_10`, `DEF_RTG_LAST_10`) are
current-season rolling windows. Before a team's first regular-season game they are NaN, the model imputer fills the
training mean and every game collapses to the intercept (pace 101.0). The WIN Elo blend never touched SCORE.

All numbers are walk-forward (train on seasons before the test season) unless stated. Code: `code/`, outputs in
`data/experimental/early_season/` (not tracked). Buckets are `min(games played this season by either team)`.

## 1. SCORE total: prior-season start, 6-game hand-over (`code/score_exp.py`)

Ridge pace / home rating / away rating models with the production structure, test seasons 2021-22..2025-26
(6,592 games). Total MAE:

| Variant | 0 games (79) | 1-2 (160) | 3-5 (230) | 6-9 (309) | 10-19 (763) | 20+ (5,051) | All |
|---|---:|---:|---:|---:|---:|---:|---:|
| Constant league total | 15.02 | 15.67 | 16.59 | 14.85 | 16.68 | 16.22 | 16.20 |
| Production (last 10, NaN imputed) | 15.41 | 15.93 | 15.48 | 14.22 | 15.08 | 14.88 | 14.92 |
| **Prior 75% to league mean, linear hand-over over 6 games (shipped)** | **14.72** | **15.09** | **15.47** | 14.22 | 15.08 | 14.88 | **14.89** |
| Prior 75%, shrink n/(n+3) | 14.74 | 15.04 | 15.52 | 14.04 | 15.14 | 14.87 | 14.89 |

Shipped in `src/features/build_matchup_features.py` (`blend_score_form_with_prior`): the six `*_LAST_10`
pace/rating inputs start at last regular season's team mean (pulled 25% toward the league mean) and move linearly
to this season's form over `EARLY_SEASON_BLEND_GAMES` = 6. Identical to before from the 6th game on. No retraining.

## 2. Window length: 3-4 games is worse (`code/score_exp.py`)

Same models, only the window changes (both trained and tested with it):

| Window | 6-9 | 10-19 | 20+ | All |
|---|---:|---:|---:|---:|
| Last 3 | 13.89 | 15.50 | 15.25 | 15.23 |
| Last 4 | 13.99 | 15.57 | 15.10 | 15.13 |
| Last 5 | 14.12 | 15.52 | 15.02 | 15.07 |
| Last 10 (production) | 14.22 | 15.08 | 14.88 | 14.92 |
| Last 15 | 14.30 | 15.08 | 14.88 | 14.93 |
| EWMA span 10 | 14.07 | 15.15 | 14.79 | 14.86 |
| EWMA span 20 | 14.35 | 15.08 | 14.77 | 14.86 |

Short windows add noise: a team's pace and ratings swing more game to game than its true level moves. An EWMA
(span 10-20) is 0.06 better overall; it needs a SCORE retrain and is not shipped.

## 3. SCORE margin: already Elo-led early (`code/margin_exp.py`)

Margin MAE, Ridge on Elo diff + net rating diff + rest:

| Variant | 0 | 1-2 | 3-5 | 6-9 | All |
|---|---:|---:|---:|---:|---:|
| Model | 10.55 | 10.84 | 10.54 | 9.87 | 10.99 |
| Elo + rest only | 10.42 | 10.59 | 10.50 | 9.96 | 10.99 |
| Model blended to Elo-only, weight 1 -> 0 over 6 games | 10.42 | 10.64 | 10.52 | 9.87 | 10.99 |

With no current-season form the form inputs are imputed and the margin is effectively Elo + availability already.
An explicit Elo blend gains at most 0.2 points in the first two games and would dilute the injury (ABS_DIFF) signal,
so it is not shipped.

## 4. PLAYER: last-season averages for the first games (`code/player_exp.py`)

Holdout LightGBM models (`models/experimental/holdout_eval`, fitted without 2025-26) on 2025-26 rows. MAE by the
player's games played this season:

| Stat | Variant | 0 (582) | 1-2 (1,149) | 3-5 (1,653) | 6+ |
|---|---|---:|---:|---:|---:|
| PTS | Model | 4.483 | 4.349 | 4.096 | unchanged |
| PTS | **40% prior, fading over 3 games (shipped)** | **4.324** | **4.331** | 4.096 | unchanged |
| PTS | 40% prior, fading over 6 games | 4.324 | 4.334 | 4.113 | unchanged |
| REB | Model / shipped | 1.966 / 1.938 | 1.870 / 1.858 | 1.815 / 1.815 | unchanged |
| AST | Model / shipped | 1.339 / 1.315 | 1.239 / 1.232 | 1.250 / 1.250 | unchanged |

The player form features already roll across seasons, so the gain is small. Shipped in
`src/api/services/player_projection.py` (`blend_early_season_projection`, before usage redistribution and the
top-down scaling to the team score). One test season only.

## 5. Roster availability at season start (`code/abs_exp.py`)

Live `ABS_DELTA` assumed every player of the previous season's last 15 games plays the opener, so players who missed
the end of last season counted as returning strength (GSW +43, MEM +72 on 2026-10-21), while training rows carry
`ABS_DELTA` = 0 for a team's first 5 games. Production WIN on the 79 opening games 2021-22..2025-26 (first game of at
least one team), no overrides:

| Variant | Brier | Log loss | Accuracy |
|---|---:|---:|---:|
| Before (returning players counted) | 0.2294 | 0.6505 | 60.8% |
| **After (only overrides move the feature)** | **0.2227** | **0.6363** | **64.6%** |

Better in 4 of 5 seasons (2022-23 flat). Shipped in `src/features/roster_absence.py`: when the team's last game is
older than 21 days the rotation spans the team's whole history in the logs (so a player hurt at the end of last
season, e.g. Butler, Dončić, can still be marked OUT) and players nobody mentioned contribute nothing.
`abs_exp.py` emulates the change by zeroing the first-game deltas; with the shipped code both columns are equal.

## 6. Live-path replay, SCORE (`code/replay.py`)

2025-26 regular-season games where either team had played fewer than 8 games, replayed through `build_features`
and the holdout SCORE models (`NBA_MODEL_DIR=models/experimental/holdout_eval`), with the hand-over off (before)
and on (after):

| Games played (min) | Games | Total MAE before | Total MAE after | Spread of predicted totals (std) before / after |
|---|---:|---:|---:|---:|
| 0 | 16 | 20.01 | **18.71** | 2.75 / 3.97 |
| 1-2 | 32 | 16.21 | **15.49** | 9.57 / 3.01 |
| 3-5 | 47 | 16.76 | **16.47** | 7.22 / 5.12 |
| 6-7 | 29 | 10.20 | 10.20 | 5.13 / 5.13 |
| All | 124 | 15.50 | **15.04** | |

Before, openers sat on one number and games 1-5 swung on one or two results; after, openers differ by team and the
early swings are damped.
