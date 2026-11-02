# Early-Season Transitions (WIN, SCORE, PLAYER)

How each production model behaves at the start of a season, before the current season has produced enough games to
speak for itself. All of this is inference-time logic: no model is retrained for it, and from the hand-over point on
every prediction is identical to the plain model output.

Evidence and reproducible scripts: `reports/backtests/2026-10-21_early_season/` (hand-over design) and
`reports/backtests/2026-10-23_prior_floor/` (permanent prior floor, tested and rejected).

## Summary

| Model | Start-of-season anchor | Hand-over | Entry point |
|---|---|---|---|
| WIN | Elo (carried over from last season) mixed into the model probability, up to 40% | 6 games | `src/inference/win_blend.py`, weight set in `build_matchup_features.py` |
| SCORE | Last season's team PACE / OFF_RTG / DEF_RTG, pulled 75% toward the league mean | 6 games, linear | `blend_score_form_with_prior` in `build_matchup_features.py` |
| PLAYER | Last season's per-game PTS / REB / AST, up to 40%, scaled by last season's games played | 3 games, linear | `blend_early_season_projection` in `src/api/services/player_projection.py` |

A "game" is a regular-season or playoff game of the current season played before the prediction date. Preseason games
are never counted (`_raw_season_games` drops them; player logs drop game ids starting with `001`).

## Common mechanics

- `n` is games already played this season. Weights are functions of `n` only, so the hand-over happens by itself as the
  logs grow. Nothing needs to be switched by hand.
- The logs come from the published snapshot inputs (`scripts/ops/publish_snapshot_data.py` ships current-season
  `team_games.csv` and `player_games.csv`). If the morning "completed games" fetch and "Publish data to cloud" are
  skipped, `n` stays low and the cloud keeps leaning on the prior longer than intended.
- The features themselves stay raw. Only the final probability (WIN) or the specific inputs listed below (SCORE,
  PLAYER) are blended. Shrinking every feature raised walk-forward log loss in every 0-20 game bucket, and the models
  were trained on raw early-season rows.

## WIN

1. **Elo across seasons.** `ContinuousEloEngine` keeps one rating per franchise through all seasons. At each new
   season ratings regress toward 1500: `new = 0.6 * old + 0.4 * 1500` (`SEASON_REGRESSION = 0.6`; K = 10, home
   court = 50 points). So Elo already carries last season's strength into game 1.
2. **ELO_DIFF is a model feature.** The logistic regression (11 features in `v15`) already sees the Elo difference, so the model
   is Elo-led early without any blend.
3. **Extra pure-Elo blend.** After the model produces `p_model`, the served probability is
   `(1 - w) * p_model + w * p_elo` with `w = 0.40 * (1 - n_min / 6)` for `n_min < 6`, else 0.
   `n_min` is the smaller game count of the two teams. So `w` is 40% when either team has no game yet, 20% at 3, 0 at 6.
   `p_elo` uses `PRE_GAME_ELO`, `OPP_PRE_GAME_ELO` and the home-court points (`elo_home_probability`).
4. **One implementation.** API, CLI, daily schedule, WinPredictor, SHAP and the paper-trading snapshot all call
   `blend_win_probability`. SHAP shows the shift as an `EARLY_SEASON_ELO_BLEND` contribution.
5. **Roster availability at the opener.** `ABS_DELTA` normally compares tonight's availability with the recent
   rotation. When the team's last game is older than 21 days (`STALE_DAYS`), the rotation spans the team's whole history
   in the logs and only injury-report overrides move the feature. Players who simply ended last season hurt no longer
   count as "returning strength". Opening games 2021-22..2025-26: Brier 0.2294 -> 0.2227, log loss 0.6505 -> 0.6363.

Tested and rejected: keeping a 5% or 10% Elo share after game 6. Log loss is identical (0.6087 for floors 0 / 5 / 10%)
because `ELO_DIFF` is already in the model.

## SCORE

