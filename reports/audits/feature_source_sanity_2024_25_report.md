# Feature Source Sanity Audit — 2024-25

This report verifies whether files labeled with `2024_25` actually contain data from the 2024-25 NBA season and identifies the cause of the `GAME_ID` mismatch.

Expected 2024-25 date range: roughly 2024-10-22 to 2025-06-22

## Files Audited

1) data/features/team_games_features_2024_25.csv
- Row count: 2,636
- Unique GAME_ID count: 1,318
- GAME_ID prefix examples: ["225", "425"]
- GAME_DATE min/max: 2025-10-21 → 2026-06-05
- First 10 rows (subset: GAME_ID, GAME_DATE, TEAM_ABBREVIATION, MATCHUP):
  - {GAME_ID: 22500082, GAME_DATE: 2025-10-22, TEAM_ABBREVIATION: ATL, MATCHUP: ATL vs. TOR}
  - {GAME_ID: 22500090, GAME_DATE: 2025-10-24, TEAM_ABBREVIATION: ATL, MATCHUP: ATL @ ORL}
  - {GAME_ID: 22500101, GAME_DATE: 2025-10-25, TEAM_ABBREVIATION: ATL, MATCHUP: ATL vs. OKC}
  - {GAME_ID: 22500115, GAME_DATE: 2025-10-27, TEAM_ABBREVIATION: ATL, MATCHUP: ATL @ CHI}
  - {GAME_ID: 22500130, GAME_DATE: 2025-10-29, TEAM_ABBREVIATION: ATL, MATCHUP: ATL @ BKN}
  - {GAME_ID: 22500020, GAME_DATE: 2025-10-31, TEAM_ABBREVIATION: ATL, MATCHUP: ATL @ IND}
  - {GAME_ID: 22500151, GAME_DATE: 2025-11-02, TEAM_ABBREVIATION: ATL, MATCHUP: ATL @ CLE}
  - {GAME_ID: 22500166, GAME_DATE: 2025-11-04, TEAM_ABBREVIATION: ATL, MATCHUP: ATL vs. ORL}
  - {GAME_ID: 22500030, GAME_DATE: 2025-11-07, TEAM_ABBREVIATION: ATL, MATCHUP: ATL vs. TOR}
  - {GAME_ID: 22500185, GAME_DATE: 2025-11-08, TEAM_ABBREVIATION: ATL, MATCHUP: ATL vs. LAL}
- Season types (counts): {Regular Season: 2,460, Playoffs: 162, PlayIn: 12, NBA Finals: 2}
- Dates match 2024-25 range: NO

2) data/features/player_games_features_2024_25.csv
- Row count: 27,902
- Unique GAME_ID count: 0 (note: the column appears as `Game_ID` in this file and was not populated under `GAME_ID`)
- GAME_ID prefix examples: []
- GAME_DATE min/max: 2025-10-21 → 2026-06-05
- First 10 rows (subset):
  - {GAME_DATE: 2025-11-18, MATCHUP: LAL vs. UTA}
  - {GAME_DATE: 2025-11-23, MATCHUP: LAL @ UTA}
  - {GAME_DATE: 2025-11-25, MATCHUP: LAL vs. LAC}
  - {GAME_DATE: 2025-11-28, MATCHUP: LAL vs. DAL}
  - {GAME_DATE: 2025-12-01, MATCHUP: LAL vs. PHX}
  - {GAME_DATE: 2025-12-04, MATCHUP: LAL @ TOR}
  - {GAME_DATE: 2025-12-07, MATCHUP: LAL @ PHI}
  - {GAME_DATE: 2025-12-10, MATCHUP: LAL vs. SAS}
  - {GAME_DATE: 2025-12-14, MATCHUP: LAL @ PHX}
  - {GAME_DATE: 2025-12-18, MATCHUP: LAL @ UTA}
- Season types (counts): {Regular Season: 25,923, Playoffs: 1,834, PlayIn: 126, NBA Finals: 19}
- Dates match 2024-25 range: NO

