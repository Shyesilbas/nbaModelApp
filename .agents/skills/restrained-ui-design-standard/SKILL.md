---
name: restrained-ui-design-standard
description: >-
  Use this skill before creating, modifying, styling, or reviewing any frontend UI
  component, view, modal, table, chart, or stylesheet. Enforces the Apple/Spotify-tier
  restrained design standard, semantic tokens, four-state data discipline, and mandatory
  pre-completion regex/lint checks.
---

# Restrained Frontend UI/UX Design Standard

Enforce every rule below when writing, styling, or editing frontend components, screens, modals, tables, or stylesheets. Visual hierarchy comes from typography scale, weight, spacing, alignment, and crisp 1px borders (`border-border`, `border-border-light`).

> **References (read on demand):**
> - [`references/tokens-and-components.md`](references/tokens-and-components.md) — Semantic CSS token mappings, typography/spacing scales, and shared primitive specs.
> - Canonical token definitions: `frontend/src/index.css` and `frontend/tailwind.config.js`.

## 1. Hard Prohibitions ("Never" List)
1. **No Emojis Anywhere:** Zero emojis in JSX, i18n strings, buttons, badges, empty states, comments, or fixtures. Use `lucide-react` icons (`16px` or `20px`, stroke `1.5`, `currentColor`) or plain text.
2. **No Oversized Border Radius:** Strict ceiling: `rounded-sm` (6px tags/badges), `rounded` (8px buttons/inputs/cards/dropdowns), `rounded-md` (12px max for modals/panels), `rounded-full` (avatars, logos, status dots). **Forbidden:** `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-[...]`, or pill cards/buttons.
3. **No Arbitrary Tailwind Brackets or Raw Hex Codes:** Never write `text-[13px]`, `p-[18px]`, `w-[342px]`, or hardcoded hex colors (`#...`) in component markup; use semantic tokens from `tailwind.config.js`.
4. **No Heavy Font Weights:** Font is Plus Jakarta Sans (`font-sans`). Use only `font-normal` (400), `font-medium` (500), and `font-semibold` (600). **Forbidden:** `font-extrabold`, `font-black`, and decorative all-caps tracking.
5. **No Gradients, Blur, or Resting Card Shadows:** **Forbidden:** `bg-gradient-*`, `backdrop-blur*`, glowing rings, decorative blobs, bounce animations, or `hover:scale-*`. Resting cards use flat `bg-background-primary` + `border-border`; shadows (`shadow-sm`, `shadow-md`) are exclusively for floating overlays.
6. **Tabular Numerals & Casing:** Apply `tabular-nums` to every score, probability, odds value, count, percentage, date, or metric cell. Use sentence case for headings and buttons.

## 2. Core Rules & Four-State Data Discipline
- **Shared Primitives First:** Always consume `frontend/src/components/common/` (`Button`, `Input`, `Select`, `DatePicker`, `Card`, `Badge`, `Modal`, `PageContainer`, `Skeleton`, `EmptyState`, `InlineError`).
- **Balanced Contextual Color:** Team identities, win probabilities, status indicators, and chart series should remain purposeful and restrained—never neon or tacky.
- **Mandatory Four Data States:** Every data-driven component or view must implement:
  1. **Loading:** Layout-matching `Skeleton` blocks (`animate-pulse bg-background-tertiary rounded`) preventing CLS; no full-page blocking spinners.
  2. **Empty:** Clean `EmptyState` with `lucide-react` icon, one concise explanation sentence, and at most one CTA.
  3. **Error:** `InlineError` (`role="alert"`) with clear explanation and retry callback.
  4. **Disabled / Pending:** Preserve button/card dimensions, reduce contrast, and reflect progress in the label.

## 3. Pre-Completion Verification Checklist
Run from `frontend/` against touched files before concluding any frontend task and fix every violation:

```bash
grep -nE "rounded-(lg|xl|2xl|3xl)|rounded-\[|bg-gradient|backdrop-blur|font-(black|extrabold)|text-\[[0-9]|#[0-9a-fA-F]{3,6}\b" <touched_files>
npm run lint:design
npm run lint
npm run build
```

Also run `python3 scripts/check_no_emoji.py` and `python3 scripts/check_api_endpoints.py` from the repository root if API paths or text changed.
