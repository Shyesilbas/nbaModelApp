# NBA ML Project — Data Freshness & Sync Report

> Generated: 2026-06-10 00:00:00
> Overall Status: **WARNING**

## 1. Latest Dates Overview

- **Current Local Date**: `2026-06-10`
- **Latest Team Games Date**: `2026-06-05`
- **Latest Player Games Date**: `2026-06-05`
- **Latest Schedule Date (Combined)**: `2026-06-19`
- **Latest Upcoming Scheduled Game Date**: `2026-06-19`

## 2. Missing Played/Completed Games

| Game ID | Date | Matchup | Team Game Rows |
| :--- | :--- | :--- | :---: |
| `0042500403` | 2026-06-08 | SAS @ NYK | 0 |
| `0042500404` | 2026-06-10 | SAS @ NYK | 0 |

## 3. Dataset Sync (Team vs Player Games)

- **Game IDs in team_games only**: 0
- **Game IDs in player_games only**: 0

✅ Game ID coverage matches perfectly between team and player game logs.

## 4. Finals / Playoff Anomaly Detection

- ⚠️ Potential completed Finals game missing from raw datasets: 0042500403 | 2026-06-08 | SAS @ NYK
- ⚠️ Potential completed Finals game missing from raw datasets: 0042500404 | 2026-06-10 | SAS @ NYK

## 5. Active Warnings / Diagnostics

- ⚠️ Team games dataset is behind completed schedule games. Latest team game: 2026-06-05, Latest completed schedule: 2026-06-10.
- ⚠️ Player games dataset is behind completed schedule games. Latest player game: 2026-06-05, Latest completed schedule: 2026-06-10.
- ⚠️ Missing completed game: 0042500403 | 2026-06-08 | SAS @ NYK (0 rows in team_games)
- ⚠️ Missing completed game: 0042500404 | 2026-06-10 | SAS @ NYK (0 rows in team_games)
- ⚠️ Potential completed Finals game missing from raw datasets.
