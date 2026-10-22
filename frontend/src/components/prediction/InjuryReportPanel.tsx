import { Badge } from "../common";
import TeamLogo from "../TeamLogo";
import type { TeamInfo } from "./types";

export type InjuryReportSummary = {
  published_et: string;
  submitted: Record<string, boolean>;
  players: { team: string; player_name: string; status: string; reason: string }[];
  promoted_starters?: number[];
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
          Published {report.published_et}
          {promoted > 0 && `, ${promoted} starter${promoted > 1 ? "s" : ""} replaced automatically`}
        </span>
      </div>
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
