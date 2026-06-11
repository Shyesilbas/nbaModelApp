import React, { useState, useMemo, useEffect } from "react";
import {
  ChevronDown,
  Search,
  TrendingUp,
  User,
  BarChart3,
  ArrowUpRight,
  Info,
  Activity,
  Clock,
  Layers,
  SlidersHorizontal,
  ChevronRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import PlayerPhoto from "./PlayerPhoto";

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
  BKN: { primary: "#2d2d2d", secondary: "#777777" },
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
  SAS: { primary: "#7a7a7a", secondary: "#080808" },
  TOR: { primary: "#ce1141", secondary: "#080808" },
  UTA: { primary: "#002b5c", secondary: "#f9a01b" },
  WAS: { primary: "#0c2340", secondary: "#e31837" },
};

const getTeamTheme = (teamAbbr: string) =>
  TEAM_THEMES[teamAbbr] || { primary: "#1d428a", secondary: "#c9082a" };

const getRoleLabel = (rank: number): string => {
  if (rank === 1) return "Primary Franchise Engine";
  if (rank === 2) return "Secondary Franchise Engine";
  if (rank <= 3) return "Core Contributor";
  if (rank <= 5) return "Primary Contributor";
  if (rank <= 8) return "Rotation Player";
  return "Bench Contributor";
};

const getCompositionRole = (rank: number): string => {
  if (rank === 1) return "Primary Engine";
  if (rank === 2) return "Secondary Engine";
  if (rank === 3) return "Third Option";
  if (rank <= 5) return "Contributor";
  return "Rotation";
};

const generatePlayerNarrative = (
  playerName: string,
  rank: number,
  score: number,
  pts: number,
  min: number,
  team: string
): string => {
  const firstName = playerName.split(" ")[0];
  if (rank === 1) {
    return `${firstName} leads ${team} as the primary franchise engine with an importance rating of ${score.toFixed(1)}, driven by elite scoring volume (${pts.toFixed(1)} PPG), heavy minute load (${min.toFixed(0)} MPG), and high team dependence across all offensive sets.`;
  }
  if (rank === 2) {
    return `${firstName} operates as the secondary engine on ${team}, providing reliable production at ${pts.toFixed(1)} PPG across ${min.toFixed(0)} MPG. The model weights consistent workload and roster positioning in the importance calculation.`;
  }
  if (rank <= 3) {
    return `${firstName} ranks third on ${team}'s core hierarchy, contributing ${pts.toFixed(1)} PPG. Score reflects rotation stability and consistent on-court presence rather than raw counting stats.`;
  }
  if (rank <= 5) {
    return `${firstName} is a primary contributor on ${team}'s roster, logging ${min.toFixed(0)} MPG and providing ${pts.toFixed(1)} PPG. Importance score reflects role consistency and positive impact in the team's rotation structure.`;
  }
  return `${firstName} contributes to ${team}'s rotation with ${pts.toFixed(1)} PPG across ${min.toFixed(0)} MPG. Score reflects depth value and situational deployment patterns in the model.`;
};

