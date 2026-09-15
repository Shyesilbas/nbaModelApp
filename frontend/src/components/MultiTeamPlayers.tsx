import React, { useState, useMemo, useEffect } from "react";
import { 
  ArrowRightLeft, 
  Search, 
  Flame, 
  Crown, 
  Sparkles, 
  ShieldCheck, 
  Info, 
  LayoutGrid, 
  Table as TableIcon,
  ArrowUpDown,
  Filter,
  Activity
} from "lucide-react";
import PlayerPhoto from "./PlayerPhoto";
import TeamLogo from "./TeamLogo";
import { loadJson, loadPrivateApi } from "../lib/dataCache";
import { TEAM_NAME_BY_ABBR, getTeamTheme, type NbaTeamAbbr, NBA_TEAM_ABBRS } from "../lib/nbaTeams";

export interface MultiTeamPlayer {
  PLAYER_ID: number;
  PLAYER_NAME: string;
  TEAMS_PLAYED_FOR: string;
  NUM_TEAMS?: number;
  TEAM_COUNT?: number;
  GP?: number;
  AVG_MIN?: number;
  AVG_PTS?: number;
  AVG_REB?: number;
  AVG_AST?: number;
  IMPORTANCE_SCORE?: number;
}

interface MultiTeamPlayersProps {
  players: MultiTeamPlayer[];
}

type SortField = "IMPORTANCE_SCORE" | "AVG_PTS" | "AVG_REB" | "AVG_AST" | "AVG_MIN" | "NUM_TEAMS" | "GP";
type TierFilter = "ALL" | "BLOCKBUSTER" | "STARTER" | "ROTATION" | "DEPTH";

