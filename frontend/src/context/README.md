# Context Module

Manages client-side theme (`light`/`dark`) and active UI language (`tr`/`en`) React context providers.

> [!NOTE]
> **Related Modules:**
> - **Dictionaries:** [`frontend/src/i18n/README.md`](../i18n/README.md)
> - **UI Toggles:** [`frontend/src/components/README.md`](../components/README.md)
> - **Key Entry Points:** [`ThemeContext.tsx`](ThemeContext.tsx) · [`useTheme.ts`](useTheme.ts) · [`LanguageContext.tsx`](LanguageContext.tsx) · [`useLanguage.ts`](useLanguage.ts)

## Business Rules & Invariants
- **Theme Persistence (`ThemeContext.tsx` / `useTheme.ts`):** `ThemeProvider` reads `localStorage` (`nba-intel-theme`) or `prefers-color-scheme`, toggles the `.dark` class on `document.documentElement`, and `useTheme` exposes theme state.
- **Language & Date Formatting (`LanguageContext.tsx` / `useLanguage.ts`):** `LanguageProvider` persists `nba-intel-language` (`"tr"` or `"en"`), updates `document.documentElement.lang`, exposes typed `t` translations via `useLanguage`, and formats ISO dates cleanly via `formatDate`.
- **Change rule:** Never store server payloads, prediction results, or auth tokens in React context or `localStorage`. Keep context objects and hook exports in `.ts` files separated from React provider `.tsx` files for Fast Refresh.
