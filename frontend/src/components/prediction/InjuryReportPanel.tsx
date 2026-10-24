import { Badge } from "../common";
import { reportStampText } from "../../lib/injuryTime";
import TeamLogo from "../TeamLogo";
import { InjuryChangesList, type InjuryChange } from "./InjuryChangesList";
import type { TeamInfo } from "./types";
import { useLanguage } from "../../context/LanguageContext";

export type InjuryReportSummary = {
  published_et: string;
  submitted: Record<string, boolean>;
  players: { team: string; player_name: string; status: string; reason: string }[];
  promoted_starters?: number[];
  changes?: InjuryChange[];
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
  const { language, t } = useLanguage();

  if (!report) {
    return (
      <div className="rounded border border-border bg-background-primary p-4 text-xs text-text-secondary">
        {language === "tr"
          ? "Bu tarih için geçerli resmi sakatlık raporu bulunamadı; kadro durumu son maçlara göre varsayılmıştır."
          : "No official injury report applies to this date, so rosters are projected from recent games only."}
      </div>
    );
  }
  const promoted = report.promoted_starters?.length ?? 0;
  return (
    <div className="rounded border border-border bg-background-primary p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-text-primary">
          {t.injuries.officialReport}
        </span>
        <span className="text-xs text-text-secondary">
          {language === "tr" ? "Rapor Saati: " : "Published: "}
          {reportStampText(report.published_et)}
          {promoted > 0 &&
            (language === "tr"
              ? `, ${promoted} as oyuncu otomatik ikame edildi`
              : `, ${promoted} starter${promoted > 1 ? "s" : ""} replaced automatically`)}
        </span>
      </div>
      {report.changes && report.changes.length > 0 && (
        <div className="mb-3">
          <InjuryChangesList changes={report.changes} />
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
