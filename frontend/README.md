# NBA Intelligence Lab - Frontend

Vite, React, TypeScript and Tailwind dashboard for NBA game results, player and team pages, injuries, model predictions and paper trading.

The frontend has no static data files. Everything comes from the FastAPI ML service:

- `/frontend-data-api/*` serves the SQLite store under `data/frontend_store/` and requires the data token.
- Prediction views call the model endpoints directly.
- The API base URL defaults to `http://localhost:8001`; override it with `VITE_API_BASE_URL`.

## Design rules

All UI work follows the [`restrained-ui-design-standard`](../.agents/skills/restrained-ui-design-standard/SKILL.md) skill: semantic tokens, shared primitives in `src/components/common/`, flat bordered surfaces, no emojis, no arbitrary Tailwind values, and the four data states (loading, empty, error with retry, pending).

## Getting started

Build the frontend store once from the repository root, then start the API:

```bash
PYTHONPATH=. python3 scripts/build_frontend_store.py
python3 -m uvicorn src.api.main:app --port 8001
```

Install and run the dev server from `frontend/`:

```bash
npm install
npm run dev
```

Vite serves the app on http://localhost:5173. `scripts/start_all.sh` in the repository root starts the API and the frontend together.

## Quality gate

Run these before finishing any UI change:

```bash
npm run lint:design   # design standard checks
npm run build         # type check and production bundle
npm run lint          # eslint
```

## Structure

```
frontend/src/
  App.tsx              sidebar, tab routing, command palette, error boundary
  main.tsx             entry point (theme provider, error boundary)
  api/                 model prediction client and response types
  context/             theme context
  lib/                 router, data cache, constants, team metadata, report export
  components/
    common/            Button, Input, Select, Card, Badge, Skeleton, EmptyState,
                       InlineError, Modal, ErrorBoundary, CommandPalette, ThemeToggle
    fixtures/          schedule, standings and match card views
    game-results/      game cards, box scores, quarter and team comparison blocks
    player/            player hero card, shared types and formatters
    prediction/        matchup hero, tactical hub, model explanation, player spotlight
    FixturesTab.tsx, PlayerPage.tsx, PlayerCompare.tsx, TeamExplorer.tsx,
    TradeBoard.tsx, NbaPrediction.tsx, PaperTrading.tsx, InjuriesTab.tsx
```

## Views

| Tab | Purpose |
|---|---|
| Game Results | Fixtures, results, standings and game detail with box scores |
| Player Profile | Player search, season averages, trend radar and game log |
| Head-to-Head | Side-by-side season averages for two players |
| Team Explorer | Team rosters and core players |
| Trade Discovery | Players who changed teams |
| Predictions | Win probability, score, player projections and model explanation |
| Paper Trading | Snapshot ledger and results |
| Injuries | Official injury report with status changes and returns |
