import React, { useEffect, useState, useMemo } from "react";
import {
  Search, 
  TrendingUp, 
  User, 
  Flame, 
  Award,
  ArrowUpDown,
  Info,
  Crown,
  Swords,
  ShieldHalf,
  Sparkles,
  Layers3
} from "lucide-react";
import TeamLogo from "./TeamLogo";
import PlayerPhoto from "./PlayerPhoto";
import { loadJson, loadPrivateApi } from "../lib/dataCache";
import { TEAM_NAME_BY_ABBR, getTeamTheme } from "../lib/nbaTeams";

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
  onSelectPlayer: (playerId: number) => void;
}

type ExplorerView = "team" | "league";

const ROLE_BY_RANK = [
  {
    title: "Franchise Cornerstone",
    description: "Primary offensive engine and highest-impact player.",
    icon: Crown,
  },
  {
    title: "Secondary Star",
    description: "High-usage scoring option with strong minutes load.",
    icon: Swords,
  },
  {
    title: "Core Starter",
    description: "Reliable two-way contributor across major stat categories.",
    icon: ShieldHalf,
  },
  {
    title: "Key Rotation",
    description: "Important supporting piece in the main rotation.",
    icon: Sparkles,
  },
  {
    title: "Rotation Scorer",
    description: "Bench or secondary scoring value with meaningful usage.",
    icon: Sparkles,
  },
] as const;

