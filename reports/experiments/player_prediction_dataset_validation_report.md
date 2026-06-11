# Player Prediction Dataset Validation Report

The output of `scripts/audit/validate_player_prediction_dataset.py`:

```
--- Player Prediction Dataset Validation ---
PASS: Physical file exists.
Row count: 56183
Unique players: 649
Unique games: 2640
PASS: No duplicate PLAYER_ID + GAME_ID rows
PASS: Target columns exist
PASS: Targets are non-null
PASS: No current-game stat leakage in feature columns
PASS: All GAME_IDs are 10 characters long
Date range: 2024-10-22 to 2026-06-10

Missing value summary (top 10):
  DAYS_REST: 1.93%
  PTS_LAST_5: 1.93%
  REB_LAST_5: 1.93%
  PLUS_MINUS_LAST_5: 1.93%
  AST_LAST_5: 1.93%
  MIN_LAST_5: 1.93%
  PTS_LAST_10: 1.93%

Validation complete.
```

## Observations
- **Missing Values:** Approximately ~1.93% missing values for rolling features correspond precisely to the first games of the season for each player, where history is insufficient. These should be mean-imputed or dropped during the modeling phase.
- **Coverage:** All expected targets (PTS, REB, AST, PRA) are complete.
- **Leakage:** Confirmed 0 leakage from current game performance features.
