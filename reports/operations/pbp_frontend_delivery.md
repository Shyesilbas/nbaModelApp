# PBP Frontend Delivery

Status: implemented.

## Decision

Play-by-play data is served through the FastAPI data API instead of copying every raw PBP JSON into `frontend/public`.

This keeps the frontend bundle/static public tree small and loads PBP only when a game detail PBP tab is opened.

## Endpoint

```text
GET /frontend-data-api/play-by-play/{game_id}?season=YYYY-YY
```

Example:

```text
/frontend-data-api/play-by-play/0042500405?season=2025-26
```

The endpoint reads:

```text
data/season=<season>/raw/play_by_play/<GAME_ID>.json
```

If `season` is omitted, the service attempts to infer it from the NBA `GAME_ID`.

## Frontend Usage

Updated PBP tabs:

- `frontend/src/components/game-results/GameCardDetail.tsx`
- `frontend/src/components/GameDetailPanel.tsx`

Both now use `loadPrivateApi` and fetch through the FastAPI service:

```text
/frontend-data-api/play-by-play/<GAME_ID>?season=<season>
```

The PBP data is still lazy-loaded only when the PBP tab opens.

## Verification

Backend:

- `python3 -m py_compile ml-service/app/routes.py ml-service/app/services/frontend_data.py`
- FastAPI `TestClient` returned `200` for `0042500405?season=2025-26`
- Returned payload: `0042500405`, `SAS @ NYK`, `554` events
- Missing game returns `404`

Frontend:

- `npx tsc -b` passed
- `npm run build` could not complete because local Node is `20.11.0`; Vite requires `20.19+` or `22.12+`

## Notes

- No production model artifacts were modified.
- No PBP files were copied into `frontend/public/data/play_by_play`.
- Historical PBP remains in the raw data cache and is served on demand.
