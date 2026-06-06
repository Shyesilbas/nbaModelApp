import React, { useState, useMemo } from "react";
import { 
  Search, 
  TrendingUp, 
  User, 
  Flame, 
  Award,
  ArrowUpDown,
  Info
} from "lucide-react";

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

const TEAM_THEMES: { [key: string]: { primary: string; secondary: string } } = {
  ATL: { primary: "#e03a3e", secondary: "#c1d32f" },
  BOS: { primary: "#007a33", secondary: "#ba9653" },
  BKN: { primary: "#080808", secondary: "#777777" },
  CHA: { primary: "#1d1160", secondary: "#00788c" },
  CHI: { primary: "#ce1141", secondary: "#080808" },
  CLE: { primary: "#860038", secondary: "#fdbb30" },
  DAL: { primary: "#00538c", secondary: "#b0b7bc" },
  DEN: { primary: "#0e2240", secondary: "#fec524" },
  DET: { primary: "#1d42ba", secondary: "#c8102e" },
  GSW: { primary: "#1d428a", secondary: "#ffc72c" },
  HOU: { primary: "#ce1141", secondary: "#c4ced4" },
  IND: { primary: "#002d62", secondary: "#fdbb30" },
  LAC: { primary: "#c8102e", secondary: "#1d428a" },
  LAL: { primary: "#552583", secondary: "#fdb927" },
  MEM: { primary: "#12173f", secondary: "#5d76a9" },
  MIA: { primary: "#98002e", secondary: "#f9a01b" },
  MIL: { primary: "#00471b", secondary: "#eee1c6" },
  MIN: { primary: "#0c2340", secondary: "#78be20" },
  NOP: { primary: "#0c2340", secondary: "#b4975a" },
  NYK: { primary: "#006bb6", secondary: "#f58426" },
  OKC: { primary: "#007ac1", secondary: "#ef3b24" },
  ORL: { primary: "#0077c0", secondary: "#c4ced4" },
  PHI: { primary: "#006bb6", secondary: "#ed174c" },
  PHX: { primary: "#1d1160", secondary: "#e56020" },
  POR: { primary: "#e03a3e", secondary: "#080808" },
  SAC: { primary: "#5a2d81", secondary: "#63727a" },
  SAS: { primary: "#c4ced4", secondary: "#080808" },
  TOR: { primary: "#ce1141", secondary: "#080808" },
  UTA: { primary: "#002b5c", secondary: "#f9a01b" },
  WAS: { primary: "#0c2340", secondary: "#e31837" }
};

const getTeamTheme = (teamAbbr: string) => {
  return TEAM_THEMES[teamAbbr] || { primary: "#1d428a", secondary: "#c9082a" };
};