Cause of the original problem: `PACE_LAST_10`, `OFF_RTG_LAST_10`, `DEF_RTG_LAST_10` (and the `OPP_` versions) are
current-season rolling windows and are NaN before a team's first game. The imputer then fills the training mean and
every opener collapses to the same total (about 226).

Fix (`blend_score_form_with_prior`):

1. **Prior.** `_prior_season_team_form` takes each team's previous regular-season mean of PACE, OFF_RTG, DEF_RTG and
   pulls it toward the league mean: `league + 0.75 * (team - league)` (`SCORE_PRIOR_REGRESSION = 0.75`).
2. **Hand-over.** For each team separately, with `w = n / 6`: `input = w * current_form + (1 - w) * prior`. With no
   current form the input is the prior itself. At `n >= 6` the function does nothing.
3. **Per team.** Home and away use their own `n`, so a team with 5 games and an opponent with 2 are blended
   independently.
4. **Margin is not blended.** The margin model is already Elo plus availability early. An explicit Elo blend gained at
   most 0.2 points in the first two games and would dilute the injury (`ABS_DIFF`) signal.

Result (walk-forward 2021-22..2025-26): total MAE 15.41 -> 14.72 for teams with 0 games, 15.93 -> 15.09 at 1-2 games;
identical from the 6th game on. Shorter form windows (3-5) were worse than 10; an EWMA span 10-20 gains 0.06 but needs a
SCORE retrain and is not shipped.

## PLAYER

1. **Where it applies.** `blend_early_season_projection` runs on `RAW_PROJ_PTS/REB/AST` before usage redistribution and
   the top-down scaling to the team score.
2. **Weight.** `w = 0.4 * (1 - n / 3)` for a player with `n < 3` games this season, else 0 (n counts games with
   minutes > 0). Value: `(1 - w) * raw_proj + w * last_season_per_game_average`.
3. **Reliability scaling.** The weight is multiplied by `min(1, prior_games / 40)`, where `prior_games` is the number of
   regular-season games the player played last season (`PLAYER_PRIOR_FULL_TRUST_GAMES = 40`). A prior built from 10
   games gets a quarter of the weight, so a short post-injury season is not trusted as a baseline.
4. **No prior, no blend.** A player with no games last season (rookie, or out the whole year) gets weight 0 and keeps the
   model value. Players with no box score at all use league rookie rates scaled with minutes
   (`apply_no_history_rates`), a separate path.
5. **The model's own form features.** EMA / rolling form features roll across seasons, so the model already starts from
   the player's last games. The blend only adds a small correction; the first-game PTS MAE moves 4.48 -> 4.32 and nothing
   changes from the third game.

Tested and rejected: a permanent 5% or 10% prior floor. MAE moves 0.1-0.2% in the same direction for every stat on one
test season, not enough to add a rule.

Known weak spot: players back from a long injury (for example a player with no games last season) keep the model's
stale pre-injury form. In the 2025-26 holdout (59 rows, 12 players) the model over-predicted first-five-game PTS by 0.95
and REB by 0.90; too few rows to correct systematically. Check these players by hand in the first week and rely on
injury-report overrides for minutes limits.

## What changes when

| Games played (smaller of the two teams / the player) | WIN Elo share | SCORE form weight | PLAYER prior weight (at 40+ prior games) |
|---|---|---|---|
| 0 | 40% | 0% (prior only) | 40% |
| 1 | 33% | 17% | 27% |
| 2 | 27% | 33% | 13% |
| 3 | 20% | 50% | 0% |
| 6 | 0% | 100% | 0% |

## Verifying a live prediction

- WIN: the feature dict from `build_features` carries `EARLY_SEASON_ELO_BLEND_WEIGHT` (and `GAMES_PLAYED_HOME_SEASON` /
  `GAMES_PLAYED_AWAY_SEASON`); it must be 0 once both teams have played 6 games. The paper ledger does not store it.
- SCORE: openers should no longer sit on one total; teams differ by last season's pace and ratings.
- PLAYER: first-game projections sit between the model value and last season's average.
