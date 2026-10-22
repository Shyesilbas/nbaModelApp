import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex h-9 w-9 items-center justify-center rounded border border-border bg-background-primary text-text-secondary transition-colors duration-150 hover:bg-background-tertiary hover:text-text-primary focus:outline-none"
    >
      {theme === "dark" ? (
        <Sun size={16} strokeWidth={1.5} className="text-status-warning" />
      ) : (
        <Moon size={16} strokeWidth={1.5} />
      )}
    </button>
  );
};
