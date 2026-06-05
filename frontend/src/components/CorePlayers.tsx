import React, { useState, useMemo } from "react";
import { Layers, Sparkles } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";

interface PlayerCore {
  TEAM_ABBREVIATION: string;
  PLAYER_ID: number;
  PLAYER_NAME: string;
  IMPORTANCE_SCORE: number;
  CORE_RANK: number;
  IS_TOP3_CORE: boolean;
  IS_TOP5_CORE: boolean;
}

interface CorePlayersProps {
  corePlayers: PlayerCore[];
}

const CorePlayers: React.FC<CorePlayersProps> = ({ corePlayers }) => {
  const [selectedTeam, setSelectedTeam] = useState<string>("BOS");

  // Get unique list of team abbreviations
  const teamsList = useMemo(() => {
    const teams = new Set(corePlayers.map(p => p.TEAM_ABBREVIATION));
    return Array.from(teams).sort();
  }, [corePlayers]);

  // Filter core players for the selected team
  const filteredPlayers = useMemo(() => {
    return corePlayers
      .filter(p => p.TEAM_ABBREVIATION === selectedTeam)
      .sort((a, b) => a.CORE_RANK - b.CORE_RANK);
  }, [corePlayers, selectedTeam]);

  // Group all core players by team to show in grid
  const groupedCorePlayers = useMemo(() => {
    const groups: { [key: string]: PlayerCore[] } = {};
    corePlayers.forEach(player => {
      if (!groups[player.TEAM_ABBREVIATION]) {
        groups[player.TEAM_ABBREVIATION] = [];
      }
      groups[player.TEAM_ABBREVIATION].push(player);
    });
    
    // Sort within each team group by CORE_RANK
    Object.keys(groups).forEach(team => {
      groups[team].sort((a, b) => a.CORE_RANK - b.CORE_RANK);
    });
    
    return groups;
  }, [corePlayers]);

  // Color map for ranking bars
  const RANK_COLORS = ["#06b6d4", "#0891b2", "#0e7490", "#e2b857", "#ca8a04"];

  return (
    <div className="space-y-6">
      {/* Glow */}
      <div className="glow-bg bottom-1/4 right-10"></div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white m-0">Core Players</h1>
          <p className="text-slate-400 mt-1 text-sm">Analyze roster hierarchies and player importance distributions</p>
        </div>
      </div>

      {/* Interactive Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Selection & Chart */}
        <div className="glass-card p-6 rounded-xl lg:col-span-2 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white m-0 flex items-center gap-2">
              <Layers size={18} className="text-cyan-400" />
              Importance Distribution Chart
            </h2>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 font-semibold"
            >
              {teamsList.map(team => (
                <option key={team} value={team}>{team} Chart</option>
              ))}
            </select>
          </div>
          
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredPlayers} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="PLAYER_NAME" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
                  labelStyle={{ color: "#fff" }}
                />
                <Bar dataKey="IMPORTANCE_SCORE" name="Importance Score" radius={[4, 4, 0, 0]}>
                  {filteredPlayers.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={RANK_COLORS[index % RANK_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="flex gap-4 text-xs justify-center pt-2 border-t border-slate-800/80">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-cyan-500"></div>
              <span className="text-slate-400">Core Players (Ranks 1-3)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-nba-gold"></div>
              <span className="text-slate-400">Secondary Players (Ranks 4-5)</span>
            </div>
          </div>
        </div>

        {/* Selected Team Text Summary */}
        <div className="glass-card p-6 rounded-xl flex flex-col justify-between">
          <h2 className="text-lg font-semibold text-white m-0 flex items-center gap-2">
            <Sparkles size={18} className="text-nba-gold" />
            {selectedTeam} Hierarchy
          </h2>
          
          <div className="space-y-4 my-4">
            {filteredPlayers.map((player) => (
              <div key={player.PLAYER_ID} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/50">
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-white m-0">{player.PLAYER_NAME}</p>
                  <p className="text-[10px] text-slate-500 font-mono font-semibold">Rank {player.CORE_RANK} • ID {player.PLAYER_ID}</p>
                </div>
                <div className="text-right">
                  <span className={`text-[10px] font-bold uppercase ${player.IS_TOP3_CORE ? 'text-cyan-400' : 'text-nba-gold'}`}>
                    {player.IS_TOP3_CORE ? 'Core' : 'Secondary'}
                  </span>
                  <p className="text-sm font-bold text-white font-mono mt-0.5">{player.IMPORTANCE_SCORE.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-slate-400 text-xs text-center italic mt-0">Click any team below to see their details</p>
        </div>
      </div>

      {/* Grid of All Teams Core Lists */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white m-0">Team-by-Team Core Roster Groups</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Object.keys(groupedCorePlayers).map((team) => (
            <div 
              key={team} 
              onClick={() => setSelectedTeam(team)}
              className={`glass-card p-5 rounded-xl space-y-4 transition-all duration-300 cursor-pointer border ${selectedTeam === team ? 'border-cyan-500/50 shadow-cyan-500/5 shadow-xl bg-cyan-950/5' : 'hover:border-slate-700/60'}`}
            >
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span className="text-lg font-bold text-white">{team}</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">Discovered core</span>
              </div>
              
              <div className="space-y-2">
                {/* Core players (ranks 1-3) */}
                <div className="space-y-1">
                  <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wide">Core (Top 3)</span>
                  {groupedCorePlayers[team].slice(0, 3).map(p => (
                    <div key={p.PLAYER_ID} className="flex justify-between text-xs font-semibold text-slate-300">
                      <span>{p.PLAYER_NAME}</span>
                      <span className="font-mono text-slate-500">{p.IMPORTANCE_SCORE.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
                
                {/* Secondary players (ranks 4-5) */}
                <div className="space-y-1 pt-2 border-t border-slate-900">
                  <span className="text-[10px] text-nba-gold font-bold uppercase tracking-wide">Secondary (Top 4-5)</span>
                  {groupedCorePlayers[team].slice(3, 5).map(p => (
                    <div key={p.PLAYER_ID} className="flex justify-between text-xs font-semibold text-slate-300">
                      <span>{p.PLAYER_NAME}</span>
                      <span className="font-mono text-slate-500">{p.IMPORTANCE_SCORE.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CorePlayers;
