### 2024-25 Feature Regeneration Report

- Team features saved: `/Users/serhat/agProjects/nbaModelApp/data/experimental/team_games_features_2024_25.csv`
- Player features saved: `/Users/serhat/agProjects/nbaModelApp/data/experimental/player_games_features_2024_25.csv`

#### Validations

- Team dates range: min=2024-10-22 max=2025-06-22 within_expected=True
- Player dates range: min=2024-10-22 max=2025-06-22 within_expected=True
- Team GAME_ID prefix check: bad=2640 of 2640
- Player GAME_ID prefix check: bad=0 of 28240
  - Team bad examples: ['22400064', '22400079', '22400100', '22400103', '22400121', '22400135', '22400152', '22400157', '22400171', '22400185']
- Team row count comparable to raw: True (diff=0.00%)
- Player row count comparable to raw: True (diff=0.00%)
- Team rolling leakage spot-check: ISSUES (mismatches=3987)
- Player rolling leakage spot-check: ISSUES (mismatches=2572)

No production artifacts were modified. All outputs were written under `data/experimental`.
