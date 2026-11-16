# UI Components Module

Presentation views, feature tabs, domain subpackages, and restrained shared UI primitives for the NBA Intelligence Lab dashboard.

> [!NOTE]
> **Related Documentation & Standards:**
> - **Design System:** [`restrained-ui-design-standard`](../../../.agents/skills/restrained-ui-design-standard/SKILL.md) · [`tokens-and-components.md`](../../../.agents/skills/restrained-ui-design-standard/references/tokens-and-components.md)
> - **Frontend Overview:** [`frontend/README.md`](../../README.md)
> - **Key Entry Points:** [`common/index.ts`](common/index.ts) · [`fixtures/FixturesScheduleView.tsx`](fixtures/FixturesScheduleView.tsx) · [`game-results/GameCardDetail.tsx`](game-results/GameCardDetail.tsx) · [`prediction/MatchupHeroCard.tsx`](prediction/MatchupHeroCard.tsx) · [`player/PlayerHeroCard.tsx`](player/PlayerHeroCard.tsx) · [`paper/PaperBaselines.tsx`](paper/PaperBaselines.tsx)

## Tab Views & Subpackages
- **Top-Level Tabs (`App.tsx`):** `GameResults` (`FixturesTab`), `PlayerPage`, `PlayerCompare`, `TeamExplorer`, `TradeBoard`, `NbaPrediction`, `PaperTrading`, `InjuriesTab`, plus global `CommandPalette` and `PublishSnapshotButton`.
- **Shared Primitives (`common/`):** `Button`, `Input`, `Select`, `DatePicker`, `Card`, `Badge`, `Modal`, `PageContainer`, `Skeleton`, `EmptyState`, `InlineError`, `ErrorBoundary`, `ThemeToggle`, `LanguageToggle`.
- **Domain Subpackages:** `fixtures/` (schedule & standings), `game-results/` (`GameCard`, `PlayerBoxTable`, `QuarterBreakdown`, `ShootingSummary`, `HighlightsTab`, `TopPerformers`, `OfficialsCard`), `prediction/` (`WinProbabilityArc`, `MatchupTacticalHub`, `ModelExplanationSection`, `PlayerSpotlight`, `PlayerMatchupModal`, `InjuryReportPanel`), `player/` (`PlayerGameCard`), and `paper/` (`BacktestCalibration`, `PaperCharts`).

## Component Rules
- **Primitives First:** All buttons, form fields, cards, modals, skeletons, empty states, and errors must use `common/` components rather than ad-hoc HTML elements.
- **Visual Ceiling & Four States:** Strictly enforce `rounded-md` max radius, semantic CSS tokens, `tabular-nums` on every metric/score, zero emojis, and all four data states (loading `Skeleton`, `EmptyState`, `InlineError`, disabled pending).
- **Change rule:** Run `npm run lint:design && npm run lint && npm run build` inside `frontend/` after editing any component.
