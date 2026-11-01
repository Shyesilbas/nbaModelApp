import { reportStampText } from "../../lib/injuryTime";
import TeamLogo from "../TeamLogo";
import { InjuryChangesList, INJURY_TONE, type InjuryChange } from "./InjuryChangesList";
import type { TeamInfo } from "./types";
import { useLanguage } from "../../context/LanguageContext";

export type InjuryReportSummary = {
  published_et: string;
  submitted: Record<string, boolean>;
  players: { team: string; player_name: string; status: string; reason: string }[];
  promoted_starters?: number[];
  changes?: InjuryChange[];
};

const ORDER: Record<string, number> = { Out: 0, Doubtful: 1, Questionable: 2, Probable: 3, Available: 4 };

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
  const tr = language === "tr";
  const promoted = report.promoted_starters?.length ?? 0;
  return (
    <section className="space-y-5 rounded border border-border bg-background-primary p-4 sm:p-5">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{t.injuries.officialReport}</h3>
        <p className="mt-0.5 text-xs tabular-nums text-text-muted">
          {tr ? "Rapor saati: " : "Published: "}
          {reportStampText(report.published_et)}
          {promoted > 0 &&
            (tr
              ? ` · ${promoted} as oyuncu otomatik ikame edildi`
              : ` · ${promoted} starter${promoted > 1 ? "s" : ""} replaced automatically`)}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {[awayInfo, homeInfo].map((info) => {
          const rows = report.players
            .filter((p) => p.team === info.abbr)
            .sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));
          const filed = report.submitted[info.abbr] !== false;
          return (
            <div key={info.abbr}>
              <div className="mb-1 flex items-center gap-2 border-b border-border-light pb-2">
                <TeamLogo abbr={info.abbr} name={info.name} size={24} />
                <h4 className="text-sm font-semibold text-text-primary">{info.name}</h4>
              </div>
              {!filed ? (
                <p className="py-2 text-xs text-text-secondary">
                  {tr ? "Rapor henüz verilmedi; durum son maçtan varsayıldı." : "Report not filed yet; availability is assumed from the last game."}
                </p>
              ) : rows.length === 0 ? (
                <p className="py-2 text-xs text-text-secondary">{tr ? "Listelenen oyuncu yok." : "No players listed."}</p>
              ) : (
                <ul className="divide-y divide-border-light">
                  {rows.map((p) => (
                    <li key={p.player_name} className="flex items-start justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary">{p.player_name}</p>
                        {p.reason && <p className="text-xs text-text-muted">{p.reason}</p>}
                      </div>
                      <span className={`shrink-0 text-xs font-medium ${INJURY_TONE[p.status] ?? "text-text-secondary"}`}>
                        {p.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {report.changes && report.changes.length > 0 && <InjuryChangesList changes={report.changes} />}
    </section>
  );
}
