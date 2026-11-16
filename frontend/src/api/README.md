# Prediction API Frontend Module

Typed client and response normalizer for live matchup ML predictions served by the FastAPI backend.

> [!NOTE]
> **Backend Counterpart & Architecture:**
> - **Backend Module:** [`src/api/README.md`](../../../src/api/README.md)
> - **Integration Guide:** [`docs/nba_prediction_integration.md`](../../../docs/nba_prediction_integration.md)
> - **Key Entry Points:** [`predictions.ts`](predictions.ts)

## Business Rules & Invariants
- **Unified Matchup Endpoint:** `predictGameFull` sends `GameFullRequest` (`home_team_id`, `away_team_id`, `prediction_date`, optional `player_status_overrides`) to `POST /predict/game_full`.
- **Single Normalization Contract:** `normalizeGameFullPrediction` converts raw `GameFullResponse` payloads into the UI prediction shape (`predicted_winner`, `confidence_bucket` at `>= 0.7`, score ranges, `PlayerStatusOverride` statuses, and player arrays) so presentation components never parse raw API keys directly.
- **Fail-Fast HTTP Errors:** `parseJsonResponse` extracts `body.error` or `body.detail` and throws `Error` on non-2xx status codes for `InlineError` rendering.
- **Change rule:** Any field change on FastAPI `GameFullRequest` or `GameFullResponse` in [`src/api/schemas.py`](../../../src/api/schemas.py) must be mirrored in [`predictions.ts`](predictions.ts) and verified with `python3 scripts/check_api_endpoints.py`.
