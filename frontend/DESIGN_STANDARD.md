# Frontend Design Standard

This document is the canonical design system specification for this repository. All UI components, screens, and AI agents modifying the frontend MUST adhere strictly to these rules.

UI/UX quality, consistency, accessibility, data clarity, and performance take priority over implementation speed.

---

## 1. Design Philosophy

- **Quiet & Deliberate:** The interface must feel intentional, modern, fast, and premium. Take inspiration from restrained consumer products (Apple / Spotify tier) rather than hyper-promotional web dashboards.
- **Hierarchy through Structure:** Visual hierarchy comes primarily from typography, spacing, alignment, layout, and subtle hairline borders (1px), never from stacked shadows, saturated colored backgrounds, or arbitrary decoration.
- **Purposeful Contextual Color:** Color must convey meaning (team identities, metrics, model probabilities, categorical states). Rigid monochrome restrictions are lifted in favor of thoughtful, mature palettes, but colors must never be loud, neon, or gratuitous.
- **Aesthetics Support Usability:** Never make an interface visually louder simply to make it appear more sophisticated.

---

## 2. Absolute Visual Rules (Zero Exceptions)

1. **No Emojis Anywhere:** No emojis in product UI copy, buttons, badges, alerts, toasts, placeholders, empty states, or mock content. Use `lucide-react` icons (16px or 20px, stroke 1.5, `currentColor`) or clean typography.
2. **No Arbitrary Decoration:** No neon bubbles, floating glowing blobs, glassmorphism (`backdrop-blur`), heavy gradients (`bg-gradient-*`), or glowing rings.
3. **No Pill-Shaped Buttons or Cards:** Buttons and cards use the standard radius system (`rounded`).
4. **No Oversized Radius Classes:** Never introduce `rounded-lg`, `rounded-xl`, `rounded-2xl`, or `rounded-3xl` into ordinary UI components.
5. **No Arbitrary Values:** Never use arbitrary bracket syntax like `text-[13px]`, `p-[18px]`, or `rounded-[2rem]`. Use Tailwind's spacing and type scale.
6. **No Heavy Font Weights:** Do not use `font-black` or `font-extrabold`. Restrict font weights to `font-normal` (400), `font-medium` (500), and `font-semibold` (600).
7. **No Gratuitous Animation:** No bounce effects, scale-up hover lifts, or looping decorative animations. Transitions must be 150–200ms with `ease-out`, operating only on opacity and small translations (1–2px).
8. **No Resting Shadows on Cards:** Resting content cards must use flat surfaces with 1px semantic borders (`border-border`). Shadows (`shadow-sm`, `shadow-md`) are reserved exclusively for floating overlays, dropdowns, and modals.
9. **No Hardcoded Hex Colors:** Do not hardcode arbitrary hex colors in component markup when a semantic token exists.

---

## 3. Design Tokens & Surfaces

All colors and surfaces are governed by semantic tokens defined in `tailwind.config.js`:

| Role | Semantic Token | Intended Usage |
|---|---|---|
| Page Background | `bg-background-secondary` (`#f8fafc`) | Canvas background for application pages |
| Content Surfaces | `bg-background-primary` (`#ffffff`) | Cards, tables, modals, input backgrounds |
| Subtle Fills | `bg-background-tertiary` (`#f1f5f9`) | Table headers, secondary buttons, input hover/active fills |
| Primary Text | `text-text-primary` (`#0f172a`) | Titles, headings, values, primary labels |
| Supporting Text | `text-text-secondary` (`#475569`) | Subtitles, descriptions, table cell text |
| Metadata & Muted | `text-text-muted` (`#94a3b8`) | Timestamps, secondary metadata (verify 4.5:1 contrast) |
| Outer Borders | `border-border` (`#e2e8f0`) | Card perimeter, input borders, button borders |
| Inner Dividers | `border-border-light` (`#f1f5f9`) | Table row dividers, subtle internal section dividers |
| Focus Border/Ring | `border-border-focus` (`#0f172a`) | Visible accessible keyboard focus state |
| Primary Action | `bg-primary` / `hover:bg-primary-hover` | Dominant CTAs and active navigation states |
| Success State | `status-success` (`#047857`) | Positive metrics, won games, completed states |
| Error State | `status-error` (`#b91c1c`) | Form errors, failed fetches, negative margins |
| Warning State | `status-warning` (`#b45309`) | Cautions, missing data warnings, uncertain thresholds |
| Info State | `status-info` (`#1d4ed8`) | Informational badges, neutral status alerts |

---

## 4. Radius System

The project's radius tokens map to exact structural semantics:

