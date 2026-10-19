import type { TeamBoxScore } from "./types";
import { fmtInt, fmtPct } from "./utils";

export function TeamComparisonBars({ home, away }: { home: TeamBoxScore | null; away: TeamBoxScore | null }) {
  if (!home || !away) {
    return (
      <div className="rounded border border-border bg-background-primary p-4 text-xs text-text-secondary">
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
    <div className="rounded border border-border bg-background-primary p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between border-b border-border-light pb-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Team comparison</h3>
          <p className="mt-0.5 text-xs text-text-secondary">Side-by-side performance</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium">
          <span className="rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-text-secondary">
            {home.TEAM_ABBREVIATION}
          </span>
          <span className="text-text-muted">vs</span>
          <span className="rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-text-secondary">
            {away.TEAM_ABBREVIATION}
          </span>
        </div>
      </div>

      <div className="space-y-3">
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
              <div className="mb-1 flex items-center justify-between">
                <span className={`text-xs tabular-nums ${homeWins && !tied ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
                  {row.fmt(row.hVal)}
                </span>
                <span className="text-xs font-medium text-text-muted">{row.label}</span>
                <span className={`text-xs tabular-nums ${awayWins && !tied ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
                  {row.fmt(row.aVal)}
                </span>
              </div>

              <div className="relative h-1.5 overflow-hidden rounded-full bg-background-tertiary">
                <div
                  className={`absolute left-0 top-0 h-full rounded-full transition-all ${homeWins && !tied ? "bg-primary" : "bg-border"}`}
                  style={{ width: `${homePct}%` }}
                />
                <div
                  className={`absolute right-0 top-0 h-full rounded-full transition-all ${awayWins && !tied ? "bg-primary" : "bg-border"}`}
                  style={{ width: `${100 - homePct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
