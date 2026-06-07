# NBA Prediction Project Status

## Current Production Models

Winner Prediction:
- Win Probability V1
- Status: PRODUCTION

Score Prediction:
- Score Model V2
- Status: PRODUCTION

## Current Experimental Work

- Cross-Season Infrastructure
- Feature Pruning
- EMA Features
- Random Forest Tuning
- Minutes Model V1 (Planned)
- Strength of Schedule Features (Planned)

## Current Decisions

- Win V2 is NOT promoted.
- EMA features are NOT promoted.
- Tuned Random Forest is NOT promoted.
- Newer models are experimental by default.
- Production status is determined only by ARTIFACT_REGISTRY.md.

## Next Roadmap

1. Full Pipeline Data Lineage Audit
2. 2024-25 Pilot Season Ingestion
3. Cross-Season Dataset Merge
4. Minutes Prediction Model V1
5. Strength of Schedule Features
6. Travel/Fatigue Features

## Cross-Season Infrastructure
- Phase 1: season path refactor completed
- Phase 2: canonical ingestion and roster snapshot foundations completed
- Next: 2024-25 pilot ingestion after explicit user approval
