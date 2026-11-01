import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AlertTriangle,
  RefreshCw,
  Activity,
  ChevronDown,
  ChevronUp,
  Calendar,
  Search,
} from "lucide-react";

import TeamLogo from "./TeamLogo";
import { DatePicker, EmptyState, InlineError, Input, Skeleton } from "./common";
import {
  normalizeGameFullPrediction,
  predictGameFull,
} from "../api/predictions";
import { loadArchivedGameIndex } from "../lib/archiveData";
import { loadPrivateApiFresh } from "../lib/dataCache";
import { NBA_TEAMS } from "../lib/nbaTeams";
import { CURRENT_SEASON, MIN_PREDICTION_DATE } from "../lib/constants";
import { useLanguage } from "../context/LanguageContext";

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
  const { t, language, formatDate } = useLanguage();
  const tr = language === "tr";
  const [home, setHome] = useState(initialGame?.home || "");
  const [away, setAway] = useState(initialGame?.away || "");
  const [date, setDate] = useState(initialGame?.date || "");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seasonGames, setSeasonGames] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [teamQuery, setTeamQuery] = useState("");
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
        if (active) setDataError(t.predictions.scheduleLoadError);
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

  const todayStr = new Date().toISOString().slice(0, 10);

  const submitGame = useCallback(
    async (h: string, a: string, d: string) => {
      setError(null);
      setLoading(true);
      try {
        if (!h || !a) throw new Error(t.predictions.selectTeamsError);
        if (h === a) throw new Error(t.predictions.sameTeamError);
        if (!d) throw new Error(language === "tr" ? "Lütfen maç tarihini seçin." : "Please select a game date.");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(language === "tr" ? "Geçersiz tarih formatı (YYYY-MM-DD olmalı)." : "Invalid date format (must be YYYY-MM-DD).");
        if (d < MIN_PREDICTION_DATE) {
          throw new Error(
            t.predictions.dateOutOfRange.replace("{season}", CURRENT_SEASON)
          );
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
        setError(e.message || (language === "tr" ? "Bilinmeyen bir hata oluştu." : "An unknown error occurred."));
      } finally {
        setLoading(false);
      }
    },
    [t, language]
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
    const q = teamQuery.trim().toLowerCase();
    if (!q) return true;
    return [g.HOME_TEAM_ABBREVIATION, g.AWAY_TEAM_ABBREVIATION].some((abbr: string) => {
      const info = getTeamInfo(teamAbbr(abbr));
      return abbr?.toLowerCase().includes(q) || info.name.toLowerCase().includes(q);
    });
  });

  const homeInfo = getTeamInfo(home);
  const awayInfo = getTeamInfo(away);

  const winnerAbbr = result?.win_probability?.predicted_winner || result?.predicted_winner;
  const winnerInfo = winnerAbbr ? getTeamInfo(winnerAbbr) : null;

  if (loadingData) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Tahmin motoru yükleniyor">
        <Skeleton className="h-24 w-full rounded" />
        <Skeleton className="h-64 w-full rounded" />
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
      <div className="overflow-hidden rounded border border-border bg-background-primary">
        <button
          id="selector-toggle"
          type="button"
          aria-expanded={selectorOpen}
          onClick={() => setSelectorOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-background-secondary/50 cursor-pointer"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Calendar size={16} className="shrink-0 text-text-secondary" />
            <div className="min-w-0">
              <p className="text-xs text-text-muted">{tr ? "Karşılaşma seçimi" : "Select matchup"}</p>
              {home && away && date ? (
                <p className="mt-0.5 truncate text-sm font-semibold text-text-primary">
                  {awayInfo.name} @ {homeInfo.name} · {formatDate(date)}
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-text-secondary">{tr ? "Henüz maç seçilmedi" : "No game selected"}</p>
              )}
            </div>
          </div>
          {selectorOpen ? <ChevronUp size={16} className="shrink-0 text-text-secondary" /> : <ChevronDown size={16} className="shrink-0 text-text-secondary" />}
        </button>

        {selectorOpen && (
          <div className="space-y-4 border-t border-border-light px-5 pb-5 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DatePicker
                dates={uniqueDates}
                value={selectedDate}
                onChange={setSelectedDate}
                todayStr={todayStr}
                formatDate={formatDate}
                order="asc"
                className="shrink-0"
              />
              <div className="w-full sm:w-64">
                <Input
                  type="text"
                  autoComplete="off"
                  aria-label={tr ? "Takım ara" : "Search team"}
                  placeholder={tr ? "Takım ara" : "Search team"}
                  leftIcon={<Search size={16} strokeWidth={1.5} />}
                  value={teamQuery}
                  onChange={(e) => setTeamQuery(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            {filteredSchedule.length === 0 ? (
              <div className="rounded border border-border bg-background-secondary p-6 text-center text-xs text-text-secondary">
                {teamQuery
                  ? (tr ? "Aramaya uyan maç bulunamadı." : "No games match your search.")
                  : (tr ? "Bu tarih için henüz oynanmamış maç bulunamadı." : "No upcoming games found for this date.")}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {filteredSchedule.map((g: any) => {
                  const isSelected = home === g.HOME_TEAM_ABBREVIATION && away === g.AWAY_TEAM_ABBREVIATION && date === g.GAME_DATE;
                  const h = getTeamInfo(teamAbbr(g.HOME_TEAM_ABBREVIATION));
                  const a = getTeamInfo(teamAbbr(g.AWAY_TEAM_ABBREVIATION));
                  return (
                    <button
                      key={g.GAME_ID}
                      type="button"
                      onClick={() => handleSelectGame(g)}
                      aria-pressed={isSelected}
                      className={`flex items-center justify-between gap-3 rounded border p-3 text-left transition-colors cursor-pointer ${
                        isSelected
                          ? "border-primary bg-background-secondary"
                          : "border-border bg-background-primary hover:border-card-border-hover"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex shrink-0 items-center gap-1">
                          <TeamLogo abbr={a.abbr} name={a.name} size={28} />
                          <TeamLogo abbr={h.abbr} name={h.name} size={28} />
                        </div>
                        <span className="truncate text-sm font-semibold text-text-primary">
                          {a.name} @ {h.name}
                        </span>
                      </div>
                      {g.SEASON_TYPE && g.SEASON_TYPE !== "Regular Season" && (
                        <span className="shrink-0 text-xs text-text-muted">{g.SEASON_TYPE}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {home && away && date && home !== away && date >= etDate(0) && date <= etDate(1) && (
              <div className="space-y-2">
                <InjuryReportStamp published={latestReport?.published_et} mode="latest" />
                {latestReport && <InjuryReportPanel report={latestReport} homeInfo={getTeamInfo(home)} awayInfo={getTeamInfo(away)} />}
                {latestReport && injuryChanges.length === 0 && (
                  <p className="text-xs text-text-secondary">
                    {tr
                      ? "Bugünkü raporlarda bu iki takımın oyuncularında durum değişikliği yok."
                      : "No status changes for these teams in today's reports."}
                  </p>
                )}
                {injuryChanges.length > 0 && <InjuryChangesList changes={injuryChanges} />}
              </div>
            )}

            {home && away && date && (
              <button
                type="button"
                onClick={submit}
                disabled={loading}
                id="run-prediction-main-btn"
                className="flex h-9 items-center gap-2 rounded bg-primary px-5 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
              >
                {loading && <RefreshCw size={16} className="animate-spin" />}
                <span>
                  {loading
                    ? (tr ? "Hesaplanıyor..." : "Calculating...")
                    : result ? (tr ? "Tahmini Yenile" : "Rerun Prediction") : (tr ? "Tahmin Üret" : "Run Prediction")}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <InlineError
          title={tr ? "Tahmin oluşturulamadı" : "Prediction failed"}
          message={error}
          onRetry={home && away && date ? submit : undefined}
        />
      )}

      {loading && (
        <div className="space-y-5" aria-busy="true" aria-label="Tahmin hazırlanıyor">
          <Skeleton className="h-64 w-full rounded" />
          <Skeleton className="h-96 w-full rounded" />
        </div>
      )}

      {!loading && !error && (!home || !away || !date) && (
        <EmptyState
          icon={<Activity size={24} strokeWidth={1.5} />}
          title={tr ? "Karşılaşma seç" : "Select a matchup"}
          description={tr ? "Model simülasyonunu çalıştırmak için yukarıdaki fikstürden bir maç seç." : "Pick a game from the schedule above to run the model."}
        />
      )}

      {/* RESULT SECTIONS */}
      {result && !loading && (
        <div className="space-y-5">
          {/* Partial failure warnings */}
          {(result.win_probability?.error || result.score_prediction?.error || result.score_prediction?.confidence_warning) && (
            <div className="p-4 bg-status-warning/10 border border-status-warning/20 rounded text-xs text-status-warning font-medium space-y-1">
              {result.win_probability?.error && (
                <p className="flex items-center gap-1.5 m-0">
                  <AlertTriangle size={16} />
                  Kazanma olasılığı modeli: {result.win_probability.error}
                </p>
              )}
              {result.score_prediction?.error && (
                <p className="flex items-center gap-1.5 m-0">
                  <AlertTriangle size={16} />
                  Skor Tahmini Modeli: {result.score_prediction.error}
                </p>
              )}
              {result.score_prediction?.confidence_warning && (
                <p className="flex items-center gap-1.5 m-0">
                  <AlertTriangle size={16} />
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
            <div role="tablist" aria-label={tr ? "Tahmin raporu bölümleri" : "Prediction report sections"} className="flex border-b border-border bg-background-primary px-3 sm:px-4">
              {([
                { id: "overview", label: tr ? "Genel Bakış" : "Overview" },
                { id: "explanation", label: tr ? "Gerekçe" : "Rationale" },
                { id: "players", label: tr ? "Oyuncular" : "Players" },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeResultTab === tab.id}
                  onClick={() => setActiveResultTab(tab.id)}
                  className={`border-b-2 px-3 py-3 text-xs font-medium transition-colors sm:text-sm cursor-pointer ${
                    activeResultTab === tab.id
                      ? "border-primary font-semibold text-text-primary"
                      : "border-transparent text-text-secondary hover:border-border hover:text-text-primary"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
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
                    <PlayerSpotlight
                      players={result.player_predictions}
                      homeInfo={homeInfo}
                      awayInfo={awayInfo}
                      gameDate={date}
                      season={CURRENT_SEASON}
                    />
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
