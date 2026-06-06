import React, { useState, useMemo, useEffect } from "react";
import { 
  Layers, 
  ChevronDown, 
  Search, 
  TrendingUp, 
  User, 
  Target, 
  Zap, 
  Clock, 
  Calendar, 
  Flame, 
  Trophy, 
  Grid, 
  BarChart3,
  Award,
  ArrowRight,
  Info,
  Activity
} from "lucide-react";
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

interface RosterPlayer {
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

interface CorePlayersProps {
  corePlayers: PlayerCore[];
  rosters: RosterPlayer[];
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

const CorePlayers: React.FC<CorePlayersProps> = ({ corePlayers, rosters }) => {
  // Local state
  const [selectedTeam, setSelectedTeam] = useState<string>("BOS");
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [teamSearchQuery, setTeamSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<"score" | "name">("score");
  const [viewMode, setViewMode] = useState<"tactical" | "league">("tactical");

  // Get active team theme colors
  const activeTeamTheme = useMemo(() => getTeamTheme(selectedTeam), [selectedTeam]);

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

  // Map players to their roster stats
  const playersWithStats = useMemo(() => {
    return filteredPlayers.map(player => {
      const rosterInfo = rosters.find(r => r.PLAYER_ID === player.PLAYER_ID && r.TEAM_ABBREVIATION === selectedTeam);
      return {
        ...player,
        GP: rosterInfo?.GP ?? 0,
        AVG_MIN: rosterInfo?.AVG_MIN ?? 0,
        AVG_PTS: rosterInfo?.AVG_PTS ?? 0,
        AVG_REB: rosterInfo?.AVG_REB ?? 0,
        AVG_AST: rosterInfo?.AVG_AST ?? 0,
      };
    });
  }, [filteredPlayers, rosters, selectedTeam]);

  // Auto-select the top rank player when team changes
  useEffect(() => {
    if (playersWithStats.length > 0) {
      setSelectedPlayerId(playersWithStats[0].PLAYER_ID);
    } else {
      setSelectedPlayerId(null);
    }
  }, [selectedTeam, playersWithStats]);

  // Get active selected player details
  const activePlayer = useMemo(() => {
    if (!selectedPlayerId) return null;
    return playersWithStats.find(p => p.PLAYER_ID === selectedPlayerId) || playersWithStats[0] || null;
  }, [playersWithStats, selectedPlayerId]);

  // Group all core players by team to show in comparison grid
  const teamMetrics = useMemo(() => {
    const teamsData: { 
      [key: string]: { 
        team: string; 
        avgCoreScore: number; 
        players: PlayerCore[]; 
      } 
    } = {};

    corePlayers.forEach(player => {
      const team = player.TEAM_ABBREVIATION;
      if (!teamsData[team]) {
        teamsData[team] = { team, avgCoreScore: 0, players: [] };
      }
      teamsData[team].players.push(player);
    });

    // Sort players in each team and calculate average core score of Top 3
    Object.keys(teamsData).forEach(team => {
      teamsData[team].players.sort((a, b) => a.CORE_RANK - b.CORE_RANK);
      const top3 = teamsData[team].players.slice(0, 3);
      const sum = top3.reduce((acc, p) => acc + p.IMPORTANCE_SCORE, 0);
      teamsData[team].avgCoreScore = top3.length > 0 ? sum / top3.length : 0;
    });

    return Object.values(teamsData);
  }, [corePlayers]);

  // Filtered and sorted team metrics for the grid
  const filteredTeamMetrics = useMemo(() => {
    const result = teamMetrics.filter(t => 
      t.team.toLowerCase().includes(teamSearchQuery.toLowerCase()) ||
      t.players.some(p => p.PLAYER_NAME.toLowerCase().includes(teamSearchQuery.toLowerCase()))
    );

    if (sortBy === "score") {
      return result.sort((a, b) => b.avgCoreScore - a.avgCoreScore);
    } else {
      return result.sort((a, b) => a.team.localeCompare(b.team));
    }
  }, [teamMetrics, teamSearchQuery, sortBy]);

  // League-wide top 15 players
  const leagueTopPlayers = useMemo(() => {
    return [...corePlayers]
      .sort((a, b) => b.IMPORTANCE_SCORE - a.IMPORTANCE_SCORE)
      .slice(0, 15);
  }, [corePlayers]);

  // Overall database insights
  const statsSummary = useMemo(() => {
    if (corePlayers.length === 0) return { total: 0, avgImportance: 0, topPlayer: null };
    const sorted = [...corePlayers].sort((a, b) => b.IMPORTANCE_SCORE - a.IMPORTANCE_SCORE);
    const avg = corePlayers.reduce((acc, p) => acc + p.IMPORTANCE_SCORE, 0) / corePlayers.length;
    return {
      total: corePlayers.length,
      avgImportance: avg,
      topPlayer: sorted[0]
    };
  }, [corePlayers]);

  // SVG Circular Gauge parameters
  const getStrokeDashOffset = (score: number) => {
    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    // Map score (0-100) to progress
    return circumference - (score / 100) * circumference;
  };

  const getPlayerBadgeTitle = (rank: number) => {
    if (rank === 1) return "Franchise Cornerstone";
    if (rank <= 3) return "Tier-1 Core Leader";
    if (rank <= 5) return "Secondary Contributor";
    return "Support Roster Depth";
  };

  const handleTeamSelect = (team: string) => {
    setSelectedTeam(team);
    // Smooth scroll to top of showcase section
    const element = document.getElementById("spotlight-section");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* ─── Premium Page Header ─── */}
      <section className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-8 shadow-sm">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#1d428a]/5 to-[#c9082a]/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#1d428a] shadow-xs">
              <Layers size={12} className="animate-pulse" />
              Machine Learning Core Roster Analyzer
            </div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tight text-slate-900 m-0 uppercase leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Core Player Analysis
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
              Roster hierarchy model indicating each player's tactical impact score, sorted dynamically. We cross-examine player performance to map franchise engines.
            </p>
          </div>

          {/* Quick Overview Badges */}
          <div className="flex flex-wrap gap-4 lg:self-center">
            <div className="glass-card flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border border-slate-100 shadow-xs hover:border-slate-200 transition-colors">
              <div className="p-2 bg-slate-50 rounded-lg text-slate-500">
                <User size={18} />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-none">Analyzed</p>
                <p className="text-lg font-black text-slate-800 leading-none mt-1">{statsSummary.total} Players</p>
              </div>
            </div>

            <div className="glass-card flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border border-slate-100 shadow-xs hover:border-slate-200 transition-colors">
              <div className="p-2 bg-[#1d428a]/10 rounded-lg text-[#1d428a]">
                <Activity size={18} />
              </div>
              <div>
                <p className="text-[10px] text-[#1d428a] font-bold uppercase tracking-wider leading-none">Avg Importance</p>
                <p className="text-lg font-black text-slate-800 leading-none mt-1">{statsSummary.avgImportance.toFixed(1)}%</p>
              </div>
            </div>

            {statsSummary.topPlayer && (
              <div className="glass-card flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border border-slate-100 shadow-xs hover:border-slate-200 transition-colors">
                <div className="p-2 bg-[#eab308]/10 rounded-lg text-[#eab308]">
                  <Trophy size={18} />
                </div>
                <div>
                  <p className="text-[10px] text-[#b45309] font-bold uppercase tracking-wider leading-none">League Leader</p>
                  <p className="text-lg font-black text-slate-800 leading-none mt-1 uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {statsSummary.topPlayer.PLAYER_NAME}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* View Toggle Bar */}
        <div className="flex gap-2 mt-8 border-t border-slate-200/60 pt-5">
          <button 
            onClick={() => setViewMode("tactical")}
            className={`results-segment ${viewMode === "tactical" ? "results-segment-active" : ""}`}
          >
            <Grid size={13} />
            Tactical Depth Showcase
          </button>
          <button 
            onClick={() => setViewMode("league")}
            className={`results-segment ${viewMode === "league" ? "results-segment-active" : ""}`}
          >
            <BarChart3 size={13} />
            League-Wide Leaders
          </button>
        </div>
      </section>

      {/* ─── View 1: Tactical Depth Showcase ─── */}
      {viewMode === "tactical" && (
        <div id="spotlight-section" className="space-y-8">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Roster Tactical Hierarchy (span 7) */}
            <div className="lg:col-span-7 space-y-6">
              <div 
                className="glass-card p-6 rounded-[2rem] border shadow-xs space-y-5 transition-all duration-300"
                style={{
                  background: `linear-gradient(180deg, ${activeTeamTheme.primary}0a 0%, #ffffff 100%)`,
                  borderColor: `${activeTeamTheme.primary}1f`
                }}
              >
                <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-100/60 pb-4">
                  <div>
                    <h2 className="text-xl font-black text-slate-800 m-0 uppercase tracking-wide flex items-center gap-2" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                      <Layers size={18} style={{ color: activeTeamTheme.primary }} />
                      {selectedTeam} Core Hierarchy
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">Click any player to reveal their statistical profile panel.</p>
                  </div>

                  {/* Team Selector dropdown */}
                  <div className="relative">
                    <select
                      value={selectedTeam}
                      onChange={(e) => setSelectedTeam(e.target.value)}
                      className="appearance-none bg-slate-50 border border-slate-200 text-slate-800 rounded-xl pl-3 pr-9 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#1d428a] shadow-xs cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      {teamsList.map(team => (
                        <option key={team} value={team}>{team} Roster</option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                {/* Depth Chart Columns */}
                <div className="space-y-4">
                  {/* Tier 1: Franchise Core (Ranks 1-3) */}
                  <div className="space-y-2.5">
                    <span 
                      className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md"
                      style={{ color: activeTeamTheme.primary, backgroundColor: `${activeTeamTheme.primary}15` }}
                    >
                      Tier 1: Franchise Core (Top 3)
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {playersWithStats.slice(0, 3).map((player) => {
                        const isSelected = selectedPlayerId === player.PLAYER_ID;
                        return (
                          <div
                            key={player.PLAYER_ID}
                            onClick={() => setSelectedPlayerId(player.PLAYER_ID)}
                            className="group relative p-4 rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden"
                            style={{
                              borderColor: isSelected ? activeTeamTheme.primary : "#e2e8f0",
                              boxShadow: isSelected ? `0 4px 15px ${activeTeamTheme.primary}12` : undefined,
                              background: isSelected ? `linear-gradient(135deg, ${activeTeamTheme.primary}08 0%, white 100%)` : "#ffffff"
                            }}
                          >
                            <div 
                              className="absolute top-0 right-0 w-16 h-16 rounded-bl-full transform translate-x-1.5 -translate-y-1.5 transition-transform group-hover:scale-110" 
                              style={{ backgroundColor: `${activeTeamTheme.primary}08` }}
                            />
                            <div className="space-y-2 relative z-10">
                              <div className="flex items-center justify-between">
                                <span 
                                  className="text-xs font-black bg-white border px-2 py-0.5 rounded-lg shadow-xs"
                                  style={{ color: activeTeamTheme.primary, borderColor: `${activeTeamTheme.primary}25` }}
                                >
                                  #{player.CORE_RANK}
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold font-mono">
                                  {player.IMPORTANCE_SCORE.toFixed(1)}%
                                </span>
                              </div>
                              <div>
                                <p 
                                  className="text-sm font-black text-slate-800 leading-tight group-hover:text-[#1d428a] transition-colors truncate" 
                                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                                >
                                  {player.PLAYER_NAME}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5 font-bold uppercase tracking-wider">{player.GP} Games</p>
                              </div>
                              <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1.5 border-t border-slate-100/60 font-semibold font-mono">
                                <span>PTS: {player.AVG_PTS.toFixed(1)}</span>
                                <span>MIN: {player.AVG_MIN.toFixed(0)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tier 2: Key Secondary Core (Ranks 4-5) */}
                  {playersWithStats.length > 3 && (
                    <div className="space-y-2.5 pt-2">
                      <span 
                        className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md"
                        style={{ color: activeTeamTheme.secondary, backgroundColor: `${activeTeamTheme.secondary}15` }}
                      >
                        Tier 2: Key Secondary (Top 4-5)
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {playersWithStats.slice(3, 5).map((player) => {
                          const isSelected = selectedPlayerId === player.PLAYER_ID;
                          return (
                            <div
                              key={player.PLAYER_ID}
                              onClick={() => setSelectedPlayerId(player.PLAYER_ID)}
                              className="group relative p-4 rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden"
                              style={{
                                borderColor: isSelected ? activeTeamTheme.secondary : "#e2e8f0",
                                boxShadow: isSelected ? `0 4px 15px ${activeTeamTheme.secondary}12` : undefined,
                                background: isSelected ? `linear-gradient(135deg, ${activeTeamTheme.secondary}08 0%, white 100%)` : "#ffffff"
                              }}
                            >
                              <div 
                                className="absolute top-0 right-0 w-16 h-16 rounded-bl-full transform translate-x-1.5 -translate-y-1.5 transition-transform group-hover:scale-110" 
                                style={{ backgroundColor: `${activeTeamTheme.secondary}08` }}
                              />
                              <div className="space-y-2 relative z-10">
                                <div className="flex items-center justify-between">
                                  <span 
                                    className="text-xs font-black bg-white border px-2 py-0.5 rounded-lg shadow-xs"
                                    style={{ color: activeTeamTheme.secondary, borderColor: `${activeTeamTheme.secondary}25` }}
                                  >
                                    #{player.CORE_RANK}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-bold font-mono">
                                    {player.IMPORTANCE_SCORE.toFixed(1)}%
                                  </span>
                                </div>
                                <div>
                                  <p 
                                    className="text-sm font-black text-slate-800 leading-tight group-hover:text-[#c9082a] transition-colors truncate" 
                                    style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                                  >
                                    {player.PLAYER_NAME}
                                  </p>
                                  <p className="text-[10px] text-slate-400 mt-0.5 font-bold uppercase tracking-wider">{player.GP} Games</p>
                                </div>
                                <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1.5 border-t border-slate-100/60 font-semibold font-mono">
                                  <span>PTS: {player.AVG_PTS.toFixed(1)}</span>
                                  <span>MIN: {player.AVG_MIN.toFixed(0)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Tier 3: Supporting Roster (Ranks 6+) */}
                  {playersWithStats.length > 5 && (
                    <div className="space-y-2.5 pt-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                        Tier 3: Support Roster Depth (Ranks 6+)
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                        {playersWithStats.slice(5).map((player) => (
                          <div
                            key={player.PLAYER_ID}
                            onClick={() => setSelectedPlayerId(player.PLAYER_ID)}
                            className={`flex items-center justify-between p-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                              selectedPlayerId === player.PLAYER_ID
                                ? "border-slate-800 bg-slate-900 text-white shadow-xs"
                                : "border-slate-100 bg-slate-50/70 hover:border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span className={`text-[10px] font-extrabold font-mono px-1.5 py-0.5 rounded-md ${
                                selectedPlayerId === player.PLAYER_ID ? "bg-slate-800 text-slate-300" : "bg-slate-200 text-slate-600"
                              }`}>
                                #{player.CORE_RANK}
                              </span>
                              <p className="text-xs font-bold truncate leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                                {player.PLAYER_NAME}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 font-mono text-[10px] font-bold">
                              <span className={selectedPlayerId === player.PLAYER_ID ? "text-slate-300" : "text-slate-400"}>
                                {player.IMPORTANCE_SCORE.toFixed(1)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Active Player Spotlight Profile (span 5) */}
            <div className="lg:col-span-5">
              {activePlayer ? (
                <div 
                  className="glass-card p-6 rounded-[2rem] shadow-md relative overflow-hidden h-full flex flex-col justify-between transition-all duration-300"
                  style={{
                    background: `linear-gradient(135deg, ${activeTeamTheme.primary}08 0%, #ffffff 100%)`,
                    borderColor: `${activeTeamTheme.primary}1f`
                  }}
                >
                  <div 
                    className="absolute top-0 right-0 w-32 h-32 rounded-bl-full pointer-events-none" 
                    style={{ background: `linear-gradient(to bottom left, ${activeTeamTheme.primary}12, transparent)` }}
                  />
                  
                  <div className="space-y-6">
                    {/* Header: Name and Badge */}
                    <div className="space-y-2">
                      <div 
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border"
                        style={{ backgroundColor: `${activeTeamTheme.primary}10`, color: activeTeamTheme.primary, borderColor: `${activeTeamTheme.primary}20` }}
                      >
                        <Award size={10} />
                        {getPlayerBadgeTitle(activePlayer.CORE_RANK)}
                      </div>
                      <h3 className="text-3xl font-black text-slate-800 uppercase tracking-tight leading-tight m-0" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {activePlayer.PLAYER_NAME}
                      </h3>
                      <p className="text-xs text-slate-400 font-mono font-bold uppercase tracking-widest">
                        NBA ID: {activePlayer.PLAYER_ID} • Roster Rank #{activePlayer.CORE_RANK}
                      </p>
                    </div>

                    {/* Radial Meter and Description */}
                    <div className="flex items-center gap-6 p-4 bg-slate-50/50 rounded-2xl border border-slate-100/60">
                      <div className="relative flex-shrink-0 w-24 h-24">
                        <svg className="w-full h-full transform -rotate-90">
                          {/* Track */}
                          <circle 
                            cx="48" 
                            cy="48" 
                            r="38" 
                            stroke={activePlayer.CORE_RANK <= 3 ? `${activeTeamTheme.primary}15` : `${activeTeamTheme.secondary}15`} 
                            strokeWidth="6" 
                            fill="transparent" 
                          />
                          {/* Value */}
                          <circle 
                            cx="48" 
                            cy="48" 
                            r="38" 
                            stroke={activePlayer.CORE_RANK <= 3 ? activeTeamTheme.primary : activeTeamTheme.secondary} 
                            strokeWidth="6" 
                            fill="transparent"
                            strokeDasharray={2 * Math.PI * 38}
                            strokeDashoffset={getStrokeDashOffset(activePlayer.IMPORTANCE_SCORE)}
                            strokeLinecap="round"
                            className="transition-all duration-1000 ease-out"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-lg font-black text-slate-800 leading-none font-mono">
                            {activePlayer.IMPORTANCE_SCORE.toFixed(1)}
                          </span>
                          <span className="text-[7px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Score</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs font-black uppercase tracking-wide text-slate-700">Importance Rating</span>
                        <p className="text-xs leading-relaxed text-slate-500">
                          The ML model calculated a score of <strong className="text-slate-800">{activePlayer.IMPORTANCE_SCORE.toFixed(2)}</strong> for this player based on on-court features, roster distribution, and team rotation.
                        </p>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-2xl flex flex-col justify-between hover:border-slate-200 transition-colors">
                        <span style={{ color: activeTeamTheme.primary }}><Flame size={16} /></span>
                        <div className="mt-3">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Avg Points</p>
                          <p className="text-lg font-black text-slate-800 font-mono mt-0.5 leading-none">{activePlayer.AVG_PTS.toFixed(1)}</p>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-2xl flex flex-col justify-between hover:border-slate-200 transition-colors">
                        <span style={{ color: activeTeamTheme.primary }}><Zap size={16} /></span>
                        <div className="mt-3">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Avg Assists</p>
                          <p className="text-lg font-black text-slate-800 font-mono mt-0.5 leading-none">{activePlayer.AVG_AST.toFixed(1)}</p>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-2xl flex flex-col justify-between hover:border-slate-200 transition-colors">
                        <span style={{ color: activeTeamTheme.secondary }}><Target size={16} /></span>
                        <div className="mt-3">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Avg Rebounds</p>
                          <p className="text-lg font-black text-slate-800 font-mono mt-0.5 leading-none">{activePlayer.AVG_REB.toFixed(1)}</p>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-2xl flex flex-col justify-between hover:border-slate-200 transition-colors">
                        <span className="text-slate-500"><Clock size={16} /></span>
                        <div className="mt-3">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Avg Minutes</p>
                          <p className="text-lg font-black text-slate-800 font-mono mt-0.5 leading-none">{activePlayer.AVG_MIN.toFixed(1)}</p>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-2xl flex flex-col justify-between col-span-2 sm:col-span-2 hover:border-slate-200 transition-colors">
                        <span className="text-slate-500"><Calendar size={16} /></span>
                        <div className="mt-3 flex items-end justify-between">
                          <div>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Games Played</p>
                            <p className="text-lg font-black text-slate-800 font-mono mt-0.5 leading-none">{activePlayer.GP} Games</p>
                          </div>
                          <span 
                            className="text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded font-mono leading-none mb-0.5"
                            style={{ color: activeTeamTheme.primary, backgroundColor: `${activeTeamTheme.primary}12` }}
                          >
                            Active
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-semibold">
                    <span className="flex items-center gap-1"><Info size={11} /> Model updated from latest rosters.</span>
                    <span className="uppercase tracking-wider font-bold" style={{ color: activeTeamTheme.primary }}>{selectedTeam} Profile</span>
                  </div>
                </div>
              ) : (
                <div className="glass-card p-6 rounded-[2rem] bg-white border border-slate-200/60 shadow-xs h-full flex flex-col items-center justify-center text-center gap-3">
                  <User size={32} className="text-slate-300 animate-bounce" />
                  <p className="text-sm font-bold text-slate-500">No active player selected</p>
                  <p className="text-xs text-slate-400">Please choose a player card on the tactical sheet to load stats.</p>
                </div>
              )}
            </div>
          </div>

          {/* ─── Team comparison grid (Grid of All Teams) ─── */}
          <div className="space-y-5 pt-4">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-2xl font-black text-slate-800 m-0 uppercase tracking-wide" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  All-Teams Strength Matrix
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Comparison matrix of all teams sorted by Average Core Strength (Top 3 core average). Click any card to load.
                </p>
              </div>

              {/* Grid Filter and Sort controls */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search team or player..."
                    value={teamSearchQuery}
                    onChange={(e) => setTeamSearchQuery(e.target.value)}
                    className="w-56 bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1d428a]/15 font-semibold shadow-xs"
                  />
                  <Search className="absolute left-2.5 top-2.5 text-slate-400" size={12} />
                </div>

                <div className="flex bg-slate-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setSortBy("score")}
                    className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-colors ${
                      sortBy === "score" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Strength
                  </button>
                  <button
                    onClick={() => setSortBy("name")}
                    className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-colors ${
                      sortBy === "name" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    A-Z
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {filteredTeamMetrics.map((item) => {
                const theme = getTeamTheme(item.team);
                const isSelected = selectedTeam === item.team;
                return (
                  <div
                    key={item.team}
                    onClick={() => handleTeamSelect(item.team)}
                    className="glass-card p-5 rounded-[1.75rem] border transition-all duration-300 cursor-pointer flex flex-col justify-between hover:scale-[1.01] hover:shadow-md"
                    style={{
                      background: `linear-gradient(135deg, ${theme.primary}0d 0%, ${theme.secondary}05 100%)`,
                      borderColor: isSelected ? theme.primary : "#e2e8f0",
                      boxShadow: isSelected ? `0 4px 20px ${theme.primary}18, inset 0 0 0 1px ${theme.primary}10` : undefined,
                    }}
                  >
                    <div className="space-y-4">
                      {/* Header */}
                      <div className="flex items-center justify-between border-b border-slate-100/60 pb-2.5">
                        <span 
                          className="text-xl font-black" 
                          style={{ color: theme.primary, fontFamily: "'Barlow Condensed', sans-serif" }}
                        >
                          {item.team}
                        </span>
                        <div className="text-right">
                          <span className="text-[8px] text-slate-400 font-extrabold uppercase tracking-widest leading-none block">Core Power</span>
                          <span className="text-xs font-black font-mono leading-none mt-0.5 block" style={{ color: theme.primary }}>{item.avgCoreScore.toFixed(1)}%</span>
                        </div>
                      </div>

                      {/* Top 3 Core Players mini-display */}
                      <div className="space-y-1.5">
                        {item.players.slice(0, 3).map((p) => (
                          <div key={p.PLAYER_ID} className="flex justify-between items-center text-xs font-semibold text-slate-600">
                            <span className="truncate max-w-[120px]">{p.PLAYER_NAME}</span>
                            <span className="font-mono text-[10px] text-slate-400 font-bold" style={{ color: isSelected ? `${theme.primary}cc` : undefined }}>
                              #{p.CORE_RANK} ({p.IMPORTANCE_SCORE.toFixed(0)})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100/60 flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      <span>{item.players.length} Core Identified</span>
                      <span className="flex items-center gap-1 transition-transform" style={{ color: theme.primary }}>
                        Spotlight <ArrowRight size={10} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredTeamMetrics.length === 0 && (
              <div className="text-center py-10 glass-card rounded-[2rem] bg-white border border-slate-200">
                <Search size={32} className="text-slate-300 mx-auto mb-2 animate-pulse" />
                <p className="text-sm font-black text-slate-600 uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>No Teams Match Query</p>
                <p className="text-xs text-slate-400">Try adjusting your filters or search queries.</p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ─── View 2: League-wide Core Leaders Chart ─── */}
      {viewMode === "league" && (
        <section className="glass-card p-6 rounded-[2rem] bg-white border border-slate-200/60 shadow-sm space-y-6">
          <div>
            <h2 className="text-2xl font-black text-slate-800 m-0 uppercase tracking-wide flex items-center gap-2" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              <TrendingUp size={22} className="text-[#c9082a]" />
              Top 15 NBA Core Leaders
            </h2>
            <p className="text-sm text-slate-400 mt-1">League-wide comparison of the top players ranked dynamically by machine learning Importance Score.</p>
          </div>

          <div className="h-[28rem] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={leagueTopPlayers}
                margin={{ top: 20, right: 30, left: 40, bottom: 20 }}
                barSize={12}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" stroke="#94a3b8" fontSize={10} domain={[0, 100]} />
                <YAxis 
                  type="category" 
                  dataKey="PLAYER_NAME" 
                  stroke="#475569" 
                  fontSize={10} 
                  tickLine={false} 
                  width={130}
                  style={{ fontWeight: "700", fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase" }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as PlayerCore;
                      return (
                        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-md space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-[#1d428a] bg-[#1d428a]/5 px-2 py-0.5 rounded-lg">
                              {data.TEAM_ABBREVIATION}
                            </span>
                            <span className="text-xs font-black text-[#c9082a] bg-[#c9082a]/5 px-2 py-0.5 rounded-lg">
                              Rank #{data.CORE_RANK}
                            </span>
                          </div>
                          <p className="text-sm font-black text-slate-800 uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                            {data.PLAYER_NAME}
                          </p>
                          <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100">
                            <span className="text-slate-400 font-bold">Importance Score:</span>
                            <span className="font-mono font-black text-slate-900">{data.IMPORTANCE_SCORE.toFixed(2)}%</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="IMPORTANCE_SCORE" name="Importance Score" radius={[0, 4, 4, 0]}>
                  {leagueTopPlayers.map((_, index) => {
                    // Distinct color scheme based on ranking tiers
                    let color = "#3b82f6"; // Tier 3
                    if (index < 3) color = "#eab308"; // Gold Tier (Top 3)
                    else if (index < 7) color = "#1d428a"; // Blue Tier (NBA Primary Core)
                    else if (index < 12) color = "#c9082a"; // Red Tier (Secondary Primary Core)
                    return <Cell key={`cell-${index}`} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap gap-4 text-xs justify-center pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 rounded-md bg-[#eab308]"></div>
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Tier 1: League MVP Core (Ranks 1-3)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 rounded-md bg-[#1d428a]"></div>
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Tier 2: Primary All-Stars (Ranks 4-7)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 rounded-md bg-[#c9082a]"></div>
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Tier 3: Impact Starters (Ranks 8-12)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 rounded-md bg-[#3b82f6]"></div>
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Tier 4: Rotation Backbone (Ranks 13-15)</span>
            </div>
          </div>
        </section>
      )}

    </div>
  );
};

export default CorePlayers;
