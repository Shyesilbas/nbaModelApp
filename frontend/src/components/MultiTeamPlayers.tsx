import React from "react";
import { RefreshCcw, Info, ArrowRightLeft } from "lucide-react";

interface MultiTeamPlayer {
  PLAYER_ID: number;
  PLAYER_NAME: string;
  TEAM_COUNT: number;
  TEAMS_PLAYED_FOR: string;
}

interface MultiTeamPlayersProps {
  players: MultiTeamPlayer[];
}

const MultiTeamPlayers: React.FC<MultiTeamPlayersProps> = ({ players }) => {
  return (
    <div className="space-y-6">
      {/* Glow */}
      <div className="glow-bg top-12 left-10"></div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white m-0">Trade & Multi-Team Discovery</h1>
          <p className="text-slate-400 mt-1 text-sm">Detect players who appeared for multiple franchises during the season</p>
        </div>
      </div>

      {/* Roster & Information Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Table of traded players */}
        <div className="glass-card rounded-xl overflow-hidden lg:col-span-2 flex flex-col justify-between">
          <div className="p-4 border-b border-slate-800/60 bg-slate-900/40 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white m-0">Traded Players Registry</h2>
            <span className="text-xs bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded font-bold font-mono">
              {players.length} Players Found
            </span>
          </div>
          
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase font-semibold border-b border-slate-800 sticky top-0">
                <tr>
                  <th className="p-4">Player Name</th>
                  <th className="p-4 font-mono">PLAYER_ID</th>
                  <th className="p-4 text-center">Team Count</th>
                  <th className="p-4">Teams Logged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {players.map((player) => (
                  <tr key={player.PLAYER_ID} className="hover:bg-slate-900/30 transition-colors">
                    <td className="p-4 font-bold text-white flex items-center gap-2">
                      <RefreshCcw size={12} className="text-cyan-400 animate-spin-slow" />
                      {player.PLAYER_NAME}
                    </td>
                    <td className="p-4 font-mono text-slate-500 text-xs">{player.PLAYER_ID}</td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${player.TEAM_COUNT >= 3 ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-slate-800 text-slate-300'}`}>
                        {player.TEAM_COUNT}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-xs text-slate-400 font-semibold tracking-wider">{player.TEAMS_PLAYED_FOR}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Why this matters card */}
        <div className="space-y-6">
          {/* Explanation card */}
          <div className="glass-card p-6 rounded-xl space-y-4">
            <div className="flex items-center gap-2 text-cyan-400 font-semibold">
              <Info size={20} />
              <h3 className="text-white text-base m-0">Why Track Traded Players?</h3>
            </div>
            <p className="text-slate-300 text-xs leading-relaxed">
              NBA players frequently shift franchises mid-season via blockbusters, free-agent buyouts, or 10-day contracts.
            </p>
            <p className="text-slate-300 text-xs leading-relaxed">
              In game prediction, a player's stint averages are computed <strong>separately per team</strong> because their role, teammates, and defensive schemes change entirely.
            </p>
            <p className="text-slate-300 text-xs leading-relaxed">
              Our roster discovery pipeline automatically accounts for this by grouping statistics on <code>["TEAM_ABBREVIATION", "Player_ID"]</code>, ensuring player contributions map to the correct roster at any given date.
            </p>
          </div>

          {/* Trade Impact Indicator */}
          <div className="glass-card p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-4">
            <div className="flex items-center gap-2 text-nba-gold font-semibold">
              <ArrowRightLeft size={20} />
              <h3 className="text-white text-base m-0">Trade Analytics Metrics</h3>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-slate-950/40 p-2.5 rounded-lg border border-slate-900">
                <span className="text-xs text-slate-400">Total Traded Players</span>
                <span className="text-sm font-bold text-white font-mono">{players.length}</span>
              </div>
              
              <div className="flex justify-between items-center bg-slate-950/40 p-2.5 rounded-lg border border-slate-900">
                <span className="text-xs text-slate-400">Played for 3+ Teams</span>
                <span className="text-sm font-bold text-white font-mono">
                  {players.filter(p => p.TEAM_COUNT >= 3).length}
                </span>
              </div>

              <div className="flex justify-between items-center bg-slate-950/40 p-2.5 rounded-lg border border-slate-900">
                <span className="text-xs text-slate-400">Max Teams Logged</span>
                <span className="text-sm font-bold text-rose-400 font-mono">
                  {players.length > 0 ? Math.max(...players.map(p => p.TEAM_COUNT)) : 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiTeamPlayers;
