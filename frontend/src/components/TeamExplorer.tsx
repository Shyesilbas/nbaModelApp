import React, { useState, useMemo } from "react";

interface PlayerRoster {
  TEAM_ABBREVIATION: string;
  PLAYER_ID: number;
  PLAYER_NAME: string;
  GP: number;
  TOTAL_MIN: number;
  AVG_MIN: number;
  AVG_PTS: number;
  AVG_REB: number;
  AVG_AST: number;
  IMPORTANCE_SCORE: number;
}

interface TeamExplorerProps {
  rosters: PlayerRoster[];
}

const TeamExplorer: React.FC<TeamExplorerProps> = ({ rosters }) => {
  const [selectedTeam, setSelectedTeam] = useState<string>("BOS");

  // Get unique list of team abbreviations
  const teamsList = useMemo(() => {
    const teams = new Set(rosters.map(r => r.TEAM_ABBREVIATION));
    return Array.from(teams).sort();
  }, [rosters]);

  // Filter roster for the selected team
  const teamRoster = useMemo(() => {
    return rosters
      .filter(r => r.TEAM_ABBREVIATION === selectedTeam)
      .sort((a, b) => b.AVG_MIN - a.AVG_MIN);
  }, [rosters, selectedTeam]);

  // Get Top 5 players based on Importance Score
  const corePlayers = useMemo(() => {
    return rosters
      .filter(r => r.TEAM_ABBREVIATION === selectedTeam)
      .sort((a, b) => b.IMPORTANCE_SCORE - a.IMPORTANCE_SCORE)
      .slice(0, 5);
  }, [rosters, selectedTeam]);

  return (
    <div className="space-y-6">
      {/* Glow */}
      <div className="glow-bg top-12 left-1/3"></div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white m-0">Team Explorer</h1>
          <p className="text-slate-400 mt-1 text-sm">Explore discovered player listings and dynamic core rosters</p>
        </div>
        <div>
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="w-48 bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 font-semibold"
          >
            {teamsList.map(team => (
              <option key={team} value={team}>{team} Roster</option>
            ))}
          </select>
        </div>
      </div>

      {/* Top Core Group Overview */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-white m-0">Core Player Grouping (Top 5)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {corePlayers.map((player, idx) => (
            <div key={player.PLAYER_ID} className="glass-card p-4 rounded-xl flex flex-col justify-between space-y-4 border-l-2 relative overflow-hidden" style={{ borderLeftColor: idx < 3 ? '#06b6d4' : '#e2b857' }}>
              <div className="absolute top-0 right-0 p-1 bg-slate-800 text-[10px] text-slate-400 font-mono rounded-bl-lg">
                Rank {idx + 1}
              </div>
              <div className="space-y-1 pr-6">
                <span className={`text-[10px] uppercase font-bold tracking-wider ${idx < 3 ? 'text-cyan-400' : 'text-nba-gold'}`}>
                  {idx < 3 ? 'Core Group' : 'Secondary'}
                </span>
                <p className="text-sm font-bold text-white truncate m-0">{player.PLAYER_NAME}</p>
                <p className="text-[10px] text-slate-500 font-semibold font-mono">ID: {player.PLAYER_ID}</p>
              </div>
              
              <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Score</span>
                  <span className="font-semibold text-white font-mono">{player.IMPORTANCE_SCORE.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">PTS</span>
                  <span className="font-semibold text-white font-mono">{player.AVG_PTS.toFixed(1)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">AST</span>
                  <span className="font-semibold text-white font-mono">{player.AVG_AST.toFixed(1)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">REB</span>
                  <span className="font-semibold text-white font-mono">{player.AVG_REB.toFixed(1)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">MIN</span>
                  <span className="font-semibold text-white font-mono">{player.AVG_MIN.toFixed(1)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Roster Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800/60 bg-slate-900/40">
          <h2 className="text-base font-semibold text-white m-0">Full Discovered Roster (Sorted by Avg Minutes)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="p-4">Player Name</th>
                <th className="p-4 font-mono">PLAYER_ID</th>
                <th className="p-4 text-center">GP</th>
                <th className="p-4 text-right">Avg Min</th>
                <th className="p-4 text-right">Avg Pts</th>
                <th className="p-4 text-right">Avg Reb</th>
                <th className="p-4 text-right">Avg Ast</th>
                <th className="p-4 text-right text-cyan-400">Importance Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {teamRoster.map((player) => {
                // Check if player is top 5
                const isTop5 = corePlayers.some(cp => cp.PLAYER_ID === player.PLAYER_ID);
                const isTop3 = corePlayers.slice(0, 3).some(cp => cp.PLAYER_ID === player.PLAYER_ID);
                return (
                  <tr key={player.PLAYER_ID} className="hover:bg-slate-900/30 transition-colors">
                    <td className="p-4 font-semibold text-white flex items-center gap-2">
                      {player.PLAYER_NAME}
                      {isTop3 && <span className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 text-[9px] rounded font-bold uppercase tracking-wider">Top 3</span>}
                      {!isTop3 && isTop5 && <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 text-[9px] rounded font-bold uppercase tracking-wider">Top 5</span>}
                    </td>
                    <td className="p-4 font-mono text-slate-500 text-xs">{player.PLAYER_ID}</td>
                    <td className="p-4 text-center font-mono">{player.GP}</td>
                    <td className="p-4 text-right font-mono">{player.AVG_MIN.toFixed(1)}</td>
                    <td className="p-4 text-right font-mono">{player.AVG_PTS.toFixed(1)}</td>
                    <td className="p-4 text-right font-mono">{player.AVG_REB.toFixed(1)}</td>
                    <td className="p-4 text-right font-mono">{player.AVG_AST.toFixed(1)}</td>
                    <td className="p-4 text-right font-mono font-bold text-cyan-400">{player.IMPORTANCE_SCORE.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TeamExplorer;
