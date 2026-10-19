import { useState } from "react";
import { ChevronDown, ChevronUp, Info, Shield, Sparkles, Trophy, Users } from "lucide-react";
import TeamLogo from "../TeamLogo";
import PlayerPhoto from "../PlayerPhoto";
import { PlayerMatchupModal, type PlayerMatchupData } from "./PlayerMatchupModal";
import type { TeamInfo } from "./types";

interface PlayerSpotlightProps {
  players: { home_players?: PlayerMatchupData[]; away_players?: PlayerMatchupData[] };
  homeInfo: TeamInfo;
  awayInfo: TeamInfo;
  gameDate?: string;
  season?: string;
}

export function PlayerSpotlight({ players, homeInfo, awayInfo, gameDate, season = "2025-26" }: PlayerSpotlightProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<{
    player: PlayerMatchupData;
    team: TeamInfo;
    opponent: TeamInfo;
  } | null>(null);
  const [expandedDnp, setExpandedDnp] = useState<Record<string, boolean>>({});

  const all = [
    ...(players.home_players?.map((p) => ({ ...p, teamAbbr: homeInfo.abbr, teamColor: homeInfo.color, isHome: true })) ?? []),
    ...(players.away_players?.map((p) => ({ ...p, teamAbbr: awayInfo.abbr, teamColor: awayInfo.color, isHome: false })) ?? []),
  ];

  if (all.length === 0) return null;

  const topScorer = [...all].sort((a, b) => b.predicted_pts - a.predicted_pts)[0];
  const topRebounder = [...all].sort((a, b) => b.predicted_reb - a.predicted_reb)[0];
  const topAssister = [...all].sort((a, b) => b.predicted_ast - a.predicted_ast)[0];

  const spotlights = [
    { player: topScorer, stat: topScorer?.predicted_pts, label: "En Skorer", unit: "PTS", icon: <Trophy size={14} /> },
    { player: topRebounder, stat: topRebounder?.predicted_reb, label: "Ribaund Lideri", unit: "REB", icon: <Shield size={14} /> },
    { player: topAssister, stat: topAssister?.predicted_ast, label: "Asist Lideri", unit: "AST", icon: <Users size={14} /> },
  ];

  const handleOpenPlayerModal = (p: PlayerMatchupData, isHome: boolean) => {
    setSelectedPlayer({
      player: {
        player_id: p.player_id,
        player_name: p.player_name,
        position_group: p.position_group,
        predicted_pts: p.predicted_pts,
        predicted_reb: p.predicted_reb,
        predicted_ast: p.predicted_ast,
        predicted_pra: p.predicted_pra,
        raw_pts: p.raw_pts,
        scale_factor: p.scale_factor,
        status: p.status,
      },
      team: isHome ? homeInfo : awayInfo,
      opponent: isHome ? awayInfo : homeInfo,
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-primary" />
          <h4 className="text-sm font-semibold text-text-primary">
            Oyuncu Tahmin Projeksiyonları ve Liderler
          </h4>
        </div>
        <span className="text-xs text-text-secondary">
          Detaylı analiz için oyuncu satırına veya bilgi ikonuna tıklayın
        </span>
      </div>

      {/* Top 3 Spotlight Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {spotlights.map((s, i) => (
          <div
            key={i}
            onClick={() => s.player && handleOpenPlayerModal(s.player, s.player.isHome)}
            title="Oyuncu Maç Raporunu Aç"
            className="bg-background-primary border border-border rounded p-4 group hover:border-card-border-hover transition-colors cursor-pointer flex flex-col justify-between gap-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-text-secondary">
                <span>{s.icon}</span>
                <span className="text-xs font-medium text-text-secondary">{s.label}</span>
              </div>
              <span className="w-5 h-5 rounded-full bg-background-secondary flex items-center justify-center text-text-secondary group-hover:text-text-primary transition-colors">
                <Info size={12} />
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-2xl sm:text-3xl font-semibold tabular-nums text-text-primary leading-none">
                  {s.stat?.toFixed(1)}
                  <span className="text-xs font-normal text-text-secondary ml-1">{s.unit}</span>
                </p>
                <p className="text-sm font-semibold text-text-primary mt-2 leading-tight group-hover:text-primary transition-colors">
                  {s.player?.player_name}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-xs font-medium px-1.5 py-0.5 rounded-sm bg-background-secondary border border-border text-text-secondary uppercase">
                    {s.player?.teamAbbr}
                  </span>
                  <span className="text-xs text-text-secondary uppercase">{s.player?.position_group}</span>
                  {s.player?.status === "OUT" && (
                    <span className="text-xs font-medium px-1.5 py-0.2 rounded-sm bg-status-error/10 text-status-error uppercase">
                      OUT
                    </span>
                  )}
                  {s.player?.status === "RESTRICTED" && (
                    <span className="text-xs font-medium px-1.5 py-0.2 rounded-sm bg-status-warning/10 text-status-warning uppercase">
                      Kısıtlı
                    </span>
                  )}
                </div>
              </div>

              {s.player && (
                <div className="shrink-0">
                  <PlayerPhoto
                    playerId={s.player.player_id}
                    name={s.player.player_name}
                    size={46}
                    className="rounded-full border border-border"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Home & Away Projections Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
        {[
          { label: awayInfo.abbr, name: awayInfo.name, color: awayInfo.color, players: players.away_players, isHome: false },
          { label: homeInfo.abbr, name: homeInfo.name, color: homeInfo.color, players: players.home_players, isHome: true },
        ].map((side) => {
          const activePlayers = side.players?.filter((p) => p.status !== "DNP" && (p.predicted_min ?? p.predicted_pts ?? 0) > 0) || [];
          const dnpPlayers = side.players?.filter((p) => p.status === "DNP" || ((p.predicted_min ?? 0) <= 0 && p.status !== "OUT")) || [];
          const isDnpOpen = !!expandedDnp[side.label];

          const toggleDnp = () => {
            setExpandedDnp((prev) => ({ ...prev, [side.label]: !prev[side.label] }));
          };

          return (
            <div key={side.label} className="flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <TeamLogo abbr={side.label} name={side.name} size={18} />
                  <h5 className="text-xs font-semibold text-text-primary">
                    {side.label} Projeksiyonları
                  </h5>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-text-secondary bg-background-secondary border border-border px-2 py-0.5 rounded-sm uppercase">
                    {activePlayers.length} Rotasyon Oyuncusu
                  </span>
                  {dnpPlayers.length > 0 && (
                    <span className="text-xs font-medium text-text-secondary bg-background-secondary px-1.5 py-0.5 rounded-sm">
                      +{dnpPlayers.length} DNP
                    </span>
                  )}
                </div>
              </div>

              {/* Active Rotation Table */}
              <div className="overflow-hidden rounded border border-border bg-background-primary text-xs">
                <table className="w-full">
                  <thead className="bg-background-secondary border-b border-border text-left text-xs font-medium text-text-secondary">
                    <tr>
                      <th className="px-3 py-2.5">Oyuncu</th>
                      <th className="px-2 py-2.5 text-center">Poz</th>
                      <th className="px-2 py-2.5 text-right text-text-primary">PTS</th>
                      <th className="px-2 py-2.5 text-right">REB</th>
                      <th className="px-2 py-2.5 text-right">AST</th>
                      <th className="px-2 py-2.5 text-right text-primary">PRA</th>
                      <th className="px-2.5 py-2.5 text-center w-10">İncele</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {activePlayers.map((p: PlayerMatchupData) => {
                      const isOut = p.status === "OUT";
                      const isRestricted = p.status === "RESTRICTED";

                      return (
                        <tr
                          key={p.player_id}
                          onClick={() => handleOpenPlayerModal(p, side.isHome)}
                          className={`hover:bg-background-secondary/60 transition-colors cursor-pointer group ${
                            isOut ? "opacity-60" : ""
                          }`}
                        >
                          <td className="px-3 py-2 font-medium text-text-primary">
                            <div className="flex items-center gap-2">
                              <PlayerPhoto playerId={p.player_id} name={p.player_name} size={24} />
                              <span className={`group-hover:text-primary transition-colors ${isOut ? "line-through text-text-muted" : ""}`}>
                                {p.player_name}
                              </span>
                              {isOut && (
                                <span className="text-xs font-semibold uppercase px-1.5 py-0.2 rounded-sm bg-status-error/10 text-status-error">
                                  OUT
                                </span>
                              )}
                              {isRestricted && (
                                <span className="text-xs font-semibold uppercase px-1.5 py-0.2 rounded-sm bg-status-warning/10 text-status-warning">
                                  Kısıtlı
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-center text-xs uppercase text-text-secondary">
                            {p.position_group}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold tabular-nums text-text-primary">
                            {p.predicted_pts.toFixed(1)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-text-secondary">
                            {p.predicted_reb.toFixed(1)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-text-secondary">
                            {p.predicted_ast.toFixed(1)}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold tabular-nums text-primary">
                            {p.predicted_pra.toFixed(1)}
                          </td>
                          <td className="px-2.5 py-2 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenPlayerModal(p, side.isHome);
                              }}
                              className="w-6 h-6 rounded bg-background-secondary group-hover:bg-primary/10 group-hover:text-primary text-text-secondary inline-flex items-center justify-center transition-colors cursor-pointer"
                              title={`${p.player_name} - Maç Raporu ve Son Maçlar`}
                            >
                              <Info size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* DNP Reserves Collapsible Section */}
              {dnpPlayers.length > 0 && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={toggleDnp}
                    className="w-full flex items-center justify-between px-3 py-2 rounded bg-background-secondary hover:bg-background-tertiary border border-border text-xs font-medium text-text-secondary transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-text-muted" />
                      Rotasyon Dışı ve Yedekler ({dnpPlayers.length} Oyuncu - DNP)
                    </span>
                    <div className="flex items-center gap-1 text-xs text-text-secondary">
                      <span>{isDnpOpen ? "Gizle" : "Görüntüle"}</span>
                      {isDnpOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </button>

                  {isDnpOpen && (
                    <div className="mt-1.5 overflow-hidden rounded border border-border bg-background-secondary text-xs">
                      <table className="w-full">
                        <tbody className="divide-y divide-border-light">
                          {dnpPlayers.map((p: PlayerMatchupData) => (
                            <tr
                              key={p.player_id}
                              onClick={() => handleOpenPlayerModal(p, side.isHome)}
                              className="hover:bg-background-tertiary transition-colors cursor-pointer opacity-75"
                            >
                              <td className="px-3 py-2 text-text-primary">
                                <div className="flex items-center gap-2">
                                  <PlayerPhoto playerId={p.player_id} name={p.player_name} size={22} />
                                  <span className="font-medium text-text-secondary">{p.player_name}</span>
                                  <span className="text-xs font-semibold uppercase px-1.5 py-0.2 rounded-sm bg-background-tertiary text-text-muted">
                                    DNP
                                  </span>
                                </div>
                              </td>
                              <td className="px-2 py-2 text-center text-xs uppercase text-text-secondary">
                                {p.position_group}
                              </td>
                              <td colSpan={4} className="px-2 py-2 text-right text-xs text-text-secondary">
                                0.0 Dakika · Rotasyonda Değil
                              </td>
                              <td className="px-2.5 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenPlayerModal(p, side.isHome);
                                  }}
                                  className="w-5 h-5 rounded bg-background-primary text-text-secondary hover:text-primary inline-flex items-center justify-center transition-colors cursor-pointer"
                                  title={`${p.player_name} - Oyuncu Bilgisi`}
                                >
                                  <Info size={12} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {selectedPlayer && (
        <PlayerMatchupModal
          player={selectedPlayer.player}
          teamInfo={selectedPlayer.team}
          opponentInfo={selectedPlayer.opponent}
          gameDate={gameDate}
          season={season}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}
