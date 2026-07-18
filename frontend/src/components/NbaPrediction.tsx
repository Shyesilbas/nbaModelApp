import { useState, useEffect, useCallback } from "react";
import {
  Trophy,
  AlertTriangle,
  Cpu,
  Sparkles,
  RefreshCw,
  Activity,
  ChevronDown,
  ChevronUp,
  Zap,
  Calendar,
} from "lucide-react";
import TeamLogo from "./TeamLogo";
import { getModelStatus, normalizeGameFullPrediction, predictGameFull } from "../api/predictions";
import { loadJson, loadPrivateApi } from "../lib/dataCache";
import { NBA_TEAMS } from "../lib/nbaTeams";
import { exportPredictionAsPDF } from "../lib/predictionReport";
import {
  ModelDiagnostics,
  ModelExplanationSection,
  NarrativeBlock,
  PlayerSpotlight,
  SignalCards,
  WinProbabilityArc,
} from "./prediction";
import PredictionExplanation from "./PredictionExplanation";

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function NbaPrediction() {
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [date, setDate] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [upcomingGames, setUpcomingGames] = useState<any[]>([]);
  const [scheduleGames, setScheduleGames] = useState<any[]>([]);
  const [gameResults, setGameResults] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [mode, setMode] = useState<"scheduled" | "custom">("scheduled");
  const [filterTeam1, setFilterTeam1] = useState("");
  const [filterTeam2, setFilterTeam2] = useState("");
  const [modelStatus, setModelStatus] = useState<any>(null);
  const [selectorOpen, setSelectorOpen] = useState(true);

  const [seasonsList, setSeasonsList] = useState<string[]>(["2025-26", "2024-25", "2023-24", "2022-23"]);
  const [selectedSeason, setSelectedSeason] = useState<string>("2025-26");
  const [allResults, setAllResults] = useState<any[]>([]);

  useEffect(() => {
    loadJson<string[]>("/data/seasons.json", [])
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setSeasonsList(data);
        }
      })
      .catch(() => {});

    const fetchInitialData = async () => {
      try {
        setLoadingData(true);
        const gamesRes = await loadPrivateApi<any[]>("/frontend-data-api/games?season=2025-26").catch(() => []);
        setAllResults(gamesRes.map((g: any) => ({ ...g, SEASON: "2025-26" })));
      } catch (err: any) {
        console.error("Error loading schedule data for predictions:", err);
        setDataError("Could not load game schedules. Manual inputs are still active.");
      } finally {
        setLoadingData(false);
      }
    };
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedSeason === "2025-26") return;
    if (allResults.some((g) => g.SEASON === selectedSeason)) return;
    setLoadingData(true);
    loadPrivateApi<any[]>(`/frontend-data-api/games?season=${encodeURIComponent(selectedSeason)}`)
      .then((rows) => {
        if (rows.length > 0) {
          setAllResults((prev) => [...prev, ...rows.map((g: any) => ({ ...g, SEASON: selectedSeason }))]);
        }
      })
      .catch((err) => {
        console.error("Error loading selected season:", err);
        setDataError("Could not load selected season. Manual inputs are still active.");
      })
      .finally(() => setLoadingData(false));
  }, [selectedSeason, allResults]);

  useEffect(() => {
    if (allResults.length === 0) return;

    const seasonGames = allResults.filter((g) => g.SEASON === selectedSeason);
    const seen = new Set();
    const uniqueGames = seasonGames.filter((g: any) => {
      if (!g.GAME_ID || seen.has(g.GAME_ID)) return false;
      seen.add(g.GAME_ID);
      return true;
    });
    uniqueGames.sort((a: any, b: any) => b.GAME_DATE.localeCompare(a.GAME_DATE));

    setScheduleGames(uniqueGames);
    setUpcomingGames(uniqueGames.filter((g: any) => !(g.GAME_STATUS === "Final" || g.HOME_SCORE != null || g.AWAY_SCORE != null)));
    setGameResults(uniqueGames.filter((g: any) => g.GAME_STATUS === "Final" || g.HOME_SCORE != null || g.AWAY_SCORE != null));
  }, [selectedSeason, allResults]);

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
    setResult(null);
    setError(null);
    setSelectorOpen(false);
  };

  const submit = useCallback(async () => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      if (!home || !away) throw new Error("Please select both a home and away team.");
      if (home === away) throw new Error("Home and away teams cannot be the same.");
      if (!date) throw new Error("Please select a date for the matchup.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date format. Please use YYYY-MM-DD.");

      const data = await predictGameFull({ home_team_id: home, away_team_id: away, prediction_date: date });
      const normalized = normalizeGameFullPrediction(data, home, away, date);
      setResult(normalized);
      setSelectorOpen(false);
    } catch (e: any) {
      setError(e.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [home, away, date]);

  const filteredSchedule = scheduleGames.filter((g: any) => {
    if (!filterTeam1) return false;
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

  const actualGame =
    mode === "scheduled"
      ? gameResults.find(
          (g: any) =>
            g.HOME_TEAM_ABBREVIATION?.toUpperCase() === home.toUpperCase() &&
            g.AWAY_TEAM_ABBREVIATION?.toUpperCase() === away.toUpperCase() &&
            g.GAME_DATE === date
        )
      : null;

  const hasActualResult = actualGame && actualGame.HOME_SCORE !== null && actualGame.AWAY_SCORE !== null;
  const isPredictionCorrect =
    result &&
    hasActualResult &&
    (result.win_probability?.predicted_winner || result.predicted_winner) === actualGame.WINNER_TEAM_ABBREVIATION;

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
            {/* Mode tabs and Season Selector */}
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
                    {m === "scheduled" ? "Scheduled Games" : "Custom Matchup"}
                  </button>
                ))}
              </div>

              {mode === "scheduled" && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mr-1">Season:</span>
                  {seasonsList.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setSelectedSeason(s); setResult(null); setError(null); }}
                      className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] transition-all duration-200 ${
                        selectedSeason === s
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                          : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Scheduled mode */}
            {mode === "scheduled" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Upcoming games quick list */}
                {upcomingGames.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Upcoming Games</p>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {upcomingGames.map((g: any) => {
                        const isSelected = home === g.HOME_TEAM_ABBREVIATION && away === g.AWAY_TEAM_ABBREVIATION && date === g.GAME_DATE;
                        return (
                          <button
                            key={g.GAME_ID}
                            onClick={() => handleSelectGame(g)}
                            className={`w-full text-left p-3 rounded-xl border transition-all duration-200 flex items-center justify-between gap-3 ${
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
                      })}
                    </div>
                  </div>
                )}

                {/* Filter by team */}
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Filter by Team</p>
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
                  <div className="border border-slate-200/80 rounded-xl overflow-hidden bg-white shadow-xs max-h-44 overflow-y-auto divide-y divide-slate-100">
                    {!filterTeam1 ? (
                      <div className="p-4 text-center text-xs text-slate-400 font-semibold">Select a team to filter games</div>
                    ) : filteredSchedule.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400 font-semibold">No matchups found</div>
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
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-xs"
                    value={date}
                    onChange={(e) => { setDate(e.target.value); setResult(null); setError(null); }}
                  />
                </div>
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
                  {loading ? "Analyzing..." : "Run Prediction Model"}
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

          {/* ── SECTION 2: HERO PREDICTION CARD ── */}
          {result.win_probability && !result.win_probability.error && winnerInfo && (
            <div className="prediction-hero rounded-[2rem] overflow-hidden relative animate-scale-in">
              {/* Team color bleeds */}
              <div
                className="absolute inset-y-0 left-0 w-1/3 opacity-20 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at left center, ${awayInfo.color}, transparent 70%)` }}
              />
              <div
                className="absolute inset-y-0 right-0 w-1/3 opacity-20 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at right center, ${homeInfo.color}, transparent 70%)` }}
              />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

              <div className="relative p-6 lg:p-8">
                {/* Header row */}
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <Cpu size={12} className="text-white/30" />
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">
                      NBA Prediction Engine
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => exportPredictionAsPDF({ result, date, fallbackHome: home, fallbackAway: away })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-wider transition-all duration-200 border border-white/10 shadow-xs"
                    >
                      Export PDF
                    </button>
                    <div className="flex items-center gap-2">
                      <Calendar size={11} className="text-white/30" />
                      <span className="text-[9px] font-mono font-bold text-white/30">{formatDate(date)}</span>
                    </div>
                  </div>
                </div>

                {/* Main hero area: Away | Arc Gauge | Home */}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 lg:gap-8">
                  {/* Away team */}
                  <div className="text-center space-y-3">
                    <div className="flex justify-center">
                      <div
                        className="w-20 h-20 rounded-2xl flex items-center justify-center ring-2 ring-white/10 shadow-xl"
                        style={{ backgroundColor: `${awayInfo.color}22`, borderColor: `${awayInfo.color}44` }}
                      >
                        <TeamLogo abbr={teamAbbr(awayInfo.abbr)} name={awayInfo.name} size={56} />
                      </div>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Away</p>
                      <h2
                        className="text-xl font-black uppercase tracking-tight text-white leading-tight mt-1"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                      >
                        {awayInfo.name}
                      </h2>
                      <p className="text-3xl font-black font-mono mt-2" style={{ color: awayInfo.color }}>
                        {(result.win_probability.away_win_probability * 100).toFixed(1)}%
                      </p>
                      <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider mt-1">Win Probability</p>
                    </div>
                    {result.win_probability.predicted_winner === awayInfo.abbr && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 winner-pulse">
                        <Trophy size={11} className="text-emerald-400" />
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">Predicted Winner</span>
                      </div>
                    )}
                  </div>

                  {/* Center: Arc gauge */}
                  <div className="flex flex-col items-center gap-2">
                    <WinProbabilityArc
                      homeProb={result.win_probability.home_win_probability}
                      awayProb={result.win_probability.away_win_probability}
                      homeColor={homeInfo.color}
                      awayColor={awayInfo.color}
                      homeAbbr={homeInfo.abbr}
                      awayAbbr={awayInfo.abbr}
                      confidence={result.win_probability.confidence_bucket || ""}
                      margin={result.score_prediction?.predicted_margin ?? 0}
                      winnerAbbr={winnerInfo.abbr}
                    />
                    {/* Confidence badge */}
                    <div
                      className="px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest"
                      style={{
                        backgroundColor:
                          result.win_probability.confidence_bucket?.toUpperCase().includes("STRONG")
                            ? "rgba(16,185,129,0.15)"
                            : result.win_probability.confidence_bucket?.toUpperCase().includes("MODERATE")
                            ? "rgba(59,130,246,0.15)"
                            : "rgba(245,158,11,0.15)",
                        borderColor:
                          result.win_probability.confidence_bucket?.toUpperCase().includes("STRONG")
                            ? "rgba(16,185,129,0.3)"
                            : result.win_probability.confidence_bucket?.toUpperCase().includes("MODERATE")
                            ? "rgba(59,130,246,0.3)"
                            : "rgba(245,158,11,0.3)",
                        color:
                          result.win_probability.confidence_bucket?.toUpperCase().includes("STRONG")
                            ? "#10b981"
                            : result.win_probability.confidence_bucket?.toUpperCase().includes("MODERATE")
                            ? "#60a5fa"
                            : "#fbbf24",
                      }}
                    >
                      {result.win_probability.confidence_bucket || "MEDIUM"}
                    </div>
                  </div>

                  {/* Home team */}
                  <div className="text-center space-y-3">
                    <div className="flex justify-center">
                      <div
                        className="w-20 h-20 rounded-2xl flex items-center justify-center ring-2 ring-white/10 shadow-xl"
                        style={{ backgroundColor: `${homeInfo.color}22`, borderColor: `${homeInfo.color}44` }}
                      >
                        <TeamLogo abbr={teamAbbr(homeInfo.abbr)} name={homeInfo.name} size={56} />
                      </div>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Home</p>
                      <h2
                        className="text-xl font-black uppercase tracking-tight text-white leading-tight mt-1"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                      >
                        {homeInfo.name}
                      </h2>
                      <p className="text-3xl font-black font-mono mt-2" style={{ color: homeInfo.color }}>
                        {(result.win_probability.home_win_probability * 100).toFixed(1)}%
                      </p>
                      <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider mt-1">Win Probability</p>
                    </div>
                    {result.win_probability.predicted_winner === homeInfo.abbr && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 winner-pulse">
                        <Trophy size={11} className="text-emerald-400" />
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">Predicted Winner</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom KPI strip */}
                {result.score_prediction && !result.score_prediction.error && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 pt-6 border-t border-white/08">
                    {[
                      {
                        label: "Predicted Score",
                        value: `${result.score_prediction.predicted_home_score?.toFixed(0)} – ${result.score_prediction.predicted_away_score?.toFixed(0)}`,
                        sub: `${homeInfo.abbr} – ${awayInfo.abbr}`,
                      },
                      {
                        label: "Expected Margin",
                        value: `${Math.abs(result.score_prediction.predicted_margin).toFixed(1)} pts`,
                        sub: `${winnerInfo.abbr} lead`,
                      },
                      {
                        label: "Total Points",
                        value: `${result.score_prediction.predicted_total_points?.toFixed(0)} pts`,
                        sub: `${result.score_prediction.total_points_range?.[0]}–${result.score_prediction.total_points_range?.[1]} range`,
                      },
                      {
                        label: "Confidence",
                        value: result.win_probability.confidence_bucket || "MEDIUM",
                        sub: "Model signal strength",
                      },
                    ].map((kpi, i) => (
                      <div key={i} className="text-center p-3 rounded-xl bg-white/04 border border-white/06">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{kpi.label}</p>
                        <p
                          className="text-sm font-black text-white mt-1.5 font-mono"
                          style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1rem" }}
                        >
                          {kpi.value}
                        </p>
                        <p className="text-[9px] text-white/25 font-bold mt-1">{kpi.sub}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SECTION 3: SIGNAL INSIGHT CARDS ── */}
          {result.win_probability && !result.win_probability.error && winnerInfo && (
            <div className="space-y-3 animate-fade-in-up stagger-2">
              <div className="flex items-center gap-2">
                <Zap size={13} className="text-indigo-500" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Why the Model Favors {winnerInfo.name}
                </p>
              </div>
              <SignalCards result={result} homeInfo={homeInfo} awayInfo={awayInfo} winnerInfo={winnerInfo} />
            </div>
          )}

          {/* ── SECTION 4: NARRATIVE GAME SCRIPT ── */}
          {result.win_probability && !result.win_probability.error && winnerInfo && (
            <NarrativeBlock result={result} homeInfo={homeInfo} awayInfo={awayInfo} winnerInfo={winnerInfo} />
          )}

          {/* ── EXPLAINABLE AI MODEL INSIGHTS (XAI) ── */}
          {result.explanation && (
            <div className="animate-fade-in-up">
              <ModelExplanationSection
                result={result}
                homeInfo={homeInfo}
                awayInfo={awayInfo}
              />
            </div>
          )}

          {/* ── NEW SHAP EXPLANATION (API-driven) ── */}
          <PredictionExplanation 
            homeTeam={home} 
            awayTeam={away} 
            predictionDate={date} 
          />

          {/* ── SECTION 5: PLAYER SPOTLIGHT + TABLES ── */}
          {result.player_predictions && !result.player_predictions.error && (
            <div className="surface rounded-[1.5rem] p-5 lg:p-6 animate-fade-in-up stagger-4">
              <PlayerSpotlight
                players={result.player_predictions}
                homeInfo={homeInfo}
                awayInfo={awayInfo}
              />
            </div>
          )}

          {/* ── SECTION 7: SCORE PREDICTION PANEL ── */}
          {result.score_prediction && !result.score_prediction.error && (
            <div className="surface rounded-[1.5rem] p-5 lg:p-6 space-y-4 animate-fade-in-up stagger-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Score Prediction</p>
                  <h3 className="text-base font-black text-slate-800 mt-0.5" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                    80% Confidence Score Ranges
                  </h3>
                </div>
                <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded bg-slate-100 text-slate-500 border border-slate-200 font-mono">
                  {result.score_prediction.model_version || "score_v2"}
                </span>
              </div>

              {/* Score boxes */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { team: awayInfo, score: result.score_prediction.predicted_away_score, range: result.score_prediction.away_score_range },
                  { team: homeInfo, score: result.score_prediction.predicted_home_score, range: result.score_prediction.home_score_range },
                ].map((s) => (
                  <div key={s.team.abbr} className="score-box">
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <TeamLogo abbr={teamAbbr(s.team.abbr)} name={s.team.name} size={24} />
                      <p className="text-xs font-black text-slate-600">{s.team.abbr}</p>
                      <span className="text-[9px] text-slate-400 font-bold uppercase">
                        {s.team.abbr === homeInfo.abbr ? "Home" : "Away"}
                      </span>
                    </div>
                    <p className="text-4xl font-black font-mono" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: s.team.color }}>
                      {s.score?.toFixed(0)}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono font-bold mt-2">
                      Range: {s.range?.[0]} – {s.range?.[1]} pts
                    </p>
                    {/* Mini range track */}
                    <div className="mt-3 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      {(() => {
                        const minV = 80, maxV = 140;
                        const rS = Math.max(0, Math.min(100, ((s.range?.[0] - minV) / (maxV - minV)) * 100));
                        const rE = Math.max(0, Math.min(100, ((s.range?.[1] - minV) / (maxV - minV)) * 100));
                        const pP = Math.max(0, Math.min(100, ((s.score - minV) / (maxV - minV)) * 100));
                        return (
                          <div className="relative h-full">
                            <div className="absolute h-full opacity-30 rounded-full" style={{ left: `${rS}%`, width: `${rE - rS}%`, backgroundColor: s.team.color }} />
                            <div className="absolute h-full w-1.5 rounded-full" style={{ left: `${pP}%`, backgroundColor: s.team.color, boxShadow: `0 0 6px ${s.team.color}80` }} />
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>

              {/* Total + Margin */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-2xl">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Expected Total Points</p>
                  <p className="text-xl font-black text-slate-900 mt-1.5 font-mono">
                    {result.score_prediction.predicted_total_points.toFixed(1)} pts
                  </p>
                  <p className="text-[9px] font-mono font-bold text-slate-400 mt-1">
                    Range: {result.score_prediction.total_points_range[0]} – {result.score_prediction.total_points_range[1]}
                  </p>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-2xl">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Expected Point Margin</p>
                  <p className="text-xl font-black text-slate-900 mt-1.5 font-mono">
                    {Math.abs(result.score_prediction.predicted_margin).toFixed(1)} pts
                  </p>
                  <p className="text-[9px] font-mono font-bold text-slate-400 mt-1">
                    {result.score_prediction.predicted_margin >= 0 ? homeInfo.abbr : awayInfo.abbr} Lead ·{" "}
                    {result.score_prediction.margin_range[0]} to {result.score_prediction.margin_range[1]}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── SECTION 9: MODEL VS ACTUAL VERDICT ── */}
          {hasActualResult && (
            <div className={isPredictionCorrect ? "verdict-card-correct animate-fade-in-up stagger-6" : "verdict-card-wrong animate-fade-in-up stagger-6"}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity size={14} className={isPredictionCorrect ? "text-emerald-600" : "text-rose-500"} />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Model vs Actual Outcome</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase border ${isPredictionCorrect ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "bg-rose-100 text-rose-700 border-rose-300"}`}>
                  {isPredictionCorrect ? "Correct Prediction" : "Incorrect Prediction"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-white/60 rounded-xl border border-white/80">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Model Predicted</p>
                  <div className="flex items-center gap-2.5">
                    <TeamLogo abbr={teamAbbr(result.win_probability?.predicted_winner || result.predicted_winner)} name={getTeamInfo(result.win_probability?.predicted_winner || result.predicted_winner).name} size={28} />
                    <div>
                      <p className="text-xs font-black text-slate-800">{getTeamInfo(result.win_probability?.predicted_winner || result.predicted_winner).abbr} to Win</p>
                      {result.win_probability && (
                        <p className="text-[10px] font-bold text-slate-400 mt-0.5 font-mono">
                          {(Math.max(result.win_probability.home_win_probability, result.win_probability.away_win_probability) * 100).toFixed(1)}% prob
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-white/60 rounded-xl border border-white/80">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Actual Outcome</p>
                  <div className="flex items-center gap-2.5">
                    <TeamLogo abbr={teamAbbr(actualGame.WINNER_TEAM_ABBREVIATION)} name={getTeamInfo(actualGame.WINNER_TEAM_ABBREVIATION).name} size={28} />
                    <div>
                      <p className="text-xs font-black text-slate-800">
                        {getTeamInfo(actualGame.WINNER_TEAM_ABBREVIATION).abbr} Won {actualGame.HOME_SCORE} – {actualGame.AWAY_SCORE}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5 font-mono uppercase">
                        {actualGame.GAME_STATUS || "Final"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
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
