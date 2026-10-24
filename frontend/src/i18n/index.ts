import en from "./translations/en";
import tr from "./translations/tr";

export type Language = "en" | "tr";

export type TranslationKeys = typeof en;

export const translations: Record<Language, TranslationKeys> = {
  en,
  tr,
};
