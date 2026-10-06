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
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[#f5f7fb] shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="relative overflow-hidden bg-[#101827] px-5 py-6 text-white sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-10 -top-20 h-56 w-56 rounded-full border-[28px] border-white/[0.035]" />
        <div className="pointer-events-none absolute right-24 -top-24 h-56 w-56 rounded-full border border-white/[0.06]" />
        <div className="relative flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">Game spotlight</p>
            <h3 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Top Performers</h3>
            <p className="mt-1.5 text-sm text-slate-400">The players who shaped the game</p>
          </div>
          <div className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-right backdrop-blur-sm">
            <span className="block text-xl font-black leading-none">{String(stars.length).padStart(2, "0")}</span>
            <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">Players</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 p-4 sm:p-5 xl:grid-cols-2">
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
                "relative overflow-hidden rounded-2xl border bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.09)]",
                isTopScorer ? "border-slate-200 shadow-sm xl:col-span-2" : "border-slate-200/80",
              ].join(" ")}
              style={{
                borderColor: isTopScorer ? `${theme.primary}40` : undefined,
              }}
            >
              <div className="flex min-h-[92px] items-center gap-3 p-4 sm:gap-4 sm:p-5">
                <span className="w-7 shrink-0 font-mono text-xs font-bold text-slate-300">{String(idx + 1).padStart(2, "0")}</span>
                <PlayerPhoto 
                  playerId={pid} 
                  name={name} 
                  size={isTopScorer ? 56 : 46} 
                  style={{
                    borderColor: theme.primary,
                    boxShadow: `0 0 0 1.5px ${theme.primary}25`,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-bold leading-tight text-slate-900 sm:text-base">{name}</p>
                    {isTopScorer && <span className="rounded-full px-2 py-1 text-[8px] font-black uppercase tracking-wider text-white" style={{ backgroundColor: theme.primary }}>Game high</span>}
                  </div>
                  <span 
                    className="mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider"
                    style={{ backgroundColor: `${theme.primary}12`, color: theme.primary }}
                  >
                    {team}
                  </span>
                </div>
                <div className="ml-auto flex items-center gap-3 border-l border-slate-100 pl-3 sm:gap-5 sm:pl-5">
                  <div className="text-center">
                    <p className={isTopScorer ? "text-3xl font-black leading-none tracking-tight sm:text-4xl" : "text-xl font-extrabold leading-none"} style={{ color: theme.primary }}>{pts ?? "-"}</p>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">PTS</p>
                  </div>
                  <div className="hidden text-center sm:block">
                    <p className="text-lg font-extrabold leading-none text-slate-800">{reb != null ? Math.round(reb) : "-"}</p>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">REB</p>
                  </div>
                  <div className="hidden text-center sm:block">
                    <p className="text-lg font-extrabold leading-none text-slate-800">{ast != null ? Math.round(ast) : "-"}</p>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">AST</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 text-[10px] font-semibold text-slate-400 sm:hidden">
                <span>{reb != null ? Math.round(reb) : "-"} REB</span><span>{ast != null ? Math.round(ast) : "-"} AST</span>
                {min != null && <span>{Math.round(min)} MIN</span>}
              </div>
              {min != null && <span className="sr-only">{Math.round(min)} minutes played</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