const TeamExplorer: React.FC<TeamExplorerProps> = ({ rosters, onSelectPlayer }) => {
  const [seasonsList, setSeasonsList] = useState<string[]>(["2026-27", "2025-26", "2024-25", "2023-24", "2022-23"]);
  const [selectedSeason, setSelectedSeason] = useState<string>("2026-27");
  const [seasonRosters, setSeasonRosters] = useState<Record<string, PlayerRoster[]>>({ "2026-27": rosters });
  const [loadingSeason, setLoadingSeason] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string>("BOS");
  const [view, setView] = useState<ExplorerView>("team");
  const [sortBy, setSortBy] = useState<string>("AVG_MIN");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    setSeasonRosters((prev) => ({ ...prev, "2026-27": rosters }));
  }, [rosters]);

  useEffect(() => {
    loadJson<string[]>("/data/seasons.json", [])
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setSeasonsList(data);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (seasonRosters[selectedSeason]) return;
    setLoadingSeason(true);
    setLoadError(null);
    let active = true;
    loadPrivateApi<PlayerRoster[]>(`/frontend-data-api/team-rosters?season=${encodeURIComponent(selectedSeason)}`)
      .then((rows) => {
        if (active) {
          setSeasonRosters((prev) => ({ ...prev, [selectedSeason]: rows }));
        }
      })
      .catch((e) => {
        if (active) setLoadError(e.message);
      })
      .finally(() => {
        if (active) setLoadingSeason(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeason]);

  const activeRosters = seasonRosters[selectedSeason] ?? [];

  // Get unique list of team abbreviations
  const teamsList = useMemo(() => {
    const teams = new Set(activeRosters.map(r => r.TEAM_ABBREVIATION));
    return Array.from(teams).sort();
  }, [activeRosters]);

  useEffect(() => {
    if (teamsList.length > 0 && !teamsList.includes(selectedTeam)) {
      setSelectedTeam(teamsList[0]);
    }
  }, [teamsList, selectedTeam]);

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
    return activeRosters.filter(r => r.TEAM_ABBREVIATION === selectedTeam);
  }, [activeRosters, selectedTeam]);

  // Get Top 5 players based on Importance Score (sorted)
  const corePlayers = useMemo(() => {
    return [...rawTeamRoster]
      .sort((a, b) => b.IMPORTANCE_SCORE - a.IMPORTANCE_SCORE)
      .slice(0, 5);
  }, [rawTeamRoster]);

  const leagueTeamRanks = useMemo(() => teamsList.map((team) => {
    const players = activeRosters
      .filter((player) => player.TEAM_ABBREVIATION === team)
      .sort((a, b) => b.IMPORTANCE_SCORE - a.IMPORTANCE_SCORE);
    const topThree = players.slice(0, 3);
    return {
      team,
      players,
      score: topThree.length ? topThree.reduce((sum, player) => sum + player.IMPORTANCE_SCORE, 0) / topThree.length : 0,
    };
  }).sort((a, b) => b.score - a.score), [activeRosters, teamsList]);

  const leaguePlayerLeaders = useMemo(() => {
    const rankByPlayer = new Map<string, number>();
    leagueTeamRanks.forEach(({ team, players }) => {
      players.forEach((player, index) => rankByPlayer.set(`${team}:${player.PLAYER_ID}`, index + 1));
    });
    return [...activeRosters]
      .sort((a, b) => b.IMPORTANCE_SCORE - a.IMPORTANCE_SCORE)
      .slice(0, 15)
      .map((player) => ({
        ...player,
        CORE_RANK: rankByPlayer.get(`${player.TEAM_ABBREVIATION}:${player.PLAYER_ID}`) ?? 0,
      }));
  }, [activeRosters, leagueTeamRanks]);

  const leagueAverage = useMemo(() => leagueTeamRanks.length
    ? leagueTeamRanks.reduce((sum, item) => sum + item.score, 0) / leagueTeamRanks.length
    : 0, [leagueTeamRanks]);

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

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* ─── Page Header with Theme Glow ─── */}
      <section 
        className="relative overflow-hidden rounded-[2rem] border p-8 shadow-sm transition-all duration-500"
        style={{
          background: `linear-gradient(135deg, ${activeTeamTheme.primary}0c 0%, #ffffff 45%, ${activeTeamTheme.secondary}08 100%)`,
          borderColor: `${activeTeamTheme.primary}25`
        }}
      >
        {/* Dual-color top accent bar */}
        <div 
          className="absolute inset-x-0 top-0 h-1.5"
          style={{ background: `linear-gradient(90deg, ${activeTeamTheme.primary}, ${activeTeamTheme.secondary})` }}
        />
        <div 
          className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl pointer-events-none" 
          style={{ background: `radial-gradient(circle, ${activeTeamTheme.glow} 0%, transparent 70%)` }} 
        />
        
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div 
              className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] shadow-xs"
              style={{ color: activeTeamTheme.primary, backgroundColor: `${activeTeamTheme.primary}12`, borderColor: `${activeTeamTheme.primary}24` }}
            >
              <Search size={12} className="animate-pulse" />
              Franchise Deep Lens
            </div>
            <div className="flex items-center gap-3">
              <TeamLogo abbr={selectedTeam} name={TEAM_NAME_BY_ABBR[selectedTeam as keyof typeof TEAM_NAME_BY_ABBR]} size={48} />
              <div>
                <h1 className="text-4xl lg:text-5xl font-black tracking-tight text-slate-900 m-0 uppercase leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {TEAM_NAME_BY_ABBR[selectedTeam as keyof typeof TEAM_NAME_BY_ABBR] || selectedTeam}
                </h1>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-1">
                  Team Explorer · {selectedSeason} Season
                </p>
              </div>
            </div>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
              Explore discovered player listings, core rotation hierarchy, and dynamic franchise ratings.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex flex-wrap gap-4">
            <div className="glass-card flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/90 backdrop-blur-sm border border-slate-200/70 shadow-xs">
              <div className="p-2 rounded-xl" style={{ backgroundColor: `${activeTeamTheme.primary}12`, color: activeTeamTheme.primary }}>
                <User size={18} />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-none">Roster Size</p>
                <p className="text-lg font-black text-slate-800 leading-none mt-1">{teamSummary.size} Players</p>
              </div>
            </div>

            <div className="glass-card flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/90 backdrop-blur-sm border border-slate-200/70 shadow-xs">
              <div className="p-2 rounded-xl" style={{ color: activeTeamTheme.primary, backgroundColor: `${activeTeamTheme.primary}15` }}>
                <Flame size={18} />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-none">Avg PTS</p>
                <p className="text-lg font-black text-slate-800 leading-none mt-1">{teamSummary.avgPts.toFixed(1)} Pts</p>
              </div>
            </div>

            <div className="glass-card flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/90 backdrop-blur-sm border border-slate-200/70 shadow-xs">
              <div className="p-2 rounded-xl" style={{ color: activeTeamTheme.secondary, backgroundColor: `${activeTeamTheme.secondary}15` }}>
                <TrendingUp size={18} />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-none">Top 3 Power</p>
                <p className="text-lg font-black text-slate-800 leading-none mt-1">{teamSummary.strength.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-6 border-t border-slate-200/60 pt-5">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-2">Select Season</p>
          <div className="flex flex-wrap gap-1.5">
            {seasonsList.map((season) => (
              <button
                key={season}
                onClick={() => setSelectedSeason(season)}
                className={[
                  "rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] transition-all duration-200",
                  selectedSeason === season
                    ? "bg-slate-900 text-white shadow-md shadow-slate-900/15"
                    : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800",
                ].join(" ")}
              >
                {season}
              </button>
            ))}
          </div>
          {loadingSeason && (
            <p className="mt-3 text-xs font-semibold text-slate-400">Loading {selectedSeason} roster data...</p>
          )}
          {loadError && (
            <p className="mt-3 text-xs font-semibold text-rose-500">{loadError}</p>
          )}
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
                  className="flex-shrink-0 rounded-xl border px-3.5 py-2 text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer hover:scale-[1.03] flex items-center gap-2"
                  style={{
                    borderColor: isSelected ? theme.primary : "#e2e8f0",
                    backgroundColor: isSelected ? `${theme.primary}15` : "#ffffff",
                    color: isSelected ? theme.primary : "#64748b",
                    boxShadow: isSelected ? `0 4px 14px ${theme.glow}, inset 0 0 0 1px ${theme.primary}20` : undefined,
                  }}
                >
                  <TeamLogo abbr={team} name={TEAM_NAME_BY_ABBR[team as keyof typeof TEAM_NAME_BY_ABBR]} size={20} />
                  {team}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="flex w-fit gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-xs">
        <button onClick={() => setView("team")} className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${view === "team" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}>
          Team overview
        </button>
        <button onClick={() => setView("league")} className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${view === "league" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}>
          League rankings
        </button>
      </div>

      {view === "team" ? <>
      {/* ─── Franchise Hierarchy Overview ─── */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-800 m-0 uppercase tracking-wide flex items-center gap-2" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              <Award size={18} style={{ color: activeTeamTheme.primary }} />
              Franchise Hierarchy
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-400">
              Rank 1 through 5 are arranged by importance score, with role labels that explain why each player sits in the franchise structure.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500 shadow-xs">
            <Layers3 size={12} style={{ color: activeTeamTheme.primary }} />
            Top 5 hierarchy
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {corePlayers.map((player, idx) => {
            const role = ROLE_BY_RANK[idx] ?? ROLE_BY_RANK[4];
            const Icon = role.icon;
            const isTop3 = idx < 3;
            const cardAccentColor = isTop3 ? activeTeamTheme.primary : activeTeamTheme.secondary;
            return (
              <div
                key={player.PLAYER_ID}
                className="group relative overflow-hidden rounded-2xl border bg-white shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                style={{
                  borderColor: isTop3 ? `${activeTeamTheme.primary}28` : `${activeTeamTheme.secondary}22`,
                  boxShadow: `0 1px 0 rgba(15,23,42,0.02), 0 20px 40px ${isTop3 ? activeTeamTheme.glow : `${activeTeamTheme.secondary}0a`}`,
                }}
              >
                <div
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ background: isTop3 ? `linear-gradient(90deg, ${activeTeamTheme.primary}, ${activeTeamTheme.secondary})` : activeTeamTheme.secondary }}
                />
                <div className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: cardAccentColor, backgroundColor: `${cardAccentColor}12`, borderColor: `${cardAccentColor}22` }}>
                          Rank {idx + 1}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{player.TEAM_ABBREVIATION}</span>
                      </div>
                      <p className="mt-2 text-lg font-bold leading-tight text-slate-900">
                        {player.PLAYER_NAME}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                        <Icon size={12} style={{ color: cardAccentColor }} />
                        <span className="font-medium">{role.title}</span>
                      </div>
                    </div>
                    <PlayerPhoto 
                      playerId={player.PLAYER_ID} 
                      name={player.PLAYER_NAME} 
                      size={48}
                      style={{
                        borderColor: cardAccentColor,
                        boxShadow: `0 0 0 2px ${cardAccentColor}25, 0 4px 12px ${activeTeamTheme.glow}`,
                      }}
                    />
                  </div>

                  <p className="text-xs leading-relaxed text-slate-500">{role.description}</p>

                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: cardAccentColor, backgroundColor: `${cardAccentColor}12` }}>
                      Impact {player.IMPORTANCE_SCORE.toFixed(1)}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                      {player.GP} GP
                    </span>
                  </div>

                  <div className="grid grid-cols-5 gap-1.5">
                    <div className="rounded-xl p-2 border" style={{ backgroundColor: `${activeTeamTheme.primary}08`, borderColor: `${activeTeamTheme.primary}18` }}>
                      <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: activeTeamTheme.primary }}>PPG</p>
                      <p className="mt-0.5 text-sm font-bold text-slate-900">{player.AVG_PTS.toFixed(1)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50/80 p-2 border border-slate-100">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">RPG</p>
                      <p className="mt-0.5 text-sm font-bold text-slate-900">{player.AVG_REB.toFixed(1)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50/80 p-2 border border-slate-100">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">APG</p>
                      <p className="mt-0.5 text-sm font-bold text-slate-900">{player.AVG_AST.toFixed(1)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50/80 p-2 border border-slate-100">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">MIN</p>
                      <p className="mt-0.5 text-sm font-bold text-slate-900">{player.AVG_MIN.toFixed(0)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50/80 p-2 border border-slate-100">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">G</p>
                      <p className="mt-0.5 text-sm font-bold text-slate-900">{player.GP}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur text-slate-400 text-xs uppercase font-bold border-b border-slate-200">
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
                  <tr key={player.PLAYER_ID} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-4 font-bold text-slate-800">
                      <div className="flex items-center gap-3">
                        <PlayerPhoto 
                          playerId={player.PLAYER_ID} 
                          name={player.PLAYER_NAME} 
                          size={32}
                          style={{
                            borderColor: isTop3 ? activeTeamTheme.primary : "#e2e8f0",
                          }} 
                        />
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{player.PLAYER_NAME}</span>
                          {isTop3 && (
                            <span 
                              className="px-2 py-0.5 text-[9px] rounded-full font-black uppercase tracking-wider"
                              style={{ backgroundColor: `${activeTeamTheme.primary}15`, color: activeTeamTheme.primary }}
                            >
                              Top 3
                            </span>
                          )}
                          {!isTop3 && isTop5 && (
                            <span 
                              className="px-2 py-0.5 text-[9px] rounded-full font-black uppercase tracking-wider"
                              style={{ backgroundColor: `${activeTeamTheme.secondary}15`, color: activeTeamTheme.secondary }}
                            >
                              Top 5
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-mono text-slate-400 text-xs">{player.PLAYER_ID}</td>
                    <td className="p-4 text-center font-mono tabular-nums">{player.GP}</td>
                    <td className="p-4 text-right font-mono tabular-nums font-semibold">{player.AVG_MIN.toFixed(1)}</td>
                    <td className="p-4 text-right font-mono tabular-nums font-bold text-slate-900">{player.AVG_PTS.toFixed(1)}</td>
                    <td className="p-4 text-right font-mono tabular-nums font-semibold text-slate-700">{player.AVG_REB.toFixed(1)}</td>
                    <td className="p-4 text-right font-mono tabular-nums font-semibold text-slate-700">{player.AVG_AST.toFixed(1)}</td>
                    <td className="p-4 text-right font-mono font-black tabular-nums">
                      <span 
                        className="inline-block px-2.5 py-1 rounded-lg text-xs font-black"
                        style={{ 
                          backgroundColor: `${activeTeamTheme.primary}12`, 
                          color: activeTeamTheme.primary 
                        }}
                      >
                        {player.IMPORTANCE_SCORE.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </> : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="m-0 text-base font-semibold text-slate-900">Franchise strength</h2>
              <p className="mt-1 text-xs text-slate-500">Average importance score of each team’s top three players · league avg. {leagueAverage.toFixed(1)}</p>
            </div>
            <div className="divide-y divide-slate-100">
              {leagueTeamRanks.map((item, index) => {
                const difference = item.score - leagueAverage;
                return (
                  <button key={item.team} onClick={() => { setSelectedTeam(item.team); setView("team"); }} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50">
                    <span className="w-6 text-right text-xs tabular-nums text-slate-400">{index + 1}</span>
                    <TeamLogo abbr={item.team} size={25} />
                    <span className="w-10 text-sm font-semibold text-slate-800">{item.team}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-slate-700" style={{ width: `${Math.min(item.score, 100)}%` }} />
                    </div>
                    <span className="w-10 text-right text-sm font-semibold tabular-nums text-slate-800">{item.score.toFixed(1)}</span>
                    <span className={`hidden w-14 text-right text-xs tabular-nums sm:block ${difference >= 0 ? "text-slate-600" : "text-slate-400"}`}>{difference >= 0 ? "+" : ""}{difference.toFixed(1)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="m-0 text-base font-semibold text-slate-900">League leaders</h2>
              <p className="mt-1 text-xs text-slate-500">Top players by importance score · {selectedSeason}</p>
            </div>
            <div className="divide-y divide-slate-100">
              {leaguePlayerLeaders.map((player, index) => (
                <button
                  key={`${player.TEAM_ABBREVIATION}-${player.PLAYER_ID}`}
                  type="button"
                  onClick={() => onSelectPlayer(player.PLAYER_ID)}
                  className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400"
                  aria-label={`Open ${player.PLAYER_NAME} player profile`}
                  title={`Open ${player.PLAYER_NAME} profile`}
                >
                  <span className="w-6 text-right text-xs tabular-nums text-slate-400">{index + 1}</span>
                  <PlayerPhoto playerId={player.PLAYER_ID} name={player.PLAYER_NAME} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{player.PLAYER_NAME}</p>
                    <p className="text-[11px] text-slate-500">{player.TEAM_ABBREVIATION} · team rank #{player.CORE_RANK}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-slate-800">{player.IMPORTANCE_SCORE.toFixed(1)}</span>
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
