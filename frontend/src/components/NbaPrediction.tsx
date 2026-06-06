import { useState, useEffect } from "react";
import {
  BarChart2,
  Trophy,
  AlertTriangle,
  Cpu,
  Sparkles,
  RefreshCw,
  Activity
} from "lucide-react";

// List of NBA teams with logos and representative brand colors
const NBA_TEAMS = [
  { abbr: "ATL", name: "Atlanta Hawks", logo: "🦅", color: "#e31837" },
  { abbr: "BOS", name: "Boston Celtics", logo: "☘️", color: "#007a33" },
  { abbr: "BKN", name: "Brooklyn Nets", logo: "⚫", color: "#111827" },
  { abbr: "CHA", name: "Charlotte Hornets", logo: "🐝", color: "#00788c" },
  { abbr: "CHI", name: "Chicago Bulls", logo: "🐂", color: "#ce1141" },
  { abbr: "CLE", name: "Cleveland Cavaliers", logo: "⚔️", color: "#860038" },
  { abbr: "DAL", name: "Dallas Mavericks", logo: "🐴", color: "#0053bc" },
  { abbr: "DEN", name: "Denver Nuggets", logo: "🏔️", color: "#0e2240" },
  { abbr: "DET", name: "Detroit Pistons", logo: "⚙️", color: "#c8102e" },
  { abbr: "GSW", name: "Golden State Warriors", logo: "🌉", color: "#1d428a" },
  { abbr: "HOU", name: "Houston Rockets", logo: "🚀", color: "#ce1141" },
  { abbr: "IND", name: "Indiana Pacers", logo: "🏎️", color: "#fdbb30" },
  { abbr: "LAC", name: "LA Clippers", logo: "⛵", color: "#c8102e" },
  { abbr: "LAL", name: "Los Angeles Lakers", logo: "👑", color: "#552583" },
  { abbr: "MEM", name: "Memphis Grizzlies", logo: "🐻", color: "#5d76a9" },
  { abbr: "MIA", name: "Miami Heat", logo: "🔥", color: "#98002e" },
  { abbr: "MIL", name: "Milwaukee Bucks", logo: "🦌", color: "#00471b" },
  { abbr: "MIN", name: "Minnesota Timberwolves", logo: "🐺", color: "#0c2340" },
  { abbr: "NOP", name: "New Orleans Pelicans", logo: "⚜️", color: "#0c2340" },
  { abbr: "NYK", name: "New York Knicks", logo: "🗽", color: "#1d428a" },
  { abbr: "OKC", name: "Oklahoma City Thunder", logo: "⚡", color: "#007ac1" },
  { abbr: "ORL", name: "Orlando Magic", logo: "🪄", color: "#0077c0" },
  { abbr: "PHI", name: "Philadelphia 76ers", logo: "🔔", color: "#006bb6" },
  { abbr: "PHX", name: "Phoenix Suns", logo: "☀️", color: "#e56020" },
  { abbr: "POR", name: "Portland Trail Blazers", logo: "🌹", color: "#e03a3e" },
  { abbr: "SAC", name: "Sacramento Kings", logo: "👑", color: "#5a2d81" },
  { abbr: "SAS", name: "San Antonio Spurs", logo: "🤠", color: "#22252a" },
  { abbr: "TOR", name: "Toronto Raptors", logo: "🦖", color: "#ce1141" },
  { abbr: "UTA", name: "Utah Jazz", logo: "🎵", color: "#f9a01b" },
  { abbr: "WAS", name: "Washington Wizards", logo: "🧙", color: "#002b5c" }
];

