### 2024-25 Strict Post-Regeneration Verification

#### Inputs Reviewed
- /Users/serhat/agProjects/nbaModelApp/reports/audits/feature_generation_leak_root_cause_report.md: FOUND (3965 bytes)
- /Users/serhat/agProjects/nbaModelApp/reports/audits/feature_regeneration_2024_25_report.md: FOUND (992 bytes)

#### 1) Team features — data/experimental/team_games_features_2024_25.csv
- Row count: 2,640
- Unique GAME_ID: 1,320
- GAME_DATE min/max: 2024-10-22 → 2025-06-22
- GAME_ID prefix examples: ['22400001', '22400002', '22400003', '22400004', '22400005']
- SEASON_TYPE counts: {'Regular Season': 2460, 'Playoffs': 168, 'PlayIn': 12}
- Required rolling columns present: {'PTS_LAST_5': True, 'PTS_LAST_10': True, 'WINRATE_LAST_5': True, 'WINRATE_LAST_10': True, 'PTS_ALLOWED': True, 'PTS_ALLOWED_LAST_5': True, 'PTS_ALLOWED_LAST_10': True, 'HOME_WINRATE_LAST_5': True, 'AWAY_WINRATE_LAST_5': True, 'H2H_WINRATE_LAST_5': True}
- Suspicious raw outcome columns present: {'PTS': True, 'WL': True, 'PLUS_MINUS': True}
- Rolling columns shifted correctly: True (checked_groups=20, mismatches=0)

#### 2) Player features — data/experimental/player_games_features_2024_25.csv
- Row count: 28,240
- Unique GAME_ID: 0
- GAME_DATE min/max: 2024-10-22 → 2025-06-22
- GAME_ID prefix examples: []
- SEASON_TYPE counts: {'Regular Season': 26306, 'Playoffs': 1804, 'PlayIn': 130}
- Required rolling columns present: {'PTS_LAST_5': True, 'PTS_LAST_10': True, 'MIN_LAST_5': True, 'REB_LAST_5': True, 'AST_LAST_5': True, 'PLUS_MINUS_LAST_5': True}
- GAME_ID column naming standardized: False
- Suspicious raw outcome columns present: {'PTS': True, 'WL': True, 'PLUS_MINUS': True}
- Rolling columns shifted correctly: True (checked_groups=20, mismatches=0)

#### 3) Alignment with game_results — GAME_ID coverage
- game_results source used for check: experimental
- Team features vs game_results: intersection=1,320, expected_coverage=100.00%
- Player features vs game_results: intersection=0, expected_coverage=0.00%

#### 4) Leakage check and column classification
- PTS: leakage risk if included in model features
- WL: required metadata/target source
- PLUS_MINUS: leakage risk if included in model features
- PTS_ALLOWED: safe if excluded (not used in model features)
- HOME_PTS: safe if excluded (not used in model features)
- AWAY_PTS: safe if excluded (not used in model features)
- POINT_DIFF: safe if excluded (not used in model features)
- TOTAL_POINTS: safe if excluded (not used in model features)

#### 5) Final verdict
- Are regenerated features truly 2024-25? False
- GAME_ID aligned with game_results? False
- Safe to use for dataset-only generation? False
- Columns to exclude when building model-ready datasets: ['PTS', 'PLUS_MINUS', 'HOME_PTS', 'AWAY_PTS', 'POINT_DIFF', 'TOTAL_POINTS']