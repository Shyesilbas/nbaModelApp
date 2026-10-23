# Prior floor test (2026-10-23)

Question: keep a 5% (or 10%) share of the Elo / last-season prior after the hand-over instead of going to 0, and is
the last-season prior unsafe for players back from a long injury.

Code: `code/win_floor.py`, `code/player_floor.py`. Nothing shipped; no model or production file changed.

## WIN (walk-forward logistic, 8 production features, 2021-22..2025-26, 7,381 home rows)
Log loss: floor 0% 0.6087, 5% 0.6087, 10% 0.6087 (Brier 0.2106 for all). Pure Elo 0.6203. Early (0-5 games) 0.6231 -> 0.6231 -> 0.6230;
40+ games 0.5948 -> 0.5950 -> 0.5952. ELO_DIFF is already a model feature, so the blend is nearly redundant. No effect.

## PLAYER (holdout LightGBM, 2025-26, 28,698 player-games)
MAE ALL, shipped (40% fading over 3 games) vs permanent floor 5% / 10%: PTS 4.504 / 4.498 / 4.498, REB 1.893 / 1.891 / 1.890,
AST 1.333 / 1.331 / 1.331. Same direction in every stat, 0.1-0.2%. One test season.
Reliability scaling of the prior by last season's games (min(1, G/40)): PTS first 2 games of players with <40 prior
games 3.838 -> 3.807; no change elsewhere.
Long-injury returners (>=50 games two seasons ago, <25 last season), first 5 games: 59 rows, 12 players; model over-predicts
PTS by 0.95, REB 0.90, AST 0.17; MAE not worse than other early rows. Too few rows to conclude.
