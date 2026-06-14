import { Shield, Sparkles, Trophy, Users } from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { TeamInfo } from "./types";

interface PlayerSpotlightProps {
  players: { home_players?: any[]; away_players?: any[] };
  homeInfo: TeamInfo;
  awayInfo: TeamInfo;
}

export function PlayerSpotlight({ players, homeInfo, awayInfo }: PlayerSpotlightProps) {
  const all = [
    ...(players.home_players?.map((p) => ({ ...p, teamAbbr: homeInfo.abbr, teamColor: homeInfo.color })) ?? []),
    ...(players.away_players?.map((p) => ({ ...p, teamAbbr: awayInfo.abbr, teamColor: awayInfo.color })) ?? []),
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-violet-500" />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Player Projection Spotlight</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {spotlights.map((s, i) => (
          <div key={i} className={`player-spotlight-card animate-fade-in-up stagger-${i + 2}`}>
            <div className="flex items-center gap-1.5 mb-3">
              <span style={{ color: s.player?.teamColor }}>{s.icon}</span>
              <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{s.label}</span>
            </div>
            <p className="text-2xl font-black font-mono text-white leading-none">
              {s.stat?.toFixed(1)}
              <span className="text-xs font-bold text-white/40 ml-1">{s.unit}</span>
            </p>
            <p className="text-xs font-bold text-white/70 mt-2 leading-tight">{s.player?.player_name}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider"
                style={{ backgroundColor: `${s.player?.teamColor}30`, color: s.player?.teamColor }}
              >
                {s.player?.teamAbbr}
              </span>
              <span className="text-[9px] text-white/30 font-bold uppercase">{s.player?.position_group}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
        {[
          { label: awayInfo.abbr, color: awayInfo.color, players: players.away_players },
          { label: homeInfo.abbr, color: homeInfo.color, players: players.home_players },
        ].map((side) => (
          <div key={side.label}>
            <div className="flex items-center gap-2 mb-2">
              <TeamLogo abbr={side.label} name={side.label} size={18} />
              <h5 className="text-xs font-black uppercase tracking-wider" style={{ color: side.color }}>
                {side.label} Projections
              </h5>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200/70 shadow-sm text-xs">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-2 py-2 text-right">Pos</th>
                    <th className="px-2 py-2 text-right text-slate-700">PTS</th>
                    <th className="px-2 py-2 text-right">REB</th>
                    <th className="px-2 py-2 text-right">AST</th>
                    <th className="px-3 py-2 text-right">PRA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {side.players?.map((p: any) => (
                    <tr key={p.player_id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-3 py-2 font-bold text-slate-800">{p.player_name}</td>
                      <td className="px-2 py-2 text-right text-[10px] uppercase font-semibold text-slate-400">{p.position_group}</td>
                      <td className="px-2 py-2 text-right font-black text-slate-900">{p.predicted_pts.toFixed(1)}</td>
                      <td className="px-2 py-2 text-right font-semibold text-slate-600">{p.predicted_reb.toFixed(1)}</td>
                      <td className="px-2 py-2 text-right font-semibold text-slate-600">{p.predicted_ast.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right font-black text-slate-700">{p.predicted_pra.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
