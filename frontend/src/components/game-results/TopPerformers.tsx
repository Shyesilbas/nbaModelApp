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

  // 2. Extract unique player IDs from trio leaders so "Öne çıkan diğer performanslar" doesn't duplicate them
  const leaderPlayerIds = new Set(
    trioLeaders.map((item) => Number(item.player?.PLAYER_ID ?? item.player?.player_id ?? 0)).filter((id) => id > 0)
  );

  // Other standout contributors (excluding players already featured as #1 in category leader cards)
  const distinctContributors = topGame.filter((p) => {
    const pid = Number(p.PLAYER_ID ?? p.player_id ?? 0);
    return !leaderPlayerIds.has(pid);
  }).slice(0, 4);

  // If after filtering we have fewer than 2, fallback to topGame slice
  const contributors = distinctContributors.length >= 2 ? distinctContributors : topGame.slice(1, 5);

  return (
    <div className="rounded border border-border bg-background-primary p-4 sm:p-5">
      {/* Section Header */}
      <div className="mb-4 flex items-center justify-between border-b border-border-light pb-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Maçın Liderleri & Öne Çıkanlar</h3>
          <p className="mt-0.5 text-xs text-text-secondary">Kategori liderleri ve öne çıkan bireysel istatistikler</p>
        </div>
        {topGame.length > 0 && (
          <span className="text-xs font-medium tabular-nums text-text-muted">
            {topGame.length} Oyuncu İncelendi
          </span>
        )}
      </div>

      {/* Trio Category Leaders: Clean Editorial Column Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-border-light">
        {trioLeaders.map((item, idx) => {
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
              className={`flex flex-col justify-between pt-3 md:pt-0 ${idx > 0 ? "md:pl-6" : ""}`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text-secondary">
                    {item.category}
                  </span>
                  {team && (
                    <span className="text-xs font-semibold text-text-muted">
                      {team}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <PlayerPhoto playerId={pid} name={name} size={44} className="ring-1 ring-border" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary" title={name}>
                      {name}
                    </p>
                    <p className="text-xs text-text-muted tabular-nums">
                      {min != null ? `${Math.round(Number(min))} dk oynadı` : "—"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Stat Value & Line Summary */}
              <div className="mt-4 pt-3 border-t border-border-light flex items-baseline justify-between">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-semibold tabular-nums text-text-primary leading-none">
                    {item.val}
                  </span>
                  <span className="text-xs font-semibold text-text-secondary">
                    {item.statKey}
                  </span>
                </div>
                <span className="text-xs font-medium tabular-nums text-text-muted">
                  {pts} PTS · {reb} REB · {ast} AST
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Standout Contributors: Editorial Strip / Table Style */}
      {contributors.length > 0 && (
        <div className="mt-6 pt-4 border-t border-border-light">
          <div className="mb-2.5 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-text-secondary">
              Öne çıkan diğer performanslar
            </h4>
          </div>

          <div className="divide-y divide-border-light">
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
                  className="flex items-center justify-between py-2.5 px-1 transition-colors hover:bg-background-tertiary/30"
                >
                  {/* Player & Team Info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-semibold tabular-nums text-text-muted w-4">
                      #{idx + 1}
                    </span>
                    <PlayerPhoto playerId={pid} name={name} size={34} className="ring-1 ring-border shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-semibold text-text-primary">
                          {name}
                        </span>
                        {team && (
                          <span className="text-xs font-semibold text-text-muted">
                            {team}
                          </span>
                        )}
                      </div>
                      {min != null && (
                        <span className="text-xs tabular-nums text-text-muted">
                          {Math.round(Number(min))} dk
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Clean Tabular Numbers */}
                  <div className="flex items-center gap-4 tabular-nums text-right shrink-0">
                    <div>
                      <span className="text-xs font-semibold text-text-primary">{pts}</span>
                      <span className="ml-1 text-xs font-medium text-text-muted">PTS</span>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-text-secondary">{reb}</span>
                      <span className="ml-1 text-xs font-medium text-text-muted">REB</span>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-text-secondary">{ast}</span>
                      <span className="ml-1 text-xs font-medium text-text-muted">AST</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
