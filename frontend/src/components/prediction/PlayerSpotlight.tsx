import { useState } from "react";
import { Info, Shield, Sparkles, Trophy, Users } from "lucide-react";
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
        ].map((side) => (
          <div key={side.label} className="flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TeamLogo abbr={side.label} name={side.name} size={18} />
                <h5 className="text-xs font-black uppercase tracking-wider" style={{ color: side.color }}>
                  {side.label} Projections
                </h5>
              </div>
              <span className="text-[9px] font-bold text-slate-400 uppercase">
                {side.players?.length || 0} Aktif Oyuncu
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200/80 shadow-2xs text-xs bg-white flex-1">
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
                  {side.players?.map((p: PlayerMatchupData) => (
                    <tr 
                      key={p.player_id} 
                      onClick={() => handleOpenPlayerModal(p, side.isHome)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >

                      <td className="px-3 py-2 font-bold text-slate-800">
                        <div className="flex items-center gap-2">
                          <PlayerPhoto playerId={p.player_id} name={p.player_name} size={22} />
                          <span className="group-hover:text-indigo-600 transition-colors">{p.player_name}</span>
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
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

