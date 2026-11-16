# Types Module

Defines shared TypeScript interfaces for season game feeds and full box score payloads served by `/frontend-data-api/*`.

> [!NOTE]
> **Related Modules:**
> - **Data Clients:** [`frontend/src/lib/README.md`](../lib/README.md) · [`frontend/src/api/README.md`](../api/README.md)
> - **Backend Store:** [`src/frontend_store/README.md`](../../../src/frontend_store/README.md)
> - **Key Entry Points:** [`gameFeed.ts`](gameFeed.ts) · [`prediction.ts`](prediction.ts)

## Business Rules & Invariants
- **Shared Feed Contracts (`gameFeed.ts`):** `GameFeedRow`, `GameDetail`, `TeamLeader`, and `TeamRosterEntry` mirror the JSON structures serialized inside `season_{YYYY_YY}.db` (`games` and `game_details` tables).
- **Prediction Contracts (`prediction.ts`):** `NormalizedPrediction`, `PredictionExplanation`, `FeatureImpact`, and `RawScoreRange` type the normalized `/api/predict/*` payload shared across `api/predictions.ts`, `lib/predictionReport.ts`, and `components/prediction/`.
- **Change rule:** Any field rename or addition in `src/frontend_store/builders.py` must be reflected in [`gameFeed.ts`](gameFeed.ts) and verified with `cd frontend && npm run build`.
