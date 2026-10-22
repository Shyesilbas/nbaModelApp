import { Badge } from "../common";
import TeamLogo from "../TeamLogo";
import type { TeamInfo } from "./types";

export type InjuryReportSummary = {
  published_et: string;
  submitted: Record<string, boolean>;
  players: { team: string; player_name: string; status: string; reason: string }[];
  promoted_starters?: number[];
  changes?: { team: string; player_name: string; from: string | null; to: string | null; since_report_et: string }[];
};

const STATUS_VARIANT: Record<string, "error" | "warning" | "neutral" | "success"> = {
  Out: "error",
  Doubtful: "warning",
  Questionable: "warning",
  Probable: "neutral",
  Available: "success",
};

interface InjuryReportPanelProps {
  report: InjuryReportSummary | null | undefined;
  homeInfo: TeamInfo;
  awayInfo: TeamInfo;
}

function formatPublishedTSI(publishedEt?: string | null): string {
  if (!publishedEt) return "";
  const m = publishedEt.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\s+([AP]M)/i);
  if (!m) return publishedEt;
  const [, mon, day, yr, hh, mm, ap] = m;
  const fullYear = yr.length === 2 ? `20${yr}` : yr;
  let h = parseInt(hh, 10);
  if (ap.toUpperCase() === "PM" && h < 12) h += 12;
  if (ap.toUpperCase() === "AM" && h === 12) h = 0;
  try {
    const iso = `${fullYear}-${mon.padStart(2, "0")}-${day.padStart(2, "0")}T${String(h).padStart(2, "0")}:${mm}:00-04:00`;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return publishedEt;
    const fmt = new Intl.DateTimeFormat("tr-TR", {
      timeZone: "Europe/Istanbul",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${fmt.format(d)} TSİ`;
  } catch {
    return publishedEt;
  }
}

/** The official injury report the prediction was made with (applied automatically, read only). */
export function InjuryReportPanel({ report, homeInfo, awayInfo }: InjuryReportPanelProps) {
  if (!report) {
    return (
      <div className="rounded border border-border bg-background-primary p-4 text-xs text-text-secondary">
        No official injury report applies to this date, so rosters are projected from recent games only.
      </div>
    );
  }
  const promoted = report.promoted_starters?.length ?? 0;
  return (
    <div className="rounded border border-border bg-background-primary p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-text-primary">Official injury report</span>
        <span className="text-xs text-text-secondary">
          Rapor Saati: {formatPublishedTSI(report.published_et)}
          {promoted > 0 && `, ${promoted} starter${promoted > 1 ? "s" : ""} replaced automatically`}
        </span>
      </div>
      {report.changes && report.changes.length > 0 && (
        <div className="mb-3 rounded border border-status-warning/30 bg-status-warning/10 p-3">
          <p className="mb-1.5 text-xs font-medium text-text-primary">
            Changed since the {report.changes[0].since_report_et} report
          </p>
          <ul className="space-y-1">
            {report.changes.map((c) => (
              <li key={`${c.team}-${c.player_name}`} className="text-xs text-text-secondary">
                <span className="text-text-primary">{c.player_name}</span> ({c.team}): {c.from ?? "not listed"} to{" "}
                {c.to ?? "removed from the report"}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {[awayInfo, homeInfo].map((info) => {
          const rows = report.players.filter((p) => p.team === info.abbr);
          const filed = report.submitted[info.abbr] !== false;
          return (
            <div key={info.abbr}>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-text-primary">
                <TeamLogo abbr={info.abbr} size={18} />
                {info.abbr}
              </div>
              {!filed ? (
                <p className="text-xs text-text-secondary">Report not filed yet; availability is assumed from the last game.</p>
              ) : rows.length === 0 ? (
                <p className="text-xs text-text-secondary">No players listed.</p>
              ) : (
                <ul className="space-y-1.5">
                  {rows.map((p) => (
                    <li key={p.player_name} className="flex items-start justify-between gap-2 text-xs">
                      <span className="text-text-primary" title={p.reason}>{p.player_name}</span>
                      <Badge variant={STATUS_VARIANT[p.status] ?? "neutral"} size="sm">{p.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
