# Client Lib Module

Centralizes frontend configuration constants, private SQLite data-API caching, URL-scoped tab routing, team metadata, injury clock formatting, and PDF report export.

> [!NOTE]
> **Backend Counterparts & Architecture:**
> - **Backend API & Store:** [`src/api/README.md`](../../../src/api/README.md) · [`src/frontend_store/README.md`](../../../src/frontend_store/README.md)
> - **Key Entry Points:** [`constants.ts`](constants.ts) · [`dataCache.ts`](dataCache.ts) · [`archiveData.ts`](archiveData.ts) · [`router.ts`](router.ts) · [`nbaTeams.ts`](nbaTeams.ts) · [`teamRecords.ts`](teamRecords.ts) · [`injuryTime.ts`](injuryTime.ts) · [`predictionReport.ts`](predictionReport.ts) · [`fill.ts`](fill.ts)

## Business Rules & Invariants
- **Single Data Gateway (`dataCache.ts`, `archiveData.ts`):** All `/frontend-data-api/*` requests attach `X-Data-Token` (`API_DATA_TOKEN`) via `loadPrivateApi` (in-memory deduplicated promise cache that evicts on error), `loadPrivateApiFresh` (`no-store` for live-updating fixtures/box scores), or `postPrivateApi`.
- **Revalidated Fresh Loads:** `loadPrivateApiFresh` sends `cache: "no-cache"`, so the browser revalidates with the server ETag and an unchanged document returns 304 instead of a new download.
- **Game ID Normalization:** `archiveData.ts` normalizes `GAME_ID` strings to 10-digit zero-padded form and caches play-by-play promises by `${season}:${gameId}` with `invalidateGameIndexCache` on manual refresh.
- **URL-Scoped Navigation (`router.ts`):** `parseUrlRoute` and `navigateTo` / `updateUrlRoute` maintain clean query parameters per active tab (e.g., `gameId`, `playerId`, `team`, `predictHome`/`predictAway`/`predictDate`, `p1`/`p2`).
- **Time & Locale Formatting:** `injuryTime.ts` (`reportLocalClock`, `reportStampText`) converts official Eastern Time league injury stamps into Europe/Istanbul clock display. `fill.ts` performs safe template token substitution for i18n strings.
- **Change rule:** Any new `/frontend-data-api/*` path referenced in `lib/` must match [`src/api/routes.py`](../../../src/api/routes.py) and pass `python3 scripts/check_api_endpoints.py`.
