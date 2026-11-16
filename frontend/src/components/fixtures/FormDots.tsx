import React from "react";
import { useLanguage } from "../../context/useLanguage";

interface FormDotsProps {
  form: ("W" | "L")[];
  className?: string;
}

/** Last five results, oldest to newest (the rightmost dot is the most recent game). */
export const FormDots: React.FC<FormDotsProps> = ({ form, className = "" }) => {
  const { language } = useLanguage();
  const tr = language === "tr";
  if (form.length === 0) return null;
  const wins = form.filter((r) => r === "W").length;
  const label = tr
    ? `Son ${form.length} maç: ${wins} galibiyet, ${form.length - wins} mağlubiyet (sağdaki en yeni)`
    : `Last ${form.length} games: ${wins} wins, ${form.length - wins} losses (rightmost is newest)`;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} role="img" aria-label={label} title={label}>
      {form.map((res, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${res === "W" ? "bg-status-success" : "bg-status-error"}`}
        />
      ))}
    </span>
  );
};
