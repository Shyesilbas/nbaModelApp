import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { translations } from "../i18n";
import type { Language, TranslationKeys } from "../i18n";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: TranslationKeys;
  formatDate: (dateStr: string, options?: Intl.DateTimeFormatOptions) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = "nba-intel-language";

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window === "undefined") return "tr";
    const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (saved === "tr" || saved === "en") return saved;
    // Default to Turkish as requested or browser language
    const browserLang = navigator.language.toLowerCase();
    return browserLang.startsWith("tr") ? "tr" : "en";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const toggleLanguage = () => {
    setLanguageState((prev) => (prev === "tr" ? "en" : "tr"));
  };

  const t = useMemo(() => {
    return translations[language];
  }, [language]);

  const formatDate = (dateStr: string, options?: Intl.DateTimeFormatOptions) => {
    try {
      const d = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr + "T12:00:00");
      const locale = language === "tr" ? "tr-TR" : "en-US";
      return d.toLocaleDateString(
        locale,
        options || { weekday: "short", year: "numeric", month: "short", day: "numeric" }
      );
    } catch {
      return dateStr;
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t, formatDate }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
