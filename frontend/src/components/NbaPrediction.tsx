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
  UsersRound,
  Cpu,
  LayoutDashboard,
} from "lucide-react";

import TeamLogo from "./TeamLogo";
import {
  getModelStatus,
  normalizeGameFullPrediction,
  predictGameFull,
  getRostersPreview,
  type PlayerStatusOverride,
} from "../api/predictions";
import { loadPrivateApiFresh } from "../lib/dataCache";
import { loadArchivedGameIndex } from "../lib/archiveData";
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
  const [seasonGames, setSeasonGames] = useState<any[]>([]);
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
  const [activeResultTab, setActiveResultTab] = useState<"overview" | "explanation" | "players" | "technical">("overview");

  const [playerOverrides, setPlayerOverrides] = useState<Record<string, PlayerStatusOverride>>({});
  const [previewRosters, setPreviewRosters] = useState<{
    home_players?: any[];
    away_players?: any[];
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchWeeks = async () => {
      try {
        setLoadingData(true);
        setDataError(null);
        const scheduleGames = await loadArchivedGameIndex(CURRENT_SEASON);
        if (!active) return;
        setSeasonGames(scheduleGames);
        const gamesByWeek = new Map<string, { start: string; end: string; count: number }>();
        for (const game of scheduleGames) {
          const gameDate = game.GAME_DATE?.slice(0, 10);
          if (!gameDate) continue;
          const dateUtc = new Date(`${gameDate}T00:00:00Z`);
          if (Number.isNaN(dateUtc.getTime())) continue;
          const monday = new Date(dateUtc);
          monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
          const sunday = new Date(monday);
          sunday.setUTCDate(sunday.getUTCDate() + 6);
          const start = monday.toISOString().slice(0, 10);
          const end = sunday.toISOString().slice(0, 10);
          const key = `${start}:${end}`;
          const existing = gamesByWeek.get(key);
          gamesByWeek.set(key, { start, end, count: (existing?.count ?? 0) + 1 });
        }
        let weekList: SeasonWeek[] = [...gamesByWeek.values()]
          .sort((a, b) => a.start.localeCompare(b.start))
          .map((week, index) => ({
            week_number: index + 1,
            start_date: week.start,
            end_date: week.end,
            label: `Hafta ${index + 1} (${week.start.slice(5)} - ${week.end.slice(5)})`,
            game_count: week.count,
          }));

        if (weekList.length === 0) {
          try {
            weekList = await loadPrivateApiFresh<SeasonWeek[]>(`/frontend-data-api/weeks?season=${encodeURIComponent(CURRENT_SEASON)}`);
          } catch {
            weekList = [];
          }
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
              label: `Hafta ${i} (${sStr.slice(5)} - ${eStr.slice(5)})`,
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
        if (active) setDataError("Takvim haftaları yüklenemedi.");
      } finally {
        if (active) setLoadingData(false);
      }
    };
    fetchWeeks();
    return () => { active = false; };
  }, [initialGame?.date]);

  useEffect(() => {
    if (!weeks.length) return;
    const currentWeek = weeks.find((w) => w.week_number === selectedWeekNum) || weeks[0];
    if (!currentWeek) return;

    let isMounted = true;
    const fetchWeekGames = async () => {
      setLoadingWeek(true);
      try {
        const data = seasonGames.filter((g) => {
          const gDate = g.GAME_DATE?.slice(0, 10);
          return gDate && gDate >= currentWeek.start_date && gDate <= currentWeek.end_date;
        });
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
  }, [selectedWeekNum, weeks, seasonGames]);

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
        if (!h || !a) throw new Error("Lütfen ev sahibi ve deplasman takımlarını seçin.");
        if (h === a) throw new Error("Ev sahibi ve deplasman aynı takım olamaz.");
        if (!d) throw new Error("Lütfen maç tarihini seçin.");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("Geçersiz tarih formatı (YYYY-MM-DD olmalı).");
        if (d < MIN_PREDICTION_DATE) {
          throw new Error(`Tahminler sadece henüz oynanmamış gelecek maçlar (${CURRENT_SEASON} sezonu ve sonrası) için geçerlidir.`);
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
        setActiveResultTab("overview");
        setSelectorOpen(false);
      } catch (e: any) {
        setError(e.message || "Bilinmeyen bir hata oluştu.");
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
    NBA_TEAMS.find((t) => t.abbr === abbr) || { abbr, name: abbr, color: NBA_TEAMS[0]?.color || "" };

  const teamAbbr = (abbr: string) => abbr?.toUpperCase?.() || "";

  const handleSelectGame = (game: any) => {
    setHome(game.HOME_TEAM_ABBREVIATION);
    setAway(game.AWAY_TEAM_ABBREVIATION);
    setDate(game.GAME_DATE);
    setPlayerOverrides({});
    setResult(null);
    setActiveResultTab("overview");
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
      return new Date(dateStr).toLocaleDateString("tr-TR", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const winnerAbbr = result?.win_probability?.predicted_winner || result?.predicted_winner;
  const winnerInfo = winnerAbbr ? getTeamInfo(winnerAbbr) : null;

  if (loadingData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 bg-background-primary rounded border border-border p-8">
        <RefreshCw size={24} className="animate-spin text-primary" />
        <span className="text-xs font-medium text-text-secondary">
          Tahmin motoru yükleniyor
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Data error notice */}
      {dataError && (
        <div className="flex items-start gap-3 rounded border border-status-warning/20 bg-status-warning/10 text-status-warning p-4">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <p className="text-xs font-medium m-0">{dataError}</p>
        </div>
      )}

      {/* SECTION 1: SELECTION PANEL */}
      <div className="bg-background-primary border border-border rounded overflow-hidden">
        <div
          id="selector-toggle"
          onClick={() => setSelectorOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-background-secondary/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Calendar size={16} className="text-text-secondary" />
            <div className="text-left">
              <p className="text-xs font-semibold text-text-primary">
                Karşılaşma seçimi
              </p>
              {home && away && date ? (
                <p className="text-sm font-semibold text-text-primary mt-0.5">
                  {homeInfo.name} vs {awayInfo.name} · {formatDate(date)}
                </p>
              ) : (
                <p className="text-sm text-text-secondary mt-0.5">Henüz maç seçilmedi</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {home && away && date && !result && !loading && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); submit(); }}
                id="run-prediction-btn"
                className="flex items-center gap-1.5 h-8 px-3 rounded bg-primary hover:bg-primary/90 text-white text-xs font-medium transition-colors cursor-pointer"
              >
                <Sparkles size={12} />
                <span>Tahmin Üret</span>
              </button>
            )}
            {selectorOpen ? <ChevronUp size={16} className="text-text-secondary" /> : <ChevronDown size={16} className="text-text-secondary" />}
          </div>
        </div>

        {selectorOpen && (
          <div className="border-t border-border-light px-5 pb-5 pt-4 space-y-4">
            {/* Mode tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-light pb-3">
              <div className="flex border border-border bg-background-secondary p-0.5 rounded gap-1">
                {(["scheduled", "custom"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setMode(m); setResult(null); setError(null); }}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                      mode === m
                        ? "bg-background-primary text-text-primary border border-border shadow-xs"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {m === "scheduled" ? "Gelecek Fikstür" : "Özel Karşılaşma"}
                  </button>
                ))}
              </div>
            </div>

            {/* Scheduled mode */}
            {mode === "scheduled" && (
              <div className="space-y-4">
                {/* Week Selector Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-background-secondary p-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedWeekNum((w) => Math.max(1, w - 1))}
                      disabled={selectedWeekNum <= 1 || loadingWeek}
                      className="flex h-8 w-8 items-center justify-center rounded border border-border bg-background-primary text-text-primary transition-colors hover:bg-background-secondary disabled:opacity-30 cursor-pointer"
                      title="Önceki Hafta"
                    >
                      <ChevronLeft size={16} />
                    </button>

                    <select
                      value={selectedWeekNum}
                      onChange={(e) => setSelectedWeekNum(Number(e.target.value))}
                      className="h-8 rounded border border-border bg-background-primary px-3 text-xs font-medium text-text-primary focus:border-border-focus focus:outline-none"
                    >
                      {weeks.map((w) => (
                        <option key={w.week_number} value={w.week_number}>
                          {w.label} ({w.game_count} maç)
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => setSelectedWeekNum((w) => Math.min(weeks.length, w + 1))}
                      disabled={selectedWeekNum >= weeks.length || loadingWeek}
                      className="flex h-8 w-8 items-center justify-center rounded border border-border bg-background-primary text-text-primary transition-colors hover:bg-background-secondary disabled:opacity-30 cursor-pointer"
                      title="Sonraki Hafta"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    {loadingWeek ? (
                      <span className="flex items-center gap-1.5 text-xs text-primary font-medium">
                        <RefreshCw size={12} className="animate-spin" /> Maçlar yükleniyor...
                      </span>
                    ) : (
                      <span className="text-xs text-text-secondary">
                        {upcomingGames.length} Karşılaşma ({selectedWeekNum}. Hafta)
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Upcoming games quick list */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-text-primary">
                        {selectedWeekNum}. Hafta Fikstürü
                      </p>
                      {loadingWeek && <RefreshCw size={12} className="animate-spin text-text-secondary" />}
                    </div>

                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {loadingWeek ? (
                        <div className="flex flex-col items-center justify-center gap-2 rounded border border-border bg-background-secondary p-8 text-center text-xs text-text-secondary">
                          <RefreshCw size={16} className="animate-spin text-primary" />
                          <span>Fikstür yükleniyor</span>
                        </div>
                      ) : upcomingGames.length === 0 ? (
                        <div className="rounded border border-border bg-background-secondary p-6 text-center text-xs text-text-secondary">
                          {selectedWeekNum}. hafta için oynanmamış maç bulunamadı.
                        </div>
                      ) : (
                        upcomingGames.map((g: any) => {
                          const isSelected = home === g.HOME_TEAM_ABBREVIATION && away === g.AWAY_TEAM_ABBREVIATION && date === g.GAME_DATE;
                          return (
                            <button
                              key={g.GAME_ID}
                              type="button"
                              onClick={() => handleSelectGame(g)}
                              className={`w-full text-left p-2.5 rounded border transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                                isSelected
                                  ? "bg-background-secondary border-primary"
                                  : "bg-background-primary border-border hover:border-card-border-hover"
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="flex items-center -space-x-1">
                                  <TeamLogo abbr={teamAbbr(g.HOME_TEAM_ABBREVIATION)} name={g.HOME_TEAM_ABBREVIATION} size={20} />
                                  <TeamLogo abbr={teamAbbr(g.AWAY_TEAM_ABBREVIATION)} name={g.AWAY_TEAM_ABBREVIATION} size={20} />
                                </div>
                                <span className="text-xs font-semibold text-text-primary">
                                  {g.HOME_TEAM_ABBREVIATION} vs {g.AWAY_TEAM_ABBREVIATION}
                                </span>
                                <span className="text-xs px-1.5 py-0.2 rounded-sm bg-background-secondary border border-border text-text-secondary">
                                  {g.SEASON_TYPE}
                                </span>
                              </div>
                              <span className="text-xs tabular-nums text-text-secondary">{g.GAME_DATE}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Filter by team */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-text-primary">Takıma göre filtrele</p>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        className="w-full h-8 rounded border border-border bg-background-primary px-2.5 text-xs font-medium text-text-primary focus:border-border-focus focus:outline-none"
                        value={filterTeam1}
                        onChange={(e) => { setFilterTeam1(e.target.value); if (!e.target.value) setFilterTeam2(""); }}
                      >
                        <option value="">Takım 1</option>
                        {NBA_TEAMS.map((t) => <option key={t.abbr} value={t.abbr}>{t.abbr} — {t.name}</option>)}
                      </select>
                      <select
                        className="w-full h-8 rounded border border-border bg-background-primary px-2.5 text-xs font-medium text-text-primary focus:border-border-focus focus:outline-none disabled:opacity-50"
                        value={filterTeam2}
                        onChange={(e) => setFilterTeam2(e.target.value)}
                        disabled={!filterTeam1}
                      >
                        <option value="">Takım 2 (isteğe bağlı)</option>
                        {NBA_TEAMS.map((t) => <option key={t.abbr} value={t.abbr} disabled={t.abbr === filterTeam1}>{t.abbr} — {t.name}</option>)}
                      </select>
                    </div>
                    <div className="border border-border rounded overflow-hidden bg-background-primary max-h-56 overflow-y-auto divide-y divide-border-light">
                      {!filterTeam1 ? (
                        <div className="p-4 text-center text-xs text-text-secondary">
                          {selectedWeekNum}. hafta maçlarını filtrelemek için takım seçin
                        </div>
                      ) : filteredSchedule.length === 0 ? (
                        <div className="p-4 text-center text-xs text-text-secondary">
                          {selectedWeekNum}. haftada {filterTeam1} için eşleşme bulunamadı
                        </div>
                      ) : (
                        filteredSchedule.map((g: any) => {
                          const isSelected = home === g.HOME_TEAM_ABBREVIATION && away === g.AWAY_TEAM_ABBREVIATION && date === g.GAME_DATE;
                          return (
                            <button
                              key={g.GAME_ID}
                              type="button"
                              onClick={() => handleSelectGame(g)}
                              className={`w-full text-left px-3.5 py-2 hover:bg-background-secondary transition-colors flex items-center justify-between text-xs cursor-pointer ${
                                isSelected ? "bg-background-secondary text-text-primary font-semibold" : "text-text-secondary"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-text-primary">{g.HOME_TEAM_ABBREVIATION}</span>
                                <span className="text-text-muted">vs</span>
                                <span className="font-semibold text-text-primary">{g.AWAY_TEAM_ABBREVIATION}</span>
                                <span className="text-xs px-1 py-0.2 rounded-sm bg-background-secondary border border-border text-text-secondary">
                                  {g.SEASON_TYPE === "NBA Finals" ? "Finals" : (g.SEASON_TYPE === "Pre Season" || g.SEASON_TYPE === "Preseason" ? "Preseason" : "Normal")}
                                </span>
                              </div>
                              <span className="text-xs text-text-secondary tabular-nums">{g.GAME_DATE}</span>
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
                  <label className="text-xs font-medium text-text-secondary block">Ev sahibi</label>
                  <select
                    className="w-full h-8 rounded border border-border bg-background-primary px-3 text-xs font-medium text-text-primary focus:border-border-focus focus:outline-none"
                    value={home}
                    onChange={(e) => { setHome(e.target.value); setResult(null); setError(null); }}
                  >
                    <option value="">Ev Sahibi Seç</option>
                    {NBA_TEAMS.map((t) => <option key={t.abbr} value={t.abbr}>{t.abbr} — {t.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-secondary block">Deplasman</label>
                  <select
                    className="w-full h-8 rounded border border-border bg-background-primary px-3 text-xs font-medium text-text-primary focus:border-border-focus focus:outline-none"
                    value={away}
                    onChange={(e) => { setAway(e.target.value); setResult(null); setError(null); }}
                  >
                    <option value="">Deplasman Seç</option>
                    {NBA_TEAMS.map((t) => <option key={t.abbr} value={t.abbr} disabled={t.abbr === home}>{t.abbr} — {t.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-secondary block">Tarih</label>
                  <input
                    type="date"
                    min="2026-10-01"
                    className="w-full h-8 rounded border border-border bg-background-primary px-3 text-xs font-medium text-text-primary focus:border-border-focus focus:outline-none"
                    value={date}
                    onChange={(e) => { setDate(e.target.value); setResult(null); setError(null); }}
                  />
                </div>
              </div>
            )}

            {/* Pre-prediction Lineup & Injury Configuration */}
            {home && away && date && home !== away && (
              <div className="pt-2 border-t border-border-light">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-text-primary">
                    Sakatlık ve rotasyon ayarları (tahmin öncesi / canlı)
                  </span>
                  {Object.keys(playerOverrides).length > 0 && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-sm bg-status-warning/10 text-status-warning border border-status-warning/20">
                      {Object.keys(playerOverrides).length} Oyuncu Durumu Değiştirildi
                    </span>
                  )}
                </div>
                {loadingPreview && !previewRosters && !result ? (
                  <div className="p-4 bg-background-secondary rounded border border-border text-center text-xs text-text-secondary">
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

            {/* CTA Buttons */}
            {home && away && date && (
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={submit}
                  disabled={loading}
                  id="run-prediction-main-btn"
                  className="flex items-center gap-2 h-9 px-5 rounded bg-primary hover:bg-primary/90 disabled:opacity-60 text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  {loading ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  <span>
                    {loading
                      ? "Hesaplanıyor..."
                      : Object.keys(playerOverrides).length > 0
                      ? "Tahmini Çalıştır (Kadro Değişiklikleriyle)"
                      : "Tahmin Modelini Çalıştır"}
                  </span>
                </button>
                {result && (
                  <button
                    type="button"
                    onClick={submit}
                    disabled={loading}
                    className="flex items-center gap-1.5 h-9 px-3.5 rounded border border-border bg-background-primary hover:bg-background-secondary text-text-primary text-xs font-medium transition-colors cursor-pointer"
                  >
                    <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                    <span>Yenile</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="p-4 bg-status-error/10 text-status-error rounded border border-status-error/20 text-xs font-medium flex items-center gap-2">
          <AlertTriangle size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="bg-background-primary border border-border rounded p-12 flex flex-col items-center justify-center gap-3">
          <RefreshCw size={24} className="animate-spin text-primary" />
          <p className="text-xs font-medium text-text-secondary">
            Karşılaşma istatistikleri ve modeller analiz ediliyor
          </p>
        </div>
      )}

      {/* Empty state */}
      {!home || !away || !date ? (
        <div className="bg-background-primary border border-border rounded p-12 text-center flex flex-col items-center justify-center gap-3 min-h-[260px]">
          <div className="w-12 h-12 rounded border border-border bg-background-secondary flex items-center justify-center text-text-secondary">
            <Activity size={22} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-text-primary">Karşılaşma Seçin</h4>
            <p className="text-xs text-text-secondary mt-1 max-w-sm mx-auto leading-relaxed">
              Model simülasyonunu çalıştırmak için yukarıdaki fikstürden bir maç seçin veya özel takım eşleşmesi belirleyin.
            </p>
          </div>
        </div>
      ) : null}

      {/* RESULT SECTIONS */}
      {result && !loading && (
        <div className="space-y-5">
          {/* Partial failure warnings */}
          {(result.win_probability?.error || result.score_prediction?.error || result.score_prediction?.confidence_warning) && (
            <div className="p-4 bg-status-warning/10 border border-status-warning/20 rounded text-xs text-status-warning font-medium space-y-1">
              {result.win_probability?.error && (
                <p className="flex items-center gap-1.5 m-0">
                  <AlertTriangle size={13} />
                  Kazanma Olasılığı Modeli: {result.win_probability.error}
                </p>
              )}
              {result.score_prediction?.error && (
                <p className="flex items-center gap-1.5 m-0">
                  <AlertTriangle size={13} />
                  Skor Tahmini Modeli: {result.score_prediction.error}
                </p>
              )}
              {result.score_prediction?.confidence_warning && (
                <p className="flex items-center gap-1.5 m-0">
                  <AlertTriangle size={13} />
                  Tahmin Uyarısı: {result.score_prediction.confidence_warning}
                </p>
              )}
            </div>
          )}

          {/* Pre-Season Calibration Info Banner */}
          {(result.is_preseason || result.season_type === "Pre Season" || result.season_type === "Preseason") && (
            <div className="p-4 bg-background-secondary border border-border rounded flex items-center gap-3 text-xs text-text-primary">
              <div className="w-8 h-8 rounded border border-border bg-background-primary flex items-center justify-center shrink-0 font-semibold text-xs text-primary">
                PRE
              </div>
              <div className="space-y-0.5">
                <p className="font-semibold text-text-primary m-0 text-xs">Hazırlık Maçı (Pre-Season) Kalibrasyonu Devrede</p>
                <p className="text-xs text-text-secondary m-0 leading-relaxed">
                  Koç rotasyonları ve kısıtlı süreler nedeniyle as oyuncuların dakika tavanı (maks 22 dk) ve istatistik projeksiyonları otomatik olarak ölçeklenmiştir.
                </p>
              </div>
            </div>
          )}

          {/* SECTION 2: HERO PREDICTION CARD */}
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

          {/* Result Tabs Panel */}
          <section className="overflow-hidden rounded border border-border bg-background-primary">
            <div role="tablist" aria-label="Tahmin raporu bölümleri" className="grid grid-cols-2 border-b border-border bg-background-secondary sm:grid-cols-4">
              {([
                { id: "overview", label: "Genel Bakış", icon: LayoutDashboard, detail: "Maç senaryosu" },
                { id: "explanation", label: "Modelin Gerekçesi", icon: Sparkles, detail: "Öne çıkan 5 neden" },
                { id: "players", label: "Oyuncular ve Kadro", icon: UsersRound, detail: "Rotasyonlar" },
                { id: "technical", label: "Teknik Detaylar", icon: Cpu, detail: "Model bilgisi" },
              ] as const).map((tab) => {
                const Icon = tab.icon;
                const selected = activeResultTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveResultTab(tab.id)}
                    className={`flex min-h-14 items-center gap-2.5 border-b-2 px-3 py-2.5 text-left transition-colors sm:px-4 cursor-pointer ${
                      selected
                        ? "border-primary bg-background-primary text-text-primary"
                        : "border-transparent text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    <Icon size={16} className={selected ? "shrink-0 text-primary" : "shrink-0 text-text-secondary"} />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold leading-tight">{tab.label}</span>
                      <span className="mt-0.5 block text-xs text-text-secondary">{tab.detail}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div role="tabpanel" className="space-y-5 p-4 sm:p-5 lg:p-6">
              {activeResultTab === "overview" && (
                <>
                  {result.win_probability && !result.win_probability.error && winnerInfo && (
                    <MatchupTacticalHub result={result} homeInfo={homeInfo} awayInfo={awayInfo} winnerInfo={winnerInfo} />
                  )}
                  <div className="rounded border border-border bg-background-secondary p-3.5 text-xs leading-relaxed text-text-secondary">
                    Tahminler istatistiksel model çıktılarıdır; kesin sonuç değildir. Skor tahminleri doğal olarak daha yüksek belirsizlik taşır.
                    {result.final_display_recommendation?.warning && (
                      <span className="mt-1 block font-medium text-status-warning">{result.final_display_recommendation.warning}</span>
                    )}
                  </div>
                </>
              )}

              {activeResultTab === "explanation" && (
                <ModelExplanationSection result={result} homeInfo={homeInfo} awayInfo={awayInfo} />
              )}

              {activeResultTab === "players" && (
                result.player_predictions && !result.player_predictions.error ? (
                  <div className="space-y-5">
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
                    <div className="bg-background-primary border border-border rounded p-5">
                      <PlayerSpotlight
                        players={result.player_predictions}
                        homeInfo={homeInfo}
                        awayInfo={awayInfo}
                        gameDate={date}
                        season={CURRENT_SEASON}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="rounded border border-border bg-background-secondary p-6 text-center text-xs text-text-secondary">
                    Bu tahminde oyuncu projeksiyonları oluşturulamadı.
                  </div>
                )
              )}

              {activeResultTab === "technical" && (
                <div className="space-y-5">
                  <ModelDiagnostics modelStatus={modelStatus} result={result} />
                  <div className="rounded border border-border bg-background-secondary p-3.5 text-xs leading-relaxed text-text-secondary">
                    Kazanma olasılığı ve skor projeksiyonu ayrı modellerden gelir; yakın maçlarda favorileri farklı olabilir. SHAP açıklamaları model girdilerinin bu tek tahmine katkı yönünü gösterir, nedensellik veya garanti ifade etmez.
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
