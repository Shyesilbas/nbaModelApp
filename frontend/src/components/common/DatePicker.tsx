import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";

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

const defaultFormat = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("tr-TR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export function DatePicker({
  dates,
  value,
  onChange,
  label = "Tarih",
  todayStr,
  counts,
  countLabel = "maç",
  formatDate = defaultFormat,
  order = "desc",
  className = "",
}: DatePickerProps) {
  const index = dates.indexOf(value);
  const listed = order === "desc" ? [...dates].reverse() : dates;

  return (
    <div className={`inline-flex items-center gap-1 ${className}`.trim()}>
      <Button
        variant="secondary"
        aria-label="Önceki gün"
        disabled={index <= 0}
        onClick={() => onChange(dates[index - 1])}
        className="h-9 w-9 p-0"
      >
        <ChevronLeft size={16} strokeWidth={1.5} />
      </Button>

      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-0 cursor-pointer rounded border border-border bg-background-primary px-3 text-xs font-medium tabular-nums text-text-primary outline-none hover:border-card-border-hover focus:border-border-focus focus:ring-1 focus:ring-border-focus sm:text-sm"
      >
        {!dates.includes(value) && <option value={value}>{value ? formatDate(value) : "Tarih seç"}</option>}
        {listed.map((d) => (
          <option key={d} value={d}>
            {formatDate(d)}
            {d === todayStr ? " · bugün" : ""}
            {counts && counts[d] != null ? ` · ${counts[d]} ${countLabel}` : ""}
          </option>
        ))}
      </select>

      <Button
        variant="secondary"
        aria-label="Sonraki gün"
        disabled={index < 0 || index >= dates.length - 1}
        onClick={() => onChange(dates[index + 1])}
        className="h-9 w-9 p-0"
      >
        <ChevronRight size={16} strokeWidth={1.5} />
      </Button>
    </div>
  );
}
