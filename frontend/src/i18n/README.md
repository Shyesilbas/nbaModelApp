# i18n Module

Provides bilingual (`en` / `tr`) strongly typed translation dictionaries consumed via `LanguageContext`.

> [!NOTE]
> **Related Modules:**
> - **Provider Hook:** [`frontend/src/context/README.md`](../context/README.md)
> - **Template Helper:** [`fill.ts`](../lib/fill.ts)
> - **Key Entry Points:** [`index.ts`](index.ts) · [`translations/en.ts`](translations/en.ts) · [`translations/tr.ts`](translations/tr.ts)

## Business Rules & Invariants
- **English Schema as Type Contract:** [`index.ts`](index.ts) defines `TranslationKeys = typeof en`, so TypeScript (`npm run build`) fails compilation if `translations/tr.ts` misses or mismatches any key defined in `translations/en.ts`.
- **Zero-Emoji UI Strings:** All translation strings across `en.ts` and `tr.ts` must strictly contain plain text (no emojis or decorative pictographs).
- **Change rule:** Always add new UI copy keys simultaneously to both `translations/en.ts` and `translations/tr.ts`, using `{placeholder}` tokens formatted with `fill(...)`.
