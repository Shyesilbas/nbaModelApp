import PlayerPhoto from "../PlayerPhoto";

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
    <section className="rounded border border-border bg-background-primary p-4 sm:p-5">
      <div className="mb-4 flex items-end justify-between border-b border-border-light pb-3">
        <div>
          <h3 className="text-base font-semibold text-text-primary">Top performers</h3>
          <p className="mt-0.5 text-xs text-text-secondary">Key contributors and game impact</p>
        </div>
        <div className="text-right">
          <span className="text-xs font-semibold tabular-nums text-text-primary">{stars.length}</span>
          <span className="ml-1 text-xs text-text-secondary">Players</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {stars.map((p: TopPerformerRow, idx: number) => {
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
              className="flex items-center gap-3 rounded border border-border bg-background-primary p-3 sm:p-4 transition-colors hover:border-card-border-hover"
            >
              <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-text-muted">{String(idx + 1).padStart(2, "0")}</span>
              <PlayerPhoto 
                playerId={pid} 
                name={name} 
                size={40} 
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-xs font-semibold text-text-primary sm:text-sm">{name}</p>
                  {isTopScorer && (
                    <span className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 text-xs font-medium text-text-primary">
                      Game high
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 text-xs font-medium text-text-secondary">
                    {team}
                  </span>
                  {min != null && (
                    <span className="text-xs tabular-nums text-text-muted">{Math.round(min)} min</span>
                  )}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-3 border-l border-border-light pl-3 sm:gap-4 sm:pl-4">
                <div className="text-center">
                  <p className="text-base font-semibold tabular-nums text-text-primary sm:text-lg">{pts ?? "-"}</p>
                  <p className="text-xs font-medium text-text-muted">PTS</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold tabular-nums text-text-secondary sm:text-sm">{reb != null ? Math.round(reb) : "-"}</p>
                  <p className="text-xs font-medium text-text-muted">REB</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold tabular-nums text-text-secondary sm:text-sm">{ast != null ? Math.round(ast) : "-"}</p>
                  <p className="text-xs font-medium text-text-muted">AST</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
