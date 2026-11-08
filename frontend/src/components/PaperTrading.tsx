import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ClipboardCheck } from "lucide-react";
import { Card, DatePicker, EmptyState, InlineError, Skeleton } from "./common";
import TeamLogo from "./TeamLogo";
import { TEAM_NAME_BY_ABBR } from "../lib/nbaTeams";
import { CalibrationChart, RollingAccuracyChart } from "./paper/PaperCharts";
import { BaselineComparison, VersionTable, type Evaluation } from "./paper/PaperBaselines";
import BacktestCalibration from "./paper/BacktestCalibration";
import PublishSnapshotButton from "./PublishSnapshotButton";
import { loadPrivateApiFresh } from "../lib/dataCache";
import { CURRENT_SEASON } from "../lib/constants";
import { fill } from "../lib/fill";
import { useLanguage } from "../context/LanguageContext";

type PaperGame = {
  game_id: string;
  game_date: string;
  home_team: string;
  away_team: string;
  model_version: string;
  home_win_probability: number;
  predicted_winner: string;
  predicted_home_score: number;
  predicted_away_score: number;
  valid: boolean;
  origin?: "live" | "backfill";
  status: "final" | "pending";
  actual_home_score?: number;
  actual_away_score?: number;
  actual_winner?: string;
  correct?: boolean;
  predicted_margin?: number;
  actual_margin?: number;
  predicted_total?: number;
  actual_total?: number;
  injury_report?: {
    published_et: string;
    submitted: Record<string, boolean>;
    players: { team: string; player_name: string; status: string; reason: string }[];
  };
};

type Band = { label: string; games: number; accuracy: number; mean_confidence: number };

type Summary = {
  games_logged: number;
  games_pending: number;
  games_graded: number;
  backfilled_graded: number;
  invalid_late: number;
  accuracy: number | null;
  brier: number | null;
  log_loss: number | null;
  home_baseline_accuracy: number | null;
  mae_margin: number | null;
  mae_total: number | null;
  bands: Band[];
};

type Report = { season: string; summary: Summary; evaluation?: Evaluation; games: PaperGame[] };

type SectionTab = "all" | "games" | "versions" | "calibration";
type GameStatusFilter = "all" | "correct" | "wrong" | "pending";

const teamName = (abbr: string) => TEAM_NAME_BY_ABBR[abbr as keyof typeof TEAM_NAME_BY_ABBR] || abbr;
const pct = (v: number | null, digits = 1) => (v == null ? "-" : `${(v * 100).toFixed(digits)}%`);
const num = (v: number | null | undefined, digits = 2) => (v == null ? "-" : v.toFixed(digits));
const signed = (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1));
const injuryTitle = (g: PaperGame) =>
  g.injury_report?.players.map((p) => `${p.team} ${p.player_name}: ${p.status} (${p.reason})`).join("\n") ?? "";

function KpiCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "positive" | "negative";
}) {
  const valueColor =
    tone === "positive"
      ? "text-status-success"
      : tone === "negative"
        ? "text-status-error"
        : "text-text-primary";

  return (
    <Card padding="sm" className="flex flex-col justify-between">
      <div>
        <dt className="text-xs font-medium text-text-secondary">{label}</dt>
        <dd className={`mt-1 text-xl font-semibold tabular-nums sm:text-2xl ${valueColor}`}>{value}</dd>
      </div>
      <p className="mt-1.5 text-xs leading-snug text-text-secondary">{hint}</p>
    </Card>
  );
}

function MatchupCell({ game }: { game: PaperGame }) {
  const isFinal = game.status === "final";
  const awayWon = isFinal && game.actual_winner === game.away_team;
  const homeWon = isFinal && game.actual_winner === game.home_team;

  const row = (abbr: string, won: boolean) => (
    <div className="flex items-center gap-2">
      <TeamLogo abbr={abbr} name={teamName(abbr)} size={22} className="shrink-0" />
      <span
        className={`text-sm ${!isFinal
            ? "font-medium text-text-primary"
            : won
              ? "font-semibold text-text-primary"
              : "font-normal text-text-secondary"
          }`}
      >
        {teamName(abbr)}
      </span>
    </div>
  );

  return (
    <div className="space-y-1.5">
      {row(game.away_team, awayWon)}
      {row(game.home_team, homeWon)}
    </div>
  );
}

