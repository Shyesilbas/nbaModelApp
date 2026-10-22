import PlayerPhoto from "../PlayerPhoto";
import type { TeamLeader } from "../../types/gameFeed";

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

export function TopPerformers({
  topGame,
  leaders,
}: {
  topGame: TopPerformerRow[];
  leaders?: { points?: TeamLeader | null; rebounds?: TeamLeader | null; assists?: TeamLeader | null } | null;
}) {
  if (topGame.length === 0 && !leaders) return null;

  // Extract Top Scorer (PTS)
  const topScorer = topGame[0];
  const ptsLeaderPlayer = topScorer ?? (leaders?.points ? {
    PLAYER_NAME: leaders.points.player_name || leaders.points.n,
    PLAYER_ID: leaders.points.player_id ? Number(leaders.points.player_id) : 0,
    PTS: Number(leaders.points.value) || 0,
  } : null);

  // Extract Top Rebounder (REB)
  const topRebounder = [...topGame].sort((a, b) => (Number(b.REB ?? b.reb) || 0) - (Number(a.REB ?? a.reb) || 0))[0];
  const rebLeaderPlayer = topRebounder ?? (leaders?.rebounds ? {
    PLAYER_NAME: leaders.rebounds.player_name || leaders.rebounds.n,
    PLAYER_ID: leaders.rebounds.player_id ? Number(leaders.rebounds.player_id) : 0,
    REB: Number(leaders.rebounds.value) || 0,
  } : null);

  // Extract Top Playmaker (AST)
  const topPlaymaker = [...topGame].sort((a, b) => (Number(b.AST ?? b.ast) || 0) - (Number(a.AST ?? a.ast) || 0))[0];
  const astLeaderPlayer = topPlaymaker ?? (leaders?.assists ? {
    PLAYER_NAME: leaders.assists.player_name || leaders.assists.n,
    PLAYER_ID: leaders.assists.player_id ? Number(leaders.assists.player_id) : 0,
    AST: Number(leaders.assists.value) || 0,
  } : null);

  const trioLeaders = [
    {
      category: "Sayı Lideri",
      statKey: "PTS",
      val: ptsLeaderPlayer?.PTS ?? ptsLeaderPlayer?.pts ?? (leaders?.points?.value ?? "-"),
      player: ptsLeaderPlayer,
    },
    {
      category: "Ribaund Lideri",
      statKey: "REB",
      val: rebLeaderPlayer?.REB ?? rebLeaderPlayer?.reb ?? (leaders?.rebounds?.value ?? "-"),
      player: rebLeaderPlayer,
    },
    {
      category: "Asist Lideri",
      statKey: "AST",
      val: astLeaderPlayer?.AST ?? astLeaderPlayer?.ast ?? (leaders?.assists?.value ?? "-"),
      player: astLeaderPlayer,
    },
  ];

  // Up to 4 other top contributors from topGame
  const contributors = topGame.slice(0, 4);

  return (
    <section className="rounded border border-border bg-background-primary p-4 sm:p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between border-b border-border-light pb-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Maçın Liderleri & Öne Çıkanlar</h3>
          <p className="mt-0.5 text-xs text-text-secondary">Kategori liderleri ve öne çıkan bireysel performanslar</p>
        </div>
        {topGame.length > 0 && (
          <span className="rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
            {topGame.length} Oyuncu
          </span>
        )}
      </div>

      {/* Trio Category Leaders */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {trioLeaders.map((item) => {
          const p = item.player;
          const name = p?.PLAYER_NAME ?? p?.player_name ?? "Bilinmiyor";
          const pid = p?.PLAYER_ID ?? p?.player_id ?? 0;
          const team = p?.TEAM_ABBREVIATION ?? p?.team_abbreviation;
          const min = p?.MIN ?? p?.min;
          const pts = p?.PTS ?? p?.pts ?? 0;
          const reb = p?.REB ?? p?.reb ?? 0;
          const ast = p?.AST ?? p?.ast ?? 0;

          return (
            <div
              key={item.category}
              className="rounded border border-border bg-background-tertiary/40 p-3.5 flex items-center justify-between gap-3 transition-colors hover:border-card-border-hover"
            >
              <div className="min-w-0 flex-1">
                <span className="rounded-sm border border-border bg-background-primary px-1.5 py-0.5 text-xs font-medium text-text-secondary">
                  {item.category}
                </span>
                <div className="mt-2.5 flex items-center gap-2.5">
                  <PlayerPhoto playerId={pid} name={name} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-text-primary" title={name}>
                      {name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                      {team && (
                        <span className="rounded-sm border border-border bg-background-primary px-1.5 py-0.5 text-xs text-text-secondary">
                          {team}
                        </span>
                      )}
                      {min != null && (
                        <span className="text-xs tabular-nums text-text-muted">
                          {Math.round(Number(min))} dk
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-xs tabular-nums text-text-muted">
                  {pts} PTS · {reb} REB · {ast} AST
                </p>
              </div>

              {/* Big Stat Box */}
              <div className="shrink-0 text-right border-l border-border-light pl-3">
                <p className="text-2xl font-semibold tabular-nums text-text-primary leading-none">
                  {item.val}
                </p>
                <p className="mt-1 text-xs font-medium text-text-muted text-center">
                  {item.statKey}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Other Key Contributors */}
      {contributors.length > 0 && (
        <div className="mt-4 border-t border-border-light pt-4">
          <h4 className="text-xs font-semibold text-text-secondary mb-3">
            Öne Çıkan Diğer Performanslar
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {contributors.map((p, idx) => {
              const name = p.PLAYER_NAME ?? p.player_name ?? "—";
              const team = p.TEAM_ABBREVIATION ?? p.team_abbreviation ?? "";
              const pid = p.PLAYER_ID ?? p.player_id ?? 0;
              const min = p.MIN ?? p.min;
              const pts = p.PTS ?? p.pts ?? 0;
              const reb = p.REB ?? p.reb ?? 0;
              const ast = p.AST ?? p.ast ?? 0;

              return (
                <div
                  key={`${pid}-${team}-${idx}`}
                  className="flex items-center gap-3 rounded border border-border bg-background-primary p-2.5 sm:p-3 transition-colors hover:border-card-border-hover"
                >
                  <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-text-muted">
                    #{idx + 1}
                  </span>
                  <PlayerPhoto playerId={pid} name={name} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-text-primary">{name}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {team && (
                        <span className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 text-xs text-text-secondary">
                          {team}
                        </span>
                      )}
                      {min != null && (
                        <span className="text-xs tabular-nums text-text-muted">
                          {Math.round(Number(min))} dk
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-2.5 border-l border-border-light pl-2.5">
                    <div className="text-right">
                      <span className="text-xs font-semibold tabular-nums text-text-primary">{pts}</span>
                      <span className="ml-0.5 text-xs text-text-muted">PTS</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs tabular-nums text-text-secondary">{reb}</span>
                      <span className="ml-0.5 text-xs text-text-muted">REB</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs tabular-nums text-text-secondary">{ast}</span>
                      <span className="ml-0.5 text-xs text-text-muted">AST</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
