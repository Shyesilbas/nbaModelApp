import React, { useState, useMemo } from "react";
import { Layers, Sparkles, ChevronDown } from "lucide-react";
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
  const RANK_COLORS = ["#1d428a", "#2b56a1", "#3b6bb8", "#c9082a", "#de2e47"];
  const selectedTeamPlayers = filteredPlayers.length;

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 px-6 py-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">
              <Layers size={11} />
              Core hierarchy
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 m-0 uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Core Players
            </h1>
            <p className="max-w-2xl text-sm text-slate-500">
              A compact roster hierarchy view with sorted player importance and an instant team snapshot.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
              Teams: {teamsList.length}
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
              Selected: {selectedTeam}
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
              Players: {selectedTeamPlayers}
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Selection & Chart */}
        <div className="glass-card p-6 rounded-[1.5rem] lg:col-span-2 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2 uppercase tracking-wide" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                <Layers size={18} className="text-[#1d428a]" />
                Importance Distribution
              </h2>
              <p className="text-xs text-slate-500 mt-1">Sorted by rank, colored by role tier.</p>
            </div>
            <div className="relative">
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="appearance-none bg-white border border-slate-200 text-slate-800 rounded-xl pl-3 pr-9 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#1d428a] font-semibold shadow-sm"
              >
                {teamsList.map(team => (
                  <option key={team} value={team}>{team} Chart</option>
                ))}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
          
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredPlayers} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="PLAYER_NAME" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "8px" }}
                  itemStyle={{ color: "#334155" }}
                  labelStyle={{ color: "#0f172a", fontWeight: "bold" }}
                />
                <Bar dataKey="IMPORTANCE_SCORE" name="Importance Score" radius={[4, 4, 0, 0]}>
                  {filteredPlayers.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={RANK_COLORS[index % RANK_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="flex flex-wrap gap-3 text-xs justify-center pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#1d428a]"></div>
              <span className="text-slate-500">Core Players (Ranks 1-3)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#c9082a]"></div>
              <span className="text-slate-500">Secondary Players (Ranks 4-5)</span>
            </div>
          </div>
        </div>

        {/* Selected Team Text Summary */}
        <div className="glass-card p-6 rounded-[1.5rem] flex flex-col justify-between">
          <h2 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2 uppercase tracking-wide" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            <Sparkles size={18} className="text-[#c9082a]" />
            {selectedTeam} Hierarchy
          </h2>
          
          <div className="space-y-4 my-4">
            {filteredPlayers.map((player) => (
              <div key={player.PLAYER_ID} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200/60">
                <div className="space-y-0.5">
                  <p className="text-sm font-black text-slate-800 m-0" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{player.PLAYER_NAME}</p>
                  <p className="text-[10px] text-slate-400 font-mono font-semibold">Rank {player.CORE_RANK} • ID {player.PLAYER_ID}</p>
                </div>
                <div className="text-right">
                  <span className={`text-[10px] font-bold uppercase ${player.IS_TOP3_CORE ? 'text-[#1d428a]' : 'text-[#c9082a]'}`}>
                    {player.IS_TOP3_CORE ? 'Core' : 'Secondary'}
                  </span>
                  <p className="text-sm font-bold text-slate-900 font-mono mt-0.5">{player.IMPORTANCE_SCORE.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-slate-400 text-[10px] text-center italic mt-0">Click any team below to see their details</p>
        </div>
      </div>

      {/* Grid of All Teams Core Lists */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 m-0 uppercase tracking-wide" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
          Team-by-Team Core Roster Groups
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Object.keys(groupedCorePlayers).map((team) => (
            <div 
              key={team} 
              onClick={() => setSelectedTeam(team)}
              className={`glass-card p-5 rounded-[1.5rem] space-y-4 transition-all duration-300 cursor-pointer border ${selectedTeam === team ? 'border-[#1d428a] shadow-md bg-slate-50' : 'hover:border-slate-300'}`}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-lg font-black text-slate-800" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{team}</span>
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider font-mono">Discovered core</span>
              </div>
              
              <div className="space-y-2">
                {/* Core players (ranks 1-3) */}
                <div className="space-y-1">
                  <span className="text-[9px] text-[#1d428a] font-bold uppercase tracking-wide">Core (Top 3)</span>
                  {groupedCorePlayers[team].slice(0, 3).map(p => (
                    <div key={p.PLAYER_ID} className="flex justify-between text-xs font-semibold text-slate-700">
                      <span>{p.PLAYER_NAME}</span>
                      <span className="font-mono text-slate-400">{p.IMPORTANCE_SCORE.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
                
                {/* Secondary players (ranks 4-5) */}
                <div className="space-y-1 pt-2 border-t border-slate-100">
                  <span className="text-[9px] text-[#c9082a] font-bold uppercase tracking-wide">Secondary (Top 4-5)</span>
                  {groupedCorePlayers[team].slice(3, 5).map(p => (
                    <div key={p.PLAYER_ID} className="flex justify-between text-xs font-semibold text-slate-700">
                      <span>{p.PLAYER_NAME}</span>
                      <span className="font-mono text-slate-400">{p.IMPORTANCE_SCORE.toFixed(1)}</span>
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
