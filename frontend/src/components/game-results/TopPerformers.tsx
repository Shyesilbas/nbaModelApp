import PlayerPhoto from "../PlayerPhoto";
import { getTeamTheme } from "../../lib/nbaTeams";

export interface TopPerformerRow {
  PTS?: number | null;
  pts?: number | null;
  REB?: number | null;
  reb?: number | null;
  AST?: number | null;
  ast?: number | null;
  MIN?: number | null;
  min?: number | null;
  PLAYER_NAME?: string;
  player_name?: string;
  TEAM_ABBREVIATION?: string;
  team_abbreviation?: string;
  PLAYER_ID?: number;
  player_id?: number;
}

export function TopPerformers({ topGame }: { topGame: TopPerformerRow[] }) {
  if (topGame.length === 0) return null;

  const stars = topGame.slice(0, 6);

  return (
    <div className="rounded-[1.5rem] border border-slate-200/80 bg-white p-5 shadow-xs">
      <div className="mb-4">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Top Performers</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-700">Game stars & key producers</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stars.map((p: TopPerformerRow, idx: number) => {
          const pts = p.PTS ?? p.pts ?? null;
          const reb = p.REB ?? p.reb ?? null;
          const ast = p.AST ?? p.ast ?? null;
          const min = p.MIN ?? p.min ?? null;
          const name = p.PLAYER_NAME ?? p.player_name ?? "-";
          const team = p.TEAM_ABBREVIATION ?? p.team_abbreviation ?? "";
          const pid = p.PLAYER_ID ?? p.player_id ?? 0;
          const isTopScorer = idx === 0;
          const theme = getTeamTheme(team);

          return (
            <div
              key={`${pid}-${team}-${idx}`}
              className={[
                "relative overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
                isTopScorer
                  ? "border-slate-300 bg-gradient-to-br from-slate-50 to-white shadow-xs"
                  : "border-slate-200/80 bg-slate-50/50 shadow-2xs",
              ].join(" ")}
              style={{
                borderColor: isTopScorer ? `${theme.primary}40` : undefined,
              }}
            >
              {/* Top Accent line */}
              <div 
                className="absolute inset-x-0 top-0 h-1"
                style={{ backgroundColor: theme.primary }}
              />

              {isTopScorer && (
                <div className="absolute right-3 top-3">
                  <span 
                    className="rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white shadow-2xs"
                    style={{ backgroundColor: theme.primary }}
                  >
                    Top Scorer
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3 mb-3 mt-1">
                <PlayerPhoto 
                  playerId={pid} 
                  name={name} 
                  size={42} 
                  style={{
                    borderColor: theme.primary,
                    boxShadow: `0 0 0 1.5px ${theme.primary}25`,
                  }}
                />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold leading-tight text-slate-900">{name}</p>
                  <span 
                    className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider"
                    style={{ backgroundColor: `${theme.primary}12`, color: theme.primary }}
                  >
                    {team}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <div className="rounded-xl bg-white border border-slate-200/70 px-2 py-1.5 text-center shadow-2xs">
                  <p className="text-base font-black leading-none text-slate-900" style={{ color: theme.primary }}>{pts ?? "-"}</p>
                  <p className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-slate-400">PTS</p>
                </div>
                <div className="rounded-xl bg-white border border-slate-200/70 px-2 py-1.5 text-center shadow-2xs">
                  <p className="text-base font-black leading-none text-slate-900">{reb != null ? Math.round(reb) : "-"}</p>
                  <p className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-slate-400">REB</p>
                </div>
                <div className="rounded-xl bg-white border border-slate-200/70 px-2 py-1.5 text-center shadow-2xs">
                  <p className="text-base font-black leading-none text-slate-900">{ast != null ? Math.round(ast) : "-"}</p>
                  <p className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-slate-400">AST</p>
                </div>
              </div>
              {min != null && (
                <p className="mt-2 text-right text-[9px] font-semibold text-slate-400">{Math.round(min)} MIN</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
