import React, { useState, useMemo, useEffect } from "react";
import { 
  ArrowRightLeft, 
  Search, 
  Flame, 
  Crown, 
  Sparkles, 
  ShieldCheck, 
  LayoutGrid, 
  Table as TableIcon,
  ArrowUpDown,
  Filter,
  Calendar
} from "lucide-react";
import PlayerPhoto from "./PlayerPhoto";
import TeamLogo from "./TeamLogo";
import { loadJson, loadPrivateApi } from "../lib/dataCache";
import { TEAM_NAME_BY_ABBR, type NbaTeamAbbr, NBA_TEAM_ABBRS } from "../lib/nbaTeams";

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
  TRADE_DATE?: string;
  HOW_ACQUIRED?: string;
}

interface MultiTeamPlayersProps {
  players: MultiTeamPlayer[];
}

type SortField = "TRADE_DATE" | "IMPORTANCE_SCORE" | "AVG_PTS" | "AVG_REB" | "AVG_AST" | "AVG_MIN" | "NUM_TEAMS" | "GP";
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
        GP: p.GP ?? 10,
        TRADE_DATE: p.TRADE_DATE,
        HOW_ACQUIRED: p.HOW_ACQUIRED,
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
          String(p.PLAYER_ID).includes(q) ||
          (p.TRADE_DATE && p.TRADE_DATE.includes(q)) ||
          (p.HOW_ACQUIRED && p.HOW_ACQUIRED.toLowerCase().includes(q))
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

    // Sorting
    list.sort((a, b) => {
      if (sortBy === "TRADE_DATE") {
        const dateA = a.TRADE_DATE || "1970-01-01";
        const dateB = b.TRADE_DATE || "1970-01-01";
        const cmp = dateB.localeCompare(dateA);
        if (cmp !== 0) {
          return sortOrder === "desc" ? cmp : -cmp;
        }
        return (b.IMPORTANCE_SCORE ?? 0) - (a.IMPORTANCE_SCORE ?? 0);
      }
      const valA = a[sortBy] ?? 0;
      const valB = b[sortBy] ?? 0;
      if (sortOrder === "desc") {
        return (valB as number) - (valA as number);
      }
      return (valA as number) - (valB as number);
    });

    return list;
  }, [normalizedPlayers, search, selectedTeamFilter, selectedTier, sortBy, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const formatTradeDate = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      const parts = dateStr.split("-");
      if (parts.length !== 3) return dateStr;
      const [y, m, d] = parts;
      const dt = new Date(Number(y), Number(m) - 1, Number(d));
      return dt.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const getTierBadge = (score: number) => {
    if (score >= 45.0) {
      return {
        label: "Franchise Cornerstone",
        bg: "bg-slate-100 border-slate-200 text-slate-600",
        icon: Crown,
        color: "#d97706"
      };
    }
    if (score >= 32.0) {
      return {
        label: "All-Star / Co-Star",
        bg: "bg-slate-100 border-slate-200 text-slate-600",
        icon: Flame,
        color: "#4f46e5"
      };
    }
    if (score >= 22.0) {
      return {
        label: "Key Starter",
        bg: "bg-slate-100 border-slate-200 text-slate-600",
        icon: ShieldCheck,
        color: "#2563eb"
      };
    }
    return {
      label: "Rotation Piece",
      bg: "bg-slate-100 border-slate-200 text-slate-600",
      icon: Sparkles,
      color: "#64748b"
    };
  };

  return (
    <div className="space-y-5 pb-8">
      {/* 1. Header Banner */}
      <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Player movement · {selectedSeason}</p>
          <h1 className="m-0 text-3xl font-semibold tracking-tight text-slate-900">Trade Discovery</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{normalizedPlayers.length} players</span>
          <select value={selectedSeason} onChange={(e) => setSelectedSeason(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200">
            {seasonsList.map((s) => <option key={s} value={s}>{s} Season</option>)}
          </select>
        </div>
      </section>

      {/* Player filters */}
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search player, team or ID..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50/80 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400 font-medium placeholder:text-slate-400"
            />
          </div>

          {/* Franchise & View Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Franchise Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600">
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
                    ? "bg-white text-slate-900 shadow-sm"
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
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
                title="Table Registry"
              >
                <TableIcon size={15} />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        <select value={selectedTier} onChange={(e) => setSelectedTier(e.target.value as TierFilter)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200">
          <option value="ALL">All impact tiers</option><option value="BLOCKBUSTER">Blockbuster</option><option value="STARTER">Starter</option><option value="ROTATION">Rotation</option><option value="DEPTH">Depth</option>
        </select>
        <select value={sortBy} onChange={(e) => { setSortBy(e.target.value as SortField); setSortOrder("desc"); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200">
          <option value="TRADE_DATE">Sort: Trade date</option><option value="IMPORTANCE_SCORE">Sort: Impact</option><option value="AVG_PTS">Sort: Points</option><option value="AVG_REB">Sort: Rebounds</option><option value="AVG_AST">Sort: Assists</option><option value="AVG_MIN">Sort: Minutes</option><option value="NUM_TEAMS">Sort: Teams</option>
        </select>
        <button onClick={() => setSortOrder((current) => current === "desc" ? "asc" : "desc")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50" aria-label={`Sort ${sortOrder === "desc" ? "ascending" : "descending"}`}>
          {sortOrder === "desc" ? "↓" : "↑"}
        </button>
        </div>
      </section>

      {/* 4. Traded Players Main Display */}
      {loadingSeason ? (
        <div className="py-16 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-slate-700 border-r-transparent align-[-0.125em]" />
          <p className="mt-3 text-xs font-semibold text-slate-400">Loading {selectedSeason} mobility data...</p>
        </div>
      ) : processedPlayers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-base font-bold text-slate-700">No traded players found</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your search query, team filter, or tier selection.</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {processedPlayers.map((player) => {
            const teams = (player.TEAMS_PLAYED_FOR || "").split(",").map((t) => t.trim() as NbaTeamAbbr);
            const primaryTeam = teams[teams.length - 1] || "MIA";
            const tier = getTierBadge(player.IMPORTANCE_SCORE ?? 0);
            const TierIcon = tier.icon;

            return (
              <div
                key={player.PLAYER_ID}
                className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300 hover:shadow-md transition-all duration-200 flex flex-col justify-between"
              >
                {/* Header Profile Row */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold border ${tier.bg}`}>
                      <TierIcon size={10} />
                      {tier.label}
                    </span>
                    <span className="text-xs font-medium tabular-nums text-slate-400">
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
                      <h3 className="text-base font-semibold text-slate-900 truncate m-0">
                        {player.PLAYER_NAME}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-medium text-slate-500">Impact</span>
                        <span className="text-sm font-semibold tabular-nums text-slate-800">
                          {player.IMPORTANCE_SCORE}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Transfer Flow Route */}
                  <div className="mb-4 bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                        Team journey · {teams.length} stops
                      </span>
                      {player.TRADE_DATE && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium tabular-nums text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                          <Calendar size={11} className="text-slate-400" />
                          {formatTradeDate(player.TRADE_DATE)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {teams.map((t, i) => {
                        const isCurrent = i === teams.length - 1;
                        return (
                          <React.Fragment key={t + i}>
                            <span
                              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 ${
                                isCurrent ? "bg-slate-800 text-white" : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {t}
                                {isCurrent && <span className="text-[9px] text-slate-300 font-sans">•</span>}
                            </span>
                            {i < teams.length - 1 && (
                              <ArrowRightLeft size={11} className="text-slate-400" />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                    {player.HOW_ACQUIRED && (
                      <div className="mt-2 pt-1.5 border-t border-slate-200/60 text-[10px] font-medium text-slate-500 truncate" title={player.HOW_ACQUIRED}>
                        {player.HOW_ACQUIRED}
                      </div>
                    )}
                  </div>
                </div>

                {/* Box Score Stats Bar */}
                <div className="grid grid-cols-4 gap-1.5 text-center bg-slate-50 rounded-lg p-2 border border-slate-100 text-slate-700">
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">PTS</span>
                    <span className="text-xs font-semibold tabular-nums">{player.AVG_PTS}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">REB</span>
                    <span className="text-xs font-semibold tabular-nums">{player.AVG_REB}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">AST</span>
                    <span className="text-xs font-semibold tabular-nums">{player.AVG_AST}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">MIN</span>
                    <span className="text-xs font-semibold tabular-nums">{player.AVG_MIN}m</span>
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
                  <th className="p-4 cursor-pointer hover:text-slate-900" onClick={() => toggleSort("TRADE_DATE")}>
                    <div className="flex items-center gap-1.5">
                      <Calendar size={12} className="text-slate-400" />
                      <span>Tarih</span>
                      <ArrowUpDown size={12} />
                      {sortBy === "TRADE_DATE" && (
                        <span className="text-slate-600 text-[10px] ml-0.5">
                          {sortOrder === "desc" ? "↓" : "↑"}
                        </span>
                      )}
                    </div>
                  </th>
                  <th className="p-4 cursor-pointer hover:text-slate-900" onClick={() => toggleSort("IMPORTANCE_SCORE")}>
                    <div className="flex items-center gap-1">
                      <span>Impact Score</span>
                      <ArrowUpDown size={12} />
                      {sortBy === "IMPORTANCE_SCORE" && (
                        <span className="text-slate-600 text-[10px] ml-0.5">
                          {sortOrder === "desc" ? "↓" : "↑"}
                        </span>
                      )}
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
                      <td className="p-4 font-medium tabular-nums text-slate-400 text-xs">
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
                      <td className="p-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                            <Calendar size={12} className="text-slate-400" />
                            <span>{formatTradeDate(player.TRADE_DATE) || "—"}</span>
                          </div>
                          {player.HOW_ACQUIRED && (
                            <span className="text-[10px] text-slate-400 font-medium truncate max-w-[170px]" title={player.HOW_ACQUIRED}>
                              {player.HOW_ACQUIRED}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="font-semibold tabular-nums text-slate-800 text-sm">
                          {player.IMPORTANCE_SCORE}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          {teams.map((t, i) => {
                            return (
                              <React.Fragment key={t + i}>
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${i === teams.length - 1 ? "bg-slate-800 text-white" : "bg-slate-200 text-slate-600"}`}
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
                      <td className="p-4 text-center tabular-nums font-semibold text-slate-800">{player.AVG_PTS}</td>
                      <td className="p-4 text-center tabular-nums font-semibold text-slate-800">{player.AVG_REB}</td>
                      <td className="p-4 text-center tabular-nums font-semibold text-slate-800">{player.AVG_AST}</td>
                      <td className="p-4 text-center tabular-nums text-slate-600">{player.AVG_MIN}m</td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                          (player.NUM_TEAMS ?? 1) >= 3 ? "bg-slate-200 text-slate-700" : "bg-slate-100 text-slate-600"
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

    </div>
  );
};

export default MultiTeamPlayers;
