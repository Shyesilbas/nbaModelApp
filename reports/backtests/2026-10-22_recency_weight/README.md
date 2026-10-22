# Recency-weight experiment (2026-10-22)

Question: do exponentially down-weighted older seasons help (rule and officiating changes)?
Setup: same expanding-window folds and estimators as `scripts/walk_forward_benchmark.py` (test 2021-22..2025-26);
only change is `sample_weight = 0.5 ** (age_years / half_life)`, age from the last training game.
Code: `code/recency_weight_exp.py`; raw rows in untracked `data/experimental/recency_weight/results.csv`.

Sample-weighted averages over folds (lower is better; `none` = production setting):

| model | metric | none | 4y | 2y | 1y | 0.5y |
|---|---|---|---|---|---|---|
| WIN | Brier | 0.2106 | 0.2107 | 0.2107 | 0.2108 | 0.2111 |
| SCORE | total MAE | 14.9016 | 14.8998 | 14.8986 | 14.8982 | 14.9016 |
| SCORE | margin MAE | 10.8328 | 10.8336 | 10.8351 | 10.8398 | 10.8470 |
| PLAYER | PTS MAE | 4.5337 | 4.5349 | 4.5353 | 4.5375 | 4.5413 |
| PLAYER | REB MAE | 1.9111 | 1.9110 | 1.9112 | 1.9119 | 1.9139 |
| PLAYER | AST MAE | 1.3212 | 1.3213 | 1.3217 | 1.3223 | 1.3241 |

Last 3 folds (2023-24..2025-26) show the same pattern.

Result: no gain. Differences are at most 0.0004 Brier / 0.003 total MAE (best case), and stronger weighting
gets steadily worse for WIN, margin and PLAYER. Production keeps equal weights. The features are already
rolling and Elo based, so the recent-form shift is captured in the inputs; weighting only discards training rows.

## History length (`code/history_length_exp.py`)
Training on the last k seasons, tested on later seasons (2025-26 only): WIN Brier 0.2015 (k=1) / 0.2016 (k=3) / 0.2013 (k=5);
SCORE total MAE 15.309 / 15.277 / 15.288; PLAYER PTS MAE 4.527 / 4.509 / 4.505. The curve is flat after 3 seasons; across the
2023-24..2025-26 tests SCORE total MAE is worse with all 5 seasons (15.29) than with 2 (14.96). More history is not a lever.

## Travel, time zone, altitude (`code/travel_exp.py`)
Pre-game home-minus-away distance from the previous venue, 7-day km, signed time-zone shift, road streak, visitor at DEN/UTA,
added to the production WIN inputs and to the SCORE margin and pace inputs (5 walk-forward folds). Change vs base (paired se):
WIN Brier +0.0006 (0.0003) with all features, SCORE total MAE -0.0055 (0.0031), margin MAE +0.0179 (0.0085). No gain; WIN and
margin get slightly worse. Rest and back-to-back already carry the schedule effect. `ABS_DELTA` is already Game Score weighted,
so quality-weighted absence is in production.
