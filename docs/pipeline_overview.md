# NBA Pipeline Overview

This document describes the current end-to-end data flow used by the project.

## 1. Data Ingestion

- Team game logs are loaded from season-specific CSV files in `data/raw/team_games`.
- Player game logs are loaded from season-specific CSV files in `data/raw/player_games`.
- Schedule data is refreshed separately through the NBA API and persisted in `data/raw/schedule`.
- Missing completed games can be backfilled through the update pipeline.

## 2. Cleaning

Cleaning is intentionally lightweight and localized:

- Dates are parsed into pandas datetime values.
- Team and player rows are sorted chronologically.
- Minutes values in player logs are normalized from text formats such as `MM:SS`.
- Matchup anomalies are normalized so home/away labels and matchup strings stay consistent.

## 3. Feature Engineering

### Team features

The team feature pipeline produces:

- Home/away flags
- Opponent abbreviations
- Win target
- Rest-day features
- Rolling offensive form
- Rolling defensive form
- Home/away split form
- Head-to-head features

### Player features

The player feature pipeline produces:

- Home/away flags
- Opponent abbreviations
- Win target
- Rest-day features
- Rolling player performance features

### Opponent features

Opponent features are produced by self-joining team rows on `GAME_ID` and renaming the opponent-side columns with the `OPP_` prefix.

## 4. Dataset Assembly

There are multiple dataset layers:

- V1: base team model-ready dataset
- V2: opponent-aware team model-ready dataset
- V3: core-player-aware team model-ready dataset
- Score dataset: team dataset joined with game results plus player-derived inference features

Each dataset builder filters to a narrower column set and drops rows that cannot support leakage-free rolling features.

## 5. Schedule and Context

The schedule context pipeline:

- Combines played schedule rows with upcoming finals rows
- Builds upcoming game context using latest available team features
- Exports frontend JSON files
- Generates a markdown report

## 6. Update Pipeline

The update pipeline:

1. Refreshes schedule data
2. Validates freshness against raw datasets
3. Detects missing completed games
4. Backfills missing team and player logs
5. Rebuilds feature datasets and derived artifacts unless skipped
6. Re-runs freshness validation

## 7. Structural Issue

The current codebase still has overlapping orchestration paths:

- `main.py` contains private pipeline helpers
- `UpdateDataService` used to import those helpers back from `main.py`
- Multiple commands rebuild overlapping artifacts with slightly different paths and assumptions

This is the main reason the pipeline feels independent and fragmented.
