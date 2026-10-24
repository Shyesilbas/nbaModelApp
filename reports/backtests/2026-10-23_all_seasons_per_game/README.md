# All-season per-game walk-forward predictions

`per_game_predictions.csv`: 6276 games, 2021-22..2025-26. Each season is predicted by models trained only on earlier seasons (current 8-feature WIN, Ridge SCORE), merged from `2026-10-23_win_metadata_check{,_early,_prev}`. Rebuild: `PYTHONPATH=. python3 reports/backtests/2026-10-23_all_seasons_per_game/code/build_csv.py`.

Columns: `P_HOME_WIN, HOME_WIN, PRED_HOME_WIN, WIN_CORRECT, PRED_TOTAL, REAL_TOTAL, TOTAL_ERROR (pred - real), PRED_MARGIN, REAL_MARGIN, MARGIN_ERROR, OVERTIME`.
No sportsbook lines exist, so there is no true over/under result; total error is the evaluation.

## Total error breakdown (pred - real)
- Per season bias +0.4, -0.4, +0.6, +0.8, +0.8 points; MAE 14.7-15.3. Small and not trending.
- Overtime games (4-6% of games) drive it: real total is ~20 points above prediction there (bias -20.4); regulation games are over-predicted by ~+1.5 (+0.8..+1.8 per season).
- Playoffs (May-June, 218 games): bias -3.5 (slower pace than regular season); October (first games): up to +7..+10 on small samples; regulation season otherwise within +-2.
- Calibration across predicted-total quintiles: pred 215.2/223.4/227.9/231.9/237.8 vs real 214.7/223.2/227.5/231.5/237.1, i.e. flat +0.4..0.7 offset, no range-dependent drift.
- Pred/real correlation 0.36, 0.31, 0.45, 0.37, 0.30 by season: noisy, no trend. 2025-26 slope of real on predicted 0.84 (predictions slightly too spread).

## Season-type report
`season_type_report.md` (`code/season_type_report.py`): total error, winner accuracy and confidence-band analysis for regular season, play-in (30 games), playoffs and Finals (28 games). Small samples (play-in, Finals) are indicative only. The over/under direction check uses a naive pseudo line (regular-season mean total), not a bookmaker line, and is flattered in the playoffs because playoff totals sit structurally below that line.

## Baselines, stability and playoff calibration
`baseline_stability_report.md` (`code/baseline_stability.py`): per-season Brier / log loss / accuracy against Elo + home court, last-10 win rate and constant home rate; total MAE / RMSE against last-10 real points and a constant mean; paired bootstrap 95% CIs; playoff confidence bands with Wilson intervals.
