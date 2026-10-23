import type { TeamBoxScore, PlayerBoxScore } from "./types";
import { fmtInt, fmtPct } from "./utils";
import TeamLogo from "../TeamLogo";

export function TeamComparisonBars({
  home,
  away,
  homePlayers = [],
  awayPlayers = [],
}: {
  home: TeamBoxScore | null;
  away: TeamBoxScore | null;
  homePlayers?: PlayerBoxScore[];
  awayPlayers?: PlayerBoxScore[];
}) {
  if (!home || !away) {
    return (
      <div className="rounded border border-border bg-background-primary p-4 sm:p-5 text-xs text-text-secondary">
        Takım istatistikleri bu maç için bulunamadı.
      </div>
    );
  }

  const awayStl = away.STL ?? (awayPlayers.length > 0 ? awayPlayers.reduce((s, p) => s + (p.STL ?? 0), 0) : null);
  const homeStl = home.STL ?? (homePlayers.length > 0 ? homePlayers.reduce((s, p) => s + (p.STL ?? 0), 0) : null);

  const awayBlk = away.BLK ?? (awayPlayers.length > 0 ? awayPlayers.reduce((s, p) => s + (p.BLK ?? 0), 0) : null);
  const homeBlk = home.BLK ?? (homePlayers.length > 0 ? homePlayers.reduce((s, p) => s + (p.BLK ?? 0), 0) : null);

  type BarRow = {
    label: string;
    aVal: number | null;
    hVal: number | null;
    higherIsBetter: boolean;
    fmt: (v: number | null) => string;
  };

  const rows: BarRow[] = [
    { label: "Sayı (PTS)", aVal: away.PTS, hVal: home.PTS, higherIsBetter: true, fmt: fmtInt },
    { label: "Saha İçi (FG%)", aVal: away.FG_PCT, hVal: home.FG_PCT, higherIsBetter: true, fmt: fmtPct },
    { label: "3 Sayılık (3PT%)", aVal: away.FG3_PCT, hVal: home.FG3_PCT, higherIsBetter: true, fmt: fmtPct },
    { label: "Serbest Atış (FT%)", aVal: away.FT_PCT, hVal: home.FT_PCT, higherIsBetter: true, fmt: fmtPct },
    { label: "Ribaund (REB)", aVal: away.REB, hVal: home.REB, higherIsBetter: true, fmt: fmtInt },
    { label: "Asist (AST)", aVal: away.AST, hVal: home.AST, higherIsBetter: true, fmt: fmtInt },
    ...(awayStl != null || homeStl != null
      ? [{ label: "Top Çalma (STL)", aVal: awayStl, hVal: homeStl, higherIsBetter: true, fmt: fmtInt }]
      : []),
    ...(awayBlk != null || homeBlk != null
      ? [{ label: "Blok (BLK)", aVal: awayBlk, hVal: homeBlk, higherIsBetter: true, fmt: fmtInt }]
      : []),
    { label: "Top Kaybı (TOV)", aVal: away.TOV, hVal: home.TOV, higherIsBetter: false, fmt: fmtInt },
  ];

  return (
    <div className="flex flex-col justify-between rounded border border-border bg-background-primary p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between border-b border-border-light pb-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Takım Karşılaştırması</h3>
          <p className="mt-0.5 text-xs text-text-secondary">Genel maç istatistikleri</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <TeamLogo abbr={away.TEAM_ABBREVIATION} size={16} />
            <span className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 text-text-secondary">
              {away.TEAM_ABBREVIATION}
            </span>
          </div>
          <span className="text-text-muted">vs</span>
          <div className="flex items-center gap-1.5">
            <span className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 text-text-secondary">
              {home.TEAM_ABBREVIATION}
            </span>
            <TeamLogo abbr={home.TEAM_ABBREVIATION} size={16} />
          </div>
        </div>
      </div>

      <div className="space-y-3.5">
        {rows.map((row) => {
          const av = row.aVal ?? 0;
          const hv = row.hVal ?? 0;
          const total = av + hv;
          const awayPct = total > 0 ? (av / total) * 100 : 50;
          const awayWins = row.higherIsBetter ? av >= hv : av <= hv;
          const homeWins = row.higherIsBetter ? hv >= av : hv <= av;
          const tied = av === hv;

          return (
            <div key={row.label}>
              <div className="mb-1 flex items-center justify-between">
                <span className={`text-xs tabular-nums ${awayWins && !tied ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
                  {row.fmt(row.aVal)}
                </span>
                <span className="text-xs font-medium text-text-muted">{row.label}</span>
                <span className={`text-xs tabular-nums ${homeWins && !tied ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
                  {row.fmt(row.hVal)}
                </span>
              </div>

              <div className="relative h-1.5 overflow-hidden rounded-full bg-background-tertiary flex">
                <div
                  className={`h-full rounded-l-full transition-all ${awayWins && !tied ? "bg-primary" : "bg-border"}`}
                  style={{ width: `${awayPct}%` }}
                />
                <div
                  className={`h-full rounded-r-full transition-all ${homeWins && !tied ? "bg-primary" : "bg-border"}`}
                  style={{ width: `${100 - awayPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
