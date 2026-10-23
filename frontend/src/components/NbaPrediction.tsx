import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AlertTriangle,
  RefreshCw,
  Activity,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Calendar,
  UsersRound,
  LayoutDashboard,
  HelpCircle,
} from "lucide-react";

import TeamLogo from "./TeamLogo";
import {
  normalizeGameFullPrediction,
  predictGameFull,
} from "../api/predictions";
import { loadArchivedGameIndex } from "../lib/archiveData";
import { loadPrivateApiFresh } from "../lib/dataCache";
import { NBA_TEAMS } from "../lib/nbaTeams";
import { CURRENT_SEASON, MIN_PREDICTION_DATE } from "../lib/constants";
import { fmtDate } from "./game-results/utils";

import {
  MatchupHeroCard,
  MatchupTacticalHub,
  ModelExplanationSection,
  PlayerSpotlight,
  InjuryReportPanel,
  InjuryChangesList,
  InjuryReportStamp,
  type InjuryReportSummary,
  type InjuryChange,
} from "./prediction";

interface NbaPredictionProps {
  initialGame?: {
    home: string;
    away: string;
    date: string;
  } | null;
  onClearInitialGame?: () => void;
}

/** Eastern-time calendar date (the injury report covers today and tomorrow in this zone). */
const etDate = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

