import { Shield, Award } from "lucide-react";
import type { ParsedOfficial } from "./utils";
import { useLanguage } from "../../context/useLanguage";

export function OfficialsCard({
  officials,
  className,
}: {
  officials: ParsedOfficial[];
  className?: string;
}) {
  const { t, language } = useLanguage();
  const tr = language === "tr";

  if (!officials || officials.length === 0) {
    return null;
  }

  return (
    <div className={`rounded border border-border bg-background-primary p-4 sm:p-5 ${className || ""}`}>
      <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2.5">
          <Shield size={16} className="text-text-secondary" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{t.gameCard.officials}</h3>
            <p className="mt-0.5 text-xs text-text-secondary">
              {tr ? "Görevli hakem ekibi" : "Assigned referee crew"}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-xs font-medium tabular-nums text-text-secondary">
          <Award size={16} className="text-text-muted" aria-hidden="true" />
          {officials.length} {tr ? "Hakem" : "Assigned"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {officials.map((o, idx) => (
          <div
            key={idx}
            className="flex items-center gap-3 rounded border border-border bg-background-primary p-3 transition-colors hover:border-card-border-hover"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border-light bg-background-tertiary text-xs font-semibold tabular-nums text-text-primary">
              {o.jerseyNum ? `#${o.jerseyNum}` : `#${idx + 1}`}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-text-primary">{o.cleanName}</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-status-success" aria-hidden="true" />
                <p className="text-xs text-text-secondary">{o.role}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
