import React, { useState, useMemo } from "react";
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  TrendingUp, 
  ArrowUpDown, 
  Trophy, 
  Zap, 
  Clock, 
  Target, 
  Flame, 
  User, 
  Award, 
  Grid, 
  Table, 
  BarChart3,
  SlidersHorizontal
} from "lucide-react";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";

interface StarCandidate {
  PLAYER_ID: number;
  PLAYER_NAME: string;
  TEAMS_PLAYED_FOR: string;
  GP: number;
  AVG_MIN: number;
  AVG_PTS: number;
  AVG_REB: number;
  AVG_AST: number;
  IMPORTANCE_SCORE: number;
  LEAGUE_RANK: number;
}

interface StarCandidatesProps {
  candidates: StarCandidate[];
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
  // Handles multiple teams listed, e.g. "LAL/MIA" - splits and matches first one
  const cleanAbbr = teamAbbr ? teamAbbr.split("/")[0].trim() : "";
  return TEAM_THEMES[cleanAbbr] || { primary: "#1d428a", secondary: "#c9082a" };
};

const StarCandidates: React.FC<StarCandidatesProps> = ({ candidates }) => {
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "table" | "chart">("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<string>("LEAGUE_RANK");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [minPPG, setMinPPG] = useState<number>(0);
  const [minMPG, setMinMPG] = useState<number>(0);
  const [minGP, setMinGP] = useState<number>(0);
  const [showFilters, setShowFilters] = useState(false);

  const itemsPerPage = 12;

  // Overview calculations
  const overviewStats = useMemo(() => {
    if (candidates.length === 0) return { total: 0, avgPPG: 0, eliteImportance: 0 };
    const avgPts = candidates.reduce((acc, p) => acc + p.AVG_PTS, 0) / candidates.length;
    const sorted = [...candidates].sort((a, b) => b.IMPORTANCE_SCORE - a.IMPORTANCE_SCORE);
    return {
      total: candidates.length,
      avgPPG: avgPts,
      eliteImportance: sorted[0]?.IMPORTANCE_SCORE ?? 0
    };
  }, [candidates]);

  // Handle column sorting toggle
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "LEAGUE_RANK" ? "asc" : "desc");
    }
    setCurrentPage(1);
  };

  // Filter candidates based on search query and threshold sliders
  const filteredCandidates = useMemo(() => {
    let result = candidates.filter(player => {
      const matchesSearch = player.PLAYER_NAME.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (player.TEAMS_PLAYED_FOR && player.TEAMS_PLAYED_FOR.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesPPG = player.AVG_PTS >= minPPG;
      const matchesMPG = player.AVG_MIN >= minMPG;
      const matchesGP = player.GP >= minGP;

      return matchesSearch && matchesPPG && matchesMPG && matchesGP;
    });

    // Apply sorting
    result.sort((a, b) => {
      let valA = a[sortBy as keyof StarCandidate];
      let valB = b[sortBy as keyof StarCandidate];

      if (typeof valA === "string" && typeof valB === "string") {
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (typeof valA === "number" && typeof valB === "number") {
        return sortOrder === "asc" ? valA - valB : valB - valA;
      }
      return 0;
    });

    return result;
  }, [candidates, searchQuery, sortBy, sortOrder, minPPG, minMPG, minGP]);

  // Paginated list for cards and tables
  const paginatedCandidates = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredCandidates.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredCandidates, currentPage]);

  const totalPages = Math.ceil(filteredCandidates.length / itemsPerPage);

  // SVG circular progress percentage offset
  const getStrokeDashOffset = (score: number) => {
    const radius = 24;
    const circumference = 2 * Math.PI * radius;
    return circumference - (score / 100) * circumference;
  };

  const getPlayerTier = (rank: number) => {
    if (rank <= 5) return { title: "MVP Contender", class: "bg-amber-100 text-amber-800 border-amber-200" };
    if (rank <= 15) return { title: "All-Star Elite", class: "bg-[#1d428a]/10 text-[#1d428a] border-[#1d428a]/20" };
    if (rank <= 30) return { title: "All-NBA Caliber", class: "bg-[#c9082a]/10 text-[#c9082a] border-[#c9082a]/20" };
    return { title: "Key Engine", class: "bg-slate-100 text-slate-700 border-slate-200" };
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* ─── Page Header ─── */}
      <section className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-8 shadow-sm">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-amber-500/5 to-slate-200/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#b45309] shadow-xs">
              <Trophy size={12} className="animate-bounce" />
              League Leaders Showcase
            </div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tight text-slate-900 m-0 uppercase leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Star Candidates
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
              League-wide star classification and cornerstone metrics. Dynamically ranked by ML models using multi-game efficiency metrics.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex flex-wrap gap-4">
            <div className="glass-card flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border border-slate-100 shadow-xs">
              <div className="p-2 bg-slate-50 rounded-lg text-slate-500">
                <User size={18} />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-none">Candidates</p>
                <p className="text-lg font-black text-slate-800 leading-none mt-1">{overviewStats.total} Players</p>
              </div>
            </div>

            <div className="glass-card flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border border-slate-100 shadow-xs">
              <div className="p-2 bg-amber-500/10 rounded-lg text-amber-600">
                <Flame size={18} />
              </div>
              <div>
                <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider leading-none">Avg PPG</p>
                <p className="text-lg font-black text-slate-800 leading-none mt-1">{overviewStats.avgPPG.toFixed(1)} Pts</p>
              </div>
            </div>

            <div className="glass-card flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border border-slate-100 shadow-xs">
              <div className="p-2 bg-[#1d428a]/10 rounded-lg text-[#1d428a]">
                <TrendingUp size={18} />
              </div>
              <div>
                <p className="text-[10px] text-[#1d428a] font-bold uppercase tracking-wider leading-none">Max Importance</p>
                <p className="text-lg font-black text-slate-800 leading-none mt-1">{overviewStats.eliteImportance.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* View Selection & Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-8 border-t border-slate-200/60 pt-5">
          <div className="flex gap-2">
            <button 
              onClick={() => setViewMode("grid")}
              className={`results-segment ${viewMode === "grid" ? "results-segment-active" : ""}`}
            >
              <Grid size={13} />
              Leaderboard Spotlight
            </button>
            <button 
              onClick={() => setViewMode("table")}
              className={`results-segment ${viewMode === "table" ? "results-segment-active" : ""}`}
            >
              <Table size={13} />
              Roster Matrix
            </button>
            <button 
              onClick={() => setViewMode("chart")}
              className={`results-segment ${viewMode === "chart" ? "results-segment-active" : ""}`}
            >
              <BarChart3 size={13} />
              Distribution Chart
            </button>
          </div>

          <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
            <div className="relative">
              <input
                type="text"
                placeholder="Search candidates or teams..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-64 bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1d428a]/15 font-semibold shadow-xs"
              />
              <Search className="absolute left-3 top-2.5 text-slate-400" size={12} />
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs font-semibold shadow-xs transition-colors ${
                showFilters || minPPG > 0 || minMPG > 0 || minGP > 0
                  ? "bg-[#1d428a]/5 border-[#1d428a]/20 text-[#1d428a]"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <SlidersHorizontal size={13} />
              Filters
            </button>
          </div>
        </div>

        {/* Expandable Sliders Filter Bar */}
        {(showFilters || minPPG > 0 || minMPG > 0 || minGP > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-4 p-5 bg-slate-50 rounded-2xl border border-slate-100 animate-fade-in-up">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>Minimum PPG: {minPPG}</span>
                {minPPG > 0 && <button onClick={() => setMinPPG(0)} className="text-[10px] text-[#c9082a] uppercase font-bold">Clear</button>}
              </div>
              <input
                type="range"
                min="0"
                max="35"
                step="1"
                value={minPPG}
                onChange={(e) => { setMinPPG(Number(e.target.value)); setCurrentPage(1); }}
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1d428a]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>Minimum Minutes: {minMPG}</span>
                {minMPG > 0 && <button onClick={() => setMinMPG(0)} className="text-[10px] text-[#c9082a] uppercase font-bold">Clear</button>}
              </div>
              <input
                type="range"
                min="0"
                max="40"
                step="2"
                value={minMPG}
                onChange={(e) => { setMinMPG(Number(e.target.value)); setCurrentPage(1); }}
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1d428a]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>Minimum Games: {minGP}</span>
                {minGP > 0 && <button onClick={() => setMinGP(0)} className="text-[10px] text-[#c9082a] uppercase font-bold">Clear</button>}
              </div>
              <input
                type="range"
                min="0"
                max="82"
                step="5"
                value={minGP}
                onChange={(e) => { setMinGP(Number(e.target.value)); setCurrentPage(1); }}
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1d428a]"
              />
            </div>
          </div>
        )}
      </section>

      {/* ─── View 1: Leaderboard Spotlight Spotlight Grid (Trophy Podium + Cards) ─── */}
      {viewMode === "grid" && (
        <div className="space-y-8">
          
          {/* Champions Podium for Top 3 (Only shown when search/filters are cleared) */}
          {searchQuery === "" && minPPG === 0 && minMPG === 0 && minGP === 0 && candidates.length >= 3 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end pt-8 pb-4">
              
              {/* RANK #2 (Silver Medal - Left side) */}
              {(() => {
                const player = candidates[1];
                const theme = getTeamTheme(player.TEAMS_PLAYED_FOR);
                const tier = getPlayerTier(2);
                return (
                  <div 
                    className="glass-card p-6 rounded-[2rem] border transition-all duration-300 relative overflow-hidden order-2 md:order-1 hover:scale-[1.01] hover:shadow-md h-[21rem] flex flex-col justify-between"
                    style={{
                      background: `linear-gradient(135deg, ${theme.primary}0d 0%, #ffffff 100%)`,
                      borderColor: "#cbd5e1"
                    }}
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 rounded-bl-full pointer-events-none" style={{ backgroundColor: `${theme.primary}08` }} />
                    <div className="space-y-4 relative z-10">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-100 border border-slate-200 px-3 py-1 rounded-full flex items-center gap-1">
                          <Award size={10} /> Rank #2
                        </span>
                        <span className={`text-[9px] font-black uppercase tracking-wider border px-2 py-0.5 rounded-lg ${tier.class}`}>
                          {tier.title}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h2 className="text-2xl font-black text-slate-800 uppercase leading-tight truncate" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                          {player.PLAYER_NAME}
                        </h2>
                        <span 
                          className="inline-block text-xs font-black uppercase px-2.5 py-0.5 rounded-md"
                          style={{ backgroundColor: `${theme.primary}12`, color: theme.primary }}
                        >
                          {player.TEAMS_PLAYED_FOR}
                        </span>
                      </div>
                    </div>

                    {/* Stats mini-columns */}
                    <div className="grid grid-cols-3 gap-2 py-2 border-t border-b border-slate-100/60 font-mono text-xs">
                      <div>
                        <span className="text-[8px] text-slate-400 font-extrabold uppercase block">PTS</span>
                        <span className="text-sm font-black text-slate-800">{player.AVG_PTS.toFixed(1)}</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-400 font-extrabold uppercase block">AST</span>
                        <span className="text-sm font-black text-slate-800">{player.AVG_AST.toFixed(1)}</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-400 font-extrabold uppercase block">REB</span>
                        <span className="text-sm font-black text-slate-800">{player.AVG_REB.toFixed(1)}</span>
                      </div>
                    </div>

                    {/* Importance SVG gauge */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="relative w-12 h-12">
                          <svg className="w-full h-full transform -rotate-90">
                            <circle cx="24" cy="24" r="20" stroke={`${theme.primary}18`} strokeWidth="3" fill="transparent" />
                            <circle 
                              cx="24" 
                              cy="24" 
                              r="20" 
                              stroke={theme.primary} 
                              strokeWidth="3" 
                              fill="transparent" 
                              strokeDasharray={2 * Math.PI * 20}
                              strokeDashoffset={getStrokeDashOffset(player.IMPORTANCE_SCORE)}
                              strokeLinecap="round"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black font-mono text-slate-700">
                            {player.IMPORTANCE_SCORE.toFixed(0)}
                          </div>
                        </div>
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wide">Importance Score</span>
                      </div>
                      <span className="text-[9px] text-slate-400 font-bold font-mono">{player.GP} GP</span>
                    </div>
                  </div>
                );
              })()}

              {/* RANK #1 (Gold Medal & Trophy - Center tall) */}
              {(() => {
                const player = candidates[0];
                const theme = getTeamTheme(player.TEAMS_PLAYED_FOR);
                const tier = getPlayerTier(1);
                return (
                  <div 
                    className="glass-card p-8 rounded-[2.25rem] border-2 transition-all duration-300 relative overflow-hidden order-1 md:order-2 hover:scale-[1.01] hover:shadow-lg h-[24rem] flex flex-col justify-between"
                    style={{
                      background: `linear-gradient(135deg, ${theme.primary}12 0%, #ffffff 100%)`,
                      borderColor: "#eab308",
                      boxShadow: `0 10px 30px ${theme.primary}12, inset 0 0 0 1px #eab30830`
                    }}
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 rounded-bl-full pointer-events-none" style={{ backgroundColor: `${theme.primary}0a` }} />
                    <div className="absolute -top-3 -left-3 w-16 h-16 opacity-10 bg-amber-500 rounded-full blur-xl animate-pulse" />
                    
                    <div className="space-y-4 relative z-10">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#b45309] bg-amber-500/10 border border-amber-500/20 px-3.5 py-1.5 rounded-full flex items-center gap-1.5">
                          <Trophy size={11} className="text-amber-500 animate-spin" style={{ animationDuration: "12s" }} /> Rank #1
                        </span>
                        <span className={`text-[9px] font-black uppercase tracking-wider border px-2.5 py-0.5 rounded-lg ${tier.class}`}>
                          {tier.title}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h2 className="text-3xl font-black text-slate-800 uppercase leading-tight truncate" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                          {player.PLAYER_NAME}
                        </h2>
                        <span 
                          className="inline-block text-xs font-black uppercase px-3 py-1 rounded-md"
                          style={{ backgroundColor: `${theme.primary}18`, color: theme.primary }}
                        >
                          {player.TEAMS_PLAYED_FOR}
                        </span>
                      </div>
                    </div>

                    {/* Stats mini-columns */}
                    <div className="grid grid-cols-3 gap-2 py-3.5 border-t border-b border-slate-100/60 font-mono text-xs">
                      <div>
                        <span className="text-[8px] text-slate-400 font-extrabold uppercase block">PTS</span>
                        <span className="text-base font-black text-slate-800">{player.AVG_PTS.toFixed(1)}</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-400 font-extrabold uppercase block">AST</span>
                        <span className="text-base font-black text-slate-800">{player.AVG_AST.toFixed(1)}</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-400 font-extrabold uppercase block">REB</span>
                        <span className="text-base font-black text-slate-800">{player.AVG_REB.toFixed(1)}</span>
                      </div>
                    </div>

                    {/* Importance SVG gauge */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="relative w-14 h-14">
                          <svg className="w-full h-full transform -rotate-90">
                            <circle cx="28" cy="28" r="24" stroke={`${theme.primary}20`} strokeWidth="3.5" fill="transparent" />
                            <circle 
                              cx="28" 
                              cy="28" 
                              r="24" 
                              stroke={theme.primary} 
                              strokeWidth="3.5" 
                              fill="transparent" 
                              strokeDasharray={2 * Math.PI * 24}
                              strokeDashoffset={getStrokeDashOffset(player.IMPORTANCE_SCORE)}
                              strokeLinecap="round"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center text-xs font-black font-mono text-slate-700">
                            {player.IMPORTANCE_SCORE.toFixed(0)}
                          </div>
                        </div>
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wide">Importance Score</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-bold font-mono">{player.GP} Games</span>
                    </div>
                  </div>
                );
              })()}

              {/* RANK #3 (Bronze Medal - Right side) */}
              {(() => {
                const player = candidates[2];
                const theme = getTeamTheme(player.TEAMS_PLAYED_FOR);
                const tier = getPlayerTier(3);
                return (
                  <div 
                    className="glass-card p-6 rounded-[2rem] border transition-all duration-300 relative overflow-hidden order-3 hover:scale-[1.01] hover:shadow-md h-[19.5rem] flex flex-col justify-between"
                    style={{
                      background: `linear-gradient(135deg, ${theme.primary}0d 0%, #ffffff 100%)`,
                      borderColor: "#e2e8f0"
                    }}
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 rounded-bl-full pointer-events-none" style={{ backgroundColor: `${theme.primary}08` }} />
                    <div className="space-y-4 relative z-10">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#b45309] bg-[#b45309]/5 border border-[#b45309]/15 px-3 py-1 rounded-full flex items-center gap-1">
                          <Award size={10} /> Rank #3
                        </span>
                        <span className={`text-[9px] font-black uppercase tracking-wider border px-2 py-0.5 rounded-lg ${tier.class}`}>
                          {tier.title}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h2 className="text-2xl font-black text-slate-800 uppercase leading-tight truncate" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                          {player.PLAYER_NAME}
                        </h2>
                        <span 
                          className="inline-block text-xs font-black uppercase px-2.5 py-0.5 rounded-md"
                          style={{ backgroundColor: `${theme.primary}12`, color: theme.primary }}
                        >
                          {player.TEAMS_PLAYED_FOR}
                        </span>
                      </div>
                    </div>

                    {/* Stats mini-columns */}
                    <div className="grid grid-cols-3 gap-2 py-2 border-t border-b border-slate-100/60 font-mono text-xs">
                      <div>
                        <span className="text-[8px] text-slate-400 font-extrabold uppercase block">PTS</span>
                        <span className="text-sm font-black text-slate-800">{player.AVG_PTS.toFixed(1)}</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-400 font-extrabold uppercase block">AST</span>
                        <span className="text-sm font-black text-slate-800">{player.AVG_AST.toFixed(1)}</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-400 font-extrabold uppercase block">REB</span>
                        <span className="text-sm font-black text-slate-800">{player.AVG_REB.toFixed(1)}</span>
                      </div>
                    </div>

                    {/* Importance SVG gauge */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="relative w-12 h-12">
                          <svg className="w-full h-full transform -rotate-90">
                            <circle cx="24" cy="24" r="20" stroke={`${theme.primary}18`} strokeWidth="3" fill="transparent" />
                            <circle 
                              cx="24" 
                              cy="24" 
                              r="20" 
                              stroke={theme.primary} 
                              strokeWidth="3" 
                              fill="transparent" 
                              strokeDasharray={2 * Math.PI * 20}
                              strokeDashoffset={getStrokeDashOffset(player.IMPORTANCE_SCORE)}
                              strokeLinecap="round"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black font-mono text-slate-700">
                            {player.IMPORTANCE_SCORE.toFixed(0)}
                          </div>
                        </div>
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wide">Importance Score</span>
                      </div>
                      <span className="text-[9px] text-slate-400 font-bold font-mono">{player.GP} GP</span>
                    </div>
                  </div>
                );
              })()}

            </div>
          )}

          {/* Leaderboard Cards Grid (excluding the podium leaders unless filters are applied) */}
          <div className="space-y-4">
            <h2 className="text-xl font-black text-slate-800 m-0 uppercase tracking-wide" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              {searchQuery !== "" || minPPG > 0 || minMPG > 0 || minGP > 0 ? "Filtered Results" : "Remaining Candidates List"}
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(searchQuery !== "" || minPPG > 0 || minMPG > 0 || minGP > 0
                ? filteredCandidates
                : filteredCandidates.slice(3)
              ).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((player) => {
                const theme = getTeamTheme(player.TEAMS_PLAYED_FOR);
                const tier = getPlayerTier(player.LEAGUE_RANK);
                return (
                  <div
                    key={player.PLAYER_ID}
                    className="glass-card p-5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs hover:scale-[1.005] transition-all duration-300 flex flex-col justify-between relative overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${theme.primary}05 0%, #ffffff 100%)`
                    }}
                  >
                    <div className="space-y-4">
                      {/* Card Header */}
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-slate-400 font-mono">#{player.LEAGUE_RANK}</span>
                          <span 
                            className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md"
                            style={{ backgroundColor: `${theme.primary}12`, color: theme.primary }}
                          >
                            {player.TEAMS_PLAYED_FOR}
                          </span>
                        </div>
                        <span className={`text-[8px] font-extrabold uppercase border px-2 py-0.5 rounded-lg ${tier.class}`}>
                          {tier.title}
                        </span>
                      </div>

                      {/* Player info */}
                      <div>
                        <h3 className="text-lg font-black text-slate-800 uppercase leading-none truncate" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                          {player.PLAYER_NAME}
                        </h3>
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5 font-bold uppercase tracking-wider">NBA ID {player.PLAYER_ID}</p>
                      </div>

                      {/* Stats grid */}
                      <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-600 pt-1 border-t border-slate-50 font-semibold font-mono">
                        <div className="flex items-center gap-1.5">
                          <Flame size={12} className="text-[#c9082a]" /> PTS: {player.AVG_PTS.toFixed(1)}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Zap size={12} className="text-[#1d428a]" /> AST: {player.AVG_AST.toFixed(1)}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Target size={12} className="text-amber-500" /> REB: {player.AVG_REB.toFixed(1)}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock size={12} className="text-slate-400" /> MIN: {player.AVG_MIN.toFixed(1)}
                        </div>
                      </div>
                    </div>

                    {/* Importance Indicator and footer */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="relative w-8 h-8">
                          <svg className="w-full h-full transform -rotate-90">
                            <circle cx="16" cy="16" r="14" stroke={`${theme.primary}12`} strokeWidth="2.5" fill="transparent" />
                            <circle 
                              cx="16" 
                              cy="16" 
                              r="14" 
                              stroke={theme.primary} 
                              strokeWidth="2.5" 
                              fill="transparent" 
                              strokeDasharray={2 * Math.PI * 14}
                              strokeDashoffset={getStrokeDashOffset(player.IMPORTANCE_SCORE)}
                              strokeLinecap="round"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center text-[9px] font-black font-mono text-slate-700">
                            {player.IMPORTANCE_SCORE.toFixed(0)}
                          </div>
                        </div>
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Importance</span>
                      </div>
                      <span className="text-[9px] text-slate-400 font-semibold font-mono">{player.GP} Games</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Empty view check */}
            {filteredCandidates.length === 0 && (
              <div className="text-center py-10 glass-card rounded-[2rem] bg-white border border-slate-200">
                <Search size={32} className="text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-black text-slate-600 uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>No Players Match Filters</p>
                <p className="text-xs text-slate-400">Try adjusting your filters or search queries.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── View 2: Roster Matrix (Table List) ─── */}
      {viewMode === "table" && (
        <div className="glass-card rounded-[1.5rem] overflow-hidden shadow-xs border border-slate-200/60 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-400 text-xs uppercase font-bold border-b border-slate-200">
                <tr>
                  <th 
                    onClick={() => handleSort("LEAGUE_RANK")}
                    className="p-4 cursor-pointer hover:text-slate-800 select-none transition-colors"
                  >
                    Rank {sortBy === "LEAGUE_RANK" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th 
                    onClick={() => handleSort("PLAYER_NAME")}
                    className="p-4 cursor-pointer hover:text-slate-800 select-none transition-colors"
                  >
                    Player Name {sortBy === "PLAYER_NAME" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="p-4">Team</th>
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
                    className="p-4 cursor-pointer hover:text-[#1d428a] text-[#1d428a] font-bold select-none text-right transition-colors"
                  >
                    Importance {sortBy === "IMPORTANCE_SCORE" ? (sortOrder === "asc" ? "▲" : "▼") : ""} <ArrowUpDown size={10} className="inline ml-1" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {paginatedCandidates.map((player) => {
                  const theme = getTeamTheme(player.TEAMS_PLAYED_FOR);
                  return (
                    <tr key={player.PLAYER_ID} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-mono font-bold text-slate-400">{player.LEAGUE_RANK}</td>
                      <td className="p-4 font-bold text-slate-800">{player.PLAYER_NAME}</td>
                      <td className="p-4 text-xs font-bold">
                        <span 
                          className="px-2 py-0.5 rounded"
                          style={{ backgroundColor: `${theme.primary}12`, color: theme.primary }}
                        >
                          {player.TEAMS_PLAYED_FOR}
                        </span>
                      </td>
                      <td className="p-4 text-center font-mono">{player.GP}</td>
                      <td className="p-4 text-right font-mono">{player.AVG_MIN.toFixed(1)}</td>
                      <td className="p-4 text-right font-mono">{player.AVG_PTS.toFixed(1)}</td>
                      <td className="p-4 text-right font-mono">{player.AVG_REB.toFixed(1)}</td>
                      <td className="p-4 text-right font-mono">{player.AVG_AST.toFixed(1)}</td>
                      <td className="p-4 text-right font-mono font-bold" style={{ color: theme.primary }}>{player.IMPORTANCE_SCORE.toFixed(2)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredCandidates.length === 0 && (
            <div className="text-center py-10 bg-white">
              <Search size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-black text-slate-600 uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>No Players Match Filters</p>
              <p className="text-xs text-slate-400">Try adjusting your filters or search queries.</p>
            </div>
          )}
        </div>
      )}

      {/* ─── View 3: Distribution Scatter Plot ─── */}
      {viewMode === "chart" && (
        <section className="glass-card p-6 rounded-[2rem] bg-white border border-slate-200/60 shadow-sm space-y-6">
          <div>
            <h2 className="text-2xl font-black text-slate-800 m-0 uppercase tracking-wide flex items-center gap-2" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              <TrendingUp size={22} className="text-[#1d428a]" />
              Importance vs Scoring Scatter Plot
            </h2>
            <p className="text-sm text-slate-400 mt-1">Cross-analyzing player Points Per Game (PPG) against their ML Importance Score. High importance & low points indicates structural value.</p>
          </div>

          <div className="h-[28rem] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis 
                  type="number" 
                  dataKey="IMPORTANCE_SCORE" 
                  name="Importance Score" 
                  unit="%" 
                  stroke="#94a3b8" 
                  fontSize={10} 
                  domain={[0, 100]}
                />
                <YAxis 
                  type="number" 
                  dataKey="AVG_PTS" 
                  name="Points Per Game" 
                  unit=" Pts" 
                  stroke="#94a3b8" 
                  fontSize={10} 
                  domain={[0, 35]}
                />
                <Tooltip 
                  cursor={{ strokeDasharray: "3 3" }} 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as StarCandidate;
                      const theme = getTeamTheme(data.TEAMS_PLAYED_FOR);
                      return (
                        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-md space-y-2">
                          <div className="flex items-center gap-2">
                            <span 
                              className="text-xs font-black px-2 py-0.5 rounded-lg"
                              style={{ backgroundColor: `${theme.primary}12`, color: theme.primary }}
                            >
                              {data.TEAMS_PLAYED_FOR}
                            </span>
                            <span className="text-xs font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">
                              Rank #{data.LEAGUE_RANK}
                            </span>
                          </div>
                          <p className="text-sm font-black text-slate-800 uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                            {data.PLAYER_NAME}
                          </p>
                          <div className="flex justify-between items-center text-xs pt-1.5 border-t border-slate-100/60 font-semibold gap-6">
                            <span className="text-slate-400 font-bold">Importance Score:</span>
                            <span className="font-mono font-black text-slate-900">{data.IMPORTANCE_SCORE.toFixed(2)}%</span>
                          </div>
                          <div className="flex justify-between items-center text-xs font-semibold gap-6">
                            <span className="text-slate-400 font-bold">Points Avg:</span>
                            <span className="font-mono font-black text-slate-900">{data.AVG_PTS.toFixed(1)} Pts</span>
                          </div>
                          <div className="flex justify-between items-center text-xs font-semibold gap-6">
                            <span className="text-slate-400 font-bold">Minutes Avg:</span>
                            <span className="font-mono font-black text-slate-900">{data.AVG_MIN.toFixed(1)} Min</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter name="Star Candidates" data={filteredCandidates} fill="#1d428a">
                  {filteredCandidates.map((entry, index) => {
                    const theme = getTeamTheme(entry.TEAMS_PLAYED_FOR);
                    return (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={theme.primary} 
                        stroke={theme.secondary}
                        strokeWidth={1}
                        r={entry.LEAGUE_RANK <= 3 ? 9 : entry.LEAGUE_RANK <= 15 ? 7 : 5}
                        className="transition-all duration-300 hover:scale-125 cursor-pointer"
                      />
                    );
                  })}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap gap-4 text-xs justify-center pt-4 border-t border-slate-100 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded-full bg-slate-800 border-2 border-slate-400"></div>
              <span>Radius size maps to Rank Importance (Larger is higher)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 rounded-full bg-[#1d428a]"></div>
              <span>Points colored by team primary branding colors</span>
            </div>
          </div>
        </section>
      )}

      {/* ─── Pagination Footer ─── */}
      {viewMode !== "chart" && totalPages > 1 && (
        <div className="glass-card p-4 rounded-2xl bg-white border border-slate-200/60 shadow-xs flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-slate-500 font-semibold">
            Showing page <strong className="text-slate-700">{currentPage}</strong> of <strong className="text-slate-700">{totalPages}</strong> ({filteredCandidates.length} total players)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-1.5 bg-white border border-slate-200 rounded-md text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:hover:text-slate-500 hover:bg-slate-50 transition-colors shadow-xs"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-1.5 bg-white border border-slate-200 rounded-md text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:hover:text-slate-500 hover:bg-slate-50 transition-colors shadow-xs"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StarCandidates;