3) data/experimental/game_results_2024_25.csv
- Row count: 1,320
- Unique GAME_ID count: 1,320
- GAME_ID prefix examples: ["002", "004"]
- GAME_DATE min/max: 2024-10-22 → 2025-06-22
- First 10 rows (subset): sample shows regular-season IDs `00224…` on 2024-10-22/23
- Season types (counts): {Regular Season: 1,230, Playoffs: 77, NBA Finals: 7, PlayIn: 6}
- Dates match 2024-25 range: YES

4) data/raw/team_games/nba_team_games_2024_25_regular_and_playoffs.csv
- Row count: 2,640
- Unique GAME_ID count: 1,320
- GAME_ID prefix examples: ["002", "004"]
- GAME_DATE min/max: 2024-10-22 → 2025-06-22
- First 10 rows (subset): includes playoff IDs `00424…` dated 2025-04-19
- Season types: present (SEASON_TYPE); counts align with results scale
- Dates match 2024-25 range: YES

5) data/raw/player_games/nba_player_games_2024_25_regular_and_playoffs.csv
- Row count: 29,240
- Unique GAME_ID count: 1,320
- GAME_ID prefix examples: ["002", "004"]
- GAME_DATE min/max: 2024-10-22 → 2025-06-22
- First 10 rows (subset): playoff IDs and dates consistent with 2025-04-19 onwards
- Season types (counts): {Regular Season: 26,306, PlayIn: 130, Playoffs: 1,645, NBA Finals: 159}
- Dates match 2024-25 range: YES

6) data/raw/boxscores/team/nba_team_boxscores_2024_25.csv
- Row count: 2,640
- Unique GAME_ID count: 1,320
- GAME_ID prefix examples: ["002", "004"]
- GAME_DATE min/max: 2024-10-22 → 2025-06-22
- First 10 rows (subset): regular season/opening week samples
- Season types: present
- Dates match 2024-25 range: YES

7) data/raw/boxscores/player/nba_player_boxscores_2024_25.csv
- Row count: 28,140
- Unique GAME_ID count: 1,320
- GAME_ID prefix examples: ["002", "004"]
- GAME_DATE min/max: 2024-10-22 → 2025-06-22
- First 10 rows (subset): regular season/opening week samples
- Season types (counts): {Regular Season: 26,306, PlayIn: 130, Playoffs: 1,645, NBA Finals: 159}
- Dates match 2024-25 range: YES

## Findings

- The two feature files named with `2024_25` appear to contain the 2025-26 season:
  - `team_games_features_2024_25.csv` has `GAME_DATE` from 2025-10-21 to 2026-06-05 and `GAME_ID` prefixes `225/425`.
  - `player_games_features_2024_25.csv` has `GAME_DATE` from 2025-10-21 to 2026-06-05 and does not populate `GAME_ID` (uses `Game_ID` elsewhere), i.e., not aligned to 2024-25.
- Conversely, 2024-25 raw sources and `game_results_2024_25.csv` are mutually consistent:
  - Dates strictly within 2024-10-22 to 2025-06-22.
  - `GAME_ID` prefixes are `002/004` (standard for regular season/playoffs 2024-25).

## Root Cause of GAME_ID Mismatch

- Wrong-season issue: the feature CSVs labeled `2024_25` are actually derived from 2025-26 data (and a different `GAME_ID` namespace), not a formatting or mere namespace discrepancy.
- Therefore, natural-key remapping from features → 2024-25 `game_results` cannot achieve acceptable coverage (observed 0%) because they represent different seasons.

## Recommendation — Smallest Safe Fix

- Do not remap the mislabeled 2025-26 feature files.
- Regenerate 2024-25 team and player feature files from the correct 2024-25 raw sources (preferably boxscore-aligned), saving only to experimental scope to avoid impacting production.
  - Option A (preferred): Build aligned experimental features from 2024-25 boxscores.
  - Option B (interim): Re-run the existing feature builders against 2024-25 raw inputs ensuring the season token selects 2024-25.
- After regeneration, re-run dataset-only assembly; expected result: >0 rows with canonical `GAME_ID` alignment to `game_results`.

## Verdicts

- Are `2024_25` feature files actually 2024-25? → NO (they are 2025-26).
- Accidentally 2025-26? → YES (dates and `225/425` prefixes confirm).
- Mismatch type → Wrong-season/source, not just formatting.
- Next action → Regenerate features from correct 2024-25 raw sources (experimental only), then proceed with dataset-only build and validations.
