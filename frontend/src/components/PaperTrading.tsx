import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Card, DatePicker, EmptyState, InlineError, Skeleton } from "./common";
import TeamLogo from "./TeamLogo";
import { TEAM_NAME_BY_ABBR } from "../lib/nbaTeams";
import { CalibrationChart, RollingAccuracyChart } from "./paper/PaperCharts";
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

type Report = { season: string; summary: Summary; games: PaperGame[] };

const teamName = (abbr: string) => TEAM_NAME_BY_ABBR[abbr as keyof typeof TEAM_NAME_BY_ABBR] || abbr;
const pct = (v: number | null, digits = 1) => (v == null ? "-" : `${(v * 100).toFixed(digits)}%`);
const num = (v: number | null | undefined, digits = 2) => (v == null ? "-" : v.toFixed(digits));
const signed = (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1));
const injuryTitle = (g: PaperGame) =>
  g.injury_report?.players.map((p) => `${p.team} ${p.player_name}: ${p.status} (${p.reason})`).join("\n") ?? "";

function Stat({ label, value, hint, strong = false }: { label: string; value: string; hint: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className={`mt-1 font-semibold tabular-nums text-text-primary ${strong ? "text-3xl" : "text-xl"}`}>{value}</dd>
      <p className="mt-1 text-xs leading-snug text-text-muted">{hint}</p>
    </div>
  );
}

function TeamCell({ abbr, bold }: { abbr: string; bold: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <TeamLogo abbr={abbr} name={teamName(abbr)} size={24} />
      <span className={bold ? "font-semibold text-text-primary" : "text-text-secondary"}>{teamName(abbr)}</span>
    </span>
  );
}

function MatchupCell({ game, highlightWinner }: { game: PaperGame; highlightWinner: boolean }) {
  const won = (abbr: string) => highlightWinner && game.status === "final" && game.actual_winner === abbr;
  return (
    <div className="space-y-1.5">
      <TeamCell abbr={game.away_team} bold={won(game.away_team)} />
      <TeamCell abbr={game.home_team} bold={won(game.home_team)} />
    </div>
  );
}

