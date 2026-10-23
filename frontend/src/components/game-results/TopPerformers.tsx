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

  // 1. Extract category leaders
  const topScorer = topGame[0];
  const ptsLeaderPlayer = topScorer ?? (leaders?.points ? {
    PLAYER_NAME: leaders.points.player_name || leaders.points.n,
    PLAYER_ID: leaders.points.player_id ? Number(leaders.points.player_id) : 0,
    PTS: Number(leaders.points.value) || 0,
  } : null);

  const topRebounder = [...topGame].sort((a, b) => (Number(b.REB ?? b.reb) || 0) - (Number(a.REB ?? a.reb) || 0))[0];
  const rebLeaderPlayer = topRebounder ?? (leaders?.rebounds ? {
    PLAYER_NAME: leaders.rebounds.player_name || leaders.rebounds.n,
    PLAYER_ID: leaders.rebounds.player_id ? Number(leaders.rebounds.player_id) : 0,
    REB: Number(leaders.rebounds.value) || 0,
  } : null);

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

  // 2. Extract unique player IDs from trio leaders so "Öne Çıkan Diğer Performanslar" doesn't duplicate them
  const leaderPlayerIds = new Set(
    trioLeaders.map((item) => Number(item.player?.PLAYER_ID ?? item.player?.player_id ?? 0)).filter((id) => id > 0)
  );

  // Other standout contributors (excluding players already featured as #1 in category leader cards)
  const distinctContributors = topGame.filter((p) => {
    const pid = Number(p.PLAYER_ID ?? p.player_id ?? 0);
    return !leaderPlayerIds.has(pid);
  }).slice(0, 4);

  // If after filtering we have fewer than 3, fallback to topGame slice
  const contributors = distinctContributors.length >= 2 ? distinctContributors : topGame.slice(1, 5);

  return (
    <section className="rounded border border-border bg-background-primary p-4 sm:p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Maçın Liderleri & Öne Çıkanlar</h3>
          <p className="mt-0.5 text-xs text-text-secondary">Kategori liderleri ve bireysel performans istatistikleri</p>
        </div>
        {topGame.length > 0 && (
          <span className="rounded border border-border bg-background-tertiary px-2 py-0.5 text-xs font-medium tabular-nums text-text-secondary">
            {topGame.length} Oyuncu
          </span>
        )}
      </div>

      {/* Trio Category Leaders */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {trioLeaders.map((item) => {
          const p = item.player;
          const name = p?.PLAYER_NAME ?? p?.player_name ?? "—";
          const pid = p?.PLAYER_ID ?? p?.player_id ?? 0;
          const team = p?.TEAM_ABBREVIATION ?? p?.team_abbreviation;
          const min = p?.MIN ?? p?.min;
          const pts = p?.PTS ?? p?.pts ?? 0;
          const reb = p?.REB ?? p?.reb ?? 0;
          const ast = p?.AST ?? p?.ast ?? 0;

          return (
            <div
              key={item.category}
              className="rounded border border-border bg-background-tertiary/40 p-3 flex flex-col justify-between transition-colors hover:border-border-focus"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                    {item.category}
                  </span>
                  {team && (
                    <span className="rounded border border-border bg-background-primary px-1.5 py-0.5 text-[10px] font-semibold text-text-secondary">
                      {team}
                    </span>
                  )}
                </div>

                <div className="mt-2.5 flex items-center gap-3">
                  <PlayerPhoto playerId={pid} name={name} size={42} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-text-primary" title={name}>
                      {name}
                    </p>
                    <p className="text-[11px] text-text-muted tabular-nums">
                      {min != null ? `${Math.round(Number(min))} dakika` : "—"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Big Stat Value + Full Line Summary */}
              <div className="mt-3.5 pt-2.5 border-t border-border flex items-baseline justify-between">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold tabular-nums text-text-primary leading-none">
                    {item.val}
                  </span>
                  <span className="text-xs font-semibold text-text-secondary">
                    {item.statKey}
                  </span>
                </div>
                <span className="text-xs font-medium tabular-nums text-text-muted">
                  {pts}p · {reb}r · {ast}a
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Other Standout Contributors */}
      {contributors.length > 0 && (
        <div className="mt-5 pt-4 border-t border-border">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-3">
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
                  className="flex items-center gap-3 rounded border border-border bg-background-primary px-3 py-2.5 transition-colors hover:border-border-focus"
                >
                  <PlayerPhoto playerId={pid} name={name} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-xs font-semibold text-text-primary">{name}</p>
                      {team && (
                        <span className="text-[10px] font-semibold text-text-muted">
                          {team}
                        </span>
                      )}
                    </div>
                    {min != null && (
                      <p className="text-[11px] tabular-nums text-text-muted">
                        {Math.round(Number(min))} dk
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 tabular-nums">
                    <span className="text-xs font-semibold text-text-primary">
                      {pts} <span className="text-[10px] font-normal text-text-muted">PTS</span>
                    </span>
                    <span className="text-text-muted text-[10px]">·</span>
                    <span className="text-xs font-medium text-text-secondary">
                      {reb} <span className="text-[10px] font-normal text-text-muted">REB</span>
                    </span>
                    <span className="text-text-muted text-[10px]">·</span>
                    <span className="text-xs font-medium text-text-secondary">
                      {ast} <span className="text-[10px] font-normal text-text-muted">AST</span>
                    </span>
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
