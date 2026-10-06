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
    { player: topScorer, stat: topScorer?.predicted_pts, label: "Top Scorer", unit: "PTS", icon: <Trophy size={14} /> },
    { player: topRebounder, stat: topRebounder?.predicted_reb, label: "Top Rebounder", unit: "REB", icon: <Shield size={14} /> },
    { player: topAssister, stat: topAssister?.predicted_ast, label: "Top Assister", unit: "AST", icon: <Users size={14} /> },
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
      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-violet-500" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Player Projection Spotlight & Matchup Intelligence
          </p>
        </div>
        <span className="text-[10px] font-bold text-slate-400">
          Detaylı analiz & son maçlar raporu için oyuncu satırına veya <Info size={11} className="inline text-indigo-600" /> ikonuna tıklayın
        </span>
      </div>

      {/* ── TOP 3 SPOTLIGHT CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {spotlights.map((s, i) => (
          <div 
            key={i} 
            className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-slate-800/90 p-4 shadow-[0_8px_25px_rgba(0,0,0,0.25)] animate-fade-in-up stagger-${i + 2} cursor-pointer group hover:border-slate-700 transition-all`}
            style={{ borderTop: `3px solid ${s.player?.teamColor || "#4f46e5"}` }}
            onClick={() => s.player && handleOpenPlayerModal(s.player, s.player.isHome)}
            title="Oyuncu Maç Raporunu Aç"
          >
            {/* Subtle team glow in background */}
            <div
              className="pointer-events-none absolute -bottom-10 -right-10 w-32 h-32 rounded-full blur-2xl opacity-15"
              style={{ backgroundColor: s.player?.teamColor }}
            />

            <div className="relative z-10 flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <span style={{ color: s.player?.teamColor }}>{s.icon}</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-white/50">{s.label}</span>
              </div>
              <span className="w-5 h-5 rounded-full bg-white/10 group-hover:bg-white/20 flex items-center justify-center text-white/80 transition-colors">
                <Info size={11} />
              </span>
            </div>

            <div className="relative z-10 flex items-center justify-between gap-3">
              <div>
                <p className="text-3xl font-black font-mono text-white leading-none tracking-tight">
                  {s.stat?.toFixed(1)}
                  <span className="text-xs font-bold text-white/40 ml-1 font-sans">{s.unit}</span>
                </p>
                <p className="text-xs font-bold text-white/90 mt-2 leading-tight group-hover:text-indigo-400 transition-colors">
                  {s.player?.player_name}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span
                    className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider font-mono"
                    style={{ backgroundColor: `${s.player?.teamColor}25`, color: s.player?.teamColor }}
                  >
                    {s.player?.teamAbbr}
                  </span>
                  <span className="text-[9px] text-white/40 font-bold uppercase">{s.player?.position_group}</span>
                  {s.player?.status === "OUT" && (
                    <span className="text-[8px] font-black uppercase px-1 py-0.2 rounded bg-rose-500/30 text-rose-300 border border-rose-500/40">
                      OUT
                    </span>
                  )}
                  {s.player?.status === "RESTRICTED" && (
                    <span className="text-[8px] font-black uppercase px-1 py-0.2 rounded bg-amber-500/30 text-amber-300 border border-amber-500/40">
                      RESTR.
                    </span>
                  )}
                </div>
              </div>

              {s.player && (
                <div className="shrink-0 relative">
                  <PlayerPhoto
                    playerId={s.player.player_id}
                    name={s.player.player_name}
                    size={46}
                    className="rounded-full ring-2 ring-slate-800 group-hover:scale-105 transition-transform"
                    style={{ borderColor: `${s.player.teamColor}55` }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>


      {/* ── HOME & AWAY PROJECTIONS TABLES ── */}
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
                  <h5 className="text-xs font-black uppercase tracking-wider" style={{ color: side.color }}>
                    {side.label} Projections
                  </h5>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full uppercase">
                    {activePlayers.length} Rotasyon Oyuncusu
                  </span>
                  {dnpPlayers.length > 0 && (
                    <span className="text-[9px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
                      +{dnpPlayers.length} DNP
                    </span>
                  )}
                </div>
              </div>

              {/* Active Rotation Table */}
              <div className="overflow-hidden rounded-xl border border-slate-200/80 shadow-2xs text-xs bg-white">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="px-3 py-2.5">Oyuncu</th>
                      <th className="px-2 py-2.5 text-center">Pos</th>
                      <th className="px-2 py-2.5 text-right text-slate-800">PTS</th>
                      <th className="px-2 py-2.5 text-right">REB</th>
                      <th className="px-2 py-2.5 text-right">AST</th>
                      <th className="px-2 py-2.5 text-right text-indigo-700">PRA</th>
                      <th className="px-2.5 py-2.5 text-center w-10">İncele</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activePlayers.map((p: PlayerMatchupData) => {
                      const isOut = p.status === "OUT";
                      const isRestricted = p.status === "RESTRICTED";

                      return (
                        <tr 
                          key={p.player_id} 
                          onClick={() => handleOpenPlayerModal(p, side.isHome)}
                          className={`hover:bg-slate-50/80 transition-colors cursor-pointer group ${
                            isOut ? "bg-rose-50/40 text-slate-400" : isRestricted ? "bg-amber-50/30" : ""
                          }`}
                        >
                          <td className="px-3 py-2 font-bold text-slate-800">
                            <div className="flex items-center gap-2">
                              <PlayerPhoto playerId={p.player_id} name={p.player_name} size={22} />
                              <span className={`group-hover:text-indigo-600 transition-colors ${isOut ? "line-through text-slate-400" : ""}`}>
                                {p.player_name}
                              </span>
                              {isOut && (
                                <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                                  OUT
                                </span>
                              )}
                              {isRestricted && (
                                <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                  RESTR.
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-center text-[10px] uppercase font-semibold text-slate-400">
                            {p.position_group}
                          </td>
                          <td className="px-2 py-2 text-right font-black font-mono text-slate-900">
                            {p.predicted_pts.toFixed(1)}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold font-mono text-slate-600">
                            {p.predicted_reb.toFixed(1)}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold font-mono text-slate-600">
                            {p.predicted_ast.toFixed(1)}
                          </td>
                          <td className="px-2 py-2 text-right font-black font-mono text-indigo-600">
                            {p.predicted_pra.toFixed(1)}
                          </td>
                          <td className="px-2.5 py-2 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenPlayerModal(p, side.isHome);
                              }}
                              className="w-6 h-6 rounded-md bg-slate-100 group-hover:bg-indigo-50 group-hover:text-indigo-600 text-slate-400 inline-flex items-center justify-center transition-colors shadow-2xs"
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
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100/90 border border-slate-200/70 text-[11px] font-bold text-slate-600 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      Rotasyon Dışı &amp; Yedekler ({dnpPlayers.length} Oyuncu - DNP)
                    </span>
                    <div className="flex items-center gap-1 text-[10px] font-medium text-slate-400">
                      <span>{isDnpOpen ? "Gizle" : "Görüntüle"}</span>
                      {isDnpOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </div>
                  </button>

                  {isDnpOpen && (
                    <div className="mt-1.5 overflow-hidden rounded-xl border border-slate-200/60 bg-slate-50/40 text-xs">
                      <table className="w-full">
                        <tbody className="divide-y divide-slate-100/80">
                          {dnpPlayers.map((p: PlayerMatchupData) => (
                            <tr
                              key={p.player_id}
                              onClick={() => handleOpenPlayerModal(p, side.isHome)}
                              className="hover:bg-slate-100/60 transition-colors cursor-pointer opacity-75"
                            >
                              <td className="px-3 py-2 text-slate-700">
                                <div className="flex items-center gap-2">
                                  <PlayerPhoto playerId={p.player_id} name={p.player_name} size={20} />
                                  <span className="font-semibold text-slate-600">{p.player_name}</span>
                                  <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                                    DNP
                                  </span>
                                </div>
                              </td>
                              <td className="px-2 py-2 text-center text-[10px] uppercase font-semibold text-slate-400">
                                {p.position_group}
                              </td>
                              <td colSpan={4} className="px-2 py-2 text-right text-[10px] font-medium text-slate-400">
                                0.0 Dakika · Rotasyonda Değil
                              </td>
                              <td className="px-2.5 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenPlayerModal(p, side.isHome);
                                  }}
                                  className="w-5 h-5 rounded bg-slate-100 text-slate-400 hover:text-indigo-600 inline-flex items-center justify-center transition-colors"
                                  title={`${p.player_name} - Oyuncu Bilgisi`}
                                >
                                  <Info size={11} />
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


      {/* ── MODAL COMPONENT ── */}
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

