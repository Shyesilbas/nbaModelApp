import type { TeamBoxScore } from "./types";
import { fmtInt, fmtPct } from "./utils";
import { getTeamTheme } from "../../lib/nbaTeams";

export function TeamComparisonBars({ home, away }: { home: TeamBoxScore | null; away: TeamBoxScore | null }) {
  if (!home || !away) {
    return (
      <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 text-sm text-slate-500">
        Team stats are not available for this game.
      </div>
    );
  }

  const homeTheme = getTeamTheme(home.TEAM_ABBREVIATION);
  const awayTheme = getTeamTheme(away.TEAM_ABBREVIATION);

  type BarRow = {
    label: string;
    hVal: number | null;
    aVal: number | null;
    higherIsBetter: boolean;
    fmt: (v: number | null) => string;
  };

  const rows: BarRow[] = [
    { label: "Points", hVal: home.PTS, aVal: away.PTS, higherIsBetter: true, fmt: fmtInt },
    { label: "FG%", hVal: home.FG_PCT, aVal: away.FG_PCT, higherIsBetter: true, fmt: fmtPct },
    { label: "3PT%", hVal: home.FG3_PCT, aVal: away.FG3_PCT, higherIsBetter: true, fmt: fmtPct },
    { label: "FT%", hVal: home.FT_PCT, aVal: away.FT_PCT, higherIsBetter: true, fmt: fmtPct },
    { label: "Rebounds", hVal: home.REB, aVal: away.REB, higherIsBetter: true, fmt: fmtInt },
    { label: "Assists", hVal: home.AST, aVal: away.AST, higherIsBetter: true, fmt: fmtInt },
    { label: "Turnovers", hVal: home.TOV, aVal: away.TOV, higherIsBetter: false, fmt: fmtInt },
  ];

  return (
    <div className="rounded-[1.5rem] border border-slate-200/80 bg-white p-5 shadow-xs">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Team Comparison</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-700">Side-by-side performance</p>
        </div>
        <div className="flex items-center gap-3 text-xs font-black uppercase tracking-wider">
          <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: `${homeTheme.primary}15`, color: homeTheme.primary }}>
            {home.TEAM_ABBREVIATION}
          </span>
          <span className="text-slate-300 font-bold">vs</span>
          <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: `${awayTheme.primary}15`, color: awayTheme.primary }}>
            {away.TEAM_ABBREVIATION}
          </span>
        </div>
      </div>

      <div className="space-y-3.5">
        {rows.map((row) => {
          const hv = row.hVal ?? 0;
          const av = row.aVal ?? 0;
          const total = hv + av;
          const homePct = total > 0 ? (hv / total) * 100 : 50;
          const homeWins = row.higherIsBetter ? hv >= av : hv <= av;
          const awayWins = row.higherIsBetter ? av >= hv : av <= hv;
          const tied = hv === av;

          return (
            <div key={row.label}>
              <div className="mb-1.5 flex items-center justify-between">
                <span 
                  className={`text-sm font-black tabular-nums ${homeWins && !tied ? "text-slate-900 font-extrabold" : "text-slate-400"}`}
                  style={{ color: homeWins && !tied ? homeTheme.primary : undefined }}
                >
                  {row.fmt(row.hVal)}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-400">{row.label}</span>
                <span 
                  className={`text-sm font-black tabular-nums ${awayWins && !tied ? "text-slate-900 font-extrabold" : "text-slate-400"}`}
                  style={{ color: awayWins && !tied ? awayTheme.primary : undefined }}
                >
                  {row.fmt(row.aVal)}
                </span>
              </div>

              <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${homePct}%`,
                    background: homeWins && !tied ? homeTheme.primary : "#cbd5e1",
                  }}
                />
                <div
                  className="absolute right-0 top-0 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${100 - homePct}%`,
                    background: awayWins && !tied ? awayTheme.primary : "#cbd5e1",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
