import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";
import { useLanguage } from "../../context/LanguageContext";

export interface DatePickerProps {
  /** Selectable ISO dates (YYYY-MM-DD), ascending. */
  dates: string[];
  value: string;
  onChange: (date: string) => void;
  /** Accessible name of the date list. */
  label?: string;
  todayStr?: string;
  /** Number of items per date, shown next to it in the list. */
  counts?: Record<string, number>;
  countLabel?: string;
  formatDate?: (date: string) => string;
  /** "asc" lists the oldest date first, "desc" the newest. */
  order?: "asc" | "desc";
  className?: string;
}

export function DatePicker({
  dates,
  value,
  onChange,
  label,
  todayStr,
  counts,
  countLabel,
  formatDate: customFormatDate,
  order = "desc",
  className = "",
}: DatePickerProps) {
  const { t, formatDate: contextFormatDate } = useLanguage();
  const index = dates.indexOf(value);
  const listed = order === "desc" ? [...dates].reverse() : dates;
  const formatDate = customFormatDate || contextFormatDate;
  const resolvedLabel = label || t.common.date;
  const resolvedCountLabel = countLabel || t.fixtures.gamesCount.replace("{count} ", "");

  return (
    <div className={`inline-flex items-center gap-1 ${className}`.trim()}>
      <Button
        variant="secondary"
        aria-label={t.common.previousDay}
        disabled={index <= 0}
        onClick={() => onChange(dates[index - 1])}
        className="h-9 w-9 p-0"
      >
        <ChevronLeft size={16} strokeWidth={1.5} />
      </Button>

      <select
        aria-label={resolvedLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-0 cursor-pointer rounded border border-border bg-background-primary px-3 text-xs font-medium tabular-nums text-text-primary outline-none hover:border-card-border-hover focus:border-border-focus focus:ring-1 focus:ring-border-focus sm:text-sm"
      >
        {!dates.includes(value) && <option value={value}>{value ? formatDate(value) : resolvedLabel}</option>}
        {listed.map((d) => (
          <option key={d} value={d}>
            {formatDate(d)}
            {d === todayStr ? ` · ${t.common.today}` : ""}
            {counts && counts[d] != null ? ` · ${counts[d]} ${resolvedCountLabel}` : ""}
          </option>
        ))}
      </select>

      <Button
        variant="secondary"
        aria-label={t.common.nextDay}
        disabled={index < 0 || index >= dates.length - 1}
        onClick={() => onChange(dates[index + 1])}
        className="h-9 w-9 p-0"
      >
        <ChevronRight size={16} strokeWidth={1.5} />
      </Button>
    </div>
  );
}