export default function NbaPrediction() {
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [date, setDate] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selector data states
  const [upcomingGames, setUpcomingGames] = useState<any[]>([]);
  const [scheduleGames, setScheduleGames] = useState<any[]>([]);
  const [gameResults, setGameResults] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // Tab and search states
  const [mode, setMode] = useState<"scheduled" | "custom">("scheduled");
  const [filterTeam1, setFilterTeam1] = useState("");
  const [filterTeam2, setFilterTeam2] = useState("");

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        setLoadingData(true);
        const [upcomingRes, scheduleRes, gameResultsRes] = await Promise.all([
          fetch("/data/upcoming_games_context.json").catch(() => null),
          fetch("/data/schedule.json").catch(() => null),
          fetch("/data/game_results.json").catch(() => null)
        ]);

        if (upcomingRes && upcomingRes.ok) {
          const upcoming = await upcomingRes.json();
          setUpcomingGames(upcoming);
        }
        if (scheduleRes && scheduleRes.ok) {
          const schedule = await scheduleRes.json();
          // Filter to unique games by GAME_ID
          const seen = new Set();
          const uniqueSchedule = schedule.filter((g: any) => {
            if (!g.GAME_ID || seen.has(g.GAME_ID)) return false;
            seen.add(g.GAME_ID);
            return true;
          });
          // Sort games by date descending
          uniqueSchedule.sort((a: any, b: any) => b.GAME_DATE.localeCompare(a.GAME_DATE));
          setScheduleGames(uniqueSchedule);
        }
        if (gameResultsRes && gameResultsRes.ok) {
          const results = await gameResultsRes.json();
          setGameResults(results);
        }
      } catch (err: any) {
        console.error("Error loading schedule data for predictions:", err);
        setDataError("Could not load game schedules. Manual inputs are still active.");
      } finally {
        setLoadingData(false);
      }
    };
    fetchDropdownData();
  }, []);

  const getTeamInfo = (abbr: string) => {
    return NBA_TEAMS.find((t) => t.abbr === abbr) || { abbr, name: abbr, logo: "🏀", color: "#475569" };
  };

  const handleSelectGame = (game: any) => {
    setHome(game.HOME_TEAM_ABBREVIATION);
    setAway(game.AWAY_TEAM_ABBREVIATION);
    setDate(game.GAME_DATE);
    setResult(null);
    setError(null);
  };

  const submit = async () => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      if (!home || !away) {
        throw new Error('Please select both a home and away team.');
      }
      if (home === away) {
        throw new Error('Home and away teams cannot be the same.');
      }
      if (!date) {
        throw new Error('Please select a date for the matchup.');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Invalid date format. Please use YYYY-MM-DD.');
      }

      const res = await fetch('/api/nba/predictions/matchup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home_team: home, away_team: away, prediction_date: date })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server returned ${res.status}`);
      }
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Filter schedule games based on selected filter teams
  const filteredSchedule = scheduleGames.filter((g: any) => {
    if (!filterTeam1) return false;
    if (filterTeam1 && !filterTeam2) {
      return (
        g.HOME_TEAM_ABBREVIATION?.toUpperCase() === filterTeam1.toUpperCase() ||
        g.AWAY_TEAM_ABBREVIATION?.toUpperCase() === filterTeam1.toUpperCase()
      );
    }
    if (filterTeam1 && filterTeam2) {
      return (
        (g.HOME_TEAM_ABBREVIATION?.toUpperCase() === filterTeam1.toUpperCase() &&
          g.AWAY_TEAM_ABBREVIATION?.toUpperCase() === filterTeam2.toUpperCase()) ||
        (g.HOME_TEAM_ABBREVIATION?.toUpperCase() === filterTeam2.toUpperCase() &&
          g.AWAY_TEAM_ABBREVIATION?.toUpperCase() === filterTeam1.toUpperCase())
      );
    }
    return false;
  });

  const homeInfo = getTeamInfo(home);
  const awayInfo = getTeamInfo(away);

  // Find actual game result if mode is scheduled
  const actualGame = mode === "scheduled"
    ? gameResults.find(
        (g: any) =>
          g.HOME_TEAM_ABBREVIATION?.toUpperCase() === home.toUpperCase() &&
          g.AWAY_TEAM_ABBREVIATION?.toUpperCase() === away.toUpperCase() &&
          g.GAME_DATE === date
      )
    : null;

  const hasActualResult = actualGame && actualGame.HOME_SCORE !== null && actualGame.AWAY_SCORE !== null;
  const isPredictionCorrect = result && hasActualResult && (result.win_probability?.predicted_winner || result.predicted_winner) === actualGame.WINNER_TEAM_ABBREVIATION;

  // Helper formatting for dates
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const renderRangeTrack = (teamAbbr: string, teamInfo: any, predVal: number, range: [number, number]) => {
    const minVal = 80;
    const maxVal = 140;
    const rangeStartPercent = Math.max(0, Math.min(100, ((range[0] - minVal) / (maxVal - minVal)) * 100));
    const rangeEndPercent = Math.max(0, Math.min(100, ((range[1] - minVal) / (maxVal - minVal)) * 100));
    const predPercent = Math.max(0, Math.min(100, ((predVal - minVal) / (maxVal - minVal)) * 100));

    return (
      <div className="space-y-2.5 p-4 bg-slate-50 border border-slate-200/80 rounded-2xl shadow-2xs">
        <div className="flex justify-between items-center text-xs">
          <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[10px] shadow-3xs">{teamInfo.logo}</span>
            {teamInfo.name} ({teamAbbr})
          </span>
          <span className="font-mono text-[10px] font-black text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded shadow-3xs">Range: {range[0]} - {range[1]} pts</span>
        </div>

        <div className="relative h-6 bg-slate-200/40 rounded-xl overflow-hidden border border-slate-200/50">
          {/* 80% Confidence Interval Highlight */}
          <div 
            className="absolute h-full opacity-25 transition-all duration-700 ease-out"
            style={{
              left: `${rangeStartPercent}%`,
              width: `${rangeEndPercent - rangeStartPercent}%`,
              backgroundColor: teamInfo.color
            }}
          />
          {/* Center Estimate Marker */}
          <div 
            className="absolute h-full w-1 flex items-center justify-center transition-all duration-700 ease-out"
            style={{
              left: `${predPercent}%`,
            }}
          >
            <div 
              className="h-4 w-4 rounded-full border-2 border-white shadow-xs flex items-center justify-center cursor-default"
              style={{ backgroundColor: teamInfo.color }}
              title={`Center Estimate: ${predVal}`}
            >
              <div className="h-1.5 w-1.5 bg-white rounded-full" />
            </div>
          </div>
        </div>

        <div className="flex justify-between text-[9px] text-slate-450 font-mono font-bold px-1">
          <span>{minVal}</span>
          <span className="text-slate-800 font-extrabold" style={{ color: teamInfo.color }}>
            Expected Estimate: {predVal}
          </span>
          <span>{maxVal}</span>
        </div>
      </div>
    );
  };

  if (loadingData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <RefreshCw size={28} className="animate-spin text-indigo-600" />
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Loading prediction contexts...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Premium Header Banner */}
      <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white shadow-2xl p-6 lg:p-8">
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: "radial-gradient(circle at 18% 18%, rgba(29, 66, 138, 0.4) 0, transparent 40%)"
        }} />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-indigo-300">
              <Cpu size={12} className="text-indigo-400 animate-pulse" />
              AI Predictive Engine
            </div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-white m-0" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              NBA Win Probability Model
            </h1>
            <p className="text-xs text-slate-300 max-w-xl m-0 leading-relaxed">
              Predict win probabilities using our machine learning models trained on historical schedules, rolling team metrics, days of rest, and back-to-back factors.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right">
              <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300/80 m-0">Model Deployed</p>
              <p className="text-base font-black text-white leading-none mt-1.5 m-0">Random Forest V2</p>
            </div>
          </div>
        </div>
      </div>

      {dataError && (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 text-amber-800 border border-amber-200/80 p-4 shadow-xs">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs font-semibold m-0">{dataError}</p>
        </div>
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Matchup Configuration */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-card rounded-[1.5rem] border border-slate-200/80 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <BarChart2 size={16} className="text-indigo-600" />
              Configure Simulation
            </h3>

            {/* Mode selection tabs */}
            <div className="flex border border-slate-200 bg-slate-50 p-1 rounded-xl">
              <button
                onClick={() => {
                  setMode("scheduled");
                  setResult(null);
                  setError(null);
                }}
                className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
                  mode === "scheduled"
                    ? "bg-white text-indigo-950 shadow-xs border border-slate-200/50"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                📅 Scheduled Games
              </button>
              <button
                onClick={() => {
                  setMode("custom");
                  setResult(null);
                  setError(null);
                }}
                className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
                  mode === "custom"
                    ? "bg-white text-indigo-950 shadow-xs border border-slate-200/50"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                ⚙️ Custom Matchup
              </button>
            </div>

            {/* Mode Content: Scheduled Games Selector */}
            {mode === "scheduled" && (
              <div className="space-y-4">
                {/* Quick select list for upcoming games */}
                {upcomingGames.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                      🔥 Upcoming Finals Matchups
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      {upcomingGames.map((g: any) => {
                        const isSelected = home === g.HOME_TEAM_ABBREVIATION && away === g.AWAY_TEAM_ABBREVIATION && date === g.GAME_DATE;
                        return (
                          <button
                            key={g.GAME_ID}
                            onClick={() => handleSelectGame(g)}
                            className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 flex items-center justify-between gap-4 ${
                              isSelected
                                ? "bg-indigo-50/40 border-indigo-500 shadow-2xs"
                                : "bg-white border-slate-200/80 hover:border-slate-300"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex items-center -space-x-1.5">
                                <span className="w-7 h-7 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center font-bold text-xs shadow-2xs">
                                  {getTeamInfo(g.HOME_TEAM_ABBREVIATION).logo}
                                </span>
                                <span className="w-7 h-7 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center font-bold text-xs shadow-2xs">
                                  {getTeamInfo(g.AWAY_TEAM_ABBREVIATION).logo}
                                </span>
                              </div>
                              <div>
                                <p className="text-xs font-black text-slate-800 leading-tight">
                                  {g.HOME_TEAM_ABBREVIATION} vs {g.AWAY_TEAM_ABBREVIATION}
                                </p>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                                  {g.SEASON_TYPE}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 px-2 py-0.5 rounded bg-slate-100 border border-slate-200/50 font-mono">
                                {g.GAME_DATE}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Searchable dropdown for all games */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                    🔎 Filter Season Schedule by Team
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Team 1</span>
                      <select
                        className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-2xs"
                        value={filterTeam1}
                        onChange={(e) => {
                          setFilterTeam1(e.target.value);
                          if (e.target.value === "") {
                            setFilterTeam2("");
                          }
                        }}
                      >
                        <option value="">Select Team 1</option>
                        {NBA_TEAMS.map((team) => (
                          <option key={team.abbr} value={team.abbr}>
                            {team.logo} {team.abbr} - {team.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Team 2 (Optional)</span>
                      <select
                        className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-2xs disabled:opacity-50 disabled:bg-slate-50"
                        value={filterTeam2}
                        onChange={(e) => setFilterTeam2(e.target.value)}
                        disabled={!filterTeam1}
                      >
                        <option value="">Select Team 2</option>
                        {NBA_TEAMS.map((team) => (
                          <option key={team.abbr} value={team.abbr} disabled={team.abbr === filterTeam1}>
                            {team.logo} {team.abbr} - {team.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="border border-slate-200/80 rounded-xl overflow-hidden bg-white shadow-2xs max-h-56 overflow-y-auto divide-y divide-slate-100">
                    {!filterTeam1 ? (
                      <div className="p-5 text-center text-xs text-slate-400 font-semibold leading-relaxed">
                        Select a team above to view their scheduled games.
                      </div>
                    ) : filteredSchedule.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400 font-semibold">
                        No matchups found between these teams.
                      </div>
                    ) : (
                      filteredSchedule.map((g: any) => {
                        const isSelected = home === g.HOME_TEAM_ABBREVIATION && away === g.AWAY_TEAM_ABBREVIATION && date === g.GAME_DATE;
                        return (
                          <button
                            key={g.GAME_ID}
                            onClick={() => handleSelectGame(g)}
                            className={`w-full text-left px-3.5 py-2.5 hover:bg-slate-50 transition-colors flex items-center justify-between text-xs ${
                              isSelected ? "bg-indigo-50/20 text-indigo-900 font-bold" : "text-slate-600 font-medium"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold">{g.HOME_TEAM_ABBREVIATION}</span>
                              <span className="text-slate-300">vs</span>
                              <span className="font-extrabold">{g.AWAY_TEAM_ABBREVIATION}</span>
                              <span className="text-[8px] uppercase font-black tracking-wider text-slate-400 px-1 py-0.2 bg-slate-50 border border-slate-150 rounded">
                                {g.SEASON_TYPE === "NBA Finals" ? "Finals" : "Regular"}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-bold font-mono">
                              {g.GAME_DATE}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Mode Content: Custom Configuration Dropdowns */}
            {mode === "custom" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Home Team</label>
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-2xs"
                      value={home}
                      onChange={(e) => {
                        setHome(e.target.value);
                        setResult(null);
                        setError(null);
                      }}
                    >
                      <option value="">Select Home</option>
                      {NBA_TEAMS.map((team) => (
                        <option key={team.abbr} value={team.abbr}>
                          {team.logo} {team.abbr} - {team.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Away Team</label>
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-2xs"
                      value={away}
                      onChange={(e) => {
                        setAway(e.target.value);
                        setResult(null);
                        setError(null);
                      }}
                    >
                      <option value="">Select Away</option>
                      {NBA_TEAMS.map((team) => (
                        <option key={team.abbr} value={team.abbr} disabled={team.abbr === home}>
                          {team.logo} {team.abbr} - {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1 pt-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Matchup Date</label>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-2xs"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setResult(null);
                      setError(null);
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Visual Matchup Preview & Prediction Results */}
        <div className="lg:col-span-7 space-y-6">
          {(!home || !away || !date) ? (
            /* Empty configuration state */
            <div className="glass rounded-[1.5rem] border border-slate-200/80 bg-white p-8 text-center flex flex-col items-center justify-center min-h-[360px] shadow-sm">
              <Activity size={40} className="text-slate-300 mb-3 animate-pulse" />
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest m-0">Awaiting Selection</h4>
              <p className="text-xs text-slate-400 mt-1.5 max-w-xs mx-auto leading-relaxed m-0">
                Select a game matchup or build your custom team combination from the options on the left to run prediction.
              </p>
            </div>
          ) : (
            /* Matchup configured state */
            <div className="space-y-6">
              {/* Visual VS Matching Card */}
              <div className="glass rounded-[1.5rem] border border-slate-200/80 bg-white p-6 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-1.5 m-0">
                  <Sparkles size={11} className="text-indigo-500" />
                  Active Simulation Matchup
                </p>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-4 py-3 px-1">
                  {/* Home Card */}
                  <div
                    className="rounded-2xl border p-4 text-center transition-all duration-300"
                    style={{
                      background: `linear-gradient(135deg, ${homeInfo.color}0c 0%, #ffffff 100%)`,
                      borderColor: `${homeInfo.color}22`
                    }}
                  >
                    <span className="text-4xl block mb-2 filter drop-shadow-sm">{homeInfo.logo}</span>
                    <h3 className="text-sm font-extrabold text-slate-800 leading-tight m-0">{homeInfo.name}</h3>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-1 block">
                      {homeInfo.abbr} · Home
                    </span>
                  </div>

                  {/* VS Separator */}
                  <div className="flex flex-col items-center gap-1.5 py-2">
                    <span className="text-xs font-black text-slate-300 tracking-wider">VS</span>
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[9px] font-extrabold text-slate-500 uppercase tracking-widest font-mono shadow-2xs">
                      {formatDate(date)}
                    </div>
                  </div>

                  {/* Away Card */}
                  <div
                    className="rounded-2xl border p-4 text-center transition-all duration-300"
                    style={{
                      background: `linear-gradient(135deg, ${awayInfo.color}0c 0%, #ffffff 100%)`,
                      borderColor: `${awayInfo.color}22`
                    }}
                  >
                    <span className="text-4xl block mb-2 filter drop-shadow-sm">{awayInfo.logo}</span>
                    <h3 className="text-sm font-extrabold text-slate-800 leading-tight m-0">{awayInfo.name}</h3>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-1 block">
                      {awayInfo.abbr} · Away
                    </span>
                  </div>
                </div>

                {/* Simulation trigger button */}
                {!result && !loading && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <button
                      onClick={submit}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold uppercase tracking-wider text-xs py-3.5 transition-all duration-200 shadow-md shadow-indigo-100"
                    >
                      <Sparkles size={13} />
                      Run Win Probability Model
                    </button>
                  </div>
                )}

                {loading && (
                  <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col items-center justify-center py-5 text-slate-400">
                    <RefreshCw size={22} className="animate-spin text-indigo-600 mb-2" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 m-0">Analyzing matchup statistics...</p>
                  </div>
                )}

                {error && (
                  <div className="mt-4 p-3 bg-rose-50 text-rose-700 rounded-xl border border-rose-100 text-xs font-semibold">
                    ⚠️ {error}
                  </div>
                )}
              </div>

              {/* Simulation Result Area */}
              {result && (
                <div className="glass rounded-[1.5rem] border border-slate-200/80 bg-white p-6 shadow-sm animate-fade-in-up space-y-6">
                  
                  {/* Warnings/Errors if partial failures occurred */}
                  {(result.win_probability?.error || result.score_prediction?.error) && (
                    <div className="p-4 bg-amber-50 border border-amber-250/50 rounded-2xl text-xs text-amber-800 font-semibold space-y-1">
                      {result.win_probability?.error && (
                        <p className="m-0 flex items-center gap-1.5">
                          <AlertTriangle size={14} className="text-amber-600" />
                          Win Probability Model: {result.win_probability.error}
                        </p>
                      )}
                      {result.score_prediction?.error && (
                        <p className="m-0 flex items-center gap-1.5">
                          <AlertTriangle size={14} className="text-amber-600" />
                          Score Prediction Model: {result.score_prediction.error}
                        </p>
                      )}
                    </div>
                  )}

                  {/* 1. Win Probability Card */}
                  {result.win_probability && !result.win_probability.error && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-2">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 m-0">Primary Winner Prediction</p>
                          <h4 className="text-base font-extrabold text-slate-800 mt-0.5 m-0">Predicted Probabilities</h4>
                        </div>
                        <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded bg-slate-100 text-slate-600 border border-slate-200 font-mono shadow-2xs">
                          {result.win_probability.model_version || "RF_V2"}
                        </span>
                      </div>

                      {/* Projected Winner Banner */}
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white font-black shadow-sm flex-shrink-0">
                          <Trophy size={18} />
                        </div>
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 m-0">Projected Winner (Primary)</p>
                          <p className="text-sm font-extrabold text-slate-800 mt-1 m-0">
                            {getTeamInfo(result.win_probability.predicted_winner).logo} {getTeamInfo(result.win_probability.predicted_winner).name} ({result.win_probability.predicted_winner})
                          </p>
                        </div>
                      </div>

                      {/* Comparative Progress Bar Chart */}
                      <div className="space-y-3.5">
                        <div className="flex justify-between items-end text-xs">
                          <div>
                            <span className="font-extrabold text-slate-800 block">
                              {homeInfo.logo} {homeInfo.abbr} (Home)
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-base font-black text-slate-900 font-mono" style={{ color: homeInfo.color }}>
                              {(result.win_probability.home_win_probability * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>

                        {/* Team Colored Progress Bar */}
                        <div className="h-4 w-full rounded-full overflow-hidden bg-slate-100 border border-slate-250/50 flex shadow-2xs">
                          <div
                            className="h-full transition-all duration-700 ease-out"
                            style={{
                              width: `${result.win_probability.home_win_probability * 100}%`,
                              backgroundColor: homeInfo.color
                            }}
                          />
                          <div
                            className="h-full transition-all duration-700 ease-out"
                            style={{
                              width: `${result.win_probability.away_win_probability * 100}%`,
                              backgroundColor: awayInfo.color
                            }}
                          />
                        </div>

                        <div className="flex justify-between items-start text-xs">
                          <div>
                            <span className="text-base font-black text-slate-900 font-mono" style={{ color: awayInfo.color }}>
                              {(result.win_probability.away_win_probability * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-extrabold text-slate-800 block">
                              {awayInfo.logo} {awayInfo.abbr} (Away)
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Metadata Indicators */}
                      <div className="grid grid-cols-2 gap-3.5 border-t border-slate-150 pt-4">
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block leading-none">Confidence Level</span>
                          <span className={`inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            result.win_probability.confidence_bucket?.toUpperCase().includes("STRONG")
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-250/50"
                              : result.win_probability.confidence_bucket?.toUpperCase().includes("MODERATE")
                              ? "bg-blue-50 text-blue-700 border border-blue-250/50"
                              : "bg-amber-50 text-amber-700 border border-amber-250/50"
                          }`}>
                            {result.win_probability.confidence_bucket || "MEDIUM"}
                          </span>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block leading-none font-mono">Prediction Date</span>
                          <p className="text-xs font-black text-slate-700 mt-2.5 m-0 font-mono leading-none">{result.prediction_date}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. Expected Score Card (V2 Model) */}
                  {result.score_prediction && !result.score_prediction.error && (
                    <div className="space-y-4 pt-4 border-t border-slate-150">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-2">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 m-0">Expected Game Scores</p>
                          <h4 className="text-base font-extrabold text-slate-800 mt-0.5 m-0">80% Confidence Score Ranges</h4>
                        </div>
                        <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded bg-slate-100 text-slate-600 border border-slate-200 font-mono shadow-2xs">
                          {result.score_prediction.model_version || "score_v2"}
                        </span>
                      </div>

                      {/* Score Range Tracks */}
                      <div className="space-y-4">
                        {renderRangeTrack(
                          home,
                          homeInfo,
                          result.score_prediction.predicted_home_score,
                          result.score_prediction.home_score_range as [number, number]
                        )}
                        {renderRangeTrack(
                          away,
                          awayInfo,
                          result.score_prediction.predicted_away_score,
                          result.score_prediction.away_score_range as [number, number]
                        )}
                      </div>

                      {/* Direct Total Points and Point Margin Grid */}
                      <div className="grid grid-cols-2 gap-3.5 pt-2">
                        <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl shadow-2xs">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Expected Total Points</span>
                          <span className="text-sm font-black text-slate-900 mt-2 block">
                            {result.score_prediction.predicted_total_points.toFixed(1)} pts
                          </span>
                          <span className="text-[9px] font-mono font-bold text-slate-450 mt-1 block">
                            Range: {result.score_prediction.total_points_range[0]} - {result.score_prediction.total_points_range[1]}
                          </span>
                        </div>

                        <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl shadow-2xs">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Expected Point Margin</span>
                          <span className="text-sm font-black text-slate-900 mt-2 block">
                            {Math.abs(result.score_prediction.predicted_margin).toFixed(1)} pts ({result.score_prediction.predicted_margin >= 0 ? homeInfo.abbr : awayInfo.abbr} Lead)
                          </span>
                          <span className="text-[9px] font-mono font-bold text-slate-450 mt-1 block">
                            Range: {result.score_prediction.margin_range[0]} to {result.score_prediction.margin_range[1]}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3. Disclaimers & Notes */}
                  <div className="p-4 rounded-2xl border border-blue-150 bg-blue-50/20 text-blue-900 text-[10px] font-semibold leading-relaxed space-y-1.5 shadow-2xs">
                    <div className="flex items-center gap-1.5 font-black uppercase tracking-wider text-blue-950 text-[11px]">
                      <Sparkles size={12} className="text-blue-700 animate-pulse" />
                      Prediction Insights &amp; Disclaimers
                    </div>
                    <p className="m-0">
                      • <strong>Disclaimer:</strong> This is a statistical prediction, not a guaranteed result.
                    </p>
                    <p className="m-0">
                      • <strong>Natural Variance:</strong> Score predictions have high natural variance. Use the win probability model as your primary winner signal.
                    </p>
                    {result.final_display_recommendation?.warning && (
                      <p className="m-0">• <strong>Recommendation:</strong> {result.final_display_recommendation.warning}</p>
                    )}
                  </div>

                  {/* Model vs Actual Comparison */}
                  {hasActualResult && (
                    <div className="mt-5 pt-5 border-t border-slate-150 space-y-4">
                      <div className="flex items-center justify-between">
                        <h5 className="text-[11px] font-black uppercase tracking-widest text-slate-400 m-0 flex items-center gap-1.5">
                          <Activity size={12} className="text-indigo-600 animate-pulse" />
                          Model vs Actual Match Outcome
                        </h5>
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase border ${
                          isPredictionCorrect
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        }`}>
                          {isPredictionCorrect ? "Prediction Correct ✅" : "Prediction Incorrect ❌"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Predicted Details */}
                        <div className="p-3.5 bg-slate-50 border border-slate-150 rounded-xl space-y-2">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Model Predicted</p>
                          <div className="flex items-center gap-2.5">
                            <span className="text-2xl filter drop-shadow-xs">
                              {getTeamInfo(result.win_probability?.predicted_winner || result.predicted_winner).logo}
                            </span>
                            <div>
                              <p className="text-xs font-extrabold text-slate-800 leading-none">
                                {getTeamInfo(result.win_probability?.predicted_winner || result.predicted_winner).abbr} to Win
                              </p>
                              {result.win_probability && (
                                <p className="text-[9px] font-bold text-slate-400 mt-1.5 uppercase tracking-wider font-mono">
                                  {(Math.max(result.win_probability.home_win_probability, result.win_probability.away_win_probability) * 100).toFixed(1)}% Prob
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actual Outcome Details */}
                        <div className="p-3.5 bg-slate-50 border border-slate-150 rounded-xl space-y-2">
                          <p className="text-[9px] font-black text-slate-450 uppercase tracking-widest">Actual Outcome</p>
                          <div className="flex items-center gap-2.5">
                            <span className="text-2xl filter drop-shadow-xs">{getTeamInfo(actualGame.WINNER_TEAM_ABBREVIATION).logo}</span>
                            <div>
                              <p className="text-xs font-extrabold text-slate-800 leading-none">
                                {getTeamInfo(actualGame.WINNER_TEAM_ABBREVIATION).abbr} Won {actualGame.HOME_SCORE} - {actualGame.AWAY_SCORE}
                              </p>
                              <p className="text-[9px] font-bold text-slate-400 mt-1.5 uppercase tracking-wider font-mono">
                                {actualGame.GAME_STATUS || "Final"} Score
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Re-run button */}
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <button
                      onClick={submit}
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 hover:border-slate-350 bg-slate-50 hover:bg-slate-100/80 text-slate-600 font-extrabold uppercase tracking-wider text-[10px] py-3 transition-colors shadow-2xs"
                    >
                      <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
                      Refresh Predictive Analysis
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
