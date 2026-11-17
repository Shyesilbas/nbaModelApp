import { ArrowRight } from "lucide-react";
import { useLanguage } from "../../context/useLanguage";
import { INJURY_TONE } from "./types";

export type InjuryChange = {
  team: string;
  player_name: string;
  steps: { status: string | null; at: string }[];
};

const clock = (published: string) => published.split(" ").slice(1).join(" ");

const STATUS_TR: Record<string, string> = {
  Out: "Yok (Out)",
  Doubtful: "Şüpheli",
  Questionable: "Belirsiz",
  Probable: "Muhtemel",
  Available: "Aktif",
};

/** Status changes of players across today's injury reports ("not on the report" reads as Available). */
export function InjuryChangesList({ changes }: { changes: InjuryChange[] }) {
  const { language } = useLanguage();
  const tr = language === "tr";
  if (changes.length === 0) return null;
  return (
    <section aria-label={tr ? "Rapor değişimleri" : "Report changes"}>
      <h4 className="text-xs font-medium text-text-muted">
        {tr ? "Bugünkü rapor değişimleri" : "Report changes today"}
      </h4>
      <ul className="mt-1 divide-y divide-border-light">
        {changes.map((c) => (
          <li key={`${c.team}-${c.player_name}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-xs">
            <span className="text-sm font-medium text-text-primary">
              {c.player_name} <span className="text-xs font-normal text-text-muted">{c.team}</span>
            </span>
            <span className="flex flex-wrap items-center gap-1.5 tabular-nums">
              {c.steps.map((s, i) => {
                const status = s.status ?? "Available";
                return (
                  <span key={`${s.at}-${i}`} className="inline-flex items-center gap-1.5">
                    {i > 0 && <ArrowRight size={14} className="text-text-muted" aria-hidden="true" />}
                    <span className={`font-medium ${INJURY_TONE[status] ?? "text-text-secondary"}`}>
                      {tr ? (STATUS_TR[status] ?? status) : status}
                    </span>
                    <span className="text-text-muted">{clock(s.at)}</span>
                  </span>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
