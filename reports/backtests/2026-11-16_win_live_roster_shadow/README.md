# WIN Shadow Candidate: Trained Under the Live Roster Assumption

**Date:** 2026-11-16 · **Status:** shadow only, not promoted · **Seed:** 42 · **Code:** [`code/train_shadow.py`](code/train_shadow.py) · **Numbers:** [`results.json`](results.json)

## Question

The production WIN model learns its four roster features (`ABS_DIFF`, `MISSING_ROT_MINS_DIFF`, `ROT_CONTINUITY_DIFF`, `ACTIVE_WT_GS_DIFF`) from each game's own box score. Live serving only knows the injury report and the default "whoever played the previous game plays". Does a model trained on that default do better when served on it?

## Method

- Same 11 features, same estimator (uncalibrated logistic regression) as production.
- Roster features rebuilt with `build_absence_deltas(..., availability="carry_forward")`.
- Expanding walk-forward, 2021-22 to 2025-26, each season predicted by models fit on earlier seasons only; both models are served with the carry-forward features, which is the leak-free lower bound of what live serving has (no injury report).
- Paired date-block bootstrap, 10,000 resamples, 95% interval.
- The locked season 2026-27 is not read. Nothing under `models/production/` is written.

## Result

| Season | Games | Production Brier (live features) | Shadow Brier | Elo Brier | Production log loss | Shadow log loss |
|---|---:|---:|---:|---:|---:|---:|
| 2021-22 | 1,256 | 0.2201 | 0.2192 | 0.2206 | 0.6330 | 0.6300 |
| 2022-23 | 1,248 | 0.2300 | 0.2276 | 0.2290 | 0.6530 | 0.6470 |
| 2023-24 | 1,259 | 0.2074 | 0.2071 | 0.2114 | 0.6020 | 0.6012 |
| 2024-25 | 1,256 | 0.2063 | 0.2054 | 0.2118 | 0.5994 | 0.5968 |
| 2025-26 | 1,257 | 0.2038 | 0.2030 | 0.2058 | 0.5926 | 0.5913 |
| **Pooled** | **6,276** | **0.2135** | **0.2124** | **0.2157** | | |

- Shadow minus production (Brier): -0.0011, 95% CI [-0.0019, -0.0003], better in 5 of 5 seasons.
- Shadow minus Elo (Brier): -0.0033, 95% CI [-0.0048, -0.0017].

The gain is real but small (about 0.001 Brier), and it is measured without the injury report. With the report, live features sit between the carry-forward default and the box score, so the production model may lose less than this table shows. That is what the ledger has to answer.

## Candidate

`models/experimental/win_live_roster_shadow.pkl`, refit on all 14,780 team rows of the six seasons. Standardized coefficients (intercept +0.0000):

| Feature | Coefficient |
|---|---:|
| `IS_HOME` | +0.2507 |
| `IS_B2B` | -0.0860 |
| `OPP_IS_B2B` | +0.0858 |
| `ABS_DIFF` | -0.0832 |
| `MISSING_ROT_MINS_DIFF` | +0.2102 |
| `ROT_CONTINUITY_DIFF` | +0.0444 |
| `ACTIVE_WT_GS_DIFF` | +0.1019 |
| `ELO_DIFF` | +0.7251 |
| `WINRATE_DIFF_LAST_10` | -0.2673 |
| `REST_DIFF` | +0.0561 |
| `CLEAN_NET_RTG_DIFF_LAST_10` | +0.2580 |

## Decision Rule (fixed before any ledger row carries the candidate)

1. From 2026-11-16 the pre-tip snapshot writes the candidate's probability next to the production call (`shadow.win_live_roster_v1`), on the same features and Elo blend. The production call is unchanged.
2. No decision before the 2026-27 regular season ends and at least 600 games carry both probabilities.
3. Promotion is considered only if the paired Brier difference (candidate minus production) on those games has a 95% date-block interval entirely below zero. Otherwise production stays.
4. The ledger is never used to change the candidate. Any change makes a new candidate with a new name and a new start date.
