import type { TeamBoxScore } from "./types";
import { fmtInt, fmtPct } from "./utils";

export function TeamComparisonBars({ home, away }: { home: TeamBoxScore | null; away: TeamBoxScore | null }) {
  if (!home || !away) {
    return (
      <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 text-sm text-slate-500">
        Team stats are not available for this game.
      </div>
    );
  }

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
    <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Team Comparison</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-700">Side-by-side performance</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest">
          <span className="text-[#1d428a]">{home.TEAM_ABBREVIATION}</span>
          <span className="text-slate-300">vs</span>
          <span className="text-[#c9082a]">{away.TEAM_ABBREVIATION}</span>
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
                <span className={`text-sm font-black tabular-nums ${homeWins && !tied ? "text-slate-900" : "text-slate-400"}`}>
                  {row.fmt(row.hVal)}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-400">{row.label}</span>
                <span className={`text-sm font-black tabular-nums ${awayWins && !tied ? "text-slate-900" : "text-slate-400"}`}>
                  {row.fmt(row.aVal)}
                </span>
              </div>

              <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${homePct}%`,
                    background: homeWins && !tied ? "#1d428a" : "#cbd5e1",
                  }}
                />
                <div
                  className="absolute right-0 top-0 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${100 - homePct}%`,
                    background: awayWins && !tied ? "#c9082a" : "#cbd5e1",
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