export default function PaperTrading() {
  const { t, language, formatDate } = useLanguage();
  const tr = language === "tr";
  const p = t.paper;
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sectionTab, setSectionTab] = useState<SectionTab>("all");
  const [gameFilter, setGameFilter] = useState<GameStatusFilter>("all");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    loadPrivateApiFresh<Report>(`/frontend-data-api/paper-trading?season=${CURRENT_SEASON}`)
      .then(setReport)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const dates = useMemo(
    () => Array.from(new Set((report?.games ?? []).map((g) => g.game_date))).sort(),
    [report]
  );
  const activeDate = selectedDate && dates.includes(selectedDate) ? selectedDate : dates[dates.length - 1] ?? null;

  const dayGames = useMemo(
    () => (report?.games ?? []).filter((g) => g.game_date === activeDate).sort((a, b) => a.game_id.localeCompare(b.game_id)),
    [report, activeDate]
  );

  const filteredDayGames = useMemo(() => {
    if (gameFilter === "all") return dayGames;
    if (gameFilter === "pending") return dayGames.filter((g) => g.status === "pending");
    if (gameFilter === "correct") return dayGames.filter((g) => g.status === "final" && g.valid && g.correct === true);
    return dayGames.filter((g) => g.status === "final" && g.valid && g.correct === false);
  }, [dayGames, gameFilter]);

  const dateCounts = useMemo(() => {
    const map: Record<string, number> = {};
    (report?.games ?? []).forEach((g) => {
      map[g.game_date] = (map[g.game_date] ?? 0) + 1;
    });
    return map;
  }, [report]);

  const dayGraded = dayGames.filter((g) => g.status === "final" && g.valid);
  const dayCorrect = dayGraded.filter((g) => g.correct).length;

  const injurySummary = (g: PaperGame) => {
    const r = g.injury_report;
    if (!r) return p.noInjuryReport;
    const out = r.players.filter((x) => x.status === "Out").length;
    const missing = Object.entries(r.submitted).filter(([, ok]) => !ok).map(([team]) => team);
    const time = r.published_et.split(" ").slice(1).join(" ");
    const base = fill(p.injurySummary, { time, out, uncertain: r.players.length - out });
    return missing.length ? `${base}, ${fill(p.injuryNotFiled, { teams: missing.join("/") })}` : base;
  };

  if (error) {
    return <InlineError title={t.common.loadFailed} message={error} onRetry={load} />;
  }

  if (loading || !report) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height={96} />
          ))}
        </div>
        <Skeleton height={280} />
        <Skeleton height={320} />
      </div>
    );
  }

  const { summary: s, games } = report;

  if (games.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-text-primary">{p.title}</h1>
          <PublishSnapshotButton />
        </div>
        <EmptyState icon={<ClipboardCheck size={32} strokeWidth={1.5} />} title={p.emptyTitle} description={p.emptyBody} />
      </div>
    );
  }

  const edge = s.accuracy != null && s.home_baseline_accuracy != null ? s.accuracy - s.home_baseline_accuracy : null;

  const resultBadges = (g: PaperGame) => {
    if (!g.valid) {
      return (
        <span className="inline-flex rounded-sm bg-status-warning/10 px-2 py-0.5 text-xs font-semibold text-status-warning">
          {p.resultLate}
        </span>
      );
    }
    if (g.status === "pending") {
      return (
        <span className="inline-flex rounded-sm bg-background-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
          {p.resultPending}
        </span>
      );
    }
    return (
      <div className="flex flex-col items-start gap-1">
        <span
          className={`inline-flex rounded-sm px-2 py-0.5 text-xs font-semibold ${g.correct ? "bg-status-success/10 text-status-success" : "bg-status-error/10 text-status-error"
            }`}
        >
          {g.correct ? p.resultCorrect : p.resultWrong}
        </span>
        {g.origin === "backfill" && (
          <span className="text-xs text-text-secondary">{p.resultBackfill}</span>
        )}
      </div>
    );
  };

  const sectionTabs: { id: SectionTab; label: string }[] = [
    { id: "all", label: tr ? "Tüm Görünüm" : "All Sections" },
    { id: "games", label: tr ? "Günlük Tahminler" : "Daily Predictions" },
    { id: "versions", label: tr ? "Sürüm ve Baseline" : "Versions & Baselines" },
    { id: "calibration", label: tr ? "Kalibrasyon ve Trend" : "Calibration & Trends" },
  ];

  const showGames = sectionTab === "all" || sectionTab === "games";
  const showVersions = sectionTab === "all" || sectionTab === "versions";
  const showCalibration = sectionTab === "all" || sectionTab === "calibration";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">{p.title}</h1>
          <p className="mt-0.5 text-xs text-text-secondary sm:text-sm">{fill(p.subtitle, { season: report.season })}</p>
        </div>
        <PublishSnapshotButton />
      </div>

      {/* Collapsible How It Works */}
      <details className="group rounded border border-border bg-background-primary">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary sm:text-sm">
          <span>{p.howTitle}</span>
          <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid grid-cols-1 gap-4 border-t border-border-light px-4 py-3.5 md:grid-cols-3">
          <div>
            <h3 className="text-xs font-semibold text-text-primary">{p.howFrozenTitle}</h3>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">{p.howFrozen}</p>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-text-primary">{p.howGradedTitle}</h3>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">{p.howGraded}</p>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-text-primary">{p.howLabelsTitle}</h3>
            <ul className="mt-1 space-y-1 text-xs leading-relaxed text-text-secondary">
              <li><span className="font-semibold text-status-warning">{p.resultLate}:</span> {p.howLate}</li>
              <li><span className="font-semibold text-text-primary">{p.resultBackfill}:</span> {p.howBackfill}</li>
            </ul>
          </div>
        </div>
      </details>

      {/* Season KPI Strip */}
      <section aria-labelledby="paper-season-summary" className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="paper-season-summary" className="text-sm font-semibold text-text-primary">{p.seasonSummary}</h2>
          {(s.backfilled_graded > 0 || s.invalid_late > 0) && (
            <span className="text-xs text-text-secondary">
              {fill(p.gamesGradedExtra, { backfill: s.backfilled_graded, late: s.invalid_late })}
            </span>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label={p.accuracy}
            value={pct(s.accuracy)}
            hint={
              s.games_graded
                ? fill(p.accuracyHint, { correct: Math.round((s.accuracy ?? 0) * s.games_graded), graded: s.games_graded })
                : p.accuracyNone
            }
          />
          <KpiCard label={p.homeBaseline} value={pct(s.home_baseline_accuracy)} hint={p.homeBaselineHint} />
          <KpiCard
            label={p.edge}
            value={edge == null ? "-" : `${edge >= 0 ? "+" : ""}${(edge * 100).toFixed(1)}%`}
            hint={p.edgeHint}
            tone={edge == null ? "default" : edge > 0 ? "positive" : edge < 0 ? "negative" : "default"}
          />
          <KpiCard
            label={p.gamesLogged}
            value={`${s.games_logged}`}
            hint={fill(p.gamesLoggedHint, { graded: s.games_graded, pending: s.games_pending })}
          />
          <KpiCard label={p.brier} value={num(s.brier, 3)} hint={p.brierHint} />
          <KpiCard label={p.logLoss} value={num(s.log_loss, 3)} hint={p.logLossHint} />
        </dl>
      </section>

      {/* Section Navigation Tabs */}
      <div
        role="tablist"
        aria-label={tr ? "Model takip bölümleri" : "Paper trading sections"}
        className="flex flex-wrap items-center gap-6 border-b border-border"
      >
        {sectionTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={sectionTab === tab.id}
            onClick={() => setSectionTab(tab.id)}
            className={`-mb-px cursor-pointer border-b-2 pb-2.5 text-sm font-medium transition-colors ${sectionTab === tab.id
                ? "border-primary font-semibold text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. Daily Predictions & Results Section */}
      {showGames && (
        <section className="space-y-3" aria-label={tr ? "Günlük tahminler" : "Daily predictions"}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <DatePicker
                dates={dates}
                value={activeDate ?? ""}
                onChange={setSelectedDate}
                counts={dateCounts}
                formatDate={formatDate}
              />
              <span className="rounded-sm bg-background-tertiary px-2.5 py-1 text-xs font-medium tabular-nums text-text-primary">
                {fill(p.dayGames, { n: dayGames.length })}
                {dayGraded.length > 0 &&
                  ` · ${fill(p.dayCorrect, { correct: dayCorrect, graded: dayGraded.length })} (${pct(dayCorrect / dayGraded.length, 0)})`}
              </span>
            </div>

            {/* Status Filter Pills */}
            <div className="inline-flex items-center rounded border border-border bg-background-tertiary p-0.5 text-xs font-medium">
              {(
                [
                  ["all", tr ? `Tümü (${dayGames.length})` : `All (${dayGames.length})`],
                  ["correct", `${p.resultCorrect} (${dayCorrect})`],
                  ["wrong", `${p.resultWrong} (${dayGraded.length - dayCorrect})`],
                  ["pending", `${p.resultPending} (${dayGames.filter((g) => g.status === "pending").length})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setGameFilter(id)}
                  className={`cursor-pointer rounded-sm px-2.5 py-1 tabular-nums transition-colors ${gameFilter === id
                      ? "bg-background-primary font-semibold text-text-primary"
                      : "text-text-secondary hover:text-text-primary"
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <Card padding="none" className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold tabular-nums text-text-primary">
                {activeDate ? formatDate(activeDate) : ""}
              </h3>
              <span className="text-xs tabular-nums text-text-secondary">
                {fill(p.winnerTableTitle, { date: activeDate ?? "", logged: s.games_logged, pending: s.games_pending })}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-background-tertiary/60 text-xs font-semibold text-text-secondary">
                  <tr>
                    <th scope="col" className="px-4 py-2.5">{p.colGame}</th>
                    <th scope="col" className="px-4 py-2.5">{p.colPrediction}</th>
                    <th scope="col" className="px-4 py-2.5">{p.colFinal}</th>
                    <th scope="col" className="px-4 py-2.5">{p.colResult}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {filteredDayGames.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-xs text-text-secondary">
                        {tr ? "Seçili filtreyle eşleşen maç bulunamadı." : "No games match the selected filter."}
                      </td>
                    </tr>
                  ) : (
                    filteredDayGames.map((g) => {
                      const conf = Math.max(g.home_win_probability, 1 - g.home_win_probability);
                      return (
                        <tr key={g.game_id} className="transition-colors hover:bg-background-tertiary/40">
                          <td className="whitespace-nowrap px-4 py-3 pr-6">
                            <div className="flex items-center gap-3">
                              <MatchupCell game={g} />
                              <span className="rounded-sm bg-background-tertiary px-1.5 py-0.5 text-xs font-medium tabular-nums text-text-secondary">
                                {g.model_version}
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                            <div className="flex items-center gap-2">
                              <TeamLogo abbr={g.predicted_winner} name={teamName(g.predicted_winner)} size={18} />
                              <span className="font-semibold text-text-primary">{teamName(g.predicted_winner)}</span>
                              <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                                {pct(conf, 0)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-text-secondary">
                              {p.score}: <span className="font-medium text-text-primary">{g.predicted_away_score.toFixed(0)} - {g.predicted_home_score.toFixed(0)}</span>
                            </p>
                            <p className="mt-0.5 max-w-xs truncate text-xs text-text-secondary" title={injuryTitle(g)}>
                              {injurySummary(g)}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                            {g.status === "final" ? (
                              <>
                                <p className="text-base font-semibold text-text-primary">
                                  {g.actual_away_score} - {g.actual_home_score}
                                </p>
                                {g.predicted_margin != null && g.actual_margin != null && (
                                  <p className="mt-0.5 text-xs text-text-secondary">
                                    {fill(p.marginErrorInline, { v: signed(g.predicted_margin - g.actual_margin) })}
                                  </p>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-text-secondary">{p.resultPending}</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">{resultBadges(g)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      )}

      {/* 2. Versions & Baselines Section */}
      {showVersions && report.evaluation && (
        <div className="space-y-4">
          <BaselineComparison evaluation={report.evaluation} />
          <VersionTable evaluation={report.evaluation} />
        </div>
      )}

      {/* 3. Calibration & Rolling Trends Section */}
      {showCalibration && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RollingAccuracyChart games={games} />
            <CalibrationChart bands={s.bands} />
          </div>

          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
            {s.bands.length > 0 && (
              <Card padding="none" className="overflow-hidden">
                <div className="border-b border-border px-4 py-3">
                  <h3 className="text-sm font-semibold text-text-primary">{p.bandsTitle}</h3>
                  <p className="mt-0.5 text-xs text-text-secondary">{p.bandsHint}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-background-tertiary/60 text-xs font-semibold text-text-secondary">
                      <tr>
                        <th scope="col" className="px-4 py-2.5">{p.colConfidence}</th>
                        <th scope="col" className="px-4 py-2.5 text-right">{p.colGames}</th>
                        <th scope="col" className="px-4 py-2.5 text-right">{p.colModelSaid}</th>
                        <th scope="col" className="px-4 py-2.5 text-right">{p.colHitRate}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light">
                      {s.bands.map((b) => (
                        <tr key={b.label} className="transition-colors hover:bg-background-tertiary/40">
                          <td className="px-4 py-2.5 font-medium tabular-nums text-text-primary">{b.label}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{b.games}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{pct(b.mean_confidence)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-text-primary">{pct(b.accuracy)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            <BacktestCalibration />
          </div>
        </div>
      )}
    </div>
  );
}
