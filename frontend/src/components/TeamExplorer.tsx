import React, { useState, useMemo, useEffect } from "react";
import {
  Award,
  Layers3,
  User,
  Flame,
  TrendingUp,
  Info,
  ArrowUpDown,
  Search,
} from "lucide-react";
import TeamLogo from "./TeamLogo";
import PlayerPhoto from "./PlayerPhoto";
import { NBA_TEAM_ABBRS, TEAM_NAME_BY_ABBR } from "../lib/nbaTeams";
import { loadJson } from "../lib/dataCache";
import { CURRENT_SEASON } from "../lib/constants";

interface CorePlayer {
  PLAYER_ID: number;
  PLAYER_NAME: string;
  TEAM_ABBREVIATION: string;
  CORE_RANK: number;
  IMPORTANCE_SCORE: number;
  GP: number;
  AVG_PTS: number;
  AVG_REB: number;
  AVG_AST: number;
  AVG_MIN: number;
}

interface TeamRosterItem {
  TEAM_ABBREVIATION: string;
  PLAYER_ID: number;
  PLAYER_NAME: string;
  GP: number;
  AVG_MIN: number;
  AVG_PTS: number;
  AVG_REB: number;
  AVG_AST: number;
  IMPORTANCE_SCORE: number;
}

interface TeamExplorerProps {
  rosters?: any[];
  onSelectPlayer: (playerId: number) => void;
  initialTeam?: string;
}

const ROLE_BY_RANK: Record<number, { title: string; description: string; icon: any }> = {
  0: {
    title: "Franchise Anchor",
    description: "Primary scoring option, highest offensive usage, and centerpiece of game planning.",
    icon: Flame,
  },
  1: {
    title: "Secondary Engine",
    description: "Co-star who stabilizes secondary lineups, secondary shot creator and playmaker.",
    icon: TrendingUp,
  },
  2: {
    title: "High-Leverage Starter",
    description: "Crucial starting contributor who balances the floor through spacing, defense, or secondary creation.",
    icon: Layers3,
  },
  3: {
    title: "System Specialist",
    description: "Defined starting or sixth-man role player delivering elite finishing, wing defense, or perimeter shooting.",
    icon: User,
  },
  4: {
    title: "Rotation Stabilizer",
    description: "Fifth rotation core piece holding structural floor minutes with consistent baseline execution.",
    icon: Award,
  },
};

