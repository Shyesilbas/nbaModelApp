# Pipeline Refactor Plan

## Objective

Consolidate the current NBA data pipeline into a smaller number of explicit orchestration layers so that ingestion, cleaning, feature engineering, dataset assembly, and export are easier to reason about and test.

## Current Pain Points

- `main.py` mixes CLI parsing, orchestration, data processing, and report generation.
- Several commands rebuild the same artifacts through different call paths.
- `UpdateDataService` previously depended on private helpers inside `main.py`.
- Path resolution is duplicated across modules.
- Derived datasets are built from implicit assumptions instead of a shared contract.

## Proposed Structure

### Layer 1: Raw data access

- Load raw team/player logs
- Refresh schedule data
- Append missing completed games

### Layer 2: Normalization

- Parse dates
- Sort rows
- Normalize minutes
- Normalize matchup strings

### Layer 3: Feature engineering

- Team features
- Player features
- Opponent-aware team features
- Core-player features

### Layer 4: Dataset builders

- V1 team model-ready dataset
- V2 opponent-aware dataset
- V3 core-player-aware dataset
- Player score dataset

### Layer 5: Artifact export

- CSV
- Parquet
- Frontend JSON
- Markdown reports

## Implementation Direction

1. Move shared pipeline operations into a dedicated orchestration helper.
2. Keep `main.py` as a thin CLI entrypoint.
3. Remove cross-imports from services back into `main.py`.
4. Standardize path resolution around a single season-aware helper.
5. Make each dataset builder declare its required inputs and outputs explicitly.

## What Has Started

- A new `PipelineRunner` has been added under `src/orchestration/`.
- `UpdateDataService` now uses `PipelineRunner` instead of importing private functions from `main.py`.

## Next Steps

1. Split remaining `main.py` helper functions into dedicated modules.
2. Move report generation into small report builders.
3. Add tests for each orchestration step.
4. Remove duplicated season/path logic where possible.
