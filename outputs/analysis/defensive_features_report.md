# NBA ML Project — Defensive Features Report

> Generated: 2026-06-07

## 1. Overview of Defensive Features

To supplement the existing offensive rolling stats (`PTS_LAST_5`/`10`), we introduced leakage-free rolling averages of defensive points allowed:

- **`PTS_ALLOWED`**: Actual opponent points scored in that game.
- **`PTS_ALLOWED_LAST_5`**: Rolling average of points allowed over previous 5 games (shifted by 1).
- **`PTS_ALLOWED_LAST_10`**: Rolling average of points allowed over previous 10 games (shifted by 1).
- **`OPP_PTS_ALLOWED_LAST_5`**: Opponent team's rolling average of points allowed over their previous 5 games (shifted by 1).
- **`OPP_PTS_ALLOWED_LAST_10`**: Opponent team's rolling average of points allowed over their previous 10 games (shifted by 1).

## 2. Statistical Verification

These features were successfully added to the team features and mapped to opponent features. Using a `shift(1)` ensures that no information about the current game's opponent points is leaked into the training feature set.
