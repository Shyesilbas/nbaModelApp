# Live replay of 2025-26 with v15 holdout models (2026-11-02)

**Question.** Does the API code path reproduce the walk-forward numbers when every 2025-26 game is predicted the way it would have been on the morning of the game? Replaces the 2026-10-20 replay, which used the models of that day (WIN v11).

**Method.** `models/experimental/holdout_eval/` holds copies fitted without 2025-26. The WIN copy was refreshed for v15 with `PYTHONPATH=. python3 scripts/retrain_pipeline.py --dry-run --models win` (no promotion; production files unchanged). SCORE and PLAYER copies are the v13 and v15 holdout fits, whose feature sets match production v15. Then:

```bash
NBA_MODEL_DIR=models/experimental/holdout_eval PYTHONPATH=. python3 -m scripts.backtest.live --season 2025-26 --out reports/backtests/2026-11-02_live_replay_v15/live_2025_26.parquet
```

**Result.** 1,321 games (1,230 regular season, 91 play-in and playoffs), 0 failed.

| | ROC-AUC | Brier | Log loss | Accuracy | Total MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| Served (early-season Elo blend, active in 95 games) | 0.7357 | 0.2057 | 0.5971 | 68.05% | 15.31 | 11.33 |
| Model only | 0.7357 | 0.2058 | 0.5973 | 68.05% | | |
| 2026-10-20 replay (WIN v11) | 0.735 | 0.206 | | | 15.46 | 11.42 |

The walk-forward 2025-26 fold (regular season only, raw features) gives Brier 0.2007, total MAE 15.29, margin MAE 11.18. The two are not the same sample: the replay includes play-in and playoff games and builds its features through the live code path.

The refreshed WIN copy scores ROC-AUC 0.7544 / Brier 0.2011 on the 2025-26 holdout against 0.7534 / 0.2017 recorded at the v15 promotion: same feature set and settings; the cause of the small difference was not investigated.

**Decision.** README live-replay line updated to these numbers. `live_2025_26.parquet` holds every prediction.

Note: records dated before 2026-11-02 that use `models/experimental/holdout_eval/` (`2026-10-21_early_season`, `audits/2026-10-22_player_pipeline_audit`) ran on the earlier WIN v11 copy; rerunning their code now uses the v15 copy.