export default function NbaPrediction({ initialGame, onClearInitialGame }: NbaPredictionProps = {}) {
  const [home, setHome] = useState(initialGame?.home || "");
  const [away, setAway] = useState(initialGame?.away || "");
  const [date, setDate] = useState(initialGame?.date || "");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seasonGames, setSeasonGames] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [filterTeam1, setFilterTeam1] = useState("");
  const [filterTeam2, setFilterTeam2] = useState("");
  const [injuryChanges, setInjuryChanges] = useState<InjuryChange[]>([]);
  const [latestReport, setLatestReport] = useState<InjuryReportSummary | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(!initialGame);
  const [activeResultTab, setActiveResultTab] = useState<"overview" | "explanation" | "players">("overview");

  useEffect(() => {
    let active = true;
    const fetchSchedule = async () => {
      try {
        setLoadingData(true);
        setDataError(null);
        const scheduleGames = await loadArchivedGameIndex(CURRENT_SEASON);
        if (!active) return;
        setSeasonGames(scheduleGames);

        const todayStr = new Date().toISOString().slice(0, 10);
        const dates = Array.from(
          new Set(scheduleGames.map((g) => g.GAME_DATE?.slice(0, 10)).filter(Boolean))
        ).sort();

        let initialDate = initialGame?.date;
        if (!initialDate || !dates.includes(initialDate)) {
          // Select today or the nearest future date
          initialDate = dates.find((d) => d >= todayStr) || dates[dates.length - 1] || "";
        }
        setSelectedDate(initialDate);
      } catch (err: any) {
        console.error("Error loading schedule games:", err);
        if (active) setDataError("Takvim maçları yüklenemedi.");
      } finally {
        if (active) setLoadingData(false);
      }
    };
    fetchSchedule();
    return () => {
      active = false;
    };
  }, [initialGame?.date]);

  // Derived: dates of unplayed/upcoming games
  const uniqueDates = useMemo(() => {
    const isCompletedGame = (g: any) => {
      const homeScore = Number(g.HOME_SCORE);
      const awayScore = Number(g.AWAY_SCORE);
      return !isNaN(homeScore) && !isNaN(awayScore) && (homeScore > 0 || awayScore > 0);
    };

    const dates = new Set<string>();
    for (const g of seasonGames) {
      if (!isCompletedGame(g) && g.GAME_DATE) {
        dates.add(g.GAME_DATE.slice(0, 10));
      }
    }
    return Array.from(dates).sort();
  }, [seasonGames]);

  // Current day unplayed games
  const dateGames = useMemo(() => {
    if (!selectedDate) return [];
    const isCompletedGame = (g: any) => {
      const homeScore = Number(g.HOME_SCORE);
      const awayScore = Number(g.AWAY_SCORE);
      return !isNaN(homeScore) && !isNaN(awayScore) && (homeScore > 0 || awayScore > 0);
    };
    const seen = new Set<string>();
    return seasonGames
      .filter((g) => g.GAME_DATE?.slice(0, 10) === selectedDate && !isCompletedGame(g))
      .filter((g) => {
        if (g.GAME_ID && seen.has(g.GAME_ID)) return false;
        if (g.GAME_ID) seen.add(g.GAME_ID);
        return true;
      });
  }, [selectedDate, seasonGames]);

  // Injury report changes for the two teams, shown as soon as a game is selected
  useEffect(() => {
    const isNear = date >= etDate(0) && date <= etDate(1);
    if (!home || !away || home === away || !date || !isNear) {
      setInjuryChanges([]);
      setLatestReport(null);
      return;
    }
    let active = true;
    loadPrivateApiFresh<{ report: InjuryReportSummary | null; changes: InjuryChange[] }>(
      `/frontend-data-api/injury-changes?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}&date=${encodeURIComponent(date)}`
    )
      .then((r) => {
        if (!active) return;
        setInjuryChanges(r.changes ?? []);
        setLatestReport(r.report);
      })
      .catch(() => {
        if (!active) return;
        setInjuryChanges([]);
        setLatestReport(null);
      });
    return () => {
      active = false;
    };
  }, [home, away, date]);

  const selectedDateIndex = uniqueDates.indexOf(selectedDate);
  const todayStr = new Date().toISOString().slice(0, 10);

  const submitGame = useCallback(
    async (h: string, a: string, d: string) => {
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

        const data = await predictGameFull({
          home_team_id: h,
          away_team_id: a,
          prediction_date: d,
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
    []
  );

  useEffect(() => {
    if (initialGame?.home && initialGame?.away && initialGame?.date) {
      setHome(initialGame.home);
      setAway(initialGame.away);
      setDate(initialGame.date);
      setResult(null);
      setError(null);
      setSelectorOpen(true);
      if (initialGame.date) {
        setSelectedDate(initialGame.date);
      }
      onClearInitialGame?.();
    }
  }, [initialGame, onClearInitialGame]);

  const getTeamInfo = (abbr: string) =>
    NBA_TEAMS.find((t) => t.abbr === abbr) || { abbr, name: abbr, color: NBA_TEAMS[0]?.color || "" };

  const teamAbbr = (abbr: string) => abbr?.toUpperCase?.() || "";

  const handleSelectGame = (game: any) => {
    setHome(game.HOME_TEAM_ABBREVIATION);
    setAway(game.AWAY_TEAM_ABBREVIATION);
    setDate(game.GAME_DATE);
    setResult(null);
    setActiveResultTab("overview");
    setError(null);
    setSelectorOpen(true);
  };

  const submit = useCallback(() => {
    return submitGame(home, away, date);
  }, [submitGame, home, away, date]);

  const filteredSchedule = dateGames.filter((g: any) => {
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
                <span>Tahmin Üret</span>
              </button>
            )}
            {selectorOpen ? <ChevronUp size={16} className="text-text-secondary" /> : <ChevronDown size={16} className="text-text-secondary" />}
          </div>
        </div>

        {selectorOpen && (
          <div className="border-t border-border-light px-5 pb-5 pt-4 space-y-4">
            <div className="space-y-4">
              {/* Date Stepper Bar (Fixtures Tab Style) */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-background-secondary p-3">
                <div className="flex items-center rounded border border-border bg-background-primary p-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedDate(uniqueDates[selectedDateIndex - 1] ?? selectedDate)}
                    disabled={selectedDateIndex <= 0}
                    className="rounded p-1 text-text-secondary transition-all hover:bg-background-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Önceki Gün"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  {/* Date Dropdown Menu */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsDateMenuOpen((open) => !open)}
                      className="flex items-center gap-1.5 px-2.5 py-1 font-mono text-xs font-semibold text-text-primary transition-colors hover:text-primary"
                    >
                      <Calendar size={13} className="text-text-muted" />
                      <span>{selectedDate ? fmtDate(selectedDate) : "Tarih Seç"}</span>
                      {selectedDate === todayStr && (
                        <span className="h-1.5 w-1.5 rounded-full bg-status-success" title="Bugün" />
                      )}
                      <ChevronDown className={`h-3.5 w-3.5 text-text-muted transition-transform ${isDateMenuOpen ? "rotate-180" : ""}`} />
                    </button>

                    {isDateMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsDateMenuOpen(false)} />
                        <div className="absolute left-0 top-full z-50 mt-1.5 max-h-64 w-60 overflow-y-auto rounded border border-border bg-background-primary p-1.5 shadow-xl scrollbar-thin">
                          {uniqueDates.map((d) => {
                            const isSelected = selectedDate === d;
                            const isToday = d === todayStr;
                            const gameCount = seasonGames.filter(
                              (g) => g.GAME_DATE?.slice(0, 10) === d && (Number(g.HOME_SCORE) === 0 || isNaN(Number(g.HOME_SCORE)))
                            ).length;
                            return (
                              <button
                                key={d}
                                type="button"
                                onClick={() => {
                                  setSelectedDate(d);
                                  setIsDateMenuOpen(false);
                                }}
                                className={`mt-0.5 flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs font-bold transition-all ${
                                  isSelected ? "bg-primary text-white" : "text-text-primary hover:bg-background-tertiary"
                                }`}
                              >
                                <span>{fmtDate(d)}</span>
                                <div className="flex items-center gap-1.5">
                                  {isToday && (
                                    <span
                                      className={`rounded px-1.5 py-0.2 text-[9px] font-sans font-semibold uppercase ${
                                        isSelected ? "bg-status-success text-white" : "bg-status-success/20 text-status-success"
                                      }`}
                                    >
                                      Bugün
                                    </span>
                                  )}
                                  <span className={`text-[10px] font-mono ${isSelected ? "text-white/80" : "text-text-muted"}`}>
                                    ({gameCount})
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedDate(uniqueDates[selectedDateIndex + 1] ?? selectedDate)}
                    disabled={selectedDateIndex >= uniqueDates.length - 1}
                    className="rounded p-1 text-text-secondary transition-all hover:bg-background-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Sonraki Gün"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <span className="text-xs text-text-secondary">
                    {dateGames.length} Karşılaşma ({selectedDate ? fmtDate(selectedDate) : "Tarih"})
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Upcoming games quick list */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-text-primary">
                      {selectedDate ? fmtDate(selectedDate) : ""} Karşılaşmaları
                    </p>
                  </div>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {dateGames.length === 0 ? (
                      <div className="rounded border border-border bg-background-secondary p-6 text-center text-xs text-text-secondary">
                        Bu tarih için henüz oynanmamış maç bulunamadı.
                      </div>
                    ) : (
                      dateGames.map((g: any) => {
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
                        Günün maçlarını filtrelemek için takım seçin
                      </div>
                    ) : filteredSchedule.length === 0 ? (
                      <div className="p-4 text-center text-xs text-text-secondary">
                        Bu tarihte {filterTeam1} için eşleşme bulunamadı
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

            {home && away && date && home !== away && date >= etDate(0) && date <= etDate(1) && (
              <div className="space-y-2">
                <InjuryReportStamp published={latestReport?.published_et} mode="latest" />
                {latestReport && <InjuryReportPanel report={latestReport} homeInfo={getTeamInfo(home)} awayInfo={getTeamInfo(away)} />}
                {latestReport && injuryChanges.length === 0 && (
                  <p className="text-xs text-text-secondary">Bugünkü raporlarda bu iki takımın oyuncularında durum değişikliği yok.</p>
                )}
                {injuryChanges.length > 0 && <InjuryChangesList changes={injuryChanges} />}
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
                  {loading && <RefreshCw size={13} className="animate-spin" />}
                  <span>
                    {loading ? "Hesaplanıyor..." : "Tahmin Modelini Çalıştır"}
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

          <InjuryReportStamp published={result.injury_report?.published_et} mode="used" />

          {/* Result Tabs Panel */}
          <section className="overflow-hidden rounded border border-border bg-background-primary">
            <div role="tablist" aria-label="Tahmin raporu bölümleri" className="grid grid-cols-3 border-b border-border bg-background-secondary">
              {([
                { id: "overview", label: "Genel Bakış", icon: LayoutDashboard, detail: "Maç senaryosu" },
                { id: "explanation", label: "Modelin Gerekçesi", icon: HelpCircle, detail: "Öne çıkan nedenler" },
                { id: "players", label: "Oyuncular ve Kadro", icon: UsersRound, detail: "Rotasyonlar" },
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
                    <InjuryReportPanel report={result.injury_report} homeInfo={homeInfo} awayInfo={awayInfo} />
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
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
