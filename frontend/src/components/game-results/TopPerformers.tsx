import PlayerPhoto from "../PlayerPhoto";

export function TopPerformers({ topGame }: { topGame: any[] }) {
  if (topGame.length === 0) return null;

  const stars = topGame.slice(0, 6);

  return (
    <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
      <div className="mb-4">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Top Performers</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-700">Game stars</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stars.map((p: any, idx: number) => {
          const pts = p.PTS ?? p.pts ?? null;
          const reb = p.REB ?? p.reb ?? null;
          const ast = p.AST ?? p.ast ?? null;
          const min = p.MIN ?? p.min ?? null;
          const name = p.PLAYER_NAME ?? p.player_name ?? "-";
          const team = p.TEAM_ABBREVIATION ?? p.team_abbreviation ?? "";
          const pid = p.PLAYER_ID ?? p.player_id ?? 0;
          const isTopScorer = idx === 0;

          return (
            <div
              key={`${pid}-${team}-${idx}`}
              className={[
                "relative overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5",
                isTopScorer
                  ? "border-[#1d428a]/20 bg-gradient-to-br from-[#1d428a]/5 to-white shadow-[0_8px_30px_rgba(29,66,138,0.10)]"
                  : "border-slate-200 bg-slate-50/70 shadow-sm hover:shadow-md",
              ].join(" ")}
            >
              {isTopScorer && (
                <div className="absolute right-3 top-3">
                  <span className="rounded-full bg-[#1d428a] px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white">
                    Top Scorer
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3 mb-3">
                <PlayerPhoto playerId={pid} name={name} size={40} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold leading-tight text-slate-900">{name}</p>
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">{team}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <div className="rounded-lg bg-white border border-slate-200 px-2 py-1.5 text-center shadow-sm">
                  <p className="text-base font-black leading-none text-slate-900">{pts ?? "-"}</p>
                  <p className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-slate-400">PTS</p>
                </div>
                <div className="rounded-lg bg-white border border-slate-200 px-2 py-1.5 text-center shadow-sm">
                  <p className="text-base font-black leading-none text-slate-900">{reb != null ? Math.round(reb) : "-"}</p>
                  <p className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-slate-400">REB</p>
                </div>
                <div className="rounded-lg bg-white border border-slate-200 px-2 py-1.5 text-center shadow-sm">
                  <p className="text-base font-black leading-none text-slate-900">{ast != null ? Math.round(ast) : "-"}</p>
                  <p className="mt-0.5 text-[8px] font-black uppercase tracking-widests text-slate-400">AST</p>
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