| Element | Target Radius Class | Token Value |
|---|---|---|
| Tags, badges, checkboxes, small indicators | `rounded-sm` | 6px |
| Buttons, inputs, selects, cards, dropdowns, toasts | `rounded` | 8px |
| Modals, drawers, large overlay dialogs (ceiling) | `rounded-md` | 12px |
| Avatars, team logos, status indicator dots | `rounded-full` | 9999px |
| All other components | None (`rounded-none`) | 0px |

---

## 5. Typography

- **Font Family:** Plus Jakarta Sans (`font-sans`), with system fallbacks.
- **Hierarchy:**
  - Page Titles: `text-2xl font-semibold text-text-primary`
  - Section Titles: `text-lg font-semibold text-text-primary`
  - Sub-headings / Card Titles: `text-sm font-semibold text-text-primary`
  - Body Text: `text-sm font-normal text-text-primary`
  - Supporting Meta: `text-xs font-normal text-text-secondary`
  - Minimum Content Size: 12px (`text-xs`). Avoid unreadable sub-12px text.
- **Numerical Formatting:** Always use `tabular-nums` for prices, scores, dates, statistics, percentages, and probabilities to prevent jitter.
- **Casing:** Sentence case for titles, headings, and buttons ("Generate prediction", not "GENERATE PREDICTION").

---

## 6. Spacing & Layout

- **Grid System:** Consistent 4px grid (`p-1` = 4px, `p-2` = 8px, `p-3` = 12px, `p-4` = 16px, `p-5` = 20px, `p-6` = 24px).
- **Cards:** Standard padding `p-4` or `p-5`. Avoid mixed paddings within sibling cards.
- **Layout Stacks:** Gap between related elements: `gap-3` or `gap-4`. Stack gaps between sections: `gap-6` or `gap-8`.
- **Page Container:** Use standard `PageContainer` with responsive horizontal padding (`px-4 sm:px-6 lg:px-8`) and max-width constraints.
- **Responsiveness:** Test mobile narrow (360px), tablet (768px), and desktop (1280px). No horizontal overflows.

---

## 7. Shared Component Guidelines

All shared primitives reside in `src/components/common/`:

1. **Button:**
   - Variants: `primary`, `secondary`, `ghost`, `danger`.
   - Fixed desktop height (36–40px), min 44px touch target on mobile.
   - Distinct loading spinner state that preserves button width.
2. **Input & Select:**
   - Always provide accessible `<label>` associated via `htmlFor`.
   - Consistent 40px height, `rounded`, `border-border`.
   - Prominent focus ring (`focus:border-border-focus focus:ring-1 focus:ring-border-focus`).
   - Helper text and error messages placed below the input with `role="alert"`.
3. **Card:**
   - Flat surface `bg-background-primary`, `border border-border`, `rounded`.
   - Optional hover state changes border to `border-card-border-hover` without scale or lift.
4. **Badge / StatusTag:**
   - Semantic color variants (success, error, warning, info, neutral).
   - Compact height, `rounded-sm`, `text-xs font-medium`.
5. **Skeleton:**
   - Subtle pulse animation (`animate-pulse bg-background-tertiary rounded`).
   - Mirrors exact height and shape of incoming content to prevent Cumulative Layout Shift (CLS).
6. **EmptyState:**
   - Clean Lucide icon (24px or 32px), single concise explanation sentence, and at most one clear primary CTA.
7. **InlineError:**
   - Accessible error banner (`role="alert"`), clear explanation, optional retry button callback.
8. **Modal & Drawer:**
   - Solid backdrop (`bg-black/40`), no backdrop-blur.
   - Focus trapped within modal; `Escape` key closes dialog.
   - Smooth entrance, primary action aligned to the right.

---

## 8. State Architecture (The Four Mandatory Data States)

Every data-driven view and tab MUST explicitly implement and test:
1. **Loading State:** Render structured skeletons mimicking the data layout. Avoid full-page blank screens or generic spinners.
2. **Empty State:** When no results match a filter or search, explain clearly why and provide an action to reset.
3. **Error State:** Catch API/fetch failures cleanly and render an inline error banner with a "Retry" button. Never crash or render blank.
4. **Disabled / Pending State:** Disable interactive controls during network requests, show progress indicators, and prevent duplicate submissions.

---

## 9. Accessibility (WCAG 2.2 AA)

- Text contrast ratio must exceed 4.5:1 against its background.
- Focus visible outlines must never be removed (`outline-none` must be paired with visible focus rings).
- All form inputs, icon buttons, and interactive elements must have accessible names (`aria-label`, `aria-describedby`, `<label>`).
- Respect `prefers-reduced-motion` for all transitions and animations.

---

## 10. Automated Quality Gate

Run from the `frontend/` directory before finalizing any UI task:
```bash
npm run lint:design
npm run build
npm run lint
```
