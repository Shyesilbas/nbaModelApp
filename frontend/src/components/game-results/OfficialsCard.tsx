import { Shield, Award } from "lucide-react";
import type { ParsedOfficial } from "./utils";

export function OfficialsCard({
  officials,
  className,
}: {
  officials: ParsedOfficial[];
  className?: string;
}) {
  if (!officials || officials.length === 0) {
    return null;
  }

  return (
    <div className={`rounded border border-border bg-background-primary p-4 sm:p-5 ${className || ""}`}>
      <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
        <div className="flex items-center gap-2.5">
          <Shield size={16} className="text-text-secondary" />
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Game officials</h3>
            <p className="mt-0.5 text-xs text-text-secondary">Assigned referee crew</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
          <Award size={16} className="text-text-muted" />
          {officials.length} Assigned
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {officials.map((o, idx) => (
          <div
            key={idx}
            className="flex items-center gap-3 rounded border border-border bg-background-primary p-3 transition-colors hover:border-card-border-hover"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border-light bg-background-tertiary tabular-nums text-xs font-semibold tabular-nums text-text-primary">
              {o.jerseyNum ? `#${o.jerseyNum}` : `#${idx + 1}`}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-text-primary truncate">{o.cleanName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-status-success" />
                <p className="text-xs text-text-secondary">{o.role}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
