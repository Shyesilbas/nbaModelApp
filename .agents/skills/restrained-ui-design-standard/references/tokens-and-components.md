# Restrained UI Design Tokens & Component Specs

Detailed token mappings and component anatomy referenced by `SKILL.md`. Canonical CSS variables and Tailwind mappings live in `frontend/src/index.css` and `frontend/tailwind.config.js`.

## 1. Surfaces, Borders & Text Hierarchy
- **Surfaces:**
  - Primary content surface (cards, tables, modals): `bg-background-primary`
  - Page canvas background: `bg-background-secondary`
  - Subtle fill / table headers / secondary hovers: `bg-background-tertiary`
  - Separate cards and section boundaries with 1px `border-border`.
  - Inner dividers, list separators, and table row borders use `border-border-light`.
- **Text Hierarchy:**
  - Primary titles, headings, values: `text-text-primary`
  - Supporting copy, descriptions, table cells: `text-text-secondary`
  - Tertiary labels / metadata: `text-text-tertiary` / `text-text-muted` (verify >= 4.5:1 contrast).
- **Primary & Status Anchors:**
  - Dominant CTAs and active navigation: `bg-primary` / `hover:bg-primary-hover` (`#0f172a` light, `#10b981` dark).
  - Status states: `status-success`, `status-error`, `status-warning`, `status-info` (available as `text-status-*`, `bg-status-*/10`, `border-status-*/30`).

## 2. Typography, Elevation & Layout Scales
- **Font (`Plus Jakarta Sans`):**
  - Weights: `font-normal` (400), `font-medium` (500), `font-semibold` (600) only.
  - Hierarchy (max 3 levels per screen): Page title `text-2xl font-semibold`, Section title `text-lg font-semibold`, Card title `text-sm font-semibold`, Body `text-sm`, Supporting meta `text-xs text-text-secondary`.
  - Minimum font size: `text-xs` (12px). Use sentence case for headings and buttons.
  - Numerals: Apply `tabular-nums` to all scores, probabilities, odds, percentages, dates, and metric cells.
- **Shadows & Radii:**
  - Resting cards use flat surfaces (`bg-background-primary border border-border rounded`) with no resting drop shadow.
  - Shadows (`shadow-sm`, `shadow-md`) are reserved strictly for floating overlays (dropdowns, command palettes, popovers, modals).
  - Radii: `rounded-sm` (6px tags/badges), `rounded` (8px inputs/buttons/cards), `rounded-md` (12px ceiling for modals/panels), `rounded-full` (avatars, team logos, status dots).
- **Spacing & Motion:** 4px grid (`p-4`/`p-5` uniform card padding across siblings, `gap-3`/`gap-4` elements, `gap-6`/`gap-8` sections). Responsive targets (`360px`, `768px`, `1280px`), `>= 44px` mobile touch targets. Transitions `150-200ms ease-out` honoring `motion-reduce:`.

## 3. Shared Primitives (`frontend/src/components/common/`)
- **Button (`Button.tsx`):** Variants `primary`, `secondary`, `ghost`, `danger`; one primary CTA per view; `36-40px` height; `rounded`; preserves width while loading.
- **Input & Select (`Input.tsx`, `Select.tsx`, `DatePicker.tsx`):** Visible `<label htmlFor>`, `40px` height, `rounded`, `1px border-border`, `border-border-focus`, inline error (`role="alert"`).
- **Card & Badge (`Card.tsx`, `Badge.tsx`):** `Card` uses flat `bg-background-primary border border-border rounded` (`hover:border-card-border-hover`). `Badge` supports `neutral`, `success`, `error`, `warning`, `info`, `primary` with `rounded-sm`.
- **Modal & CommandPalette (`Modal.tsx`, `CommandPalette.tsx`):** Solid `bg-black/40` backdrop (no blur), `rounded-md`, focus trapped, `Escape` closes, primary action on the right. No nested modals.
- **Four-State Primitives (`Skeleton.tsx`, `EmptyState.tsx`, `InlineError.tsx`, `ErrorBoundary.tsx`):**
  - `Skeleton`: `animate-pulse bg-background-tertiary rounded` matching final card/table dimensions.
  - `EmptyState`: `lucide-react` icon (`Inbox` 32px default), concise title/description, at most one secondary action button.
  - `InlineError`: `role="alert"` with `AlertCircle`, concise message, and `Retry` button callback (`onRetry`).
