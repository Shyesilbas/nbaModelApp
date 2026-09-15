import type { TeamBoxScore } from "./types";
import { fmtPair, fmtPct } from "./utils";
import { getTeamTheme } from "../../lib/nbaTeams";

export function ShootingSummary({ home, away }: { home: TeamBoxScore | null; away: TeamBoxScore | null }) {
  if (!home && !away) return null;

  const homeTheme = home ? getTeamTheme(home.TEAM_ABBREVIATION) : null;
  const awayTheme = away ? getTeamTheme(away.TEAM_ABBREVIATION) : null;

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
    <div className="rounded-[1.5rem] border border-slate-200/80 bg-white p-5 shadow-xs">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Shooting Efficiency</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-700">Made / Attempted - Percentage</p>
        </div>
        <div className="flex items-center gap-3 text-xs font-black uppercase tracking-wider">
          {home && homeTheme && (
            <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: `${homeTheme.primary}15`, color: homeTheme.primary }}>
              {home.TEAM_ABBREVIATION}
            </span>
          )}
          {away && awayTheme && (
            <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: `${awayTheme.primary}15`, color: awayTheme.primary }}>
              {away.TEAM_ABBREVIATION}
            </span>
          )}
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3 first:pt-0 last:pb-0">
            <div className="text-left">
              <p className="text-sm font-black text-slate-900">{row.homeVal}</p>
              <p className="text-[11px] font-black" style={{ color: homeTheme?.primary || "#1d428a" }}>{row.homePct}</p>
            </div>
            <div className="text-center">
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">{row.label}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-black text-slate-900">{row.awayVal}</p>
              <p className="text-[11px] font-black" style={{ color: awayTheme?.primary || "#c9082a" }}>{row.awayPct}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