const TeamExplorer: React.FC<TeamExplorerProps> = ({ rosters }) => {
  const [selectedTeam, setSelectedTeam] = useState<string>("BOS");
  const [sortBy, setSortBy] = useState<string>("AVG_MIN");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Get unique list of team abbreviations
  const teamsList = useMemo(() => {
    const teams = new Set(rosters.map(r => r.TEAM_ABBREVIATION));
    return Array.from(teams).sort();
  }, [rosters]);

  const activeTeamTheme = useMemo(() => {
    return getTeamTheme(selectedTeam);
  }, [selectedTeam]);

  // Sort handler
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc"); // Default to desc for stats
    }
  };

  // Filter roster for the selected team
  const rawTeamRoster = useMemo(() => {
    return rosters.filter(r => r.TEAM_ABBREVIATION === selectedTeam);
  }, [rosters, selectedTeam]);

  // Get Top 5 players based on Importance Score (sorted)
  const corePlayers = useMemo(() => {
    return [...rawTeamRoster]
      .sort((a, b) => b.IMPORTANCE_SCORE - a.IMPORTANCE_SCORE)
      .slice(0, 5);
  }, [rawTeamRoster]);

  // Sorted full roster
  const sortedTeamRoster = useMemo(() => {
    return [...rawTeamRoster].sort((a, b) => {
      const valA = a[sortBy as keyof PlayerRoster];
      const valB = b[sortBy as keyof PlayerRoster];

      if (typeof valA === "string" && typeof valB === "string") {
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (typeof valA === "number" && typeof valB === "number") {
        return sortOrder === "asc" ? valA - valB : valB - valA;
      }
      return 0;
    });
  }, [rawTeamRoster, sortBy, sortOrder]);

  // Selected Team Summary statistics
  const teamSummary = useMemo(() => {
    if (rawTeamRoster.length === 0) return { size: 0, avgPts: 0, avgMin: 0, strength: 0 };
    const ptsSum = rawTeamRoster.reduce((acc, p) => acc + p.AVG_PTS, 0);
    const minSum = rawTeamRoster.reduce((acc, p) => acc + p.AVG_MIN, 0);
    const top3 = corePlayers.slice(0, 3);
    const strengthSum = top3.reduce((acc, p) => acc + p.IMPORTANCE_SCORE, 0);

    return {
      size: rawTeamRoster.length,
      avgPts: ptsSum / rawTeamRoster.length,
      avgMin: minSum / rawTeamRoster.length,
      strength: top3.length > 0 ? strengthSum / top3.length : 0
    };
  }, [rawTeamRoster, corePlayers]);

  const getStrokeDashOffset = (score: number) => {
    const radius = 20;
    const circumference = 2 * Math.PI * radius;
    return circumference - (score / 100) * circumference;
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* ─── Page Header with Theme Glow ─── */}
      <section 
        className="relative overflow-hidden rounded-[2rem] border p-8 shadow-sm transition-all duration-500"
        style={{
          background: `linear-gradient(135deg, ${activeTeamTheme.primary}0a 0%, #ffffff 50%, ${activeTeamTheme.secondary}05 100%)`,
          borderColor: `${activeTeamTheme.primary}1a`
        }}
      >
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl pointer-events-none" style={{ background: `radial-gradient(circle, ${activeTeamTheme.primary}08 0%, transparent 70%)` }} />
        
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div 
              className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] shadow-xs"
              style={{ color: activeTeamTheme.primary, backgroundColor: `${activeTeamTheme.primary}10`, borderColor: `${activeTeamTheme.primary}1f` }}
            >
              <Search size={12} className="animate-pulse" />
              Franchise Deep Lens
            </div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tight text-slate-900 m-0 uppercase leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Team Explorer
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
              Explore discovered player listings and dynamic core rosters. Select a team below to load custom stats and dynamic branding filters.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex flex-wrap gap-4">
            <div className="glass-card flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border border-slate-100 shadow-xs">
              <div className="p-2 bg-slate-50 rounded-lg text-slate-500">
                <User size={18} />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-none">Roster Size</p>
                <p className="text-lg font-black text-slate-800 leading-none mt-1">{teamSummary.size} Players</p>
              </div>
            </div>

            <div className="glass-card flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border border-slate-100 shadow-xs">
              <div className="p-2 bg-slate-50 rounded-lg text-slate-500" style={{ color: activeTeamTheme.primary, backgroundColor: `${activeTeamTheme.primary}10` }}>
                <Flame size={18} />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-none">Avg PTS</p>
                <p className="text-lg font-black text-slate-800 leading-none mt-1">{teamSummary.avgPts.toFixed(1)} Pts</p>
              </div>
            </div>

            <div className="glass-card flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border border-slate-100 shadow-xs">
              <div className="p-2 bg-slate-50 rounded-lg text-slate-500" style={{ color: activeTeamTheme.secondary, backgroundColor: `${activeTeamTheme.secondary}10` }}>
                <TrendingUp size={18} />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-none">Top 3 Power</p>
                <p className="text-lg font-black text-slate-800 leading-none mt-1">{teamSummary.strength.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Horizontal Scrollable Team Selector */}
        <div className="mt-8 border-t border-slate-200/60 pt-5">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-2">Select Active Franchise</p>
          <div className="flex gap-2 overflow-x-auto pb-3 pt-1 scrollbar-thin scrollbar-thumb-slate-200">
            {teamsList.map(team => {
              const theme = getTeamTheme(team);
              const isSelected = selectedTeam === team;
              return (
                <button
                  key={team}
                  onClick={() => setSelectedTeam(team)}
                  className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 border cursor-pointer hover:scale-[1.03]"
                  style={{
                    borderColor: isSelected ? theme.primary : "#e2e8f0",
                    backgroundColor: isSelected ? `${theme.primary}15` : "#ffffff",
                    color: isSelected ? theme.primary : "#64748b",
                    boxShadow: isSelected ? `0 4px 12px ${theme.primary}18, inset 0 0 0 1px ${theme.primary}10` : undefined,
                  }}
                >
                  {team}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Core Grouping Overview (Top 5 Cards) ─── */}
      <div className="space-y-4">
        <h2 className="text-xl font-black text-slate-800 m-0 uppercase tracking-wide flex items-center gap-2" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
          <Award size={18} style={{ color: activeTeamTheme.primary }} />
          Dynamic Core Grouping (Top 5 Roster)
        </h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {corePlayers.map((player, idx) => (
            <div 
              key={player.PLAYER_ID} 
              className="glass-card p-5 rounded-[1.5rem] border-l-4 relative overflow-hidden flex flex-col justify-between h-56 transition-all duration-300 hover:scale-[1.01] hover:shadow-md"
              style={{ 
                borderLeftColor: idx < 3 ? activeTeamTheme.primary : activeTeamTheme.secondary,
                background: `linear-gradient(135deg, ${activeTeamTheme.primary}08 0%, #ffffff 100%)`
              }}
            >
              <div 
                className="absolute top-0 right-0 px-2 py-0.5 text-[9px] font-mono rounded-bl-lg border-l border-b font-extrabold"
                style={{ 
                  color: idx < 3 ? activeTeamTheme.primary : activeTeamTheme.secondary,
                  backgroundColor: idx < 3 ? `${activeTeamTheme.primary}10` : `${activeTeamTheme.secondary}10`,
                  borderColor: idx < 3 ? `${activeTeamTheme.primary}1c` : `${activeTeamTheme.secondary}1c`
                }}
              >
                RANK {idx + 1}
              </div>
              
              <div className="space-y-1.5 pr-6">
                <span 
                  className="text-[9px] uppercase font-black tracking-wider leading-none"
                  style={{ color: idx < 3 ? activeTeamTheme.primary : activeTeamTheme.secondary }}
                >
                  {idx < 3 ? 'Core Group' : 'Secondary'}
                </span>
                <p className="text-sm font-black text-slate-800 truncate m-0" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {player.PLAYER_NAME}
                </p>
                <p className="text-[9px] text-slate-400 font-semibold font-mono">ID: {player.PLAYER_ID}</p>
              </div>
              
              {/* Stats & Circular Progress bar */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div className="relative w-12 h-12 flex-shrink-0">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="24" cy="24" r="20" stroke="#f1f5f9" strokeWidth="2.5" fill="transparent" />
                    <circle 
                      cx="24" 
                      cy="24" 
                      r="20" 
                      stroke={idx < 3 ? activeTeamTheme.primary : activeTeamTheme.secondary} 
                      strokeWidth="2.5" 
                      fill="transparent" 
                      strokeDasharray={2 * Math.PI * 20}
                      strokeDashoffset={getStrokeDashOffset(player.IMPORTANCE_SCORE)}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-black font-mono text-slate-700 leading-none">
                      {player.IMPORTANCE_SCORE.toFixed(0)}
                    </span>
                    <span className="text-[5px] text-slate-400 font-black uppercase tracking-wider mt-0.5 leading-none">Score</span>
                  </div>
                </div>

                <div className="text-right space-y-0.5 font-mono text-[10px] font-semibold text-slate-500">
                  <div className="flex justify-between gap-3">
                    <span>PTS:</span>
                    <strong className="text-slate-800">{player.AVG_PTS.toFixed(1)}</strong>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>AST:</span>
                    <strong className="text-slate-800">{player.AVG_AST.toFixed(1)}</strong>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>MIN:</span>
                    <strong className="text-slate-800">{player.AVG_MIN.toFixed(0)}</strong>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Discovered Roster Table (Full Matrix) ─── */}
      <div className="glass-card rounded-[2rem] overflow-hidden shadow-xs border border-slate-200/60 bg-white">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-800 m-0 uppercase tracking-wide" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Full Discovered Roster
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Discovered player listings, sortable by stats and core importance ratings.</p>
          </div>
          <div className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
            <Info size={12} /> Click column headers to sort.
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="sticky top-0 bg-slate-50 text-slate-400 text-xs uppercase font-bold border-b border-slate-200">
              <tr>
                <th 
                  onClick={() => handleSort("PLAYER_NAME")}
                  className="p-4 cursor-pointer hover:text-slate-800 select-none transition-colors"
                >
                  Player Name {sortBy === "PLAYER_NAME" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th 
                  onClick={() => handleSort("PLAYER_ID")}
                  className="p-4 cursor-pointer hover:text-slate-800 select-none transition-colors font-mono"
                >
                  Player ID {sortBy === "PLAYER_ID" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th 
                  onClick={() => handleSort("GP")}
                  className="p-4 cursor-pointer hover:text-slate-800 select-none text-center transition-colors font-mono"
                >
                  GP {sortBy === "GP" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th 
                  onClick={() => handleSort("AVG_MIN")}
                  className="p-4 cursor-pointer hover:text-slate-800 select-none text-right transition-colors"
                >
                  Avg Min {sortBy === "AVG_MIN" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th 
                  onClick={() => handleSort("AVG_PTS")}
                  className="p-4 cursor-pointer hover:text-slate-800 select-none text-right transition-colors"
                >
                  Avg Pts {sortBy === "AVG_PTS" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th 
                  onClick={() => handleSort("AVG_REB")}
                  className="p-4 cursor-pointer hover:text-slate-800 select-none text-right transition-colors"
                >
                  Avg Reb {sortBy === "AVG_REB" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th 
                  onClick={() => handleSort("AVG_AST")}
                  className="p-4 cursor-pointer hover:text-slate-800 select-none text-right transition-colors"
                >
                  Avg Ast {sortBy === "AVG_AST" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                </th>
                <th 
                  onClick={() => handleSort("IMPORTANCE_SCORE")}
                  className="p-4 cursor-pointer hover:text-slate-800 select-none text-right transition-colors"
                  style={{ color: activeTeamTheme.primary }}
                >
                  Importance Score {sortBy === "IMPORTANCE_SCORE" ? (sortOrder === "asc" ? "▲" : "▼") : ""} <ArrowUpDown size={10} className="inline ml-1" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {sortedTeamRoster.map((player) => {
                // Check if player is top 5/3
                const isTop5 = corePlayers.some(cp => cp.PLAYER_ID === player.PLAYER_ID);
                const isTop3 = corePlayers.slice(0, 3).some(cp => cp.PLAYER_ID === player.PLAYER_ID);
                return (
                  <tr key={player.PLAYER_ID} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-bold text-slate-800 flex items-center gap-2">
                      {player.PLAYER_NAME}
                      {isTop3 && (
                        <span 
                          className="px-1.5 py-0.5 text-[9px] rounded font-black uppercase tracking-wider"
                          style={{ backgroundColor: `${activeTeamTheme.primary}12`, color: activeTeamTheme.primary }}
                        >
                          Top 3
                        </span>
                      )}
                      {!isTop3 && isTop5 && (
                        <span 
                          className="px-1.5 py-0.5 text-[9px] rounded font-black uppercase tracking-wider"
                          style={{ backgroundColor: `${activeTeamTheme.secondary}12`, color: activeTeamTheme.secondary }}
                        >
                          Top 5
                        </span>
                      )}
                    </td>
                    <td className="p-4 font-mono text-slate-400 text-xs">{player.PLAYER_ID}</td>
                    <td className="p-4 text-center font-mono">{player.GP}</td>
                    <td className="p-4 text-right font-mono">{player.AVG_MIN.toFixed(1)}</td>
                    <td className="p-4 text-right font-mono">{player.AVG_PTS.toFixed(1)}</td>
                    <td className="p-4 text-right font-mono">{player.AVG_REB.toFixed(1)}</td>
                    <td className="p-4 text-right font-mono">{player.AVG_AST.toFixed(1)}</td>
                    <td className="p-4 text-right font-mono font-bold" style={{ color: activeTeamTheme.primary }}>{player.IMPORTANCE_SCORE.toFixed(2)}%</td>
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
