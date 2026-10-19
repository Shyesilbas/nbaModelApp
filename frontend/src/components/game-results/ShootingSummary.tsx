import type { TeamBoxScore } from "./types";
import { fmtPair, fmtPct } from "./utils";

export function ShootingSummary({ home, away }: { home: TeamBoxScore | null; away: TeamBoxScore | null }) {
  if (!home && !away) return null;

  const hasFG = (home?.FGM != null || home?.FGA != null) || (away?.FGM != null || away?.FGA != null);
  const has3PT = (home?.FG3M != null || home?.FG3A != null) || (away?.FG3M != null || away?.FG3A != null);
  const hasFT = (home?.FTM != null || home?.FTA != null) || (away?.FTM != null || away?.FTA != null);

  if (!hasFG && !has3PT && !hasFT) return null;

  const rows = [
    {
      key: "fg",
      label: "Field Goals",
      homeVal: fmtPair(home?.FGM, home?.FGA),
      awayVal: fmtPair(away?.FGM, away?.FGA),
      homePct: fmtPct(home?.FG_PCT ?? null),
      awayPct: fmtPct(away?.FG_PCT ?? null),
      show: hasFG,
    },
    {
      key: "3pt",
      label: "Three Pointers",
      homeVal: fmtPair(home?.FG3M, home?.FG3A),
      awayVal: fmtPair(away?.FG3M, away?.FG3A),
      homePct: fmtPct(home?.FG3_PCT ?? null),
      awayPct: fmtPct(away?.FG3_PCT ?? null),
      show: has3PT,
    },
    {
      key: "ft",
      label: "Free Throws",
      homeVal: fmtPair(home?.FTM, home?.FTA),
      awayVal: fmtPair(away?.FTM, away?.FTA),
      homePct: fmtPct(home?.FT_PCT ?? null),
      awayPct: fmtPct(away?.FT_PCT ?? null),
      show: hasFT,
    },
  ].filter((r) => r.show);

  if (rows.length === 0) return null;

  return (
    <div className="rounded border border-border bg-background-primary p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Shooting efficiency</h3>
          <p className="mt-0.5 text-xs text-text-secondary">Made / attempted and percentages</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold">
          {home && (
            <span className="rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
              {home.TEAM_ABBREVIATION}
            </span>
          )}
          {away && (
            <span className="rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
              {away.TEAM_ABBREVIATION}
            </span>
          )}
        </div>
      </div>
      <div className="divide-y divide-border-light">
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="text-left">
              <p className="text-xs font-semibold tabular-nums text-text-primary">{row.homeVal}</p>
              <p className="text-xs tabular-nums text-text-secondary">{row.homePct}</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-text-muted">{row.label}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold tabular-nums text-text-primary">{row.awayVal}</p>
              <p className="text-xs tabular-nums text-text-secondary">{row.awayPct}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
