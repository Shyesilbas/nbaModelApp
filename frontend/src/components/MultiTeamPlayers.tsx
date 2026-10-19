import React, { useState, useMemo, useEffect } from "react";
import {
  Search,
  Filter,
  ArrowRightLeft,
  Crown,
  Flame,
  ShieldCheck,
  Sparkles,
  LayoutGrid,
  Table as TableIcon,
  Calendar,
  ArrowUpDown,
} from "lucide-react";
import TeamLogo from "./TeamLogo";
import PlayerPhoto from "./PlayerPhoto";
import { NBA_TEAM_ABBRS, TEAM_NAME_BY_ABBR, type NbaTeamAbbr } from "../lib/nbaTeams";
import { loadJson } from "../lib/dataCache";
import { CURRENT_SEASON } from "../lib/constants";

export interface MultiTeamPlayer {
  PLAYER_ID: number;
  PLAYER_NAME: string;
  NUM_TEAMS: number;
  TEAMS_PLAYED_FOR: string;
  FIRST_TEAM: string;
  LATEST_TEAM: string;
  FIRST_GAME_DATE: string;
  LATEST_GAME_DATE: string;
  DAYS_SPAN: number;
  AVG_PTS: number;
  AVG_REB: number;
  AVG_AST: number;
  AVG_MIN: number;
  TOTAL_PTS: number;
  TOTAL_REB: number;
  TOTAL_AST: number;
  TOTAL_GAMES: number;
  TRADE_DATE?: string;
  HOW_ACQUIRED?: string;
  MOVE_TYPE?: "Trade" | "Non-rostered";
  IMPORTANCE_SCORE?: number;
}

type SortField =
  | "IMPORTANCE_SCORE"
  | "NUM_TEAMS"
  | "AVG_PTS"
  | "AVG_REB"
  | "AVG_AST"
  | "AVG_MIN"
  | "TOTAL_GAMES"
  | "TRADE_DATE";

type TierFilter = "ALL" | "BLOCKBUSTER" | "STARTER" | "ROTATION" | "DEPTH";

