# Season 2024-25 Pilot Dry-Run Report

## Summary
- **Status**: PASS
- **Timestamp**: 2026-06-07T13:18:00+03:00

## Configuration Verification
- **Current Season**: `2025-26` (Expected: `2025-26`)
- **Configured Seasons**: `['2025-26']`

## Path Resolutions (2024-25)
| Parameter | Resolved Path | Season Token Check | Production Overlap Check |
| :--- | :--- | :--- | :--- |
| `team_games_raw` | `data/raw/team_games/nba_team_games_2024_25_regular_and_playoffs.csv` | ✅ OK | ✅ SAFE |
| `player_games_raw` | `data/raw/player_games/nba_player_games_2024_25_regular_and_playoffs.csv` | ✅ OK | ✅ SAFE |
| `raw_schedule` | `data/raw/schedule/nba_schedule_2024_25.csv` | ✅ OK | ✅ SAFE |
| `raw_finals_schedule` | `data/raw/schedule/nba_finals_upcoming_2024_25.csv` | ✅ OK | ✅ SAFE |
| `raw_team_boxscores` | `data/raw/boxscores/team/nba_team_boxscores_2024_25.csv` | ✅ OK | ✅ SAFE |
| `raw_player_boxscores` | `data/raw/boxscores/player/nba_player_boxscores_2024_25.csv` | ✅ OK | ✅ SAFE |
| `game_results` | `data/processed/game_results_2024_25.csv` | ✅ OK | ✅ SAFE |
| `schedule_combined` | `data/processed/schedule_combined_2024_25.csv` | ✅ OK | ✅ SAFE |
| `upcoming_context` | `data/processed/upcoming_games_context_2024_25.csv` | ✅ OK | ✅ SAFE |
| `team_features` | `data/features/team_games_features_2024_25.csv` | ✅ OK | ✅ SAFE |
| `player_features` | `data/features/player_games_features_2024_25.csv` | ✅ OK | ✅ SAFE |
| `win_model_dataset` | `data/processed/team_win_model_ready_v2_player_features_2024_25.csv` | ✅ OK | ✅ SAFE |
| `score_model_dataset` | `data/processed/team_score_model_ready_v2_player_features_2024_25.csv` | ✅ OK | ✅ SAFE |
| `team_model_ready_v2` | `data/processed/team_model_ready_v2_2024_25.csv` | ✅ OK | ✅ SAFE |

## Dry-Run Status
- ✅ All configuration checks passed successfully.
- ✅ No overlaps with production paths.
- ✅ All target paths successfully isolated to the `2024_25` file token.
