import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AlertTriangle,
  Activity,
  ChevronDown,
  ChevronUp,
  Calendar,
  Search,
} from "lucide-react";

import TeamLogo from "./TeamLogo";
import { Button, DatePicker, EmptyState, InlineError, Input, Skeleton } from "./common";
import {
  normalizeGameFullPrediction,
  predictGameFull,
  type NormalizedPrediction,
} from "../api/predictions";
import type { GameFeedRow } from "../types/gameFeed";
import { loadArchivedGameIndex } from "../lib/archiveData";
import { loadPrivateApiFresh } from "../lib/dataCache";
import { NBA_TEAMS, getTeamShortName } from "../lib/nbaTeams";
import { CURRENT_SEASON, MIN_PREDICTION_DATE } from "../lib/constants";
import { useLanguage } from "../context/useLanguage";

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

/** Eastern-time calendar date (NBA schedule & injury reports follow America/New_York). */
const etDate = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

export default function NbaPrediction({ initialGame, onClearInitialGame }: NbaPredictionProps = {}) {
  const { t, language, formatDate } = useLanguage();
  const tr = language === "tr";
  const [home, setHome] = useState(initialGame?.home || "");
  const [away, setAway] = useState(initialGame?.away || "");
  const [date, setDate] = useState(initialGame?.date || "");
  const [result, setResult] = useState<NormalizedPrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seasonGames, setSeasonGames] = useState<GameFeedRow[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(initialGame?.date || "");
  const [initialTargetDate] = useState<string | undefined>(initialGame?.date);
  const [loadingData, setLoadingData] = useState(true);
  const [dataLoadFailed, setDataLoadFailed] = useState(false);
  const dataError = dataLoadFailed ? t.predictions.scheduleLoadError : null;

  const [teamQuery, setTeamQuery] = useState("");
  const [injuryState, setInjuryState] = useState<{
    key: string;
    report: InjuryReportSummary | null;
    changes: InjuryChange[];
  } | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(true);
  const [activeResultTab, setActiveResultTab] = useState<"overview" | "explanation" | "players">("overview");

  useEffect(() => {
    let active = true;
    loadArchivedGameIndex(CURRENT_SEASON)
      .then((scheduleGames) => {
        if (!active) return;
        setSeasonGames(scheduleGames);
        setDataLoadFailed(false);

        const nbaToday = etDate(0);
        const dates = Array.from(
          new Set(scheduleGames.map((g) => g.GAME_DATE?.slice(0, 10)).filter(Boolean))
        ).sort();

        let initialDate = initialTargetDate;
        if (!initialDate || !dates.includes(initialDate)) {
          initialDate = dates.find((d) => d >= nbaToday) || dates[dates.length - 1] || "";
        }
        setSelectedDate(initialDate);
      })
      .catch((err: unknown) => {
        console.error("Error loading schedule games:", err);
        if (active) setDataLoadFailed(true);
      })
      .finally(() => {
        if (active) setLoadingData(false);
      });
    return () => {
      active = false;
    };
  }, [initialTargetDate]);

  const uniqueDates = useMemo(() => {
    const isCompletedGame = (g: GameFeedRow) => {
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

  const dateGames = useMemo(() => {
    if (!selectedDate) return [];
    const isCompletedGame = (g: GameFeedRow) => {
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

  const injuryKey =
    home && away && home !== away && date && date >= etDate(0) && date <= etDate(1)
      ? `${home}|${away}|${date}`
      : null;

  useEffect(() => {
    if (!injuryKey) return;
    let active = true;
    loadPrivateApiFresh<{ report: InjuryReportSummary | null; changes: InjuryChange[] }>(
      `/frontend-data-api/injury-changes?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}&date=${encodeURIComponent(date)}`
    )
      .then((r) => {
        if (!active) return;
        setInjuryState({ key: injuryKey, report: r.report, changes: r.changes ?? [] });
      })
      .catch(() => {
        if (!active) return;
        setInjuryState({ key: injuryKey, report: null, changes: [] });
      });
    return () => {
      active = false;
    };
  }, [injuryKey, home, away, date]);

  const injuryChanges = injuryKey && injuryState?.key === injuryKey ? injuryState.changes : [];
  const latestReport = injuryKey && injuryState?.key === injuryKey ? injuryState.report : null;

  const todayStr = etDate(0);

  const submitGame = useCallback(
    async (h: string, a: string, d: string) => {
      setError(null);
      setLoading(true);
      try {
        if (!h || !a) throw new Error(t.predictions.selectTeamsError);
        if (h === a) throw new Error(t.predictions.sameTeamError);
        if (!d) throw new Error(tr ? "Lütfen maç tarihini seçin." : "Please select a game date.");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          throw new Error(tr ? "Geçersiz tarih formatı (YYYY-MM-DD olmalı)." : "Invalid date format (must be YYYY-MM-DD).");
        }
        if (d < MIN_PREDICTION_DATE) {
          throw new Error(t.predictions.dateOutOfRange.replace("{season}", CURRENT_SEASON));
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
      } catch (e: unknown) {
        const msg = e instanceof Error && e.message ? e.message : "";
        setError(msg || (tr ? "Bilinmeyen bir hata oluştu." : "An unknown error occurred."));
      } finally {
        setLoading(false);
      }
    },
    [t, tr]
  );

  useEffect(() => {
    if (initialGame?.home && initialGame?.away && initialGame?.date) {
      onClearInitialGame?.();
    }
  }, [initialGame, onClearInitialGame]);

  const getTeamInfo = (abbr: string) =>
    NBA_TEAMS.find((team) => team.abbr === abbr) || { abbr, name: abbr, color: NBA_TEAMS[0]?.color || "" };

  const teamAbbr = (abbr: string) => abbr?.toUpperCase?.() || "";

  const handleSelectGame = (game: GameFeedRow) => {
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

  const filteredSchedule = dateGames.filter((g) => {
    const q = teamQuery.trim().toLowerCase();
    if (!q) return true;
    return [g.HOME_TEAM_ABBREVIATION, g.AWAY_TEAM_ABBREVIATION].some((abbr) => {
      const info = getTeamInfo(teamAbbr(abbr));
      return abbr?.toLowerCase().includes(q) || info.name.toLowerCase().includes(q);
    });
  });

  const homeInfo = getTeamInfo(home);
  const awayInfo = getTeamInfo(away);

  const winnerAbbr = result?.win_probability?.predicted_winner || result?.predicted_winner;
  const winnerInfo = winnerAbbr ? getTeamInfo(winnerAbbr) : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-text-primary sm:text-xl">{t.menu.predictions}</h1>
        <p className="mt-0.5 text-xs text-text-secondary">
          {tr
            ? "Oynanmamış maçlar için kazanma olasılığı, skor farkı ve oyuncu projeksiyonları üretin."
            : "Generate win probabilities, score projections, and player stat lines for upcoming games."}
        </p>
      </div>

      {loadingData ? (
        <div className="space-y-5" aria-busy="true" aria-label={t.predictions.loadingEngine}>
          <Skeleton className="h-24 w-full rounded" />
          <Skeleton className="h-64 w-full rounded" />
        </div>
      ) : (
        <div className="space-y-5">
          {dataError && (
            <div className="flex items-start gap-3 rounded border border-status-warning/20 bg-status-warning/10 p-4 text-status-warning">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p className="m-0 text-xs font-medium">{dataError}</p>
            </div>
          )}

          {/* SECTION 1: SELECTION PANEL */}
          <div className="overflow-hidden rounded border border-border bg-background-primary">
            <button
              id="selector-toggle"
              type="button"
              aria-expanded={selectorOpen}
              onClick={() => setSelectorOpen((v) => !v)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-background-secondary/50"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Calendar size={16} className="shrink-0 text-text-secondary" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs text-text-muted">{tr ? "Karşılaşma seçimi" : "Select matchup"}</p>
                  {home && away && date ? (
                    <p className="mt-0.5 truncate text-sm font-semibold text-text-primary">
                      {awayInfo.name} @ {homeInfo.name} · <span className="tabular-nums">{formatDate(date)}</span>
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm text-text-secondary">
                      {tr ? "Henüz maç seçilmedi" : "No game selected"}
                    </p>
                  )}
                </div>
              </div>
              {selectorOpen ? (
                <ChevronUp size={16} className="shrink-0 text-text-secondary" aria-hidden="true" />
              ) : (
                <ChevronDown size={16} className="shrink-0 text-text-secondary" aria-hidden="true" />
              )}
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
                      ? tr
                        ? "Aramaya uyan maç bulunamadı."
                        : "No games match your search."
                      : tr
                        ? "Bu tarih için henüz oynanmamış maç bulunamadı."
                        : "No upcoming games found for this date."}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {filteredSchedule.map((g) => {
                      const isSelected =
                        home === g.HOME_TEAM_ABBREVIATION &&
                        away === g.AWAY_TEAM_ABBREVIATION &&
                        date === g.GAME_DATE;
                      const h = getTeamInfo(teamAbbr(g.HOME_TEAM_ABBREVIATION));
                      const a = getTeamInfo(teamAbbr(g.AWAY_TEAM_ABBREVIATION));
                      return (
                        <button
                          key={g.GAME_ID}
                          type="button"
                          onClick={() => handleSelectGame(g)}
                          aria-pressed={isSelected}
                          className={`flex cursor-pointer items-center justify-between gap-3 rounded border p-3 text-left transition-colors ${
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
                              {getTeamShortName(a.abbr, a.name)} @ {getTeamShortName(h.abbr, h.name)}
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

                {home && away && date && (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      variant="primary"
                      size="md"
                      onClick={submit}
                      isLoading={loading}
                      id="run-prediction-main-btn"
                    >
                      {loading
                        ? tr
                          ? "Hesaplanıyor..."
                          : "Calculating..."
                        : result
                          ? tr
                            ? "Tahmini Yenile"
                            : "Rerun Prediction"
                          : t.predictions.generatePrediction}
                    </Button>
                  </div>
                )}

                {home && away && date && home !== away && date >= etDate(0) && date <= etDate(1) && (
                  <div className="space-y-2">
                    <InjuryReportStamp published={latestReport?.published_et} mode="latest" />
                    {latestReport && (
                      <InjuryReportPanel
                        report={latestReport}
                        homeInfo={getTeamInfo(home)}
                        awayInfo={getTeamInfo(away)}
                      />
                    )}
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
            <div className="space-y-5" aria-busy="true" aria-label={tr ? "Tahmin hazırlanıyor" : "Running prediction"}>
              <Skeleton className="h-64 w-full rounded" />
              <Skeleton className="h-96 w-full rounded" />
            </div>
          )}

          {!loading && !error && (!home || !away || !date) && (
            <EmptyState
              icon={<Activity size={24} strokeWidth={1.5} />}
              title={tr ? "Karşılaşma seç" : "Select a matchup"}
              description={
                tr
                  ? "Model simülasyonunu çalıştırmak için yukarıdaki fikstürden bir maç seç."
                  : "Pick a game from the schedule above to run the model."
              }
            />
          )}

          {/* RESULT SECTIONS */}
          {result && !loading && (
            <div className="space-y-5">
              {(result.win_probability?.error ||
                result.score_prediction?.error ||
                result.score_prediction?.confidence_warning) && (
                <div className="space-y-1 rounded border border-status-warning/20 bg-status-warning/10 p-4 text-xs font-medium text-status-warning">
                  {result.win_probability?.error && (
                    <p className="m-0 flex items-center gap-1.5">
                      <AlertTriangle size={16} aria-hidden="true" />
                      {t.predictions.winProbability}: {result.win_probability.error}
                    </p>
                  )}
                  {result.score_prediction?.error && (
                    <p className="m-0 flex items-center gap-1.5">
                      <AlertTriangle size={16} aria-hidden="true" />
                      {t.predictions.expectedScore}: {result.score_prediction.error}
                    </p>
                  )}
                  {result.score_prediction?.confidence_warning && (
                    <p className="m-0 flex items-center gap-1.5">
                      <AlertTriangle size={16} aria-hidden="true" />
                      {tr ? "Tahmin Uyarısı: " : "Warning: "}
                      {result.score_prediction.confidence_warning}
                    </p>
                  )}
                </div>
              )}

              {(result.is_preseason ||
                result.season_type === "Pre Season" ||
                result.season_type === "Preseason") && (
                <div className="flex items-center gap-3 rounded border border-border bg-background-secondary p-4 text-xs text-text-primary">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-background-primary text-xs font-semibold text-primary">
                    PRE
                  </div>
                  <div className="space-y-0.5">
                    <p className="m-0 text-xs font-semibold text-text-primary">
                      {tr ? "Hazırlık Maçı Kalibrasyonu Devrede" : "Pre-Season Calibration Active"}
                    </p>
                    <p className="m-0 text-xs leading-relaxed text-text-secondary">
                      {t.predictions.preseasonNote}
                    </p>
                  </div>
                </div>
              )}

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

              <section className="overflow-hidden rounded border border-border bg-background-primary">
                <div
                  role="tablist"
                  aria-label={tr ? "Tahmin raporu bölümleri" : "Prediction report sections"}
                  className="flex border-b border-border bg-background-primary px-3 sm:px-4"
                >
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
                      className={`cursor-pointer border-b-2 px-3 py-3 text-xs font-medium transition-colors sm:text-sm ${
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
                        <MatchupTacticalHub
                          result={result}
                          homeInfo={homeInfo}
                          awayInfo={awayInfo}
                          winnerInfo={winnerInfo}
                        />
                      )}
                      <div className="rounded border border-border bg-background-secondary p-3.5 text-xs leading-relaxed text-text-secondary">
                        {t.predictions.disclaimerText}
                        {result.final_display_recommendation?.warning && (
                          <span className="mt-1 block font-medium text-status-warning">
                            {result.final_display_recommendation.warning}
                          </span>
                        )}
                      </div>
                    </>
                  )}

                  {activeResultTab === "explanation" && (
                    <ModelExplanationSection result={result} homeInfo={homeInfo} awayInfo={awayInfo} />
                  )}

                  {activeResultTab === "players" &&
                    (result.player_predictions && !result.player_predictions.error ? (
                      <div className="space-y-5">
                        <InjuryReportPanel
                          report={result.injury_report}
                          homeInfo={homeInfo}
                          awayInfo={awayInfo}
                        />
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
                        {tr
                          ? "Bu tahminde oyuncu projeksiyonları oluşturulamadı."
                          : "Player projections could not be generated for this prediction."}
                      </div>
                    ))}
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
