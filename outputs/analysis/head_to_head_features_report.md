# NBA ML Project — Head-to-Head Features Report

> Generated: 2026-06-07

## 1. Head-to-Head History Features

We added historical matchup context between teams by grouping rows by the specific franchise pair (`TEAM_ABBREVIATION` and `OPPONENT_ABBREVIATION`):

- **`H2H_GAMES_LAST_5`**: Count of previous head-to-head games between the two teams (shifted by 1).
- **`H2H_WINRATE_LAST_5`**: Win rate of the team against this opponent over their previous 5 games (shifted by 1).
- **`H2H_PTS_LAST_5`**: Average points scored by the team against this opponent over their previous 5 games (shifted by 1).
- **`H2H_PTS_ALLOWED_LAST_5`**: Average points allowed by the team against this opponent over their previous 5 games (shifted by 1).
- **Opponent Equivalents**: `OPP_H2H_WINRATE_LAST_5`, `OPP_H2H_PTS_LAST_5`, and `OPP_H2H_PTS_ALLOWED_LAST_5` are merged side-by-side.

## 2. Diagnostic & Leakage Check

These features use only historical matchup outcomes and are shifted by 1 game. If a team is facing an opponent for the first time in the season, the H2H features will be NaN, and the row will be dropped during model dataset building to maintain features quality.