export default function PaperTrading() {
  const { t, formatDate } = useLanguage();
  const p = t.paper;
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={84} />
          ))}
        </div>
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
    if (!g.valid) return <span className="text-xs font-medium text-status-warning">{p.resultLate}</span>;
    if (g.status === "pending") return <span className="text-xs text-text-muted">{p.resultPending}</span>;
    return (
      <div>
        <span className={`text-sm font-semibold ${g.correct ? "text-status-success" : "text-status-error"}`}>
          {g.correct ? p.resultCorrect : p.resultWrong}
        </span>
        {g.origin === "backfill" && <p className="mt-0.5 text-xs text-text-muted">{p.resultBackfill}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{p.title}</h1>
          <p className="mt-1 text-sm text-text-secondary">{fill(p.subtitle, { season: report.season })}</p>
        </div>
        <PublishSnapshotButton />
      </div>

      <details className="group rounded border border-border bg-background-primary">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary">
          {p.howTitle}
        </summary>
        <div className="grid grid-cols-1 gap-5 border-t border-border-light px-4 py-4 md:grid-cols-3">
          <div>
            <h3 className="text-sm font-medium text-text-primary">{p.howFrozenTitle}</h3>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">{p.howFrozen}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-text-primary">{p.howGradedTitle}</h3>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">{p.howGraded}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-text-primary">{p.howLabelsTitle}</h3>
            <ul className="mt-1 space-y-1.5 text-xs leading-relaxed text-text-secondary">
              <li><span className="font-medium text-status-warning">{p.resultLate}:</span> {p.howLate}</li>
              <li><span className="font-medium text-text-primary">{p.resultBackfill}:</span> {p.howBackfill}</li>
            </ul>
          </div>
        </div>
      </details>

      <section aria-labelledby="paper-season-summary">
        <h2 id="paper-season-summary" className="mb-3 text-sm font-semibold text-text-primary">{p.seasonSummary}</h2>
        <Card padding="md">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-3">
            <Stat
              strong
              label={p.accuracy}
              value={pct(s.accuracy)}
              hint={
                s.games_graded
                  ? fill(p.accuracyHint, { correct: Math.round((s.accuracy ?? 0) * s.games_graded), graded: s.games_graded })
                  : p.accuracyNone
              }
            />
            <Stat label={p.homeBaseline} value={pct(s.home_baseline_accuracy)} hint={p.homeBaselineHint} />
            <Stat
              label={p.edge}
              value={edge == null ? "-" : `${edge >= 0 ? "+" : ""}${(edge * 100).toFixed(1)}%`}
              hint={p.edgeHint}
            />
            <Stat
              label={p.gamesLogged}
              value={`${s.games_logged}`}
              hint={fill(p.gamesLoggedHint, { graded: s.games_graded, pending: s.games_pending })}
            />
            <Stat label={p.brier} value={num(s.brier, 3)} hint={p.brierHint} />
            <Stat label={p.logLoss} value={num(s.log_loss, 3)} hint={p.logLossHint} />
          </dl>
        </Card>
        {(s.backfilled_graded > 0 || s.invalid_late > 0) && (
          <p className="mt-2 text-xs text-text-muted">
            {fill(p.gamesGradedExtra, { backfill: s.backfilled_graded, late: s.invalid_late })}
          </p>
        )}
      </section>

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RollingAccuracyChart games={games} />
          <CalibrationChart bands={s.bands} />
        </div>

        {s.bands.length > 0 && (
          <Card padding="none" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="border-b border-border-light px-4 py-3 text-left">
                <span className="block text-sm font-semibold text-text-primary">{p.bandsTitle}</span>
                <span className="mt-0.5 block text-xs font-normal text-text-secondary">{p.bandsHint}</span>
              </caption>
              <thead className="bg-background-tertiary text-xs text-text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">{p.colConfidence}</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">{p.colGames}</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">{p.colModelSaid}</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">{p.colHitRate}</th>
                </tr>
              </thead>
              <tbody>
                {s.bands.map((b) => (
                  <tr key={b.label} className="border-t border-border-light">
                    <td className="px-4 py-2 tabular-nums text-text-primary">{b.label}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{b.games}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{pct(b.mean_confidence)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-text-primary">{pct(b.accuracy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <DatePicker
            dates={dates}
            value={activeDate ?? ""}
            onChange={setSelectedDate}
            counts={dateCounts}
            formatDate={formatDate}
          />
          <span className="text-xs tabular-nums text-text-secondary">
            {fill(p.dayGames, { n: dayGames.length })}
            {dayGraded.length > 0 &&
              `, ${fill(p.dayCorrect, { correct: dayCorrect, graded: dayGraded.length })}`}
          </span>
        </div>

        <Card padding="none" className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="border-b border-border-light px-4 py-3 text-left text-sm font-semibold tabular-nums text-text-primary">
              {fill(p.winnerTableTitle, { date: activeDate ?? "", logged: s.games_logged, pending: s.games_pending })}
            </caption>
            <thead className="bg-background-tertiary text-xs text-text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">{p.colGame}</th>
                <th scope="col" className="px-4 py-2 font-medium">{p.colPrediction}</th>
                <th scope="col" className="px-4 py-2 font-medium">{p.colFinal}</th>
                <th scope="col" className="px-4 py-2 font-medium">{p.colResult}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {dayGames.map((g) => {
                const conf = Math.max(g.home_win_probability, 1 - g.home_win_probability);
                return (
                  <tr key={g.game_id} className="hover:bg-background-secondary/50">
                    <td className="whitespace-nowrap px-4 py-3 pr-8">
                      <MatchupCell game={g} highlightWinner />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      <p className="flex items-center gap-2 text-sm">
                        <span className="font-semibold text-text-primary">{teamName(g.predicted_winner)}</span>
                        <span className="text-xs text-text-secondary">{pct(conf, 0)}</span>
                      </p>
                      <p className="mt-1 text-xs text-text-secondary">
                        {p.score} {g.predicted_away_score.toFixed(0)} - {g.predicted_home_score.toFixed(0)}
                      </p>
                      <p className="mt-0.5 max-w-xs truncate text-xs text-text-muted" title={injuryTitle(g)}>
                        {injurySummary(g)}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {g.status === "final" ? (
                        <>
                          <p className="font-semibold text-text-primary">
                            {g.actual_away_score} - {g.actual_home_score}
                          </p>
                          {g.predicted_margin != null && g.actual_margin != null && (
                            <p className="mt-1 text-xs text-text-secondary">
                              {fill(p.marginErrorInline, { v: signed(g.predicted_margin - g.actual_margin) })}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{resultBadges(g)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
