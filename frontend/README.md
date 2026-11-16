# NBA Intelligence Lab — Frontend

React 19, TypeScript, Vite, and Tailwind CSS dashboard for NBA game results, player and team views, injury tracking, model predictions, and prospective paper trading.

> [!NOTE]
> **Related Documentation & Standards:**
> - **Agent Guide & Design System:** [`AGENTS.md`](../AGENTS.md) · [`restrained-ui-design-standard`](../.agents/skills/restrained-ui-design-standard/SKILL.md)
> - **Backend Integration:** [`docs/nba_prediction_integration.md`](../docs/nba_prediction_integration.md) · [`src/api/README.md`](../src/api/README.md) · [`src/frontend_store/README.md`](../src/frontend_store/README.md)

## Quick Start & Quality Gate
```bash
# Build SQLite store and start FastAPI backend (from repo root)
PYTHONPATH=. python3 scripts/build_frontend_store.py
python3 -m uvicorn src.api.main:app --port 8001

# Install and start Vite dev server on http://localhost:5173 (from frontend/)
npm install && npm run dev

# Required checks before completing any UI change
npm run lint:design && npm run lint && npm run build
```

## Module Hubs (`src/`)
| Module | Scope | Hub |
|---|---|---|
| **Prediction API** | `POST /predict/game_full` client & response normalization | [`src/api/README.md`](src/api/README.md) |
| **UI Components** | 8 lazy/eager feature tabs, `common/` primitives & domain subpackages | [`src/components/README.md`](src/components/README.md) |
| **Client Lib** | SQLite `/frontend-data-api/*` cache, URL tab routing & team metadata | [`src/lib/README.md`](src/lib/README.md) |
| **Context** | Light/dark theme & TR/EN language providers | [`src/context/README.md`](src/context/README.md) |
| **i18n** | Bilingual translation dictionaries (`en.ts`, `tr.ts`) | [`src/i18n/README.md`](src/i18n/README.md) |
| **Types** | Shared TypeScript interfaces for game feeds & box scores | [`src/types/README.md`](src/types/README.md) |

## Architecture & Invariants
- **Zero Static Data:** Every view fetches from FastAPI (`/frontend-data-api/*` backed by `data/frontend_store/` SQLite files, and `/predict/*` for live inference). `VITE_API_BASE_URL` defaults to `http://localhost:8001`.
- **URL-Synced Tab Routing (`App.tsx`):** `parseUrlRoute` and `updateUrlRoute` scope deep links per tab (`game-results`, `player-profile`, `player-compare`, `team-explorer`, `multi-team`, `nba-prediction`, `paper-trading`, `injuries`).
- **Restrained Design Standard:** Semantic CSS variables in `src/index.css`, max radius `rounded-md`, flat 1px bordered surfaces, `lucide-react` icons, zero emojis, and four data states (loading `Skeleton`, `EmptyState`, `InlineError`, pending).
