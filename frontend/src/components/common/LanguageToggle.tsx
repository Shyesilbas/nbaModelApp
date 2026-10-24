import React from "react";
import { Globe } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";

interface LanguageToggleProps {
  className?: string;
}

export const LanguageToggle: React.FC<LanguageToggleProps> = ({ className = "" }) => {
  const { language, toggleLanguage, t } = useLanguage();

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      className={`inline-flex items-center gap-1.5 rounded border border-border bg-background-primary px-2.5 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:bg-background-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${className}`}
      title={t.common.toggleLanguage}
      aria-label={t.common.toggleLanguage}
    >
      <Globe size={15} strokeWidth={1.5} className="text-text-secondary" />
      <span className="uppercase tracking-wider">{language}</span>
    </button>
  );
};
