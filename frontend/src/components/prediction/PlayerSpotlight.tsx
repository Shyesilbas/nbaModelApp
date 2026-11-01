import { useState } from "react";
import type React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import TeamLogo from "../TeamLogo";
import PlayerPhoto from "../PlayerPhoto";
import { PlayerMatchupModal, type PlayerMatchupData } from "./PlayerMatchupModal";
import type { TeamInfo } from "./types";
import { useLanguage } from "../../context/LanguageContext";

interface PlayerSpotlightProps {
  players: { home_players?: PlayerMatchupData[]; away_players?: PlayerMatchupData[] };
  homeInfo: TeamInfo;
  awayInfo: TeamInfo;
  gameDate?: string;
  season?: string;
}

export function PlayerSpotlight({ players, homeInfo, awayInfo, gameDate, season = "2025-26" }: PlayerSpotlightProps) {
  const { t, language } = useLanguage();
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

  const tr = language === "tr";

  const statusTag = (p: PlayerMatchupData) => {
    if (p.status === "OUT") return { text: "OUT", cls: "text-status-error" };
    if (p.status === "RESTRICTED") return { text: tr ? "Kısıtlı" : "Restricted", cls: "text-status-warning" };
    if (p.status === "DOUBTFUL") return { text: tr ? "Şüpheli" : "Doubtful", cls: "text-status-warning" };
    if (p.status === "QUESTIONABLE") return { text: tr ? "Belirsiz" : "Questionable", cls: "text-status-warning" };
    return null;
  };

  const openRow = (p: PlayerMatchupData, isHome: boolean) => ({
    role: "button" as const,
    tabIndex: 0,
    onClick: () => handleOpenPlayerModal(p, isHome),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleOpenPlayerModal(p, isHome);
      }
    },
    title: t.predictions.viewPlayerReport,
  });

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-text-primary">{tr ? "Oyuncu projeksiyonları" : "Player projections"}</h4>
        <p className="mt-0.5 text-xs text-text-secondary">
          {tr ? "Detaylı analiz için oyuncu satırına tıklayın." : "Click a player row for the detailed analysis."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {[
          { label: awayInfo.abbr, name: awayInfo.name, players: players.away_players, isHome: false },
          { label: homeInfo.abbr, name: homeInfo.name, players: players.home_players, isHome: true },
        ].map((side) => {
          const activePlayers = side.players?.filter((p) => p.status !== "DNP" && p.status !== "OUT" && (p.predicted_min ?? p.predicted_pts ?? 0) > 0) || [];
          const outPlayers = side.players?.filter((p) => p.status === "OUT") || [];
          const tablePlayers = [...activePlayers, ...outPlayers];
          const dnpPlayers = side.players?.filter((p) => p.status === "DNP" || ((p.predicted_min ?? 0) <= 0 && p.status !== "OUT")) || [];
          const isDnpOpen = !!expandedDnp[side.label];
          const summary = [
            `${activePlayers.length} ${tr ? "rotasyon oyuncusu" : "in rotation"}`,
            outPlayers.length > 0 ? `${outPlayers.length} OUT` : null,
          ].filter(Boolean).join(" · ");

          return (
            <section key={side.label} className="min-w-0">
              <div className="mb-2 flex items-center gap-2.5">
                <TeamLogo abbr={side.label} name={side.name} size={28} />
                <div>
                  <h5 className="text-sm font-semibold text-text-primary">{side.name}</h5>
                  <p className="text-xs text-text-muted">{summary}</p>
                </div>
              </div>

              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full min-w-[360px] text-xs">
                  <thead className="border-b border-border bg-background-tertiary text-text-secondary">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-medium">{t.common.player}</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">PTS</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">REB</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">AST</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">PRA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light tabular-nums">
                    {tablePlayers.map((p: PlayerMatchupData) => {
                      const isOut = p.status === "OUT";
                      const tag = statusTag(p);
                      const stat = (v: number) => (isOut ? "–" : v.toFixed(1));
                      return (
                        <tr
                          key={p.player_id}
                          {...openRow(p, side.isHome)}
                          className="group cursor-pointer transition-colors hover:bg-background-tertiary/40 focus-visible:bg-background-tertiary/40 focus-visible:outline-none"
                        >
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2.5">
                              <PlayerPhoto playerId={p.player_id} name={p.player_name} size={32} className="shrink-0 rounded-full border border-border" />
                              <div className="min-w-0">
                                <p className={`truncate text-sm font-semibold transition-colors group-hover:text-primary ${isOut ? "text-text-secondary" : "text-text-primary"}`}>
                                  {p.player_name}
                                </p>
                                <p className="text-xs text-text-muted">
                                  {p.position_group}
                                  {tag && <span className={`font-medium ${tag.cls}`}> · {tag.text}</span>}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className={`px-2 py-2 text-right ${isOut ? "text-text-muted" : "font-semibold text-text-primary"}`}>{stat(p.predicted_pts)}</td>
                          <td className="px-2 py-2 text-right text-text-secondary">{stat(p.predicted_reb)}</td>
                          <td className="px-2 py-2 text-right text-text-secondary">{stat(p.predicted_ast)}</td>
                          <td className={`px-3 py-2 text-right ${isOut ? "text-text-muted" : "font-semibold text-text-primary"}`}>{stat(p.predicted_pra)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {dnpPlayers.length > 0 && (
                <div className="mt-2">
                  <button
                    type="button"
                    aria-expanded={isDnpOpen}
                    onClick={() => setExpandedDnp((prev) => ({ ...prev, [side.label]: !prev[side.label] }))}
                    className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary cursor-pointer"
                  >
                    {isDnpOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    {tr ? `Rotasyon dışı (${dnpPlayers.length})` : `Out of rotation (${dnpPlayers.length})`}
                  </button>
                  {isDnpOpen && (
                    <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                      {dnpPlayers.map((p: PlayerMatchupData) => (
                        <li key={p.player_id}>
                          <button
                            type="button"
                            onClick={() => handleOpenPlayerModal(p, side.isHome)}
                            className="flex w-full items-center gap-2 py-1 text-left text-xs text-text-secondary transition-colors hover:text-text-primary cursor-pointer"
                          >
                            <PlayerPhoto playerId={p.player_id} name={p.player_name} size={22} className="shrink-0 rounded-full border border-border" />
                            <span className="truncate">{p.player_name}</span>
                            <span className="ml-auto text-text-muted">{p.position_group}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
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
