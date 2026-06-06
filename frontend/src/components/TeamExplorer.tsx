import React, { useState, useMemo } from "react";
import { ChevronDown, Search } from "lucide-react";

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
      <section className="rounded-[1.75rem] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 px-6 py-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">
              <Search size={11} />
              Team lens
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 m-0 uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Team Explorer
            </h1>
            <p className="text-slate-500 mt-1 text-sm">Explore discovered player listings and dynamic core rosters.</p>
          </div>
          <div className="relative">
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="appearance-none w-48 bg-white border border-slate-200 text-slate-800 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1d428a] font-semibold shadow-sm"
            >
              {teamsList.map(team => (
                <option key={team} value={team}>{team} Roster</option>
              ))}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
        </div>
      </section>

      {/* Top Core Group Overview */}
        <div className="space-y-3">
          <h2 className="text-base font-bold text-slate-900 m-0 uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Core Player Grouping (Top 5)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {corePlayers.map((player, idx) => (
              <div key={player.PLAYER_ID} className="glass-card p-4 rounded-[1.25rem] flex flex-col justify-between space-y-4 border-l-4 relative overflow-hidden" style={{ borderLeftColor: idx < 3 ? '#1d428a' : '#c9082a' }}>
              <div className="absolute top-0 right-0 px-2 py-0.5 bg-slate-100 text-[9px] text-slate-500 font-mono rounded-bl-lg border-l border-b border-slate-200/60 font-semibold">
                RANK {idx + 1}
              </div>
              <div className="space-y-1 pr-6">
                <span className={`text-[10px] uppercase font-bold tracking-wider ${idx < 3 ? 'text-[#1d428a]' : 'text-[#c9082a]'}`}>
                  {idx < 3 ? 'Core Group' : 'Secondary'}
                </span>
                <p className="text-sm font-black text-slate-800 truncate m-0" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {player.PLAYER_NAME}
                </p>
                <p className="text-[10px] text-slate-400 font-semibold font-mono">ID: {player.PLAYER_ID}</p>
              </div>
              
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400 font-medium">Importance</span>
                  <span className="font-bold text-slate-800 font-mono">{player.IMPORTANCE_SCORE.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400 font-medium">PTS</span>
                  <span className="font-bold text-slate-700 font-mono">{player.AVG_PTS.toFixed(1)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400 font-medium">AST</span>
                  <span className="font-bold text-slate-700 font-mono">{player.AVG_AST.toFixed(1)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400 font-medium">REB</span>
                  <span className="font-bold text-slate-700 font-mono">{player.AVG_REB.toFixed(1)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400 font-medium">MIN</span>
                  <span className="font-bold text-slate-700 font-mono">{player.AVG_MIN.toFixed(1)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Roster Table */}
      <div className="glass-card rounded-[1.5rem] overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-base font-bold text-slate-900 m-0 uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Full Discovered Roster (Sorted by Avg Minutes)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="sticky top-0 bg-slate-50 text-slate-400 text-xs uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="p-4">Player Name</th>
                <th className="p-4 font-mono">PLAYER_ID</th>
                <th className="p-4 text-center">GP</th>
                <th className="p-4 text-right">Avg Min</th>
                <th className="p-4 text-right">Avg Pts</th>
                <th className="p-4 text-right">Avg Reb</th>
                <th className="p-4 text-right">Avg Ast</th>
                <th className="p-4 text-right text-[#1d428a]">Importance Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {teamRoster.map((player) => {
                // Check if player is top 5
                const isTop5 = corePlayers.some(cp => cp.PLAYER_ID === player.PLAYER_ID);
                const isTop3 = corePlayers.slice(0, 3).some(cp => cp.PLAYER_ID === player.PLAYER_ID);
                return (
                  <tr key={player.PLAYER_ID} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-bold text-slate-800 flex items-center gap-2">
                      {player.PLAYER_NAME}
                      {isTop3 && <span className="px-1.5 py-0.5 bg-[#1d428a]/10 text-[#1d428a] text-[9px] rounded font-bold uppercase tracking-wider">Top 3</span>}
                      {!isTop3 && isTop5 && <span className="px-1.5 py-0.5 bg-[#c9082a]/10 text-[#c9082a] text-[9px] rounded font-bold uppercase tracking-wider">Top 5</span>}
                    </td>
                    <td className="p-4 font-mono text-slate-400 text-xs">{player.PLAYER_ID}</td>
                    <td className="p-4 text-center font-mono">{player.GP}</td>
                    <td className="p-4 text-right font-mono">{player.AVG_MIN.toFixed(1)}</td>
                    <td className="p-4 text-right font-mono">{player.AVG_PTS.toFixed(1)}</td>
                    <td className="p-4 text-right font-mono">{player.AVG_REB.toFixed(1)}</td>
                    <td className="p-4 text-right font-mono">{player.AVG_AST.toFixed(1)}</td>
                    <td className="p-4 text-right font-mono font-bold text-[#1d428a]">{player.IMPORTANCE_SCORE.toFixed(2)}</td>
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