const MultiTeamPlayers: React.FC<MultiTeamPlayersProps> = ({ players: initialPlayers }) => {
  const [seasonsList, setSeasonsList] = useState<string[]>(["2026-27", "2025-26", "2024-25", "2023-24"]);
  const [selectedSeason, setSelectedSeason] = useState<string>("2026-27");
  const [seasonData, setSeasonData] = useState<Record<string, MultiTeamPlayer[]>>({ "2026-27": initialPlayers });
  const [loadingSeason, setLoadingSeason] = useState(false);

  const [search, setSearch] = useState("");
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>("ALL");
  const [selectedTier, setSelectedTier] = useState<TierFilter>("ALL");
  const [sortBy, setSortBy] = useState<SortField>("IMPORTANCE_SCORE");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Keep initial data in sync
  useEffect(() => {
    if (initialPlayers && initialPlayers.length > 0) {
      setSeasonData((prev) => ({ ...prev, [selectedSeason]: initialPlayers }));
    }
  }, [initialPlayers, selectedSeason]);

  // Load seasons list
  useEffect(() => {
    loadJson<string[]>("/data/seasons.json", [])
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setSeasonsList(data);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch season trade data if not cached
  useEffect(() => {
    if (seasonData[selectedSeason] && seasonData[selectedSeason].length > 0) return;
    setLoadingSeason(true);
    
    // Attempt to load from public cache or private api
    loadJson<MultiTeamPlayer[]>("/data/multi_team_players.json", [])
      .then((rows) => {
        if (rows && rows.length > 0) {
          setSeasonData((prev) => ({ ...prev, [selectedSeason]: rows }));
        }
      })
      .catch(() => {
        // Fallback to load from api
        loadPrivateApi<any[]>(`/frontend-data-api/team-rosters?season=${encodeURIComponent(selectedSeason)}`)
          .catch(() => []);
      })
      .finally(() => {
        setLoadingSeason(false);
      });
  }, [selectedSeason, seasonData]);

  const rawPlayers = seasonData[selectedSeason] ?? initialPlayers ?? [];

  // Normalize players and calculate score if missing
  const normalizedPlayers = useMemo(() => {
    return rawPlayers.map((p) => {
      const min = p.AVG_MIN ?? 20.0;
      const pts = p.AVG_PTS ?? 10.0;
      const reb = p.AVG_REB ?? 4.0;
      const ast = p.AVG_AST ?? 2.5;
      const calcScore = (min * 0.5) + (pts * 1.0) + (reb * 1.2) + (ast * 1.5);
      const score = p.IMPORTANCE_SCORE != null && p.IMPORTANCE_SCORE > 0 ? p.IMPORTANCE_SCORE : calcScore;
      const teamCount = p.NUM_TEAMS ?? p.TEAM_COUNT ?? (p.TEAMS_PLAYED_FOR ? p.TEAMS_PLAYED_FOR.split(",").length : 2);
      return {
        ...p,
        AVG_MIN: min,
        AVG_PTS: pts,
        AVG_REB: reb,
        AVG_AST: ast,
        IMPORTANCE_SCORE: Number(score.toFixed(1)),
        NUM_TEAMS: teamCount,
        TEAM_COUNT: teamCount,
        GP: p.GP ?? 10
      };
    });
  }, [rawPlayers]);

  // Filtered & Sorted Players
  const processedPlayers = useMemo(() => {
    let list = [...normalizedPlayers];

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.PLAYER_NAME.toLowerCase().includes(q) ||
          p.TEAMS_PLAYED_FOR.toLowerCase().includes(q) ||
          String(p.PLAYER_ID).includes(q)
      );
    }

    // Team Filter
    if (selectedTeamFilter !== "ALL") {
      list = list.filter((p) =>
        p.TEAMS_PLAYED_FOR.toUpperCase().includes(selectedTeamFilter.toUpperCase())
      );
    }

    // Tier Filter
    if (selectedTier !== "ALL") {
      if (selectedTier === "BLOCKBUSTER") {
        list = list.filter((p) => (p.IMPORTANCE_SCORE ?? 0) >= 40.0);
      } else if (selectedTier === "STARTER") {
        list = list.filter((p) => (p.IMPORTANCE_SCORE ?? 0) >= 28.0 && (p.IMPORTANCE_SCORE ?? 0) < 40.0);
      } else if (selectedTier === "ROTATION") {
        list = list.filter((p) => (p.IMPORTANCE_SCORE ?? 0) >= 18.0 && (p.IMPORTANCE_SCORE ?? 0) < 28.0);
      } else if (selectedTier === "DEPTH") {
        list = list.filter((p) => (p.IMPORTANCE_SCORE ?? 0) < 18.0);
      }
    }

    // Sorting (Default: High to Low by IMPORTANCE_SCORE)
    list.sort((a, b) => {
      const valA = a[sortBy] ?? 0;
      const valB = b[sortBy] ?? 0;
      if (sortOrder === "desc") {
        return (valB as number) - (valA as number);
      }
      return (valA as number) - (valB as number);
    });

    return list;
  }, [normalizedPlayers, search, selectedTeamFilter, selectedTier, sortBy, sortOrder]);

  // Top Blockbuster Stars for marquee (sorted by IMPORTANCE_SCORE descending)
  const topBlockbusters = useMemo(() => {
    return [...normalizedPlayers]
      .sort((a, b) => (b.IMPORTANCE_SCORE ?? 0) - (a.IMPORTANCE_SCORE ?? 0))
      .slice(0, 4);
  }, [normalizedPlayers]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const getTierBadge = (score: number) => {
    if (score >= 45.0) {
      return {
        label: "Franchise Cornerstone",
        bg: "bg-amber-500/10 border-amber-500/30 text-amber-600",
        icon: Crown,
        color: "#d97706"
      };
    }
    if (score >= 32.0) {
      return {
        label: "All-Star / Co-Star",
        bg: "bg-indigo-500/10 border-indigo-500/30 text-indigo-600",
        icon: Flame,
        color: "#4f46e5"
      };
    }
    if (score >= 22.0) {
      return {
        label: "Key Starter",
        bg: "bg-blue-500/10 border-blue-500/30 text-blue-600",
        icon: ShieldCheck,
        color: "#2563eb"
      };
    }
    return {
      label: "Rotation Piece",
      bg: "bg-slate-500/10 border-slate-500/30 text-slate-600",
      icon: Sparkles,
      color: "#64748b"
    };
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <section className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-6 md:p-8 text-white shadow-xl">
        <div className="absolute right-0 top-0 -mt-8 -mr-8 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 -mb-8 h-56 w-56 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/20 px-3.5 py-1 text-[11px] font-black uppercase tracking-[0.25em] text-indigo-200 backdrop-blur-md">
              <ArrowRightLeft size={13} className="text-indigo-300" />
              NBA Mobility Engine · {selectedSeason}
            </div>
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-white m-0" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Trade & Player Mobility Discovery
            </h1>
            <p className="text-slate-300 text-sm md:text-base max-w-2xl font-medium">
              Rank and analyze mid-season transfers, multi-franchise stints, and blockbuster trades sorted by calibrated overall player impact score.
            </p>
          </div>

          {/* Season Selector & Quick Stats */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-xl">
              <span className="text-xs font-semibold text-slate-300">Season:</span>
              <select
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value)}
                className="bg-transparent text-sm font-bold text-white focus:outline-none cursor-pointer"
              >
                {seasonsList.map((s) => (
                  <option key={s} value={s} className="bg-slate-900 text-white">
                    {s} Season
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/15 px-4 py-2 rounded-xl text-xs font-mono">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-sans">Traded Players</span>
                <span className="text-base font-bold text-amber-300">{normalizedPlayers.length}</span>
              </div>
              <div className="h-6 w-[1px] bg-white/20" />
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-sans">Top Rating</span>
                <span className="text-base font-bold text-emerald-300">
                  {topBlockbusters[0]?.IMPORTANCE_SCORE ?? 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Blockbuster Deals Spotlight (Top Rated Trades) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="text-amber-500 fill-amber-500" size={18} />
            <h2 className="text-lg font-black uppercase tracking-wider text-slate-900 m-0" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Blockbuster Trade Spotlight · Top Impact Deals
            </h2>
          </div>
          <span className="text-xs font-semibold text-slate-400">Ranked by Core Importance Score</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {topBlockbusters.map((player, idx) => {
            const teams = (player.TEAMS_PLAYED_FOR || "").split(",").map(t => t.trim() as NbaTeamAbbr);
            const primaryTeam = teams[teams.length - 1] || "MIA";
            const fromTeam = teams[0] || "MIL";
            const theme = getTeamTheme(primaryTeam);
            const fromTheme = getTeamTheme(fromTeam);
            const tier = getTierBadge(player.IMPORTANCE_SCORE ?? 0);
            const TierIcon = tier.icon;

            return (
              <div
                key={player.PLAYER_ID}
                className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm hover:shadow-md transition-all duration-200"
              >
                {/* Top background glow */}
                <div
                  className="absolute -top-12 -right-12 h-24 w-24 rounded-full blur-2xl opacity-20 transition-opacity group-hover:opacity-40 pointer-events-none"
                  style={{ backgroundColor: theme.primary }}
                />

                {/* Rank & Tier Pill */}
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1 font-mono text-xs font-black text-slate-400">
                    #{idx + 1}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold border ${tier.bg}`}>
                    <TierIcon size={10} />
                    {tier.label}
                  </span>
                </div>

                {/* Player Profile Row */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="relative">
                    <PlayerPhoto
                      playerId={player.PLAYER_ID}
                      name={player.PLAYER_NAME}
                      size={56}
                      className="h-14 w-14 rounded-full border-2 border-white shadow-sm object-cover bg-slate-100"
                    />
                    <div className="absolute -bottom-1 -right-1">
                      <TeamLogo abbr={primaryTeam} size={20} />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-black text-slate-900 truncate m-0" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                      {player.PLAYER_NAME}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[11px] font-mono font-bold text-slate-500">
                        Score:
                      </span>
                      <span className="text-xs font-black font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                        {player.IMPORTANCE_SCORE}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Trade Path Route */}
                <div className="mb-3 flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="px-2 py-0.5 rounded font-black text-white text-[11px] shadow-xs"
                      style={{ backgroundColor: fromTheme.primary }}
                    >
                      {fromTeam}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {TEAM_NAME_BY_ABBR[fromTeam] ? TEAM_NAME_BY_ABBR[fromTeam].split(" ").pop() : fromTeam}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-slate-400 font-bold">
                    <ArrowRightLeft size={12} className="text-slate-500" />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className="px-2 py-0.5 rounded font-black text-white text-[11px] shadow-xs"
                      style={{ backgroundColor: theme.primary }}
                    >
                      {primaryTeam}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {TEAM_NAME_BY_ABBR[primaryTeam] ? TEAM_NAME_BY_ABBR[primaryTeam].split(" ").pop() : primaryTeam}
                    </span>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-4 gap-1 text-center bg-slate-50/80 rounded-lg p-2 border border-slate-100 text-slate-700">
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">PTS</span>
                    <span className="text-xs font-black font-mono">{player.AVG_PTS}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">REB</span>
                    <span className="text-xs font-black font-mono">{player.AVG_REB}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">AST</span>
                    <span className="text-xs font-black font-mono">{player.AVG_AST}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">MIN</span>
                    <span className="text-xs font-black font-mono">{player.AVG_MIN}m</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Filter & Sort Toolbar */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search traded player, franchise, or ID..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
            />
          </div>

          {/* Franchise & View Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Franchise Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600">
              <Filter size={13} className="text-slate-400" />
              <span>Team:</span>
              <select
                value={selectedTeamFilter}
                onChange={(e) => setSelectedTeamFilter(e.target.value)}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All 30 Teams</option>
                {NBA_TEAM_ABBRS.map((t) => (
                  <option key={t} value={t}>
                    {t} - {TEAM_NAME_BY_ABBR[t]}
                  </option>
                ))}
              </select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === "grid"
                    ? "bg-white text-indigo-600 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
                title="Grid Cards"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === "table"
                    ? "bg-white text-indigo-600 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
                title="Table Registry"
              >
                <TableIcon size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Tier & Sort Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
          {/* Tier Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-slate-400 text-[11px] uppercase mr-1">Tier:</span>
            {(
              [
                { id: "ALL", label: `All (${normalizedPlayers.length})` },
                { id: "BLOCKBUSTER", label: "Blockbuster (Score ≥40)" },
                { id: "STARTER", label: "Starters (28-40)" },
                { id: "ROTATION", label: "Rotation (18-28)" },
                { id: "DEPTH", label: "Depth (<18)" },
              ] as const
            ).map((tier) => (
              <button
                key={tier.id}
                onClick={() => setSelectedTier(tier.id)}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  selectedTier === tier.id
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tier.label}
              </button>
            ))}
          </div>

          {/* Quick Sort Options */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-400 text-[11px] uppercase mr-1">Sort:</span>
            {[
              { id: "IMPORTANCE_SCORE" as SortField, label: "Impact Score" },
              { id: "AVG_PTS" as SortField, label: "PTS" },
              { id: "AVG_REB" as SortField, label: "REB" },
              { id: "AVG_AST" as SortField, label: "AST" },
              { id: "AVG_MIN" as SortField, label: "MIN" },
              { id: "NUM_TEAMS" as SortField, label: "Teams" },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => toggleSort(s.id)}
                className={`px-2.5 py-1 rounded-lg font-mono font-bold flex items-center gap-1 transition-all ${
                  sortBy === s.id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {s.label}
                {sortBy === s.id && (
                  <span className="text-[10px] text-amber-300">
                    {sortOrder === "desc" ? "↓" : "↑"}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Traded Players Main Display */}
      {loadingSeason ? (
        <div className="py-16 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-600 border-r-transparent align-[-0.125em]" />
          <p className="mt-3 text-xs font-semibold text-slate-400">Loading {selectedSeason} mobility data...</p>
        </div>
      ) : processedPlayers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-base font-bold text-slate-700">No traded players found</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your search query, team filter, or tier selection.</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {processedPlayers.map((player) => {
            const teams = (player.TEAMS_PLAYED_FOR || "").split(",").map((t) => t.trim() as NbaTeamAbbr);
            const primaryTeam = teams[teams.length - 1] || "MIA";
            const theme = getTeamTheme(primaryTeam);
            const tier = getTierBadge(player.IMPORTANCE_SCORE ?? 0);
            const TierIcon = tier.icon;

            return (
              <div
                key={player.PLAYER_ID}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between"
              >
                {/* Background glow */}
                <div
                  className="absolute -top-12 -right-12 h-24 w-24 rounded-full blur-2xl opacity-15 transition-opacity group-hover:opacity-30 pointer-events-none"
                  style={{ backgroundColor: theme.primary }}
                />

                {/* Header Profile Row */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold border ${tier.bg}`}>
                      <TierIcon size={10} />
                      {tier.label}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-400">
                      ID: {player.PLAYER_ID}
                    </span>
                  </div>

                  <div className="flex items-center gap-3.5 mb-4">
                    <div className="relative">
                      <PlayerPhoto
                        playerId={player.PLAYER_ID}
                        name={player.PLAYER_NAME}
                        size={56}
                        className="h-14 w-14 rounded-full border-2 border-slate-100 shadow-xs object-cover bg-slate-50"
                      />
                      <div className="absolute -bottom-1 -right-1">
                        <TeamLogo abbr={primaryTeam} size={20} />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-black text-slate-900 truncate m-0" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {player.PLAYER_NAME}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-bold text-slate-500">Impact Score:</span>
                        <span className="text-sm font-black font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                          {player.IMPORTANCE_SCORE}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Transfer Flow Route */}
                  <div className="mb-4 bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                      Franchise Movements ({teams.length} Stints)
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {teams.map((t, i) => {
                        const tTheme = getTeamTheme(t);
                        const isCurrent = i === teams.length - 1;
                        return (
                          <React.Fragment key={t + i}>
                            <span
                              className={`px-2.5 py-1 rounded-lg text-xs font-black text-white shadow-xs flex items-center gap-1 ${
                                isCurrent ? "ring-2 ring-indigo-500/40" : "opacity-85"
                              }`}
                              style={{ backgroundColor: tTheme.primary }}
                            >
                              {t}
                              {isCurrent && <span className="text-[9px] text-amber-300 font-sans">★</span>}
                            </span>
                            {i < teams.length - 1 && (
                              <ArrowRightLeft size={11} className="text-slate-400" />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Box Score Stats Bar */}
                <div className="grid grid-cols-4 gap-1.5 text-center bg-slate-50 rounded-xl p-2 border border-slate-100 text-slate-700">
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">PTS</span>
                    <span className="text-xs font-black font-mono">{player.AVG_PTS}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">REB</span>
                    <span className="text-xs font-black font-mono">{player.AVG_REB}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">AST</span>
                    <span className="text-xs font-black font-mono">{player.AVG_AST}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">MIN</span>
                    <span className="text-xs font-black font-mono">{player.AVG_MIN}m</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table Registry View */
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="p-4">Rank</th>
                  <th className="p-4">Player</th>
                  <th className="p-4 cursor-pointer hover:text-slate-900" onClick={() => toggleSort("IMPORTANCE_SCORE")}>
                    <div className="flex items-center gap-1">
                      Impact Score
                      <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th className="p-4">Trade Route</th>
                  <th className="p-4 text-center cursor-pointer hover:text-slate-900" onClick={() => toggleSort("AVG_PTS")}>
                    PTS
                  </th>
                  <th className="p-4 text-center cursor-pointer hover:text-slate-900" onClick={() => toggleSort("AVG_REB")}>
                    REB
                  </th>
                  <th className="p-4 text-center cursor-pointer hover:text-slate-900" onClick={() => toggleSort("AVG_AST")}>
                    AST
                  </th>
                  <th className="p-4 text-center cursor-pointer hover:text-slate-900" onClick={() => toggleSort("AVG_MIN")}>
                    MIN
                  </th>
                  <th className="p-4 text-center">Teams</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {processedPlayers.map((player, idx) => {
                  const teams = (player.TEAMS_PLAYED_FOR || "").split(",").map((t) => t.trim() as NbaTeamAbbr);
                  const tier = getTierBadge(player.IMPORTANCE_SCORE ?? 0);
                  const TierIcon = tier.icon;

                  return (
                    <tr key={player.PLAYER_ID} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-mono font-bold text-slate-400 text-xs">
                        #{idx + 1}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <PlayerPhoto
                            playerId={player.PLAYER_ID}
                            name={player.PLAYER_NAME}
                            size={40}
                            className="h-10 w-10 rounded-full border border-slate-200 object-cover bg-slate-100"
                          />
                          <div>
                            <span className="font-bold text-slate-900 block">{player.PLAYER_NAME}</span>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${tier.bg} px-1.5 py-0.2 rounded border`}>
                              <TierIcon size={9} />
                              {tier.label}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="font-mono font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 text-sm">
                          {player.IMPORTANCE_SCORE}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          {teams.map((t, i) => {
                            const tTheme = getTeamTheme(t);
                            return (
                              <React.Fragment key={t + i}>
                                <span
                                  className="px-2 py-0.5 rounded font-black text-white text-xs shadow-xs"
                                  style={{ backgroundColor: tTheme.primary }}
                                >
                                  {t}
                                </span>
                                {i < teams.length - 1 && (
                                  <ArrowRightLeft size={10} className="text-slate-400" />
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </td>
                      <td className="p-4 text-center font-mono font-bold text-slate-800">{player.AVG_PTS}</td>
                      <td className="p-4 text-center font-mono font-bold text-slate-800">{player.AVG_REB}</td>
                      <td className="p-4 text-center font-mono font-bold text-slate-800">{player.AVG_AST}</td>
                      <td className="p-4 text-center font-mono text-slate-600">{player.AVG_MIN}m</td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                          (player.NUM_TEAMS ?? 1) >= 3 ? "bg-rose-50 text-rose-600 border border-rose-200" : "bg-slate-100 text-slate-600"
                        }`}>
                          {player.NUM_TEAMS ?? 2}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Educational Insights Section */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-2.5">
          <div className="flex items-center gap-2 text-indigo-600 font-bold">
            <Info size={18} />
            <h3 className="text-base font-black uppercase tracking-wider text-slate-900 m-0" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Why Impact Scores Matter for Trades
            </h3>
          </div>
          <p className="text-slate-600 text-xs leading-relaxed">
            When superstar or high-usage players switch teams (such as Giannis Antetokounmpo to Miami), historical team ratings become obsolete.
            Our pipeline recalculates team offensive/defensive baselines by weighting roster minutes and individual player importance.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-2.5">
          <div className="flex items-center gap-2 text-rose-600 font-bold">
            <Activity size={18} />
            <h3 className="text-base font-black uppercase tracking-wider text-slate-900 m-0" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Stint-Specific Calibration
            </h3>
          </div>
          <p className="text-slate-600 text-xs leading-relaxed">
            Rather than blending a player's season into a single generic average, predictions isolate per-franchise splits. A player's pace, usage rate, and true shooting percentage are adapted to the current scheme they are running.
          </p>
        </div>
      </section>
    </div>
  );
};

export default MultiTeamPlayers;