export default function MultiTeamPlayers({ players }: { players: MultiTeamPlayer[] }) {
  const [selectedSeason, setSelectedSeason] = useState<string>(CURRENT_SEASON);
  const [seasonPlayers, setSeasonPlayers] = useState<MultiTeamPlayer[]>(players);
  const [loadingSeason, setLoadingSeason] = useState<boolean>(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("TRADE_DATE");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>("ALL");
  const [moveFilter, setMoveFilter] = useState<"ALL" | "Trade" | "Non-rostered">("ALL");
  const [selectedTier, setSelectedTier] = useState<TierFilter>("ALL");

  const seasonsList = useMemo(() => [CURRENT_SEASON, "2025-26", "2024-25", "2023-24", "2022-23", "2021-22", "2020-21"], []);

  useEffect(() => {
    let isMounted = true;
    setLoadingSeason(true);

    const path =
      selectedSeason === CURRENT_SEASON
        ? "/data/multi_team_players.json"
        : `/data/seasons/${selectedSeason}/multi_team_players.json`;

    loadJson<MultiTeamPlayer[]>(path)
      .then((data) => {
        if (isMounted) {
          setSeasonPlayers(data || []);
          setLoadingSeason(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSeasonPlayers(selectedSeason === CURRENT_SEASON ? players : []);
          setLoadingSeason(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedSeason, players]);

  const normalizedPlayers = useMemo(() => {
    return seasonPlayers.map((p) => {
      const pts = Number(p.AVG_PTS || 0);
      const reb = Number(p.AVG_REB || 0);
      const ast = Number(p.AVG_AST || 0);
      const min = Number(p.AVG_MIN || 0);
      const games = Number(p.TOTAL_GAMES || 0);

      let calcScore = p.IMPORTANCE_SCORE;
      if (calcScore === undefined || calcScore === null) {
        const baseImpact = pts * 1.0 + reb * 1.2 + ast * 1.5;
        const volumeFactor = Math.min(1.0, min / 25.0);
        const sampleConfidence = Math.min(1.0, games / 10.0);
        calcScore = Math.round((baseImpact * volumeFactor * sampleConfidence) * 10) / 10;
      }

      return {
        ...p,
        AVG_PTS: pts,
        AVG_REB: reb,
        AVG_AST: ast,
        AVG_MIN: min,
        TOTAL_GAMES: games,
        IMPORTANCE_SCORE: calcScore,
      };
    });
  }, [seasonPlayers]);

  const processedPlayers = useMemo(() => {
    return normalizedPlayers
      .filter((p) => {
        const matchesSearch =
          search === "" ||
          p.PLAYER_NAME.toLowerCase().includes(search.toLowerCase()) ||
          p.TEAMS_PLAYED_FOR.toLowerCase().includes(search.toLowerCase()) ||
          String(p.PLAYER_ID).includes(search);

        const matchesTeam =
          selectedTeamFilter === "ALL" ||
          p.TEAMS_PLAYED_FOR.split(",")
            .map((t) => t.trim().toUpperCase())
            .includes(selectedTeamFilter.toUpperCase());

        const matchesMove = moveFilter === "ALL" || (p.MOVE_TYPE ?? "Trade") === moveFilter;

        let matchesTier = true;
        const score = p.IMPORTANCE_SCORE ?? 0;
        if (selectedTier === "BLOCKBUSTER") matchesTier = score >= 45.0;
        else if (selectedTier === "STARTER") matchesTier = score >= 32.0 && score < 45.0;
        else if (selectedTier === "ROTATION") matchesTier = score >= 20.0 && score < 32.0;
        else if (selectedTier === "DEPTH") matchesTier = score < 20.0;

        return matchesSearch && matchesTeam && matchesTier && matchesMove;
      })
      .sort((a, b) => {
        let valA: any = a[sortBy];
        let valB: any = b[sortBy];

        if (sortBy === "TRADE_DATE") {
          valA = a.TRADE_DATE || a.LATEST_GAME_DATE || "";
          valB = b.TRADE_DATE || b.LATEST_GAME_DATE || "";
        }

        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;

        if (valA < valB) return sortOrder === "asc" ? -1 : 1;
        if (valA > valB) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
  }, [normalizedPlayers, search, selectedTeamFilter, selectedTier, moveFilter, sortBy, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
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
      return dt.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const getTierBadge = (score: number) => {
    if (score >= 45.0) {
      return {
        label: "Franchise Cornerstone",
        icon: Crown,
      };
    }
    if (score >= 32.0) {
      return {
        label: "All-Star / Co-Star",
        icon: Flame,
      };
    }
    if (score >= 22.0) {
      return {
        label: "Key Starter",
        icon: ShieldCheck,
      };
    }
    return {
      label: "Rotation Piece",
      icon: Sparkles,
    };
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="flex flex-col gap-3 border-b border-border-light pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Trade Discovery</h1>
          <p className="mt-0.5 text-xs text-text-secondary">Player movement and mid-season roster transitions · {selectedSeason}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-secondary">{normalizedPlayers.length} players</span>
          <select
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(e.target.value)}
            className="rounded border border-border bg-background-primary px-3 py-1.5 text-xs font-medium text-text-primary focus:border-border-focus"
          >
            {seasonsList.map((s) => (
              <option key={s} value={s}>
                {s} Season
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Filters card */}
      <section className="rounded border border-border bg-background-primary p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={14} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search player, team or ID..."
              className="w-full rounded border border-border bg-background-primary py-1.5 pl-9 pr-3 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-border-focus"
            />
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded border border-border bg-background-tertiary px-2.5 py-1 text-xs text-text-secondary">
              <Filter size={12} className="text-text-muted" />
              <span>Team:</span>
              <select
                value={selectedTeamFilter}
                onChange={(e) => setSelectedTeamFilter(e.target.value)}
                className="bg-transparent text-xs font-medium text-text-primary focus:outline-none cursor-pointer"
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
            <div className="flex items-center rounded border border-border bg-background-primary p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={`rounded p-1 text-xs transition-colors ${
                  viewMode === "grid"
                    ? "bg-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
                title="Grid Cards"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`rounded p-1 text-xs transition-colors ${
                  viewMode === "table"
                    ? "bg-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
                title="Table Registry"
              >
                <TableIcon size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-2 border-t border-border-light pt-2.5">
          <select
            value={moveFilter}
            onChange={(e) => setMoveFilter(e.target.value as "ALL" | "Trade" | "Non-rostered")}
            className="rounded border border-border bg-background-primary px-2.5 py-1 text-xs text-text-primary focus:border-border-focus"
          >
            <option value="ALL">All moves</option>
            <option value="Trade">Trades</option>
            <option value="Non-rostered">Non-rostered</option>
          </select>
          <select
            value={selectedTier}
            onChange={(e) => setSelectedTier(e.target.value as TierFilter)}
            className="rounded border border-border bg-background-primary px-2.5 py-1 text-xs text-text-primary focus:border-border-focus"
          >
            <option value="ALL">All impact tiers</option>
            <option value="BLOCKBUSTER">Blockbuster</option>
            <option value="STARTER">Starter</option>
            <option value="ROTATION">Rotation</option>
            <option value="DEPTH">Depth</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as SortField);
              setSortOrder("desc");
            }}
            className="rounded border border-border bg-background-primary px-2.5 py-1 text-xs text-text-primary focus:border-border-focus"
          >
            <option value="TRADE_DATE">Sort: Trade date</option>
            <option value="IMPORTANCE_SCORE">Sort: Impact</option>
            <option value="AVG_PTS">Sort: Points</option>
            <option value="AVG_REB">Sort: Rebounds</option>
            <option value="AVG_AST">Sort: Assists</option>
            <option value="AVG_MIN">Sort: Minutes</option>
            <option value="NUM_TEAMS">Sort: Teams</option>
          </select>
          <button
            onClick={() => setSortOrder((current) => (current === "desc" ? "asc" : "desc"))}
            className="rounded border border-border bg-background-primary px-2.5 py-1 text-xs text-text-secondary hover:bg-background-tertiary"
            aria-label={`Sort ${sortOrder === "desc" ? "ascending" : "descending"}`}
          >
            {sortOrder === "desc" ? "↓ Descending" : "↑ Ascending"}
          </button>
        </div>
      </section>

      {/* Main Display */}
      {loadingSeason ? (
        <div className="py-12 text-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
          <p className="mt-2 text-xs text-text-secondary">Loading mobility data...</p>
        </div>
      ) : processedPlayers.length === 0 ? (
        <div className="rounded border border-border bg-background-primary p-8 text-center">
          <p className="text-sm font-semibold text-text-primary">No traded players found</p>
          <p className="mt-1 text-xs text-text-secondary">Try adjusting your search query, team filter, or tier selection.</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {processedPlayers.map((player) => {
            const teams = (player.TEAMS_PLAYED_FOR || "").split(",").map((t) => t.trim() as NbaTeamAbbr);
            const primaryTeam = teams[teams.length - 1] || "MIA";
            const tier = getTierBadge(player.IMPORTANCE_SCORE ?? 0);
            const TierIcon = tier.icon;

            return (
              <div
                key={player.PLAYER_ID}
                className="flex flex-col justify-between rounded border border-border bg-background-primary p-4 transition-colors hover:border-card-border-hover"
              >
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
                      <TierIcon size={12} className="text-text-muted" />
                      {tier.label}
                    </span>
                    <span className="text-xs tabular-nums text-text-muted">
                      ID: {player.PLAYER_ID}
                    </span>
                  </div>

                  <div className="mb-3 flex items-center gap-3">
                    <div className="relative">
                      <PlayerPhoto
                        playerId={player.PLAYER_ID}
                        name={player.PLAYER_NAME}
                        size={48}
                      />
                      <div className="absolute -bottom-1 -right-1">
                        <TeamLogo abbr={primaryTeam} size={18} />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold text-text-primary">
                        {player.PLAYER_NAME}
                      </h3>
                      <div className="mt-0.5 flex items-center gap-2 text-xs">
                        <span className="text-text-muted">Impact Score:</span>
                        <span className="font-semibold tabular-nums text-text-primary">
                          {player.IMPORTANCE_SCORE}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Transfer Route */}
                  <div className="mb-3 rounded border border-border-light bg-background-tertiary p-2.5">
                    <div className="mb-1.5 flex items-center justify-between gap-1 text-xs">
                      <span className="font-medium text-text-muted">
                        Team journey · {teams.length} stops
                      </span>
                      {player.TRADE_DATE && (
                        <span className="inline-flex items-center gap-1 text-xs tabular-nums text-text-secondary">
                          <Calendar size={11} className="text-text-muted" />
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
                              className={`rounded-sm border px-2 py-0.5 text-xs font-medium ${
                                isCurrent
                                  ? "border-primary bg-primary text-white"
                                  : "border-border bg-background-primary text-text-secondary"
                              }`}
                            >
                              {t}
                            </span>
                            {i < teams.length - 1 && (
                              <ArrowRightLeft size={11} className="text-text-muted" />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                    {player.HOW_ACQUIRED && (
                      <div className="mt-1.5 border-t border-border-light pt-1 text-xs text-text-muted truncate" title={player.HOW_ACQUIRED}>
                        {player.MOVE_TYPE === "Non-rostered" && <span className="mr-1.5 rounded-sm border border-border px-1 text-[10px] uppercase">Non-rostered</span>}
                        {player.HOW_ACQUIRED}
                      </div>
                    )}
                  </div>
                </div>

                {/* Box Score Stats Bar */}
                <div className="grid grid-cols-4 gap-1 rounded border border-border bg-background-tertiary p-2 text-center">
                  <div>
                    <span className="block text-xs font-medium text-text-muted">PTS</span>
                    <span className="text-xs font-semibold tabular-nums text-text-primary">{player.AVG_PTS}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-medium text-text-muted">REB</span>
                    <span className="text-xs font-semibold tabular-nums text-text-primary">{player.AVG_REB}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-medium text-text-muted">AST</span>
                    <span className="text-xs font-semibold tabular-nums text-text-primary">{player.AVG_AST}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-medium text-text-muted">MIN</span>
                    <span className="text-xs font-semibold tabular-nums text-text-primary">{player.AVG_MIN}m</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table Registry View */
        <div className="overflow-x-auto rounded border border-border bg-background-primary">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-background-tertiary">
                <th className="p-3 font-medium text-text-secondary">Rank</th>
                <th className="p-3 font-medium text-text-secondary">Player</th>
                <th className="p-3 font-medium text-text-secondary cursor-pointer" onClick={() => toggleSort("TRADE_DATE")}>
                  <div className="flex items-center gap-1">
                    <Calendar size={12} className="text-text-muted" />
                    <span>Date</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th className="p-3 font-medium text-text-secondary cursor-pointer" onClick={() => toggleSort("IMPORTANCE_SCORE")}>
                  <div className="flex items-center gap-1">
                    <span>Impact</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th className="p-3 font-medium text-text-secondary">Trade Route</th>
                <th className="p-3 text-right font-medium text-text-secondary cursor-pointer" onClick={() => toggleSort("AVG_PTS")}>PTS</th>
                <th className="p-3 text-right font-medium text-text-secondary cursor-pointer" onClick={() => toggleSort("AVG_REB")}>REB</th>
                <th className="p-3 text-right font-medium text-text-secondary cursor-pointer" onClick={() => toggleSort("AVG_AST")}>AST</th>
                <th className="p-3 text-right font-medium text-text-secondary cursor-pointer" onClick={() => toggleSort("AVG_MIN")}>MIN</th>
                <th className="p-3 text-center font-medium text-text-secondary">Teams</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {processedPlayers.map((player, idx) => {
                const teams = (player.TEAMS_PLAYED_FOR || "").split(",").map((t) => t.trim() as NbaTeamAbbr);
                return (
                  <tr key={player.PLAYER_ID} className="transition-colors hover:bg-background-tertiary">
                    <td className="p-3 font-mono tabular-nums text-text-muted">
                      #{idx + 1}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <PlayerPhoto
                          playerId={player.PLAYER_ID}
                          name={player.PLAYER_NAME}
                          size={32}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-text-primary">{player.PLAYER_NAME}</p>
                          <p className="text-xs text-text-muted">ID: {player.PLAYER_ID}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 tabular-nums text-text-secondary">
                      {formatTradeDate(player.TRADE_DATE) || "—"}
                    </td>
                    <td className="p-3 font-semibold tabular-nums text-text-primary">
                      {player.IMPORTANCE_SCORE}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1 text-xs">
                        {teams.map((t, i) => (
                          <React.Fragment key={t + i}>
                            <span className="font-medium text-text-primary">{t}</span>
                            {i < teams.length - 1 && <ArrowRightLeft size={10} className="text-text-muted" />}
                          </React.Fragment>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-right font-semibold tabular-nums text-text-primary">{player.AVG_PTS}</td>
                    <td className="p-3 text-right tabular-nums text-text-secondary">{player.AVG_REB}</td>
                    <td className="p-3 text-right tabular-nums text-text-secondary">{player.AVG_AST}</td>
                    <td className="p-3 text-right tabular-nums text-text-secondary">{player.AVG_MIN}m</td>
                    <td className="p-3 text-center tabular-nums text-text-muted">{teams.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
