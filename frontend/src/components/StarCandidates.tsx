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
  Grid,
  Table,
  BarChart3,
  SlidersHorizontal,
  Crown,
} from "lucide-react";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import TeamLogo from "./TeamLogo";
import PlayerPhoto from "./PlayerPhoto";

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
  const cleanAbbr = teamAbbr ? teamAbbr.split("/")[0].trim() : "";
  return TEAM_THEMES[cleanAbbr] || { primary: "#1d428a", secondary: "#c9082a" };
};

const getPrimaryTeamAbbr = (teamsPlayedFor: string) => (teamsPlayedFor ? teamsPlayedFor.split(",")[0].trim().split("/")[0].trim() : "");

const getTier = (rank: number) => {
  if (rank <= 3) return { title: "MVP Tier", tone: "bg-amber-100 text-amber-900 border-amber-200" };
  if (rank <= 10) return { title: "Superstar Tier", tone: "bg-[#1d428a]/10 text-[#1d428a] border-[#1d428a]/20" };
  if (rank <= 25) return { title: "All-NBA Tier", tone: "bg-[#c9082a]/10 text-[#c9082a] border-[#c9082a]/20" };
  if (rank <= 50) return { title: "All-Star Tier", tone: "bg-slate-100 text-slate-700 border-slate-200" };
  if (rank <= 100) return { title: "High Impact", tone: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  return { title: "Strong Rotation", tone: "bg-slate-50 text-slate-500 border-slate-200" };
};

const getDependenceLabel = (rank: number) => {
  if (rank <= 3) return "Very High";
  if (rank <= 15) return "High";
  if (rank <= 50) return "Medium";
  return "Low";
};

const getStrokeDashOffset = (score: number, radius: number) => {
  const circumference = 2 * Math.PI * radius;
  return circumference - (score / 100) * circumference;
};

const StarCandidates: React.FC<StarCandidatesProps> = ({ candidates }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "table" | "chart">("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<string>("LEAGUE_RANK");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [minPPG, setMinPPG] = useState<number>(0);
  const [minMPG, setMinMPG] = useState<number>(0);
  const [minGP, setMinGP] = useState<number>(0);
  const [selectedTeam, setSelectedTeam] = useState<string>("All");
  const [selectedTier, setSelectedTier] = useState<string>("All");
  const [minImpact, setMinImpact] = useState<number>(0);
  const [maxImpact, setMaxImpact] = useState<number>(100);
  const [showFilters, setShowFilters] = useState(false);

  const itemsPerPage = 12;

  const overviewStats = useMemo(() => {
    if (candidates.length === 0) return { total: 0, avgScore: 0, topScore: 0 };
    const sorted = [...candidates].sort((a, b) => b.IMPORTANCE_SCORE - a.IMPORTANCE_SCORE);
    const avgScore = candidates.reduce((acc, p) => acc + p.IMPORTANCE_SCORE, 0) / candidates.length;
    return { total: candidates.length, avgScore, topScore: sorted[0]?.IMPORTANCE_SCORE ?? 0 };
  }, [candidates]);

  const tierCounts = useMemo(() => {
    const counts = { MVP: 0, Superstar: 0, AllNBA: 0, AllStar: 0, HighImpact: 0, StrongRotation: 0 };
    candidates.forEach((player) => {
      if (player.LEAGUE_RANK <= 3) counts.MVP += 1;
      else if (player.LEAGUE_RANK <= 10) counts.Superstar += 1;
      else if (player.LEAGUE_RANK <= 25) counts.AllNBA += 1;
      else if (player.LEAGUE_RANK <= 50) counts.AllStar += 1;
      else if (player.LEAGUE_RANK <= 100) counts.HighImpact += 1;
      else counts.StrongRotation += 1;
    });
    return counts;
  }, [candidates]);

  const scoreDistribution = useMemo(() => {
    const buckets = [
      { label: "0-19", min: 0, max: 19, count: 0 },
      { label: "20-39", min: 20, max: 39, count: 0 },
      { label: "40-59", min: 40, max: 59, count: 0 },
      { label: "60-79", min: 60, max: 79, count: 0 },
      { label: "80-100", min: 80, max: 100, count: 0 },
    ];
    candidates.forEach((p) => {
      const bucket = buckets.find((b) => p.IMPORTANCE_SCORE >= b.min && p.IMPORTANCE_SCORE <= b.max);
      if (bucket) bucket.count += 1;
    });
    return buckets;
  }, [candidates]);

  const teams = useMemo(
    () => Array.from(new Set(candidates.map((c) => getPrimaryTeamAbbr(c.TEAMS_PLAYED_FOR)).filter(Boolean))).sort(),
    [candidates]
  );

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "LEAGUE_RANK" ? "asc" : "desc");
    }
    setCurrentPage(1);
  };

  const filteredCandidates = useMemo(() => {
    let result = candidates.filter((player) => {
      const matchesSearch =
        player.PLAYER_NAME.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (player.TEAMS_PLAYED_FOR && player.TEAMS_PLAYED_FOR.toLowerCase().includes(searchQuery.toLowerCase()));
      const teamAbbr = getPrimaryTeamAbbr(player.TEAMS_PLAYED_FOR);
      const matchesTeam = selectedTeam === "All" || teamAbbr === selectedTeam;
      const matchesTier = selectedTier === "All" || getTier(player.LEAGUE_RANK).title === selectedTier;
      const matchesPPG = player.AVG_PTS >= minPPG;
      const matchesMPG = player.AVG_MIN >= minMPG;
      const matchesGP = player.GP >= minGP;
      const matchesImpact = player.IMPORTANCE_SCORE >= minImpact && player.IMPORTANCE_SCORE <= maxImpact;
      return matchesSearch && matchesTeam && matchesTier && matchesPPG && matchesMPG && matchesGP && matchesImpact;
    });

    result.sort((a, b) => {
      const valA = a[sortBy as keyof StarCandidate];
      const valB = b[sortBy as keyof StarCandidate];
      if (typeof valA === "string" && typeof valB === "string") {
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (typeof valA === "number" && typeof valB === "number") {
        return sortOrder === "asc" ? valA - valB : valB - valA;
      }
      return 0;
    });

    return result;
  }, [candidates, searchQuery, selectedTeam, selectedTier, minPPG, minMPG, minGP, minImpact, maxImpact, sortBy, sortOrder]);

  const hasFilters = showFilters || minPPG > 0 || minMPG > 0 || minGP > 0 || selectedTeam !== "All" || selectedTier !== "All" || minImpact > 0 || maxImpact < 100;

  const displayedGridCandidates = useMemo(() => {
    const base = searchQuery !== "" || hasFilters ? filteredCandidates : filteredCandidates.slice(3);
    const startIdx = (currentPage - 1) * itemsPerPage;
    return base.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredCandidates, searchQuery, hasFilters, currentPage]);

  const paginatedCandidates = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredCandidates.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredCandidates, currentPage]);

  const totalPages = useMemo(() => {
    const base = searchQuery !== "" || hasFilters ? filteredCandidates : filteredCandidates.slice(3);
    return Math.ceil(base.length / itemsPerPage);
  }, [filteredCandidates, searchQuery, hasFilters]);

  return (
    <div className="space-y-8 animate-fade-in-up">
      <section className="surface relative overflow-hidden rounded-[2rem] p-6 lg:p-8">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
              <Trophy size={12} />
              NBA Impact Rankings
            </div>
            <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase leading-none lg:text-5xl" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              NBA Impact Rankings
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
              The Impact Score evaluates player influence based on production, consistency, workload, and team dependence.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="kpi-card flex items-center gap-3">
              <div className="rounded-xl bg-slate-900 p-2.5 text-white"><User size={16} /></div>
              <div><p className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">Evaluated</p><p className="mt-1 text-lg font-black text-slate-900">{overviewStats.total}</p></div>
            </div>
            <div className="kpi-card flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700"><Flame size={16} /></div>
              <div><p className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">Average Score</p><p className="mt-1 text-lg font-black text-slate-900">{overviewStats.avgScore.toFixed(1)}%</p></div>
            </div>
            <div className="kpi-card flex items-center gap-3">
              <div className="rounded-xl bg-[#1d428a]/10 p-2.5 text-[#1d428a]"><TrendingUp size={16} /></div>
              <div><p className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">Highest Score</p><p className="mt-1 text-lg font-black text-slate-900">{overviewStats.topScore.toFixed(1)}%</p></div>
            </div>
            <div className="kpi-card flex items-center gap-3">
              <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700"><Trophy size={16} /></div>
              <div><p className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">Elite Tier</p><p className="mt-1 text-lg font-black text-slate-900">{tierCounts.MVP + tierCounts.Superstar}</p></div>
            </div>
            <div className="kpi-card flex items-center gap-3">
              <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700"><Crown size={16} /></div>
              <div><p className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">MVP Tier</p><p className="mt-1 text-lg font-black text-slate-900">{tierCounts.MVP}</p></div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="m-0 text-lg font-black uppercase tracking-wide text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                How Impact Score Works
              </h2>
              <p className="mt-1 text-xs text-slate-400">The model is intentionally simple to read and hard to game.</p>
            </div>
            <div className="text-xs font-semibold text-slate-400">Higher score means stronger league-wide influence</div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
            {[
              ["Scoring Production", 28],
              ["Minutes Played", 22],
              ["Consistency", 18],
              ["Team Dependence", 20],
              ["Statistical Contribution", 12],
            ].map(([label, weight]) => (
              <div key={label as string} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{label as string}</span>
                  <span className="text-[10px] font-black text-slate-400">{weight as number}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-slate-900" style={{ width: `${weight}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="m-0 text-lg font-black uppercase tracking-wide text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                Importance Score Distribution
              </h2>
              <p className="mt-1 text-xs text-slate-400">Histogram and tier counts provide context for the ranking spread.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
              <span>MVP: {tierCounts.MVP}</span>
              <span>Superstar: {tierCounts.Superstar}</span>
              <span>All-NBA: {tierCounts.AllNBA}</span>
              <span>All-Star: {tierCounts.AllStar}</span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-5 gap-2">
            {(() => {
              const maxCount = Math.max(...scoreDistribution.map((b) => b.count), 1);
              return scoreDistribution.map((bucket) => (
                <div key={bucket.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex h-28 items-end justify-center">
                    <div className="w-full rounded-t-xl bg-slate-900" style={{ height: `${Math.max((bucket.count / maxCount) * 100, 8)}%` }} />
                  </div>
                  <div className="mt-2 text-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{bucket.label}</p>
                    <p className="text-sm font-black text-slate-900">{bucket.count}</p>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-8 border-t border-slate-200/60 pt-5">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setViewMode("grid")} className={`results-segment ${viewMode === "grid" ? "results-segment-active" : ""}`}><Grid size={13} />Leaderboard Spotlight</button>
            <button onClick={() => setViewMode("table")} className={`results-segment ${viewMode === "table" ? "results-segment-active" : ""}`}><Table size={13} />Roster Matrix</button>
            <button onClick={() => setViewMode("chart")} className={`results-segment ${viewMode === "chart" ? "results-segment-active" : ""}`}><BarChart3 size={13} />Distribution Chart</button>
          </div>

          <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
            <div className="relative">
              <input
                type="text"
                placeholder="Search candidates or teams..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-64 bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1d428a]/15 font-semibold shadow-xs"
              />
              <Search className="absolute left-3 top-2.5 text-slate-400" size={12} />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs font-semibold shadow-xs transition-colors ${hasFilters ? "bg-[#1d428a]/5 border-[#1d428a]/20 text-[#1d428a]" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              <SlidersHorizontal size={13} />
              Filters
            </button>
          </div>
        </div>

        {(hasFilters) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-4 p-5 bg-slate-50 rounded-2xl border border-slate-100 animate-fade-in-up">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>Team</span>
                {selectedTeam !== "All" && <button onClick={() => setSelectedTeam("All")} className="text-[10px] text-[#c9082a] uppercase font-bold">Clear</button>}
              </div>
              <select value={selectedTeam} onChange={(e) => { setSelectedTeam(e.target.value); setCurrentPage(1); }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                <option value="All">All Teams</option>
                {teams.map(team => <option key={team} value={team}>{team}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>Tier</span>
                {selectedTier !== "All" && <button onClick={() => setSelectedTier("All")} className="text-[10px] text-[#c9082a] uppercase font-bold">Clear</button>}
              </div>
              <select value={selectedTier} onChange={(e) => { setSelectedTier(e.target.value); setCurrentPage(1); }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                <option value="All">All Tiers</option>
                {["MVP Tier", "Superstar Tier", "All-NBA Tier", "All-Star Tier", "High Impact", "Strong Rotation"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>Impact Min: {minImpact}</span>
                {minImpact > 0 && <button onClick={() => setMinImpact(0)} className="text-[10px] text-[#c9082a] uppercase font-bold">Clear</button>}
              </div>
              <input type="range" min="0" max="100" step="1" value={minImpact} onChange={(e) => { setMinImpact(Number(e.target.value)); setCurrentPage(1); }} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1d428a]" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>Impact Max: {maxImpact}</span>
                {maxImpact < 100 && <button onClick={() => setMaxImpact(100)} className="text-[10px] text-[#c9082a] uppercase font-bold">Clear</button>}
              </div>
              <input type="range" min="0" max="100" step="1" value={maxImpact} onChange={(e) => { setMaxImpact(Number(e.target.value)); setCurrentPage(1); }} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1d428a]" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>Minimum PPG: {minPPG}</span>
                {minPPG > 0 && <button onClick={() => setMinPPG(0)} className="text-[10px] text-[#c9082a] uppercase font-bold">Clear</button>}
              </div>
              <input type="range" min="0" max="35" step="1" value={minPPG} onChange={(e) => { setMinPPG(Number(e.target.value)); setCurrentPage(1); }} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1d428a]" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>Minimum Minutes: {minMPG}</span>
                {minMPG > 0 && <button onClick={() => setMinMPG(0)} className="text-[10px] text-[#c9082a] uppercase font-bold">Clear</button>}
              </div>
              <input type="range" min="0" max="40" step="2" value={minMPG} onChange={(e) => { setMinMPG(Number(e.target.value)); setCurrentPage(1); }} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1d428a]" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>Minimum Games: {minGP}</span>
                {minGP > 0 && <button onClick={() => setMinGP(0)} className="text-[10px] text-[#c9082a] uppercase font-bold">Clear</button>}
              </div>
              <input type="range" min="0" max="82" step="5" value={minGP} onChange={(e) => { setMinGP(Number(e.target.value)); setCurrentPage(1); }} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1d428a]" />
            </div>
          </div>
        )}
      </section>

      {viewMode === "grid" && (
        <div className="space-y-8">
          {searchQuery === "" && !hasFilters && candidates.length >= 3 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end pt-8 pb-4">
              {(() => {
                const player = candidates[1];
                const theme = getTeamTheme(player.TEAMS_PLAYED_FOR);
                const tier = getTier(player.LEAGUE_RANK);
                return (
                  <div className="surface p-5 rounded-[1.75rem] border transition-all duration-300 relative overflow-hidden order-2 md:order-1 hover:shadow-md h-[21rem] flex flex-col justify-between" style={{ background: `linear-gradient(135deg, ${theme.primary}08 0%, #ffffff 100%)`, borderColor: "#cbd5e1" }}>
                    <div className="absolute top-0 right-0 w-24 h-24 rounded-bl-full pointer-events-none" style={{ backgroundColor: `${theme.primary}08` }} />
                    <div className="space-y-4 relative z-10">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">🥈 Elite Challenger</span>
                        <span className={`text-[9px] font-black uppercase tracking-wider border px-2 py-0.5 rounded-lg ${tier.tone}`}>{tier.title}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <PlayerPhoto playerId={player.PLAYER_ID} name={player.PLAYER_NAME} size={60} />
                        <div className="min-w-0">
                          <h2 className="truncate text-2xl font-black uppercase leading-tight text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{player.PLAYER_NAME}</h2>
                          <div className="mt-1 flex items-center gap-2">
                            <TeamLogo abbr={getPrimaryTeamAbbr(player.TEAMS_PLAYED_FOR)} name={player.TEAMS_PLAYED_FOR} size={18} />
                            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">{player.TEAMS_PLAYED_FOR}</span>
                          </div>
                          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Why ranked here: elite two-way impact with a high dependence load.</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 py-2 border-t border-b border-slate-100/60 font-mono text-xs">
                      <div><span className="text-[8px] text-slate-400 font-extrabold uppercase block">PTS</span><span className="text-sm font-black text-slate-800">{player.AVG_PTS.toFixed(1)}</span></div>
                      <div><span className="text-[8px] text-slate-400 font-extrabold uppercase block">AST</span><span className="text-sm font-black text-slate-800">{player.AVG_AST.toFixed(1)}</span></div>
                      <div><span className="text-[8px] text-slate-400 font-extrabold uppercase block">REB</span><span className="text-sm font-black text-slate-800">{player.AVG_REB.toFixed(1)}</span></div>
                      <div><span className="text-[8px] text-slate-400 font-extrabold uppercase block">GP</span><span className="text-sm font-black text-slate-800">{player.GP}</span></div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="relative w-12 h-12">
                          <svg className="w-full h-full transform -rotate-90">
                            <circle cx="24" cy="24" r="20" stroke={`${theme.primary}18`} strokeWidth="3" fill="transparent" />
                            <circle cx="24" cy="24" r="20" stroke={theme.primary} strokeWidth="3" fill="transparent" strokeDasharray={2 * Math.PI * 20} strokeDashoffset={getStrokeDashOffset(player.IMPORTANCE_SCORE, 20)} strokeLinecap="round" />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black font-mono text-slate-700">{player.IMPORTANCE_SCORE.toFixed(0)}</div>
                        </div>
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wide">Importance Score</span>
                      </div>
                      <span className="text-[9px] text-slate-400 font-bold font-mono">Dependence {getDependenceLabel(player.LEAGUE_RANK)}</span>
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const player = candidates[0];
                const theme = getTeamTheme(player.TEAMS_PLAYED_FOR);
                const tier = getTier(player.LEAGUE_RANK);
                return (
                  <div className="surface p-6 rounded-[2rem] border-2 transition-all duration-300 relative overflow-hidden order-1 md:order-2 hover:shadow-lg h-[24rem] flex flex-col justify-between" style={{ background: `linear-gradient(135deg, ${theme.primary}0c 0%, #ffffff 100%)`, borderColor: "#eab308", boxShadow: `0 10px 30px ${theme.primary}12, inset 0 0 0 1px #eab30830` }}>
                    <div className="absolute top-0 right-0 w-32 h-32 rounded-bl-full pointer-events-none" style={{ backgroundColor: `${theme.primary}0a` }} />
                    <div className="absolute -top-3 -left-3 w-16 h-16 opacity-10 bg-amber-500 rounded-full blur-xl animate-pulse" />
                    <div className="space-y-4 relative z-10">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-[0.24em] text-amber-700">🥇 MVP Favorite</span>
                        <span className={`text-[9px] font-black uppercase tracking-wider border px-2.5 py-0.5 rounded-lg ${tier.tone}`}>{tier.title}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <PlayerPhoto playerId={player.PLAYER_ID} name={player.PLAYER_NAME} size={72} />
                        <div className="min-w-0">
                          <h2 className="truncate text-3xl font-black uppercase leading-tight text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{player.PLAYER_NAME}</h2>
                          <div className="mt-1 flex items-center gap-2">
                            <TeamLogo abbr={getPrimaryTeamAbbr(player.TEAMS_PLAYED_FOR)} name={player.TEAMS_PLAYED_FOR} size={18} />
                            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">{player.TEAMS_PLAYED_FOR}</span>
                          </div>
                          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Why ranked here: this player drives a franchise-level share of creation, usage, and outcomes.</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 py-3.5 border-t border-b border-slate-100/60 font-mono text-xs">
                      <div><span className="text-[8px] text-slate-400 font-extrabold uppercase block">PTS</span><span className="text-base font-black text-slate-800">{player.AVG_PTS.toFixed(1)}</span></div>
                      <div><span className="text-[8px] text-slate-400 font-extrabold uppercase block">AST</span><span className="text-base font-black text-slate-800">{player.AVG_AST.toFixed(1)}</span></div>
                      <div><span className="text-[8px] text-slate-400 font-extrabold uppercase block">REB</span><span className="text-base font-black text-slate-800">{player.AVG_REB.toFixed(1)}</span></div>
                      <div><span className="text-[8px] text-slate-400 font-extrabold uppercase block">GP</span><span className="text-base font-black text-slate-800">{player.GP}</span></div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="relative w-14 h-14">
                          <svg className="w-full h-full transform -rotate-90">
                            <circle cx="28" cy="28" r="24" stroke={`${theme.primary}20`} strokeWidth="3.5" fill="transparent" />
                            <circle cx="28" cy="28" r="24" stroke={theme.primary} strokeWidth="3.5" fill="transparent" strokeDasharray={2 * Math.PI * 24} strokeDashoffset={getStrokeDashOffset(player.IMPORTANCE_SCORE, 24)} strokeLinecap="round" />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center text-xs font-black font-mono text-slate-700">{player.IMPORTANCE_SCORE.toFixed(0)}</div>
                        </div>
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wide">Importance Score</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-bold font-mono">Dependence {getDependenceLabel(player.LEAGUE_RANK)}</span>
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const player = candidates[2];
                const theme = getTeamTheme(player.TEAMS_PLAYED_FOR);
                const tier = getTier(player.LEAGUE_RANK);
                return (
                  <div className="surface p-5 rounded-[1.75rem] border transition-all duration-300 relative overflow-hidden order-3 hover:shadow-md h-[19.5rem] flex flex-col justify-between" style={{ background: `linear-gradient(135deg, ${theme.primary}08 0%, #ffffff 100%)`, borderColor: "#e2e8f0" }}>
                    <div className="absolute top-0 right-0 w-24 h-24 rounded-bl-full pointer-events-none" style={{ backgroundColor: `${theme.primary}08` }} />
                    <div className="space-y-4 relative z-10">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">🥉 Top Contender</span>
                        <span className={`text-[9px] font-black uppercase tracking-wider border px-2 py-0.5 rounded-lg ${tier.tone}`}>{tier.title}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <PlayerPhoto playerId={player.PLAYER_ID} name={player.PLAYER_NAME} size={56} />
                        <div className="min-w-0">
                          <h2 className="truncate text-2xl font-black uppercase leading-tight text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{player.PLAYER_NAME}</h2>
                          <div className="mt-1 flex items-center gap-2">
                            <TeamLogo abbr={getPrimaryTeamAbbr(player.TEAMS_PLAYED_FOR)} name={player.TEAMS_PLAYED_FOR} size={18} />
                            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">{player.TEAMS_PLAYED_FOR}</span>
                          </div>
                          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Why ranked here: consistent star output with broad statistical contribution.</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 py-2 border-t border-b border-slate-100/60 font-mono text-xs">
                      <div><span className="text-[8px] text-slate-400 font-extrabold uppercase block">PTS</span><span className="text-sm font-black text-slate-800">{player.AVG_PTS.toFixed(1)}</span></div>
                      <div><span className="text-[8px] text-slate-400 font-extrabold uppercase block">AST</span><span className="text-sm font-black text-slate-800">{player.AVG_AST.toFixed(1)}</span></div>
                      <div><span className="text-[8px] text-slate-400 font-extrabold uppercase block">REB</span><span className="text-sm font-black text-slate-800">{player.AVG_REB.toFixed(1)}</span></div>
                      <div><span className="text-[8px] text-slate-400 font-extrabold uppercase block">GP</span><span className="text-sm font-black text-slate-800">{player.GP}</span></div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="relative w-12 h-12">
                          <svg className="w-full h-full transform -rotate-90">
                            <circle cx="24" cy="24" r="20" stroke={`${theme.primary}18`} strokeWidth="3" fill="transparent" />
                            <circle cx="24" cy="24" r="20" stroke={theme.primary} strokeWidth="3" fill="transparent" strokeDasharray={2 * Math.PI * 20} strokeDashoffset={getStrokeDashOffset(player.IMPORTANCE_SCORE, 20)} strokeLinecap="round" />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center text-[9px] font-black font-mono text-slate-700">{player.IMPORTANCE_SCORE.toFixed(0)}</div>
                        </div>
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wide">Importance Score</span>
                      </div>
                      <span className="text-[9px] text-slate-400 font-bold font-mono">Dependence {getDependenceLabel(player.LEAGUE_RANK)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <div className="space-y-4">
            <h2 className="text-xl font-black text-slate-800 m-0 uppercase tracking-wide" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              {searchQuery !== "" || hasFilters ? "Filtered Results" : "Remaining Candidates List"}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedGridCandidates.map((player) => {
                const theme = getTeamTheme(player.TEAMS_PLAYED_FOR);
                const tier = getTier(player.LEAGUE_RANK);
                return (
                  <div key={player.PLAYER_ID} className="surface p-5 rounded-[1.5rem] border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs hover:scale-[1.005] transition-all duration-300 flex flex-col justify-between relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${theme.primary}05 0%, #ffffff 100%)` }}>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <TeamLogo abbr={getPrimaryTeamAbbr(player.TEAMS_PLAYED_FOR)} name={player.TEAMS_PLAYED_FOR} size={18} />
                          <span className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">{player.TEAMS_PLAYED_FOR}</span>
                        </div>
                        <span className={`text-[8px] font-extrabold uppercase border px-2 py-0.5 rounded-lg ${tier.tone}`}>{tier.title}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <PlayerPhoto playerId={player.PLAYER_ID} name={player.PLAYER_NAME} size={52} />
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-black uppercase leading-none text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{player.PLAYER_NAME}</h3>
                          <p className="mt-1 text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400">Dependence {getDependenceLabel(player.LEAGUE_RANK)}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-600 pt-1 border-t border-slate-50 font-semibold font-mono">
                        <div className="flex items-center gap-1.5"><Flame size={12} className="text-[#c9082a]" /> PTS: {player.AVG_PTS.toFixed(1)}</div>
                        <div className="flex items-center gap-1.5"><Zap size={12} className="text-[#1d428a]" /> AST: {player.AVG_AST.toFixed(1)}</div>
                        <div className="flex items-center gap-1.5"><Target size={12} className="text-amber-500" /> REB: {player.AVG_REB.toFixed(1)}</div>
                        <div className="flex items-center gap-1.5"><Clock size={12} className="text-slate-400" /> MIN: {player.AVG_MIN.toFixed(1)}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="relative w-8 h-8">
                          <svg className="w-full h-full transform -rotate-90">
                            <circle cx="16" cy="16" r="14" stroke={`${theme.primary}12`} strokeWidth="2.5" fill="transparent" />
                            <circle cx="16" cy="16" r="14" stroke={theme.primary} strokeWidth="2.5" fill="transparent" strokeDasharray={2 * Math.PI * 14} strokeDashoffset={getStrokeDashOffset(player.IMPORTANCE_SCORE, 14)} strokeLinecap="round" />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center text-[9px] font-black font-mono text-slate-700">{player.IMPORTANCE_SCORE.toFixed(0)}</div>
                        </div>
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Importance</span>
                      </div>
                      <span className="text-[9px] text-slate-400 font-semibold font-mono">{player.GP} Games</span>
                    </div>
                  </div>
                );
              })}
            </div>

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

      {viewMode === "table" && (
        <div className="glass-card rounded-[1.5rem] overflow-hidden shadow-xs border border-slate-200/60 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur text-slate-400 text-xs uppercase font-bold border-b border-slate-200">
                <tr>
                  <th onClick={() => handleSort("LEAGUE_RANK")} className="p-4 cursor-pointer hover:text-slate-800 select-none transition-colors">Rank {sortBy === "LEAGUE_RANK" ? (sortOrder === "asc" ? "▲" : "▼") : ""}</th>
                  <th onClick={() => handleSort("PLAYER_NAME")} className="p-4 cursor-pointer hover:text-slate-800 select-none transition-colors">Player Name {sortBy === "PLAYER_NAME" ? (sortOrder === "asc" ? "▲" : "▼") : ""}</th>
                  <th className="p-4">Team</th>
                  <th onClick={() => handleSort("GP")} className="p-4 cursor-pointer hover:text-slate-800 select-none text-center transition-colors font-mono">GP {sortBy === "GP" ? (sortOrder === "asc" ? "▲" : "▼") : ""}</th>
                  <th onClick={() => handleSort("AVG_MIN")} className="p-4 cursor-pointer hover:text-slate-800 select-none text-right transition-colors">Avg Min {sortBy === "AVG_MIN" ? (sortOrder === "asc" ? "▲" : "▼") : ""}</th>
                  <th onClick={() => handleSort("AVG_PTS")} className="p-4 cursor-pointer hover:text-slate-800 select-none text-right transition-colors">Avg Pts {sortBy === "AVG_PTS" ? (sortOrder === "asc" ? "▲" : "▼") : ""}</th>
                  <th onClick={() => handleSort("AVG_REB")} className="p-4 cursor-pointer hover:text-slate-800 select-none text-right transition-colors">Avg Reb {sortBy === "AVG_REB" ? (sortOrder === "asc" ? "▲" : "▼") : ""}</th>
                  <th onClick={() => handleSort("AVG_AST")} className="p-4 cursor-pointer hover:text-slate-800 select-none text-right transition-colors">Avg Ast {sortBy === "AVG_AST" ? (sortOrder === "asc" ? "▲" : "▼") : ""}</th>
                  <th onClick={() => handleSort("IMPORTANCE_SCORE")} className="p-4 cursor-pointer hover:text-[#1d428a] text-[#1d428a] font-bold select-none text-right transition-colors">Importance {sortBy === "IMPORTANCE_SCORE" ? (sortOrder === "asc" ? "▲" : "▼") : ""} <ArrowUpDown size={10} className="inline ml-1" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {paginatedCandidates.map((player) => {
                  const theme = getTeamTheme(player.TEAMS_PLAYED_FOR);
                  const tier = getTier(player.LEAGUE_RANK);
                  return (
                    <tr key={player.PLAYER_ID} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-mono font-bold text-slate-400">{player.LEAGUE_RANK}</td>
                      <td className="p-4 font-bold text-slate-800">
                        <div className="flex items-center gap-3">
                          <PlayerPhoto playerId={player.PLAYER_ID} name={player.PLAYER_NAME} size={36} />
                          <div>
                            <span>{player.PLAYER_NAME}</span>
                            <div className="mt-1"><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${tier.tone}`}>{tier.title}</span></div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-xs font-bold">
                        <div className="flex items-center gap-2">
                          <TeamLogo abbr={getPrimaryTeamAbbr(player.TEAMS_PLAYED_FOR)} name={player.TEAMS_PLAYED_FOR} size={18} />
                          <span className="px-2 py-0.5 rounded" style={{ backgroundColor: `${theme.primary}12`, color: theme.primary }}>{player.TEAMS_PLAYED_FOR}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center font-mono tabular-nums">{player.GP}</td>
                      <td className="p-4 text-right font-mono tabular-nums">{player.AVG_MIN.toFixed(1)}</td>
                      <td className="p-4 text-right font-mono tabular-nums">{player.AVG_PTS.toFixed(1)}</td>
                      <td className="p-4 text-right font-mono tabular-nums">{player.AVG_REB.toFixed(1)}</td>
                      <td className="p-4 text-right font-mono tabular-nums">{player.AVG_AST.toFixed(1)}</td>
                      <td className="p-4 text-right font-mono font-bold tabular-nums" style={{ color: theme.primary }}>{player.IMPORTANCE_SCORE.toFixed(2)}%</td>
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

      {viewMode === "chart" && (
        <section className="glass-card p-6 rounded-[2rem] bg-white border border-slate-200/60 shadow-sm space-y-6">
          <div>
            <h2 className="text-2xl font-black text-slate-800 m-0 uppercase tracking-wide flex items-center gap-2" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              <TrendingUp size={22} className="text-[#1d428a]" />
              Importance Score Distribution
            </h2>
            <p className="text-sm text-slate-400 mt-1">Higher importance and lower scoring can signal structural value rather than pure shot creation.</p>
          </div>
          <div className="h-[28rem] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" dataKey="IMPORTANCE_SCORE" name="Importance Score" unit="%" stroke="#94a3b8" fontSize={10} domain={[0, 100]} />
                <YAxis type="number" dataKey="AVG_PTS" name="Points Per Game" unit=" Pts" stroke="#94a3b8" fontSize={10} domain={[0, 35]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as StarCandidate;
                      const theme = getTeamTheme(data.TEAMS_PLAYED_FOR);
                      const tier = getTier(data.LEAGUE_RANK);
                      return (
                        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-md space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black px-2 py-0.5 rounded-lg" style={{ backgroundColor: `${theme.primary}12`, color: theme.primary }}>{data.TEAMS_PLAYED_FOR}</span>
                            <span className={`text-xs font-black px-2 py-0.5 rounded-lg border ${tier.tone}`}>{tier.title}</span>
                          </div>
                          <p className="text-sm font-black text-slate-800 uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{data.PLAYER_NAME}</p>
                          <div className="flex justify-between items-center text-xs pt-1.5 border-t border-slate-100/60 font-semibold gap-6"><span className="text-slate-400 font-bold">Importance Score:</span><span className="font-mono font-black text-slate-900">{data.IMPORTANCE_SCORE.toFixed(2)}%</span></div>
                          <div className="flex justify-between items-center text-xs font-semibold gap-6"><span className="text-slate-400 font-bold">Points Avg:</span><span className="font-mono font-black text-slate-900">{data.AVG_PTS.toFixed(1)} Pts</span></div>
                          <div className="flex justify-between items-center text-xs font-semibold gap-6"><span className="text-slate-400 font-bold">Minutes Avg:</span><span className="font-mono font-black text-slate-900">{data.AVG_MIN.toFixed(1)} Min</span></div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter name="NBA Impact Rankings" data={filteredCandidates} fill="#1d428a">
                  {filteredCandidates.map((entry, index) => {
                    const theme = getTeamTheme(entry.TEAMS_PLAYED_FOR);
                    return <Cell key={`cell-${index}`} fill={theme.primary} stroke={theme.secondary} strokeWidth={1} r={entry.LEAGUE_RANK <= 3 ? 9 : entry.LEAGUE_RANK <= 15 ? 7 : 5} className="transition-all duration-300 hover:scale-125 cursor-pointer" />;
                  })}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-4 text-xs justify-center pt-4 border-t border-slate-100 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
            <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rounded-full bg-slate-800 border-2 border-slate-400"></div><span>Radius increases for top-ranked players</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rounded-full bg-[#1d428a]"></div><span>Colors follow team branding</span></div>
          </div>
        </section>
      )}

      {viewMode !== "chart" && totalPages > 1 && (
        <div className="glass-card p-4 rounded-2xl bg-white border border-slate-200/60 shadow-xs flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-slate-500 font-semibold">
            Showing page <strong className="text-slate-700">{currentPage}</strong> of <strong className="text-slate-700">{totalPages}</strong> ({filteredCandidates.length} total players)
          </span>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="p-1.5 bg-white border border-slate-200 rounded-md text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:hover:text-slate-500 hover:bg-slate-50 transition-colors shadow-xs">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="p-1.5 bg-white border border-slate-200 rounded-md text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:hover:text-slate-500 hover:bg-slate-50 transition-colors shadow-xs">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StarCandidates;
