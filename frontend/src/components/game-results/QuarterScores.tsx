import TeamLogo from "../TeamLogo";
import { teamFull } from "./utils";
import { useLanguage } from "../../context/LanguageContext";

export interface QuarterScoresProps {
  homeAbbr: string;
  awayAbbr: string;
  homeName?: string | null;
  awayName?: string | null;
  homeQS?: number[] | null;
  awayQS?: number[] | null;
  homeScore?: number | null;
  awayScore?: number | null;
  winnerAbbr?: string | null;
  margin?: number | null;
}

export function QuarterScores({
  homeAbbr,
  awayAbbr,
  homeName,
  awayName,
  homeQS,
  awayQS,
  homeScore,
  awayScore,
  winnerAbbr,
  margin,
}: QuarterScoresProps) {
  const { language } = useLanguage();
  const hasQS =
    (Array.isArray(awayQS) && awayQS.length > 0) ||
    (Array.isArray(homeQS) && homeQS.length > 0);

  if (!hasQS) return null;

  const quarters = Math.max(awayQS?.length ?? 0, homeQS?.length ?? 0);
  const cols = Array.from({ length: quarters }, (_, i) => i);

  const awayTotal = awayScore ?? awayQS?.reduce((a, b) => a + b, 0) ?? 0;
  const homeTotal = homeScore ?? homeQS?.reduce((a, b) => a + b, 0) ?? 0;
  const awayWon = winnerAbbr ? winnerAbbr === awayAbbr : awayTotal > homeTotal;
  const homeWon = winnerAbbr ? winnerAbbr === homeAbbr : homeTotal > awayTotal;

  return (
    <div className="rounded border border-border bg-background-primary p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between border-b border-border-light pb-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            {language === "tr" ? "Periyot Skorları" : "Quarter Scores"}
          </h3>
          <p className="mt-0.5 text-xs text-text-secondary">
            {language === "tr" ? "Çeyrek ve uzatma bazında skor dağılımı" : "Score progression by quarters and overtime"}
          </p>
        </div>
        {winnerAbbr && margin != null && margin > 0 && (
          <span className="rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
            {teamFull(winnerAbbr, null)} +{margin}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-light text-text-secondary">
              <th className="pb-2 text-left text-xs font-medium min-w-[140px]">{language === "tr" ? "Takım" : "Team"}</th>
              {cols.map((i) => {
                const label = i < 4 ? `Q${i + 1}` : quarters === 5 ? "OT" : `OT${i - 3}`;
                return (
                  <th key={i} className="pb-2 text-center text-xs font-medium w-12 sm:w-16">
                    {label}
                  </th>
                );
              })}
              <th className="pb-2 text-center text-xs font-semibold text-text-primary w-14 sm:w-18">
                {language === "tr" ? "Toplam" : "Total"}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {/* Away Team (First Row) */}
            <tr>
              <td className="py-2.5 text-left">
                <div className="flex items-center gap-2">
                  <TeamLogo abbr={awayAbbr} name={awayName} size={20} />
                  <span className={`text-xs font-semibold ${awayWon ? "text-text-primary" : "text-text-secondary"}`}>
                    {teamFull(awayAbbr, awayName)}
                  </span>
                </div>
              </td>
              {cols.map((i) => {
                const aVal = awayQS?.[i] ?? null;
                const hVal = homeQS?.[i] ?? null;
                const isHigh = aVal != null && hVal != null && aVal > hVal;
                return (
                  <td
                    key={i}
                    className={`py-2.5 text-center text-xs tabular-nums ${
                      isHigh ? "font-semibold text-text-primary" : "text-text-secondary"
                    }`}
                  >
                    {aVal ?? "-"}
                  </td>
                );
              })}
              <td className={`py-2.5 text-center text-xs font-semibold tabular-nums ${awayWon ? "text-text-primary" : "text-text-secondary"}`}>
                {awayTotal}
              </td>
            </tr>

            {/* Home Team (Second Row) */}
            <tr>
              <td className="py-2.5 text-left">
                <div className="flex items-center gap-2">
                  <TeamLogo abbr={homeAbbr} name={homeName} size={20} />
                  <span className={`text-xs font-semibold ${homeWon ? "text-text-primary" : "text-text-secondary"}`}>
                    {teamFull(homeAbbr, homeName)}
                  </span>
                </div>
              </td>
              {cols.map((i) => {
                const aVal = awayQS?.[i] ?? null;
                const hVal = homeQS?.[i] ?? null;
                const isHigh = hVal != null && aVal != null && hVal > aVal;
                return (
                  <td
                    key={i}
                    className={`py-2.5 text-center text-xs tabular-nums ${
                      isHigh ? "font-semibold text-text-primary" : "text-text-secondary"
                    }`}
                  >
                    {hVal ?? "-"}
                  </td>
                );
              })}
              <td className={`py-2.5 text-center text-xs font-semibold tabular-nums ${homeWon ? "text-text-primary" : "text-text-secondary"}`}>
                {homeTotal}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
