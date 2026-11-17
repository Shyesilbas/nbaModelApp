import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../../context/useTheme";
import { useLanguage } from "../../context/useLanguage";

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { t, language } = useLanguage();
  const tr = language === "tr";
  const label =
    theme === "dark"
      ? tr
        ? `${t.common.toggleTheme} (Açık tema)`
        : `${t.common.toggleTheme} (Light theme)`
      : tr
        ? `${t.common.toggleTheme} (Koyu tema)`
        : `${t.common.toggleTheme} (Dark theme)`;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-border bg-background-primary text-text-secondary transition-colors duration-150 hover:bg-background-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      {theme === "dark" ? (
        <Sun size={16} strokeWidth={1.5} className="text-status-warning" aria-hidden="true" />
      ) : (
        <Moon size={16} strokeWidth={1.5} aria-hidden="true" />
      )}
    </button>
  );
};