const TeamExplorer: React.FC<TeamExplorerProps> = ({ onSelectPlayer, initialTeam }) => {
  const [selectedSeason, setSelectedSeason] = useState<string>(CURRENT_SEASON);
  const [activeRosters, setActiveRosters] = useState<any[]>([]);
  const [loadingSeason, setLoadingSeason] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string>(() => initialTeam || "BOS");

  useEffect(() => {
    if (initialTeam) {
      setSelectedTeam(initialTeam);
    }
  }, [initialTeam]);
  const [view, setView] = useState<"team" | "league">("team");
  const [sortBy, setSortBy] = useState<keyof TeamRosterItem>("IMPORTANCE_SCORE");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const seasonsList = useMemo(() => ["2026-27", "2025-26", "2024-25", "2023-24", "2022-23", "2021-22", "2020-21"], []);

  useEffect(() => {
    let isMounted = true;
    setLoadingSeason(true);
    setLoadError(null);
    setActiveRosters([]); // never show the previous season's rosters while the new one loads

    const path = `/data/seasons/${selectedSeason}/team_rosters.json`;

    loadJson<any[]>(path)
      .then((data) => {
        if (isMounted) {
          setActiveRosters(data || []);
          setLoadingSeason(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLoadError(`Failed to load ${selectedSeason} rosters.`);
          setActiveRosters([]);
          setLoadingSeason(false);
        }
      });

    return () => { isMounted = false; };
  }, [selectedSeason]);

  const teamsList = useMemo(() => {
    if (!activeRosters || activeRosters.length === 0) return [...NBA_TEAM_ABBRS];
    const extracted = Array.from(new Set(activeRosters.map(r => r.TEAM_ABBREVIATION))).filter(Boolean);
    return extracted.length > 0 ? (extracted as string[]).sort() : [...NBA_TEAM_ABBRS];
  }, [activeRosters]);

  const activeTeam = teamsList.includes(selectedTeam) ? selectedTeam : (teamsList[0] || "BOS");

  const rawTeamRoster: TeamRosterItem[] = useMemo(() => {
    if (!activeRosters) return [];
    return activeRosters
      .filter((r) => r.TEAM_ABBREVIATION === activeTeam)
      .map((r) => ({
        TEAM_ABBREVIATION: r.TEAM_ABBREVIATION,
        PLAYER_ID: Number(r.PLAYER_ID),
        PLAYER_NAME: r.PLAYER_NAME || `Player ${r.PLAYER_ID}`,
        GP: Number(r.GP || 0),
        AVG_MIN: Number(r.AVG_MIN || 0),
        AVG_PTS: Number(r.AVG_PTS || 0),
        AVG_REB: Number(r.AVG_REB || 0),
        AVG_AST: Number(r.AVG_AST || 0),
        IMPORTANCE_SCORE: Number(r.IMPORTANCE_SCORE || 0),
      }));
  }, [activeRosters, activeTeam]);

  const corePlayers: CorePlayer[] = useMemo(() => {
    return [...rawTeamRoster]
      .sort((a, b) => b.IMPORTANCE_SCORE - a.IMPORTANCE_SCORE)
      .slice(0, 5)
      .map((p, index) => ({
        ...p,
        CORE_RANK: index + 1,
      }));
  }, [rawTeamRoster]);

  const handleSort = (field: keyof TeamRosterItem) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const sortedTeamRoster = useMemo(() => {
    return [...rawTeamRoster].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortOrder === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortOrder === "asc" ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
    });
  }, [rawTeamRoster, sortBy, sortOrder]);

  const leagueTeamRanks = useMemo(() => {
    if (!activeRosters || activeRosters.length === 0) return [];
    const teamScores: Record<string, number[]> = {};
    activeRosters.forEach((r) => {
      const team = r.TEAM_ABBREVIATION;
      if (!team) return;
      if (!teamScores[team]) teamScores[team] = [];
      teamScores[team].push(Number(r.IMPORTANCE_SCORE || 0));
    });

    return Object.entries(teamScores)
      .map(([team, scores]) => {
        const top3 = scores.sort((a, b) => b - a).slice(0, 3);
        const avg = top3.length ? top3.reduce((sum, val) => sum + val, 0) / top3.length : 0;
        return { team, score: avg };
      })
      .sort((a, b) => b.score - a.score);
  }, [activeRosters]);

  const leagueAverage = useMemo(() => {
    if (!leagueTeamRanks.length) return 0;
    return leagueTeamRanks.reduce((sum, item) => sum + item.score, 0) / leagueTeamRanks.length;
  }, [leagueTeamRanks]);

  const leaguePlayerLeaders = useMemo(() => {
    if (!activeRosters) return [];
    return [...activeRosters]
      .map((r) => ({
        ...r,
        IMPORTANCE_SCORE: Number(r.IMPORTANCE_SCORE || 0),
        CORE_RANK: Number(r.CORE_RANK || 99),
      }))
      .sort((a, b) => b.IMPORTANCE_SCORE - a.IMPORTANCE_SCORE)
      .slice(0, 15);
  }, [activeRosters]);

  const teamSummary = useMemo(() => {
    const size = rawTeamRoster.length;
    const avgPts = size ? rawTeamRoster.reduce((sum, p) => sum + p.AVG_PTS, 0) / size : 0;
    const top3 = corePlayers.slice(0, 3);
    const strength = top3.length ? top3.reduce((sum, p) => sum + p.IMPORTANCE_SCORE, 0) / top3.length : 0;
    return { size, avgPts, strength };
  }, [rawTeamRoster, corePlayers]);

  return (
    <div className="space-y-4">
      {/* ── Page Header ── */}
      <section className="rounded border border-border bg-background-primary p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <Search size={13} />
              <span className="font-medium">Franchise deep lens</span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <TeamLogo abbr={activeTeam} name={TEAM_NAME_BY_ABBR[activeTeam as keyof typeof TEAM_NAME_BY_ABBR]} size={40} />
              <div>
                <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">
                  {TEAM_NAME_BY_ABBR[activeTeam as keyof typeof TEAM_NAME_BY_ABBR] || activeTeam}
                </h1>
                <p className="text-xs text-text-secondary">
                  Team Explorer · {selectedSeason} Season
                </p>
              </div>
            </div>
            <p className="mt-2 max-w-2xl text-xs text-text-secondary">
              Discovered player listings, core rotation hierarchy, and dynamic franchise ratings.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded border border-border bg-background-tertiary p-2.5 text-center min-w-[90px]">
              <p className="text-xs font-medium text-text-muted">Roster Size</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-text-primary">{teamSummary.size}</p>
            </div>
            <div className="rounded border border-border bg-background-tertiary p-2.5 text-center min-w-[90px]">
              <p className="text-xs font-medium text-text-muted">Avg PTS</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-text-primary">{teamSummary.avgPts.toFixed(1)}</p>
            </div>
            <div className="rounded border border-border bg-background-tertiary p-2.5 text-center min-w-[90px]">
              <p className="text-xs font-medium text-text-muted">Top 3 Power</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-text-primary">{teamSummary.strength.toFixed(1)}%</p>
            </div>
          </div>
        </div>

        {/* Season Selector */}
        <div className="mt-4 border-t border-border-light pt-3">
          <p className="text-xs font-medium text-text-secondary mb-1.5">Season</p>
          <div className="flex flex-wrap gap-1">
            {seasonsList.map((season) => (
              <button
                key={season}
                onClick={() => setSelectedSeason(season)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedSeason === season
                    ? "bg-primary text-white"
                    : "border border-border bg-background-primary text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
                }`}
              >
                {season}
              </button>
            ))}
          </div>
          {loadingSeason && (
            <p className="mt-2 text-xs text-text-secondary">Loading {selectedSeason} roster data...</p>
          )}
          {selectedSeason === CURRENT_SEASON && !loadingSeason && (
            <p className="mt-2 text-xs text-text-secondary">
              Kadrolar güncel takımlara göre; istatistikler bir önceki sezondan (2025-26).
            </p>
          )}
          {loadError && (
            <p className="mt-2 text-xs text-status-error">{loadError}</p>
          )}
        </div>

        {/* Franchise Selector */}
        <div className="mt-3 border-t border-border-light pt-3">
          <p className="text-xs font-medium text-text-secondary mb-1.5">Franchise</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {teamsList.map((team) => {
              const isSelected = activeTeam === team;
              return (
                <button
                  key={team}
                  onClick={() => setSelectedTeam(team)}
                  className={`flex shrink-0 items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                    isSelected
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-background-primary text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
                  }`}
                >
                  <TeamLogo abbr={team} size={16} />
                  <span>{team}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* View Switcher */}
      <nav aria-label="Views" className="flex gap-1 border-b border-border bg-background-primary pb-px">
        <button
          onClick={() => setView("team")}
          className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
            view === "team"
              ? "border-primary text-text-primary"
              : "border-transparent text-text-secondary hover:border-border hover:text-text-primary"
          }`}
        >
          Team overview
        </button>
        <button
          onClick={() => setView("league")}
          className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
            view === "league"
              ? "border-primary text-text-primary"
              : "border-transparent text-text-secondary hover:border-border hover:text-text-primary"
          }`}
        >
          League rankings
        </button>
      </nav>

      {view === "team" ? (
        <>
          {/* Franchise Hierarchy Overview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Franchise hierarchy</h2>
                <p className="mt-0.5 text-xs text-text-secondary">Top 5 core players and rotation tiers</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {corePlayers.map((player, idx) => {
                const role = ROLE_BY_RANK[idx] ?? ROLE_BY_RANK[4];
                const Icon = role.icon;
                return (
                  <div
                    key={player.PLAYER_ID}
                    className="flex flex-col justify-between rounded border border-border bg-background-primary p-4 transition-colors hover:border-card-border-hover"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 text-xs font-medium text-text-primary">
                          Rank {idx + 1}
                        </span>
                        <span className="text-xs text-text-muted">{player.TEAM_ABBREVIATION}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-text-primary">{player.PLAYER_NAME}</p>
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-text-secondary">
                            <Icon size={12} className="text-text-muted" />
                            <span>{role.title}</span>
                          </div>
                        </div>
                        <PlayerPhoto playerId={player.PLAYER_ID} name={player.PLAYER_NAME} size={40} />
                      </div>
                      <p className="mt-2 text-xs text-text-secondary">{role.description}</p>
                    </div>

                    <div className="mt-3 border-t border-border-light pt-2.5">
                      <div className="mb-2 flex items-center gap-2 text-xs">
                        <span className="font-semibold tabular-nums text-text-primary">
                          Impact {player.IMPORTANCE_SCORE.toFixed(1)}
                        </span>
                        <span className="text-text-muted">·</span>
                        <span className="tabular-nums text-text-secondary">{player.GP} GP</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1 rounded border border-border bg-background-tertiary p-1.5 text-center">
                        <div>
                          <p className="text-xs text-text-muted">PPG</p>
                          <p className="text-xs font-semibold tabular-nums text-text-primary">{player.AVG_PTS.toFixed(1)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted">RPG</p>
                          <p className="text-xs font-semibold tabular-nums text-text-primary">{player.AVG_REB.toFixed(1)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted">APG</p>
                          <p className="text-xs font-semibold tabular-nums text-text-primary">{player.AVG_AST.toFixed(1)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted">MIN</p>
                          <p className="text-xs font-semibold tabular-nums text-text-primary">{player.AVG_MIN.toFixed(0)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Full Discovered Roster */}
          <div className="rounded border border-border bg-background-primary">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border p-4">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Full Discovered Roster</h3>
                <p className="text-xs text-text-secondary">Discovered player listings, sortable by stats and importance score.</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-text-muted">
                <Info size={12} /> Click column headers to sort.
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-background-tertiary text-text-secondary">
                    <th onClick={() => handleSort("PLAYER_NAME")} className="p-3 cursor-pointer hover:text-text-primary select-none font-medium">
                      Player Name {sortBy === "PLAYER_NAME" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th onClick={() => handleSort("PLAYER_ID")} className="p-3 cursor-pointer hover:text-text-primary select-none font-medium font-mono">
                      ID {sortBy === "PLAYER_ID" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th onClick={() => handleSort("GP")} className="p-3 cursor-pointer hover:text-text-primary select-none text-center font-medium font-mono">
                      GP {sortBy === "GP" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th onClick={() => handleSort("AVG_MIN")} className="p-3 cursor-pointer hover:text-text-primary select-none text-right font-medium">
                      Min {sortBy === "AVG_MIN" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th onClick={() => handleSort("AVG_PTS")} className="p-3 cursor-pointer hover:text-text-primary select-none text-right font-medium">
                      Pts {sortBy === "AVG_PTS" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th onClick={() => handleSort("AVG_REB")} className="p-3 cursor-pointer hover:text-text-primary select-none text-right font-medium">
                      Reb {sortBy === "AVG_REB" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th onClick={() => handleSort("AVG_AST")} className="p-3 cursor-pointer hover:text-text-primary select-none text-right font-medium">
                      Ast {sortBy === "AVG_AST" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th onClick={() => handleSort("IMPORTANCE_SCORE")} className="p-3 cursor-pointer hover:text-text-primary select-none text-right font-semibold">
                      Importance Score {sortBy === "IMPORTANCE_SCORE" ? (sortOrder === "asc" ? "▲" : "▼") : ""} <ArrowUpDown size={10} className="inline ml-0.5" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {sortedTeamRoster.map((player) => {
                    const isTop5 = corePlayers.some(cp => cp.PLAYER_ID === player.PLAYER_ID);
                    const isTop3 = corePlayers.slice(0, 3).some(cp => cp.PLAYER_ID === player.PLAYER_ID);
                    return (
                      <tr key={player.PLAYER_ID} className="transition-colors hover:bg-background-tertiary">
                        <td className="p-3 font-medium text-text-primary">
                          <div className="flex items-center gap-2.5">
                            <PlayerPhoto playerId={player.PLAYER_ID} name={player.PLAYER_NAME} size={28} />
                            <div className="flex items-center gap-1.5">
                              <span>{player.PLAYER_NAME}</span>
                              {isTop3 && (
                                <span className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 text-xs font-medium text-text-primary">
                                  Top 3
                                </span>
                              )}
                              {!isTop3 && isTop5 && (
                                <span className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 text-xs font-medium text-text-secondary">
                                  Top 5
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-3 font-mono text-xs tabular-nums text-text-muted">{player.PLAYER_ID}</td>
                        <td className="p-3 text-center tabular-nums text-text-secondary">{player.GP}</td>
                        <td className="p-3 text-right tabular-nums text-text-secondary">{player.AVG_MIN.toFixed(1)}</td>
                        <td className="p-3 text-right font-semibold tabular-nums text-text-primary">{player.AVG_PTS.toFixed(1)}</td>
                        <td className="p-3 text-right tabular-nums text-text-secondary">{player.AVG_REB.toFixed(1)}</td>
                        <td className="p-3 text-right tabular-nums text-text-secondary">{player.AVG_AST.toFixed(1)}</td>
                        <td className="p-3 text-right font-semibold tabular-nums text-text-primary">
                          {player.IMPORTANCE_SCORE.toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section className="rounded border border-border bg-background-primary">
            <div className="border-b border-border p-4">
              <h2 className="text-sm font-semibold text-text-primary">Franchise strength</h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                Average importance score of each team's top three players · league avg. {leagueAverage.toFixed(1)}
              </p>
            </div>
            <div className="divide-y divide-border-light">
              {leagueTeamRanks.map((item, index) => {
                const difference = item.score - leagueAverage;
                return (
                  <button
                    key={item.team}
                    onClick={() => { setSelectedTeam(item.team); setView("team"); }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs transition-colors hover:bg-background-tertiary"
                  >
                    <span className="w-5 text-right font-mono tabular-nums text-text-muted">{index + 1}</span>
                    <TeamLogo abbr={item.team} size={22} />
                    <span className="w-10 font-semibold text-text-primary">{item.team}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background-tertiary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(item.score, 100)}%` }} />
                    </div>
                    <span className="w-10 text-right font-semibold tabular-nums text-text-primary">{item.score.toFixed(1)}</span>
                    <span className={`hidden w-12 text-right tabular-nums sm:block ${difference >= 0 ? "text-status-success" : "text-text-muted"}`}>
                      {difference >= 0 ? "+" : ""}{difference.toFixed(1)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded border border-border bg-background-primary">
            <div className="border-b border-border p-4">
              <h2 className="text-sm font-semibold text-text-primary">League leaders</h2>
              <p className="mt-0.5 text-xs text-text-secondary">Top players by importance score · {selectedSeason}</p>
            </div>
            <div className="divide-y divide-border-light">
              {leaguePlayerLeaders.map((player, index) => (
                <button
                  key={`${player.TEAM_ABBREVIATION}-${player.PLAYER_ID}`}
                  type="button"
                  onClick={() => onSelectPlayer(player.PLAYER_ID)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs transition-colors hover:bg-background-tertiary"
                  aria-label={`Open ${player.PLAYER_NAME} player profile`}
                >
                  <span className="w-5 text-right font-mono tabular-nums text-text-muted">{index + 1}</span>
                  <PlayerPhoto playerId={player.PLAYER_ID} name={player.PLAYER_NAME} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-text-primary">{player.PLAYER_NAME}</p>
                    <p className="text-xs text-text-muted">{player.TEAM_ABBREVIATION} · rank #{player.CORE_RANK}</p>
                  </div>
                  <span className="font-semibold tabular-nums text-text-primary">{player.IMPORTANCE_SCORE.toFixed(1)}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default TeamExplorer;