const CorePlayers: React.FC<CorePlayersProps> = ({ corePlayers, rosters }) => {
  const [selectedTeam, setSelectedTeam] = useState<string>("BOS");
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [teamSearchQuery, setTeamSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<"score" | "name">("score");
  const [viewMode, setViewMode] = useState<"franchise" | "league">("franchise");

  const activeTeamTheme = useMemo(() => getTeamTheme(selectedTeam), [selectedTeam]);

  const teamsList = useMemo(() => {
    const teams = new Set(corePlayers.map((p) => p.TEAM_ABBREVIATION));
    return Array.from(teams).sort();
  }, [corePlayers]);

  const filteredPlayers = useMemo(() =>
    corePlayers
      .filter((p) => p.TEAM_ABBREVIATION === selectedTeam)
      .sort((a, b) => a.CORE_RANK - b.CORE_RANK),
    [corePlayers, selectedTeam]
  );

  const playersWithStats = useMemo(() =>
    filteredPlayers.map((player) => {
      const rosterInfo = rosters.find(
        (r) => r.PLAYER_ID === player.PLAYER_ID && r.TEAM_ABBREVIATION === selectedTeam
      );
      return {
        ...player,
        GP: rosterInfo?.GP ?? 0,
        AVG_MIN: rosterInfo?.AVG_MIN ?? 0,
        AVG_PTS: rosterInfo?.AVG_PTS ?? 0,
        AVG_REB: rosterInfo?.AVG_REB ?? 0,
        AVG_AST: rosterInfo?.AVG_AST ?? 0,
      };
    }),
    [filteredPlayers, rosters, selectedTeam]
  );

  useEffect(() => {
    if (playersWithStats.length > 0) {
      setSelectedPlayerId(playersWithStats[0].PLAYER_ID);
    } else {
      setSelectedPlayerId(null);
    }
  }, [selectedTeam, playersWithStats]);

  const activePlayer = useMemo(() =>
    selectedPlayerId
      ? playersWithStats.find((p) => p.PLAYER_ID === selectedPlayerId) || playersWithStats[0] || null
      : playersWithStats[0] || null,
    [playersWithStats, selectedPlayerId]
  );

  const teamMetrics = useMemo(() => {
    const teamsData: {
      [key: string]: { team: string; avgCoreScore: number; players: PlayerCore[] };
    } = {};

    corePlayers.forEach((player) => {
      const team = player.TEAM_ABBREVIATION;
      if (!teamsData[team]) {
        teamsData[team] = { team, avgCoreScore: 0, players: [] };
      }
      teamsData[team].players.push(player);
    });

    Object.keys(teamsData).forEach((team) => {
      teamsData[team].players.sort((a, b) => a.CORE_RANK - b.CORE_RANK);
      const top3 = teamsData[team].players.slice(0, 3);
      const sum = top3.reduce((acc, p) => acc + p.IMPORTANCE_SCORE, 0);
      teamsData[team].avgCoreScore = top3.length > 0 ? sum / top3.length : 0;
    });

    return Object.values(teamsData);
  }, [corePlayers]);

  const filteredTeamMetrics = useMemo(() => {
    const result = teamMetrics.filter(
      (t) =>
        t.team.toLowerCase().includes(teamSearchQuery.toLowerCase()) ||
        t.players.some((p) => p.PLAYER_NAME.toLowerCase().includes(teamSearchQuery.toLowerCase()))
    );
    if (sortBy === "score") return result.sort((a, b) => b.avgCoreScore - a.avgCoreScore);
    return result.sort((a, b) => a.team.localeCompare(b.team));
  }, [teamMetrics, teamSearchQuery, sortBy]);

  const leagueAvg = useMemo(() => {
    if (teamMetrics.length === 0) return 0;
    return teamMetrics.reduce((sum, t) => sum + t.avgCoreScore, 0) / teamMetrics.length;
  }, [teamMetrics]);

  const topTeams = useMemo(() =>
    [...teamMetrics].sort((a, b) => b.avgCoreScore - a.avgCoreScore).slice(0, 10),
    [teamMetrics]
  );

  const leagueTopPlayers = useMemo(() =>
    [...corePlayers].sort((a, b) => b.IMPORTANCE_SCORE - a.IMPORTANCE_SCORE).slice(0, 15),
    [corePlayers]
  );

  const statsSummary = useMemo(() => {
    if (corePlayers.length === 0) return { total: 0, avgImportance: 0, topPlayer: null };
    const sorted = [...corePlayers].sort((a, b) => b.IMPORTANCE_SCORE - a.IMPORTANCE_SCORE);
    const avg = corePlayers.reduce((acc, p) => acc + p.IMPORTANCE_SCORE, 0) / corePlayers.length;
    return { total: corePlayers.length, avgImportance: avg, topPlayer: sorted[0] };
  }, [corePlayers]);

  const selectedTeamRank = useMemo(() => {
    const sorted = [...teamMetrics].sort((a, b) => b.avgCoreScore - a.avgCoreScore);
    const idx = sorted.findIndex((t) => t.team === selectedTeam);
    return idx >= 0 ? idx + 1 : null;
  }, [teamMetrics, selectedTeam]);



  const handleTeamSelect = (team: string) => {
    setSelectedTeam(team);
    const element = document.getElementById("franchise-section");
    if (element) element.scrollIntoView({ behavior: "smooth" });
  };

  // Shared tab button style
  const tabBtn = (active: boolean) =>
    `flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-150 ${
      active
        ? "bg-slate-900 text-white shadow-sm"
        : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
    }`;

  return (
    <div className="space-y-6 animate-fade-in-up">

      {/* ─── Header ─── */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
              <Activity size={12} />
              ML-Powered Roster Intelligence
            </div>
            <h1
              className="text-3xl font-bold text-slate-900 tracking-tight leading-none"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              Franchise Core Intelligence
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed max-w-xl">
              Machine learning importance scores map each player's role within their franchise structure. Scores are derived from minutes share, statistical contribution, and roster dependency.
            </p>
          </div>

          {/* KPI Strip */}
          <div className="flex flex-wrap gap-3 lg:self-start">
            <div className="flex flex-col px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl min-w-[110px]">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Players Analyzed</span>
              <span className="text-xl font-bold text-slate-900 mt-0.5">{statsSummary.total}</span>
            </div>
            <div className="flex flex-col px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl min-w-[110px]">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Avg Importance</span>
              <span className="text-xl font-bold text-slate-900 mt-0.5">{statsSummary.avgImportance.toFixed(1)}</span>
            </div>
            {statsSummary.topPlayer && (
              <div className="flex flex-col px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">League Leader</span>
                <span className="text-sm font-bold text-slate-900 mt-0.5">{statsSummary.topPlayer.PLAYER_NAME}</span>
                <span className="text-[10px] text-slate-400 font-mono">{statsSummary.topPlayer.TEAM_ABBREVIATION} &middot; {statsSummary.topPlayer.IMPORTANCE_SCORE.toFixed(1)}</span>
              </div>
            )}
          </div>
        </div>

        {/* View Toggle + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-5 pt-4 border-t border-slate-100">
          <div className="flex gap-1.5">
            <button onClick={() => setViewMode("franchise")} className={tabBtn(viewMode === "franchise")}>
              <Layers size={13} />
              Franchise Analysis
            </button>
            <button onClick={() => setViewMode("league")} className={tabBtn(viewMode === "league")}>
              <BarChart3 size={13} />
              League Leaders
            </button>
          </div>
          {viewMode === "franchise" && (
            <div className="flex items-center gap-2">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search team or player..."
                  value={teamSearchQuery}
                  onChange={(e) => setTeamSearchQuery(e.target.value)}
                  className="w-52 bg-white border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 font-medium shadow-sm"
                />
                <Search className="absolute left-2.5 top-2 text-slate-400" size={12} />
              </div>
              <div className="flex border border-slate-200 bg-white rounded-lg p-0.5 shadow-sm">
                <button
                  onClick={() => setSortBy("score")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${sortBy === "score" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"}`}
                >
                  <SlidersHorizontal size={10} />
                  Strength
                </button>
                <button
                  onClick={() => setSortBy("name")}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${sortBy === "name" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"}`}
                >
                  A–Z
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── View: Franchise Analysis ─── */}
      {viewMode === "franchise" && (
        <div id="franchise-section" className="space-y-6">

          {/* ── Top 10 Core Rankings Leaderboard ── */}
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Top Core Rankings</h2>
                <p className="text-xs text-slate-400 mt-0.5">Ranked by average top-3 core importance score</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                <TrendingUp size={12} />
                League avg: {leagueAvg.toFixed(1)}
              </div>
            </div>
            <div className="divide-y divide-slate-50">
              {topTeams.map((item, idx) => {
                const theme = getTeamTheme(item.team);
                const diff = item.avgCoreScore - leagueAvg;
                const isSelected = item.team === selectedTeam;
                return (
                  <button
                    key={item.team}
                    onClick={() => handleTeamSelect(item.team)}
                    className={`w-full flex items-center gap-4 px-6 py-3 text-left transition-colors hover:bg-slate-50 ${isSelected ? "bg-slate-50" : ""}`}
                  >
                    <span className="text-[11px] font-mono font-bold text-slate-300 w-5 text-right shrink-0">
                      #{idx + 1}
                    </span>
                    <span
                      className="text-xs font-bold w-8 shrink-0"
                      style={{ color: theme.primary }}
                    >
                      {item.team}
                    </span>
                    {/* Score bar */}
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(item.avgCoreScore / 100) * 100}%`,
                          backgroundColor: theme.primary,
                          opacity: 0.7,
                        }}
                      />
                    </div>
                    <span className="text-sm font-bold text-slate-800 font-mono w-10 text-right shrink-0">
                      {item.avgCoreScore.toFixed(1)}
                    </span>
                    <span
                      className={`text-[10px] font-semibold font-mono w-14 text-right shrink-0 ${diff >= 0 ? "text-emerald-600" : "text-rose-500"}`}
                    >
                      {diff >= 0 ? "+" : ""}{diff.toFixed(1)} avg
                    </span>
                    {isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-900 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── Franchise Structure + Player Intelligence ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Left: Franchise Structure */}
            <div className="lg:col-span-6 space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                {/* Panel header */}
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-bold"
                        style={{ color: activeTeamTheme.primary }}
                      >
                        {selectedTeam}
                      </span>
                      {selectedTeamRank && (
                        <span className="text-[10px] font-mono text-slate-400">
                          #{selectedTeamRank} league
                        </span>
                      )}
                    </div>
                    <h2 className="text-base font-semibold text-slate-900 mt-0.5">Franchise Structure</h2>
                  </div>
                  <div className="relative">
                    <select
                      value={selectedTeam}
                      onChange={(e) => setSelectedTeam(e.target.value)}
                      className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 rounded-lg pl-3 pr-8 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-slate-300 cursor-pointer"
                    >
                      {teamsList.map((team) => (
                        <option key={team} value={team}>{team}</option>
                      ))}
                    </select>
                    <ChevronDown size={11} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                <div className="px-5 py-4 space-y-5">
                  {/* Core Players (Ranks 1-3) */}
                  {playersWithStats.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: activeTeamTheme.primary }}
                        >
                          Core Players
                        </span>
                        <div className="flex-1 h-px bg-slate-100" />
                        <span className="text-[9px] text-slate-300 font-mono">Importance</span>
                      </div>
                      <div className="space-y-1.5">
                        {playersWithStats.slice(0, 3).map((player) => {
                          const isSelected = selectedPlayerId === player.PLAYER_ID;
                          return (
                            <button
                              key={player.PLAYER_ID}
                              onClick={() => setSelectedPlayerId(player.PLAYER_ID)}
                              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all duration-150 ${
                                isSelected
                                  ? "border-slate-300 bg-slate-50 shadow-sm"
                                  : "border-transparent hover:border-slate-200 hover:bg-slate-50/50"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-mono font-semibold text-slate-300 w-4 shrink-0">
                                  {player.CORE_RANK}
                                </span>
                                <PlayerPhoto playerId={player.PLAYER_ID} name={player.PLAYER_NAME} size={36} />
                                <div>
                                  <p className="text-sm font-semibold text-slate-800 leading-none">
                                    {player.PLAYER_NAME}
                                  </p>
                                  <p className="text-[10px] text-slate-400 mt-0.5">
                                    {player.AVG_PTS.toFixed(1)} pts &middot; {player.AVG_MIN.toFixed(0)} min &middot; {player.GP}g
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold font-mono text-slate-700">
                                  {player.IMPORTANCE_SCORE.toFixed(1)}
                                </span>
                                <ChevronRight size={12} className={`transition-colors ${isSelected ? "text-slate-500" : "text-slate-200"}`} />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Primary Contributors (Ranks 4-5) */}
                  {playersWithStats.length > 3 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Primary Contributors
                        </span>
                        <div className="flex-1 h-px bg-slate-100" />
                      </div>
                      <div className="space-y-1.5">
                        {playersWithStats.slice(3, 5).map((player) => {
                          const isSelected = selectedPlayerId === player.PLAYER_ID;
                          return (
                            <button
                              key={player.PLAYER_ID}
                              onClick={() => setSelectedPlayerId(player.PLAYER_ID)}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-left transition-all duration-150 ${
                                isSelected
                                  ? "border-slate-300 bg-slate-50 shadow-sm"
                                  : "border-transparent hover:border-slate-200 hover:bg-slate-50/50"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-mono font-semibold text-slate-300 w-4 shrink-0">
                                  {player.CORE_RANK}
                                </span>
                                <PlayerPhoto playerId={player.PLAYER_ID} name={player.PLAYER_NAME} size={30} />
                                <div>
                                  <p className="text-sm font-semibold text-slate-700 leading-none">
                                    {player.PLAYER_NAME}
                                  </p>
                                  <p className="text-[10px] text-slate-400 mt-0.5">
                                    {player.AVG_PTS.toFixed(1)} pts &middot; {player.GP}g
                                  </p>
                                </div>
                              </div>
                              <span className="text-sm font-bold font-mono text-slate-600">
                                {player.IMPORTANCE_SCORE.toFixed(1)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Rotation Depth (Ranks 6+) */}
                  {playersWithStats.length > 5 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                          Rotation Depth
                        </span>
                        <div className="flex-1 h-px bg-slate-100" />
                      </div>
                      <div className="space-y-1 max-h-44 overflow-y-auto pr-0.5">
                        {playersWithStats.slice(5).map((player) => {
                          const isSelected = selectedPlayerId === player.PLAYER_ID;
                          return (
                            <button
                              key={player.PLAYER_ID}
                              onClick={() => setSelectedPlayerId(player.PLAYER_ID)}
                              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-left transition-all duration-150 ${
                                isSelected
                                  ? "bg-slate-100 text-slate-800"
                                  : "hover:bg-slate-50 text-slate-500"
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="text-[9px] font-mono text-slate-300 w-4">
                                  {player.CORE_RANK}
                                </span>
                                <p className="text-xs font-medium leading-none">
                                  {player.PLAYER_NAME}
                                </p>
                              </div>
                              <span className="text-xs font-mono font-semibold text-slate-400">
                                {player.IMPORTANCE_SCORE.toFixed(1)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Player Intelligence Profile */}
            <div className="lg:col-span-6">
              {activePlayer ? (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden h-full flex flex-col">
                  {/* Profile header */}
                  <div
                    className="px-5 py-4 border-b border-slate-100"
                    style={{ borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: activeTeamTheme.primary }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <PlayerPhoto playerId={activePlayer.PLAYER_ID} name={activePlayer.PLAYER_NAME} size={52} className="shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            {selectedTeam} &middot; Franchise Rank #{activePlayer.CORE_RANK}
                          </span>
                          <h3 className="text-xl font-bold text-slate-900 leading-tight mt-0.5">
                            {activePlayer.PLAYER_NAME}
                          </h3>
                          <span
                            className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded mt-1"
                            style={{
                              backgroundColor: `${activeTeamTheme.primary}12`,
                              color: activeTeamTheme.primary,
                            }}
                          >
                            {getRoleLabel(activePlayer.CORE_RANK)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Importance</p>
                        <p className="text-2xl font-bold font-mono text-slate-900 leading-none mt-0.5">
                          {activePlayer.IMPORTANCE_SCORE.toFixed(1)}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          / 100 scale
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="px-5 py-4 space-y-5 flex-1">
                    {/* Stats row */}
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: "PTS", value: activePlayer.AVG_PTS.toFixed(1) },
                        { label: "REB", value: activePlayer.AVG_REB.toFixed(1) },
                        { label: "AST", value: activePlayer.AVG_AST.toFixed(1) },
                        { label: "MIN", value: activePlayer.AVG_MIN.toFixed(0) },
                      ].map((stat) => (
                        <div
                          key={stat.label}
                          className="flex flex-col items-center justify-center py-2.5 bg-slate-50 rounded-xl border border-slate-100"
                        >
                          <span className="text-xs font-mono font-bold text-slate-800">
                            {stat.value}
                          </span>
                          <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
                            {stat.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Secondary metrics */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <Clock size={12} />
                        <span>{activePlayer.GP} games played</span>
                      </div>
                      <div className="font-mono text-slate-400 text-[10px]">
                        ID: {activePlayer.PLAYER_ID}
                      </div>
                    </div>

                    {/* Importance score bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
                        <span>Importance Score</span>
                        <span className="font-mono">{activePlayer.IMPORTANCE_SCORE.toFixed(1)} / 100</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${activePlayer.IMPORTANCE_SCORE}%`,
                            backgroundColor: activeTeamTheme.primary,
                          }}
                        />
                      </div>
                    </div>

                    {/* Narrative: Why This Player Matters */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        <Info size={10} />
                        Why This Player Matters
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {generatePlayerNarrative(
                          activePlayer.PLAYER_NAME,
                          activePlayer.CORE_RANK,
                          activePlayer.IMPORTANCE_SCORE,
                          activePlayer.AVG_PTS,
                          activePlayer.AVG_MIN,
                          selectedTeam
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Model updated from latest rosters</span>
                    <span className="font-semibold" style={{ color: activeTeamTheme.primary }}>
                      {selectedTeam} Intelligence
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
                  <User size={28} className="text-slate-200" />
                  <p className="text-sm font-semibold text-slate-500">Select a player to view their intelligence profile</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Core Composition Analysis ── */}
          {playersWithStats.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-900">Core Composition</h2>
                <p className="text-xs text-slate-400 mt-0.5">{selectedTeam} roster role distribution based on importance ranking</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 divide-x divide-y divide-slate-100">
                {playersWithStats.slice(0, 5).map((player) => (
                  <button
                    key={player.PLAYER_ID}
                    onClick={() => setSelectedPlayerId(player.PLAYER_ID)}
                    className="flex flex-col gap-1 p-4 text-left hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
                      {getCompositionRole(player.CORE_RANK)}
                    </span>
                    <span className="text-sm font-semibold text-slate-800 leading-tight">
                      {player.PLAYER_NAME}
                    </span>
                    <span className="text-xs font-mono text-slate-500">{player.IMPORTANCE_SCORE.toFixed(1)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── League Matrix ── */}
          <section className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">League Matrix</h2>
              <p className="text-xs text-slate-400 mt-0.5">All franchises ranked by core strength. Click any card to analyze.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredTeamMetrics.map((item) => {
                const theme = getTeamTheme(item.team);
                const isSelected = selectedTeam === item.team;
                const allSorted = [...teamMetrics].sort((a, b) => b.avgCoreScore - a.avgCoreScore);
                const leagueRank = allSorted.findIndex((t) => t.team === item.team) + 1;
                const diff = item.avgCoreScore - leagueAvg;
                return (
                  <button
                    key={item.team}
                    onClick={() => handleTeamSelect(item.team)}
                    className={`bg-white border rounded-xl p-4 text-left transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 space-y-3 ${
                      isSelected ? "border-slate-400 shadow-sm" : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-base font-bold" style={{ color: theme.primary }}>
                            {item.team}
                          </span>
                          <span className="text-[10px] font-mono text-slate-300">#{leagueRank}</span>
                        </div>
                        <span className={`text-[10px] font-semibold font-mono ${diff >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                          {diff >= 0 ? "+" : ""}{diff.toFixed(1)} vs avg
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Core Power</p>
                        <p className="text-lg font-bold font-mono text-slate-800 leading-none mt-0.5">
                          {item.avgCoreScore.toFixed(1)}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      {item.players.slice(0, 3).map((p) => (
                        <div key={p.PLAYER_ID} className="flex items-center justify-between text-xs">
                          <span className="text-slate-600 font-medium truncate max-w-[130px]">
                            {p.PLAYER_NAME}
                          </span>
                          <span className="text-slate-400 font-mono text-[10px] shrink-0">
                            {p.IMPORTANCE_SCORE.toFixed(0)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-50 text-[9px] text-slate-300 font-semibold uppercase tracking-wider">
                      <span>{item.players.length} players</span>
                      <span className="flex items-center gap-0.5" style={{ color: theme.primary }}>
                        Analyze <ArrowUpRight size={9} />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {filteredTeamMetrics.length === 0 && (
              <div className="text-center py-10 bg-white border border-slate-200 rounded-xl">
                <Search size={24} className="text-slate-200 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-500">No teams match your search</p>
                <p className="text-xs text-slate-400 mt-1">Try a different team abbreviation or player name</p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ─── View: League Leaders ─── */}
      {viewMode === "league" && (
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <TrendingUp size={16} className="text-slate-400" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">Top 15 NBA Core Leaders</h2>
              <p className="text-xs text-slate-400 mt-0.5">League-wide ranking by ML importance score</p>
            </div>
          </div>
          <div className="p-6">
            <div className="h-[30rem] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={leagueTopPlayers}
                  margin={{ top: 4, right: 60, left: 10, bottom: 4 }}
                  barSize={10}
                >
                  <CartesianGrid strokeDasharray="2 4" stroke="#f1f5f9" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="#cbd5e1"
                    fontSize={10}
                    domain={[0, 100]}
                    tick={{ fill: "#94a3b8", fontFamily: "Inter" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="PLAYER_NAME"
                    stroke="#e2e8f0"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={150}
                    tick={{ fill: "#475569", fontFamily: "Inter", fontWeight: 500 }}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(241,245,249,0.6)" }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as PlayerCore;
                        return (
                          <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                              <span
                                className="text-xs font-bold px-1.5 py-0.5 rounded"
                                style={{
                                  backgroundColor: `${getTeamTheme(data.TEAM_ABBREVIATION).primary}15`,
                                  color: getTeamTheme(data.TEAM_ABBREVIATION).primary,
                                }}
                              >
                                {data.TEAM_ABBREVIATION}
                              </span>
                              <span className="font-semibold text-slate-800">{data.PLAYER_NAME}</span>
                            </div>
                            <div className="flex justify-between gap-6 text-xs text-slate-500">
                              <span>Importance</span>
                              <span className="font-mono font-bold text-slate-800">{data.IMPORTANCE_SCORE.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-6 text-xs text-slate-500">
                              <span>Franchise Rank</span>
                              <span className="font-mono text-slate-700">#{data.CORE_RANK}</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="IMPORTANCE_SCORE" name="Importance Score" radius={[0, 4, 4, 0]}>
                    {leagueTopPlayers.map((entry, index) => {
                      const theme = getTeamTheme(entry.TEAM_ABBREVIATION);
                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={theme.primary}
                          opacity={index < 3 ? 1 : 0.65}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-[10px] text-slate-400">
              <Info size={10} />
              <span>Bar colors reflect each team's primary color. Top 3 rendered at full opacity to denote league leadership.</span>
            </div>
          </div>
        </section>
      )}

    </div>
  );
};

export default CorePlayers;
