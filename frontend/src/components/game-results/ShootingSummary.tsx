import type { TeamBoxScore } from "./types";
import { fmtPair, fmtPct } from "./utils";
import TeamLogo from "../TeamLogo";

export function ShootingSummary({ home, away }: { home: TeamBoxScore | null; away: TeamBoxScore | null }) {
  if (!home && !away) return null;

  const hasFG = (away?.FGM != null || away?.FGA != null) || (home?.FGM != null || home?.FGA != null);
  const has3PT = (away?.FG3M != null || away?.FG3A != null) || (home?.FG3M != null || home?.FG3A != null);
  const hasFT = (away?.FTM != null || away?.FTA != null) || (home?.FTM != null || home?.FTA != null);

  // 2PT calculation
  const away2M = away?.FGM != null && away?.FG3M != null ? Math.max(0, away.FGM - away.FG3M) : null;
  const away2A = away?.FGA != null && away?.FG3A != null ? Math.max(0, away.FGA - away.FG3A) : null;
  const away2Pct = away2M != null && away2A != null && away2A > 0 ? (away2M / away2A) * 100 : null;

  const home2M = home?.FGM != null && home?.FG3M != null ? Math.max(0, home.FGM - home.FG3M) : null;
  const home2A = home?.FGA != null && home?.FG3A != null ? Math.max(0, home.FGA - home.FG3A) : null;
  const home2Pct = home2M != null && home2A != null && home2A > 0 ? (home2M / home2A) * 100 : null;

  const has2PT = (away2M != null && away2A != null) || (home2M != null && home2A != null);

  if (!hasFG && !has3PT && !hasFT) return null;

  const rows = [
    {
      key: "fg",
      label: "Saha İçi (FG)",
      aVal: fmtPair(away?.FGM, away?.FGA),
      hVal: fmtPair(home?.FGM, home?.FGA),
      aPctStr: fmtPct(away?.FG_PCT ?? null),
      hPctStr: fmtPct(home?.FG_PCT ?? null),
      aPctNum: away?.FG_PCT != null ? Number(away.FG_PCT) * (Number(away.FG_PCT) <= 1 ? 100 : 1) : 0,
      hPctNum: home?.FG_PCT != null ? Number(home.FG_PCT) * (Number(home.FG_PCT) <= 1 ? 100 : 1) : 0,
      show: hasFG,
    },
    {
      key: "2pt",
      label: "2 Sayılık (2PT)",
      aVal: fmtPair(away2M, away2A),
      hVal: fmtPair(home2M, home2A),
      aPctStr: away2Pct != null ? `${away2Pct.toFixed(1)}%` : "—",
      hPctStr: home2Pct != null ? `${home2Pct.toFixed(1)}%` : "—",
      aPctNum: away2Pct ?? 0,
      hPctNum: home2Pct ?? 0,
      show: has2PT,
    },
    {
      key: "3pt",
      label: "3 Sayılık (3PT)",
      aVal: fmtPair(away?.FG3M, away?.FG3A),
      hVal: fmtPair(home?.FG3M, home?.FG3A),
      aPctStr: fmtPct(away?.FG3_PCT ?? null),
      hPctStr: fmtPct(home?.FG3_PCT ?? null),
      aPctNum: away?.FG3_PCT != null ? Number(away.FG3_PCT) * (Number(away.FG3_PCT) <= 1 ? 100 : 1) : 0,
      hPctNum: home?.FG3_PCT != null ? Number(home.FG3_PCT) * (Number(home.FG3_PCT) <= 1 ? 100 : 1) : 0,
      show: has3PT,
    },
    {
      key: "ft",
      label: "Serbest Atış (FT)",
      aVal: fmtPair(away?.FTM, away?.FTA),
      hVal: fmtPair(home?.FTM, home?.FTA),
      aPctStr: fmtPct(away?.FT_PCT ?? null),
      hPctStr: fmtPct(home?.FT_PCT ?? null),
      aPctNum: away?.FT_PCT != null ? Number(away.FT_PCT) * (Number(away.FT_PCT) <= 1 ? 100 : 1) : 0,
      hPctNum: home?.FT_PCT != null ? Number(home.FT_PCT) * (Number(home.FT_PCT) <= 1 ? 100 : 1) : 0,
      show: hasFT,
    },
  ].filter((r) => r.show);

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col justify-between rounded border border-border bg-background-primary p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between border-b border-border-light pb-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Şut Dağılımı ve Verimlilik</h3>
          <p className="mt-0.5 text-xs text-text-secondary">İsabet / Deneme ve yüzdeler</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium">
          {away && (
            <div className="flex items-center gap-1.5">
              <TeamLogo abbr={away.TEAM_ABBREVIATION} size={16} />
              <span className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 text-text-secondary">
                {away.TEAM_ABBREVIATION}
              </span>
            </div>
          )}
          <span className="text-text-muted">vs</span>
          {home && (
            <div className="flex items-center gap-1.5">
              <span className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 text-text-secondary">
                {home.TEAM_ABBREVIATION}
              </span>
              <TeamLogo abbr={home.TEAM_ABBREVIATION} size={16} />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3.5">
        {rows.map((row) => {
          const totalPct = row.aPctNum + row.hPctNum;
          const awayShare = totalPct > 0 ? (row.aPctNum / totalPct) * 100 : 50;
          const awayWins = row.aPctNum > row.hPctNum;
          const homeWins = row.hPctNum > row.aPctNum;
          const tied = row.aPctNum === row.hPctNum;

          return (
            <div key={row.key}>
              <div className="mb-1 flex items-center justify-between">
                {/* Away */}
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-xs tabular-nums ${awayWins && !tied ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
                    {row.aVal}
                  </span>
                  <span className={`text-xs tabular-nums ${awayWins && !tied ? "font-semibold text-text-primary" : "text-text-muted"}`}>
                    ({row.aPctStr})
                  </span>
                </div>

                {/* Center Label */}
                <span className="text-xs font-medium text-text-muted">{row.label}</span>

                {/* Home */}
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-xs tabular-nums ${homeWins && !tied ? "font-semibold text-text-muted" : "text-text-muted"}`}>
                    ({row.hPctStr})
                  </span>
                  <span className={`text-xs tabular-nums ${homeWins && !tied ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
                    {row.hVal}
                  </span>
                </div>
              </div>

              {/* Symmetrical Comparative Bar */}
              <div className="relative h-1.5 overflow-hidden rounded-full bg-background-tertiary flex">
                <div
                  className={`h-full rounded-l-full transition-all ${awayWins && !tied ? "bg-primary" : "bg-border"}`}
                  style={{ width: `${awayShare}%` }}
                />
                <div
                  className={`h-full rounded-r-full transition-all ${homeWins && !tied ? "bg-primary" : "bg-border"}`}
                  style={{ width: `${100 - awayShare}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
