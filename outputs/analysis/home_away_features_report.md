# NBA ML Project — Home/Away Split Form Features Report

> Generated: 2026-06-07

## 1. Split Form Features

We implemented rolling split form metrics to capture team performance specifically when playing at home versus playing away:

### Home-Only Form (previous home games only, shifted by 1):
- `HOME_WINRATE_LAST_5`: Rolling win rate over previous 5 home games.
- `HOME_PTS_LAST_5`: Rolling points scored over previous 5 home games.
- `HOME_PTS_ALLOWED_LAST_5`: Rolling points allowed over previous 5 home games.

### Away-Only Form (previous away games only, shifted by 1):
- `AWAY_WINRATE_LAST_5`: Rolling win rate over previous 5 away games.
- `AWAY_PTS_LAST_5`: Rolling points scored over previous 5 away games.
- `AWAY_PTS_ALLOWED_LAST_5`: Rolling points allowed over previous 5 away games.

### Opponent Split Form Features:
- Opponent-level equivalents of these split form columns (e.g. `OPP_HOME_WINRATE_LAST_5`, etc.) are mapped side-by-side on the same row.

## 2. Leakage-Free Synchronization & Chronological Forward-Fill

To prevent NaN values from dropping home/away rows when building the dataset, split form metrics are computed on their respective masks and then forward-filled chronologically within each team's games. This ensures all rows have valid split stats from their most recent respective games without any future data leakage.
