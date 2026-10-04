import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  Sparkles,
  RefreshCw,
  Activity,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from "lucide-react";

import TeamLogo from "./TeamLogo";
import {
  getModelStatus,
  normalizeGameFullPrediction,
  predictGameFull,
  getRostersPreview,
  type PlayerStatusOverride,
} from "../api/predictions";
import { loadPrivateApi } from "../lib/dataCache";
import { NBA_TEAMS } from "../lib/nbaTeams";
import { CURRENT_SEASON, MIN_PREDICTION_DATE } from "../lib/constants";

import {
  MatchupHeroCard,
  MatchupTacticalHub,
  ModelDiagnostics,
  ModelExplanationSection,
  PlayerSpotlight,
  LineupInjuryHub,
} from "./prediction";


// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface NbaPredictionProps {
  initialGame?: {
    home: string;
    away: string;
    date: string;
  } | null;
  onClearInitialGame?: () => void;
}

export default function NbaPrediction({ initialGame, onClearInitialGame }: NbaPredictionProps = {}) {
  const [home, setHome] = useState(initialGame?.home || "");
  const [away, setAway] = useState(initialGame?.away || "");
  const [date, setDate] = useState(initialGame?.date || "");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  interface SeasonWeek {
    week_number: number;
    start_date: string;
    end_date: string;
    label: string;
    game_count: number;
  }

  const [weeks, setWeeks] = useState<SeasonWeek[]>([]);
  const [selectedWeekNum, setSelectedWeekNum] = useState<number>(1);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [upcomingGames, setUpcomingGames] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [mode, setMode] = useState<"scheduled" | "custom">("scheduled");
  const [filterTeam1, setFilterTeam1] = useState("");
  const [filterTeam2, setFilterTeam2] = useState("");
  const [modelStatus, setModelStatus] = useState<any>(null);
  const [selectorOpen, setSelectorOpen] = useState(!initialGame);

  const [playerOverrides, setPlayerOverrides] = useState<Record<string, PlayerStatusOverride>>({});
  const [previewRosters, setPreviewRosters] = useState<{
    home_players?: any[];
    away_players?: any[];
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    const fetchWeeks = async () => {
      try {
        setLoadingData(true);
        setDataError(null);
        let weekList: SeasonWeek[] = [];
        try {
          weekList = await loadPrivateApi<SeasonWeek[]>(`/frontend-data-api/weeks?season=${encodeURIComponent(CURRENT_SEASON)}`);
        } catch {
          weekList = [];
        }

        if (!weekList || weekList.length === 0) {
          const startDt = new Date("2026-09-28");
          const fallbackWeeks: SeasonWeek[] = [];
          for (let i = 1; i <= 28; i++) {
            const wStart = new Date(startDt.getTime() + (i - 1) * 7 * 86400000);
            const wEnd = new Date(wStart.getTime() + 6 * 86400000);
            const sStr = wStart.toISOString().slice(0, 10);
            const eStr = wEnd.toISOString().slice(0, 10);
            fallbackWeeks.push({
              week_number: i,
              start_date: sStr,
              end_date: eStr,
              label: `Week ${i} (${sStr.slice(5)} to ${eStr.slice(5)})`,
              game_count: 45,
            });
          }
          weekList = fallbackWeeks;
        }

        setWeeks(weekList);

        let targetWeek = 1;
        const todayStr = new Date().toISOString().slice(0, 10);
        if (initialGame?.date) {
          const match = weekList.find((w) => initialGame.date >= w.start_date && initialGame.date <= w.end_date);
          if (match) targetWeek = match.week_number;
        } else {
          const upcoming = weekList.find((w) => w.end_date >= todayStr);
          if (upcoming) targetWeek = upcoming.week_number;
        }
        setSelectedWeekNum(targetWeek);
      } catch (err: any) {
        console.error("Error loading schedule weeks:", err);
        setDataError("Failed to initialize schedule weeks.");
      } finally {
        setLoadingData(false);
      }
    };
    fetchWeeks();
  }, [initialGame?.date]);

  useEffect(() => {
    if (!weeks.length) return;
    const currentWeek = weeks.find((w) => w.week_number === selectedWeekNum) || weeks[0];
    if (!currentWeek) return;

    let isMounted = true;
    const fetchWeekGames = async () => {
      setLoadingWeek(true);
      try {
        const data = await loadPrivateApi<any[]>(
          `/frontend-data-api/games?season=${encodeURIComponent(CURRENT_SEASON)}&start_date=${encodeURIComponent(currentWeek.start_date)}&end_date=${encodeURIComponent(currentWeek.end_date)}`
        );
        if (!isMounted) return;

        const isCompletedGame = (g: any) => {
          const homeScore = Number(g.HOME_SCORE);
          const awayScore = Number(g.AWAY_SCORE);
          return !isNaN(homeScore) && !isNaN(awayScore) && (homeScore > 0 || awayScore > 0);
        };

        const uniqueMap = new Map();
        (data || []).forEach((g: any) => {
          if (g.GAME_ID && !uniqueMap.has(g.GAME_ID)) {
            uniqueMap.set(g.GAME_ID, g);
          }
        });
        const unplayed = Array.from(uniqueMap.values())
          .filter((g: any) => !isCompletedGame(g))
          .sort((a: any, b: any) => a.GAME_DATE.localeCompare(b.GAME_DATE));

        setUpcomingGames(unplayed);
      } catch (err) {
        console.error("Failed to load week games:", err);
      } finally {
        if (isMounted) setLoadingWeek(false);
      }
    };

    fetchWeekGames();
    return () => {
      isMounted = false;
    };
  }, [selectedWeekNum, weeks]);

  // Load preview rosters whenever home, away, date are chosen
  useEffect(() => {
    if (!home || !away || !date || home === away) {
      setPreviewRosters(null);
      return;
    }
    let isMounted = true;
    const fetchPreview = async () => {
      setLoadingPreview(true);
      try {
        const preview = await getRostersPreview(home, away, date);
        if (isMounted) {
          setPreviewRosters(preview);
        }
      } catch (err) {
        console.warn("Could not load preview rosters:", err);
      } finally {
        if (isMounted) setLoadingPreview(false);
      }
    };
    fetchPreview();
    return () => {
      isMounted = false;
    };
  }, [home, away, date]);

  const submitGame = useCallback(
    async (
      h: string,
      a: string,
      d: string,
      overridesMap: Record<string, PlayerStatusOverride> = playerOverrides
    ) => {
      setError(null);
      setLoading(true);
      try {
        if (!h || !a) throw new Error("Please select both a home and away team.");
        if (h === a) throw new Error("Home and away teams cannot be the same.");
        if (!d) throw new Error("Please select a date for the matchup.");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("Invalid date format. Please use YYYY-MM-DD.");
        if (d < MIN_PREDICTION_DATE) {
          throw new Error(`Predictions are only enabled for unplayed upcoming games (${CURRENT_SEASON} season and onward). Past completed games cannot be predicted.`);
        }

        const overridesList = Object.values(overridesMap);
        const data = await predictGameFull({
          home_team_id: h,
          away_team_id: a,
          prediction_date: d,
          player_status_overrides: overridesList.length > 0 ? overridesList : undefined,
        });
        const normalized = normalizeGameFullPrediction(data, h, a, d);
        setResult(normalized);
        setSelectorOpen(false);
      } catch (e: any) {
        setError(e.message || "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [playerOverrides]
  );

  const handleOverrideChange = (key: string, override: PlayerStatusOverride) => {
    setPlayerOverrides((prev) => {
      const next = { ...prev };
      if (override.status === "ACTIVE") {
        delete next[key];
      } else {
        next[key] = override;
      }
      return next;
    });
  };

  const handleResetOverrides = () => {
    setPlayerOverrides({});
    if (result) {
      submitGame(home, away, date, {});
    }
  };

  const handleApplyOverrides = () => {
    submitGame(home, away, date, playerOverrides);
  };

  useEffect(() => {
    if (initialGame?.home && initialGame?.away && initialGame?.date) {
      setHome(initialGame.home);
      setAway(initialGame.away);
      setDate(initialGame.date);
      setPlayerOverrides({});
      setResult(null);
      setError(null);
      setSelectorOpen(true);
      if (weeks.length > 0) {
        const found = weeks.find((w) => initialGame.date >= w.start_date && initialGame.date <= w.end_date);
        if (found) {
          setSelectedWeekNum(found.week_number);
        }
      }
      onClearInitialGame?.();
    }
  }, [initialGame, onClearInitialGame, weeks]);

  useEffect(() => {
    const fetchModelStatus = async () => {
      try {
        setModelStatus(await getModelStatus());
      } catch (err) {
        console.error("Error loading model status:", err);
      }
    };
    fetchModelStatus();
  }, []);

  const getTeamInfo = (abbr: string) =>
    NBA_TEAMS.find((t) => t.abbr === abbr) || { abbr, name: abbr, color: "#475569" };

  const teamAbbr = (abbr: string) => abbr?.toUpperCase?.() || "";

  const handleSelectGame = (game: any) => {
    setHome(game.HOME_TEAM_ABBREVIATION);
    setAway(game.AWAY_TEAM_ABBREVIATION);
    setDate(game.GAME_DATE);
    setPlayerOverrides({});
    setResult(null);
    setError(null);
    setSelectorOpen(true);
  };

  const submit = useCallback(() => {
    return submitGame(home, away, date, playerOverrides);
  }, [submitGame, home, away, date, playerOverrides]);

  const filteredSchedule = upcomingGames.filter((g: any) => {
    if (!filterTeam1) return true;
    if (filterTeam1 && !filterTeam2) {
      return (
        g.HOME_TEAM_ABBREVIATION?.toUpperCase() === filterTeam1.toUpperCase() ||
        g.AWAY_TEAM_ABBREVIATION?.toUpperCase() === filterTeam1.toUpperCase()
      );
    }
    return (
      (g.HOME_TEAM_ABBREVIATION?.toUpperCase() === filterTeam1.toUpperCase() &&
        g.AWAY_TEAM_ABBREVIATION?.toUpperCase() === filterTeam2.toUpperCase()) ||
      (g.HOME_TEAM_ABBREVIATION?.toUpperCase() === filterTeam2.toUpperCase() &&
        g.AWAY_TEAM_ABBREVIATION?.toUpperCase() === filterTeam1.toUpperCase())
    );
  });

  const homeInfo = getTeamInfo(home);
  const awayInfo = getTeamInfo(away);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const winnerAbbr = result?.win_probability?.predicted_winner || result?.predicted_winner;
  const winnerInfo = winnerAbbr ? getTeamInfo(winnerAbbr) : null;

  if (loadingData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <RefreshCw size={28} className="animate-spin text-indigo-600" />
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Loading prediction engine...</span>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-5">

      {/* ── Data error notice ── */}
      {dataError && (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 text-amber-800 border border-amber-200/80 p-4 shadow-xs">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs font-semibold m-0">{dataError}</p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 1 — COMPACT SELECTION PANEL
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="surface rounded-[1.5rem] overflow-hidden">
        <div
          id="selector-toggle"
          onClick={() => setSelectorOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Calendar size={15} className="text-slate-500" />
            <div className="text-left">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                Game Selection
              </p>
              {home && away && date ? (
                <p className="text-sm font-black text-slate-800 mt-0.5">
                  {homeInfo.name} vs {awayInfo.name} · {formatDate(date)}
                </p>
              ) : (
                <p className="text-sm font-black text-slate-400 mt-0.5">No game selected</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {home && away && date && !result && !loading && (
              <button
                onClick={(e) => { e.stopPropagation(); submit(); }}
                id="run-prediction-btn"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black uppercase tracking-wider transition-colors shadow-md shadow-indigo-200"
              >
                <Sparkles size={11} />
                Run Model
              </button>
            )}
            {selectorOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
          </div>
        </div>

        {selectorOpen && (
          <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-4 animate-fade-in">
            {/* Mode tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex border border-slate-200 bg-slate-50 p-1 rounded-xl w-fit gap-1">
                {(["scheduled", "custom"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setResult(null); setError(null); }}
                    className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
                      mode === m
                        ? "bg-white text-slate-900 shadow-xs border border-slate-200/50"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {m === "scheduled" ? "Upcoming Schedule" : "Custom Matchup"}
                  </button>
                ))}
              </div>
            </div>

            {/* Scheduled mode */}
            {mode === "scheduled" && (
              <div className="space-y-4">
                {/* Week Selector Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-slate-50 p-2.5 sm:p-3 shadow-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedWeekNum((w) => Math.max(1, w - 1))}
                      disabled={selectedWeekNum <= 1 || loadingWeek}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs transition-all hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white"
                      title="Previous Week"
                    >
                      <ChevronLeft size={16} />
                    </button>

                    <select
                      value={selectedWeekNum}
                      onChange={(e) => setSelectedWeekNum(Number(e.target.value))}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-800 shadow-xs focus:border-indigo-500 focus:outline-none"
                    >
                      {weeks.map((w) => (
                        <option key={w.week_number} value={w.week_number}>
                          {w.label} ({w.game_count} games)
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => setSelectedWeekNum((w) => Math.min(weeks.length, w + 1))}
                      disabled={selectedWeekNum >= weeks.length || loadingWeek}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs transition-all hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white"
                      title="Next Week"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                    {loadingWeek ? (
                      <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-indigo-600">
                        <RefreshCw size={12} className="animate-spin" /> Fetching games...
                      </span>
                    ) : (
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        {upcomingGames.length} Matchups in Week {selectedWeekNum}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Upcoming games quick list */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Week {selectedWeekNum} Schedule
                      </p>
                      {loadingWeek && <RefreshCw size={12} className="animate-spin text-slate-400" />}
                    </div>

                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {loadingWeek ? (
                        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-8 text-center text-xs font-semibold text-slate-400">
                          <RefreshCw size={16} className="animate-spin text-indigo-500" />
                          <span>Loading week fixtures...</span>
                        </div>
                      ) : upcomingGames.length === 0 ? (
                        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-6 text-center text-xs font-semibold text-slate-400">
                          No upcoming matches found for Week {selectedWeekNum}.
                        </div>
                      ) : (
                        upcomingGames.map((g: any) => {
                          const isSelected = home === g.HOME_TEAM_ABBREVIATION && away === g.AWAY_TEAM_ABBREVIATION && date === g.GAME_DATE;
                          return (
                            <button
                              key={g.GAME_ID}
                              onClick={() => handleSelectGame(g)}
                              className={`w-full text-left p-2.5 rounded-xl border transition-all duration-200 flex items-center justify-between gap-3 ${
                                isSelected
                                  ? "bg-indigo-50/60 border-indigo-400 shadow-xs"
                                  : "bg-white border-slate-200/80 hover:border-slate-300"
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="flex items-center -space-x-1">
                                  <TeamLogo abbr={teamAbbr(g.HOME_TEAM_ABBREVIATION)} name={g.HOME_TEAM_ABBREVIATION} size={20} />
                                  <TeamLogo abbr={teamAbbr(g.AWAY_TEAM_ABBREVIATION)} name={g.AWAY_TEAM_ABBREVIATION} size={20} />
                                </div>
                                <span className="text-xs font-black text-slate-800">
                                  {g.HOME_TEAM_ABBREVIATION} vs {g.AWAY_TEAM_ABBREVIATION}
                                </span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase">{g.SEASON_TYPE}</span>
                              </div>
                              <span className="text-[10px] font-mono text-slate-400 font-bold">{g.GAME_DATE}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Filter by team */}
                  <div className="space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Filter Week by Team</p>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-xs"
                        value={filterTeam1}
                        onChange={(e) => { setFilterTeam1(e.target.value); if (!e.target.value) setFilterTeam2(""); }}
                      >
                        <option value="">Team 1</option>
                        {NBA_TEAMS.map((t) => <option key={t.abbr} value={t.abbr}>{t.abbr} — {t.name}</option>)}
                      </select>
                      <select
                        className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-xs disabled:opacity-50"
                        value={filterTeam2}
                        onChange={(e) => setFilterTeam2(e.target.value)}
                        disabled={!filterTeam1}
                      >
                        <option value="">Team 2 (optional)</option>
                        {NBA_TEAMS.map((t) => <option key={t.abbr} value={t.abbr} disabled={t.abbr === filterTeam1}>{t.abbr} — {t.name}</option>)}
                      </select>
                    </div>
                    <div className="border border-slate-200/80 rounded-xl overflow-hidden bg-white shadow-xs max-h-56 overflow-y-auto divide-y divide-slate-100">
                      {!filterTeam1 ? (
                        <div className="p-4 text-center text-xs text-slate-400 font-semibold">Select a team to filter Week {selectedWeekNum} matches</div>
                      ) : filteredSchedule.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400 font-semibold">No matchups for {filterTeam1} in Week {selectedWeekNum}</div>
                      ) : (
                        filteredSchedule.map((g: any) => {
                          const isSelected = home === g.HOME_TEAM_ABBREVIATION && away === g.AWAY_TEAM_ABBREVIATION && date === g.GAME_DATE;
                          return (
                            <button
                              key={g.GAME_ID}
                              onClick={() => handleSelectGame(g)}
                              className={`w-full text-left px-3.5 py-2 hover:bg-slate-50 transition-colors flex items-center justify-between text-xs ${isSelected ? "bg-indigo-50/30 text-indigo-900 font-bold" : "text-slate-600 font-medium"}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold">{g.HOME_TEAM_ABBREVIATION}</span>
                                <span className="text-slate-300">vs</span>
                                <span className="font-extrabold">{g.AWAY_TEAM_ABBREVIATION}</span>
                                <span className="text-[8px] uppercase font-black tracking-wider text-slate-400 px-1 py-0.5 bg-slate-50 border border-slate-150 rounded">
                                  {g.SEASON_TYPE === "NBA Finals" ? "Finals" : "Regular"}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-bold font-mono">{g.GAME_DATE}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Custom mode */}
            {mode === "custom" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Home Team</label>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-xs"
                    value={home}
                    onChange={(e) => { setHome(e.target.value); setResult(null); setError(null); }}
                  >
                    <option value="">Select Home</option>
                    {NBA_TEAMS.map((t) => <option key={t.abbr} value={t.abbr}>{t.abbr} — {t.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Away Team</label>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-xs"
                    value={away}
                    onChange={(e) => { setAway(e.target.value); setResult(null); setError(null); }}
                  >
                    <option value="">Select Away</option>
                    {NBA_TEAMS.map((t) => <option key={t.abbr} value={t.abbr} disabled={t.abbr === home}>{t.abbr} — {t.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Date</label>
                  <input
                    type="date"
                    min="2026-10-01"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-xs"
                    value={date}
                    onChange={(e) => { setDate(e.target.value); setResult(null); setError(null); }}
                  />
                </div>
              </div>
            )}

            {/* Pre-prediction Lineup & Injury Configuration */}
            {home && away && date && home !== away && (
              <div className="pt-2 border-t border-slate-100">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Sakatlık & Rotasyon Ayarları (Tahmin Öncesi / Canlı)
                  </span>
                  {Object.keys(playerOverrides).length > 0 && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                      {Object.keys(playerOverrides).length} Oyuncu Durumu Değiştirildi
                    </span>
                  )}
                </div>
                {loadingPreview && !previewRosters && !result ? (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60 text-center text-xs text-slate-400">
                    Kadro ve rotasyon bilgileri yükleniyor...
                  </div>
                ) : (
                  <LineupInjuryHub
                    homeInfo={homeInfo}
                    awayInfo={awayInfo}
                    homePlayers={result?.player_predictions?.home_players || previewRosters?.home_players || []}
                    awayPlayers={result?.player_predictions?.away_players || previewRosters?.away_players || []}
                    overrides={playerOverrides}
                    onOverrideChange={handleOverrideChange}
                    onResetOverrides={handleResetOverrides}
                    onApplyChanges={result ? handleApplyOverrides : undefined}
                    loading={loading || loadingPreview}
                  />
                )}
              </div>
            )}

            {/* CTA */}
            {home && away && date && (
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={submit}
                  disabled={loading}
                  id="run-prediction-main-btn"
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-black uppercase tracking-wider transition-colors shadow-md shadow-indigo-200"
                >
                  {loading ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {loading
                    ? "Analyzing..."
                    : Object.keys(playerOverrides).length > 0
                    ? "Run Prediction (With Lineup Changes)"
                    : "Run Prediction Model"}
                </button>
                {result && (
                  <button
                    onClick={submit}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white text-slate-600 text-[11px] font-bold uppercase tracking-wider transition-colors"
                  >
                    <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
                    Refresh
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="p-4 bg-rose-50 text-rose-700 rounded-xl border border-rose-200 text-xs font-semibold flex items-center gap-2 animate-fade-in">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="surface rounded-[1.5rem] p-12 flex flex-col items-center justify-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-indigo-100" />
            <div className="w-16 h-16 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin absolute inset-0" />
          </div>
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Analyzing matchup statistics...</p>
        </div>
      )}

      {/* Empty state */}
      {!home || !away || !date ? (
        <div className="surface rounded-[1.5rem] p-14 text-center flex flex-col items-center justify-center gap-4 min-h-[300px]">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
            <Activity size={28} className="text-slate-300 animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest">Select a Matchup</h4>
            <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
              Choose a scheduled game or build a custom matchup using the controls above to run the prediction engine.
            </p>
          </div>
        </div>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════════════
          RESULT SECTIONS — only shown when result is available
      ═══════════════════════════════════════════════════════════════════ */}
      {result && !loading && (
        <div className="space-y-5">

          {/* Partial failure warnings */}
          {(result.win_probability?.error || result.score_prediction?.error || result.score_prediction?.confidence_warning) && (
            <div className="p-4 bg-amber-50 border border-amber-200/50 rounded-2xl text-xs text-amber-800 font-semibold space-y-1.5">
              {result.win_probability?.error && (
                <p className="flex items-center gap-1.5 m-0">
                  <AlertTriangle size={13} className="text-amber-600" />
                  Win Probability Model: {result.win_probability.error}
                </p>
              )}
              {result.score_prediction?.error && (
                <p className="flex items-center gap-1.5 m-0">
                  <AlertTriangle size={13} className="text-amber-600" />
                  Score Prediction Model: {result.score_prediction.error}
                </p>
              )}
              {result.score_prediction?.confidence_warning && (
                <p className="flex items-center gap-1.5 m-0">
                  <AlertTriangle size={13} className="text-amber-600" />
                  Prediction Warning: {result.score_prediction.confidence_warning}
                </p>
              )}
            </div>
          )}

          {/* ── SECTION 2: HERO PREDICTION CARD & STADIUM HUB ── */}
          {result.win_probability && !result.win_probability.error && winnerInfo && (
            <MatchupHeroCard
              result={result}
              homeInfo={homeInfo}
              awayInfo={awayInfo}
              winnerInfo={winnerInfo}
              date={date}
              onRefresh={submit}
              isLoading={loading}
            />
          )}

          {/* ── SECTION 3: TACTICAL BLUEPRINT & GAME SCRIPT ── */}
          {result.win_probability && !result.win_probability.error && winnerInfo && (
            <MatchupTacticalHub
              result={result}
              homeInfo={homeInfo}
              awayInfo={awayInfo}
              winnerInfo={winnerInfo}
            />
          )}

          {/* ── SECTION 4: EXPLAINABLE AI MODEL INSIGHTS (XAI) ── */}
          {result.explanation && (
            <div className="animate-fade-in-up stagger-3">
              <ModelExplanationSection
                result={result}
                homeInfo={homeInfo}
                awayInfo={awayInfo}
              />
            </div>
          )}

          {/* ── SECTION 4.5: INTERACTIVE LINEUP & INJURY HUB ── */}
          {result.player_predictions && !result.player_predictions.error && (
            <div className="animate-fade-in-up stagger-4">
              <LineupInjuryHub
                homeInfo={homeInfo}
                awayInfo={awayInfo}
                homePlayers={result.player_predictions.home_players || []}
                awayPlayers={result.player_predictions.away_players || []}
                overrides={playerOverrides}
                onOverrideChange={handleOverrideChange}
                onResetOverrides={handleResetOverrides}
                onApplyChanges={handleApplyOverrides}
                loading={loading}
              />
            </div>
          )}

          {/* ── SECTION 5: PLAYER PROJECTION SPOTLIGHT & ROSTERS ── */}
          {result.player_predictions && !result.player_predictions.error && (
            <div className="surface rounded-[1.75rem] p-5 lg:p-7 border border-slate-200/80 bg-white shadow-sm animate-fade-in-up stagger-5">
              <PlayerSpotlight
                players={result.player_predictions}
                homeInfo={homeInfo}
                awayInfo={awayInfo}
                gameDate={date}
                season="2026-27"
              />
            </div>
          )}

          {/* ── SECTION 8: MODEL DIAGNOSTICS (collapsed) ── */}
          <ModelDiagnostics modelStatus={modelStatus} result={result} />

          {/* Disclaimer */}
          <div className="p-4 rounded-xl border border-slate-200/50 bg-slate-50/60 text-[10px] text-slate-400 font-medium leading-relaxed animate-fade-in-up stagger-8">
            <span className="font-black text-slate-500">Disclaimer:</span> Statistical model output — not a guaranteed result. Score predictions have high natural variance. Use win probability as your primary signal.
            {result.final_display_recommendation?.warning && (
              <span className="block mt-1 text-amber-600 font-semibold">{result.final_display_recommendation.warning}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
