import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardCheck } from "lucide-react";
import { Badge, Button, Card, EmptyState, InlineError, Select, Skeleton } from "./common";
import TeamLogo from "./TeamLogo";
import { loadPrivateApiFresh } from "../lib/dataCache";
import { CURRENT_SEASON } from "../lib/constants";

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
  home_ml_close?: number;
  away_ml_close?: number;
  market_home_probability?: number;
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
  games_with_odds: number;
  market_accuracy: number | null;
  market_brier: number | null;
  market_log_loss: number | null;
  model_accuracy_on_odds: number | null;
  model_brier_on_odds: number | null;
  model_log_loss_on_odds: number | null;
};

type Report = { season: string; summary: Summary; games: PaperGame[] };

const pct = (v: number | null, digits = 1) => (v == null ? "-" : `${(v * 100).toFixed(digits)}%`);
const num = (v: number | null | undefined, digits = 2) => (v == null ? "-" : v.toFixed(digits));
const ml = (v: number | undefined) => (v == null ? "-" : v > 0 ? `+${v}` : `${v}`);
const signed = (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1));

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card padding="sm">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-text-primary">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-text-secondary">{hint}</p>}
    </Card>
  );
}

function TeamCell({ abbr, bold }: { abbr: string; bold: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <TeamLogo abbr={abbr} size={20} />
      <span className={bold ? "font-semibold text-text-primary" : "text-text-secondary"}>{abbr}</span>
    </span>
  );
}

export default function PaperTrading() {
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
  const dayIndex = activeDate ? dates.indexOf(activeDate) : -1;
  const dayGraded = dayGames.filter((g) => g.status === "final" && g.valid);
  const dayCorrect = dayGraded.filter((g) => g.correct).length;

  if (error) {
    return <InlineError title="Failed to load paper trading" message={error} onRetry={load} />;
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
      <EmptyState
        icon={<ClipboardCheck size={32} strokeWidth={1.5} />}
        title="No predictions logged yet"
        description={`Pre-game predictions for ${report.season} are frozen by scripts/paper_trading_snapshot.py before tip-off and graded here once the game is final.`}
      />
    );
  }

  const edge = s.accuracy != null && s.home_baseline_accuracy != null ? s.accuracy - s.home_baseline_accuracy : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Paper Trading</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Season {report.season}. Each prediction is frozen before tip-off and never rewritten; the result is
          attached once the game is final.
          {s.backfilled_graded > 0 &&
            ` ${s.backfilled_graded} graded games are backfills: re-predicted as of their date using only earlier games.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Winner accuracy"
          value={pct(s.accuracy)}
          hint={s.games_graded ? `${Math.round((s.accuracy ?? 0) * s.games_graded)} of ${s.games_graded} graded` : "No graded games yet"}
        />
        <Stat
          label="Always home baseline"
          value={pct(s.home_baseline_accuracy)}
          hint={edge == null ? undefined : `Model ${edge >= 0 ? "+" : ""}${(edge * 100).toFixed(1)} pts`}
        />
        <Stat label="Brier / log loss" value={`${num(s.brier, 3)} / ${num(s.log_loss, 3)}`} hint="Lower is better" />
        <Stat
          label="Score error (MAE)"
          value={`${num(s.mae_margin, 1)} / ${num(s.mae_total, 1)}`}
          hint="Margin / total points"
        />
      </div>

      {s.games_with_odds > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Market accuracy"
            value={pct(s.market_accuracy)}
            hint={`Closing moneyline favorite, ${s.games_with_odds} games. Model ${pct(s.model_accuracy_on_odds)}`}
          />
          <Stat
            label="Market Brier / log loss"
            value={`${num(s.market_brier, 3)} / ${num(s.market_log_loss, 3)}`}
            hint="Vig removed, lower is better"
          />
          <Stat
            label="Model Brier / log loss"
            value={`${num(s.model_brier_on_odds, 3)} / ${num(s.model_log_loss_on_odds, 3)}`}
            hint="Same games as the market"
          />
        </div>
      )}

      {s.bands.length > 0 && (
        <Card padding="none" className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="border-b border-border-light px-4 py-3 text-left text-sm font-semibold text-text-primary">
              Accuracy by model confidence
            </caption>
            <thead className="bg-background-tertiary text-xs text-text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Confidence</th>
                <th className="px-4 py-2 font-medium">Games</th>
                <th className="px-4 py-2 font-medium">Model said</th>
                <th className="px-4 py-2 font-medium">Actual hit rate</th>
              </tr>
            </thead>
            <tbody>
              {s.bands.map((b) => (
                <tr key={b.label} className="border-t border-border-light">
                  <td className="px-4 py-2 text-text-primary">{b.label}</td>
                  <td className="px-4 py-2 text-text-secondary">{b.games}</td>
                  <td className="px-4 py-2 text-text-secondary">{pct(b.mean_confidence)}</td>
                  <td className="px-4 py-2 text-text-primary">{pct(b.accuracy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          aria-label="Previous day"
          disabled={dayIndex <= 0}
          onClick={() => setSelectedDate(dates[dayIndex - 1])}
        >
          <ChevronLeft size={16} strokeWidth={1.5} />
        </Button>
        <Select
          aria-label="Game day"
          value={activeDate ?? ""}
          onChange={(e) => setSelectedDate(e.target.value)}
        >
          {[...dates].reverse().map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </Select>
        <Button
          variant="secondary"
          size="sm"
          aria-label="Next day"
          disabled={dayIndex < 0 || dayIndex >= dates.length - 1}
          onClick={() => setSelectedDate(dates[dayIndex + 1])}
        >
          <ChevronRight size={16} strokeWidth={1.5} />
        </Button>
        <span className="text-xs text-text-secondary">
          {dayGames.length} games
          {dayGraded.length > 0 && `, ${dayCorrect} of ${dayGraded.length} picked correctly`}
        </span>
      </div>

      <Card padding="none" className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="border-b border-border-light px-4 py-3 text-left text-sm font-semibold text-text-primary">
            {activeDate} ({s.games_logged} logged this season, {s.games_pending} pending)
          </caption>
          <thead className="bg-background-tertiary text-xs text-text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Game</th>
              <th className="px-4 py-2 font-medium">Model pick</th>
              <th className="px-4 py-2 font-medium">Closing ML (away / home)</th>
              <th className="px-4 py-2 font-medium">Model vs market</th>
              <th className="px-4 py-2 font-medium">Predicted score</th>
              <th className="px-4 py-2 font-medium">Final score</th>
              <th className="px-4 py-2 font-medium">Margin err.</th>
              <th className="px-4 py-2 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {dayGames.map((g) => {
              const conf = Math.max(g.home_win_probability, 1 - g.home_win_probability);
              return (
                <tr key={g.game_id} className="border-t border-border-light">
                  <td className="whitespace-nowrap px-4 py-2 text-text-secondary">{g.game_date}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <span className="inline-flex items-center gap-2">
                      <TeamCell abbr={g.away_team} bold={g.status === "final" && g.actual_winner === g.away_team} />
                      <span className="text-text-muted">@</span>
                      <TeamCell abbr={g.home_team} bold={g.status === "final" && g.actual_winner === g.home_team} />
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-text-primary">
                    {g.predicted_winner} <span className="text-text-muted">{pct(conf, 0)}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-text-secondary">
                    {g.market_home_probability == null ? "-" : `${ml(g.away_ml_close)} / ${ml(g.home_ml_close)}`}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-text-secondary">
                    {g.market_home_probability == null
                      ? "-"
                      : `${signed((g.home_win_probability - g.market_home_probability) * 100)} pts home`}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-text-secondary">
                    {g.predicted_away_score.toFixed(0)} - {g.predicted_home_score.toFixed(0)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-text-primary">
                    {g.status === "final" ? `${g.actual_away_score} - ${g.actual_home_score}` : "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-text-secondary">
                    {g.status === "final" && g.predicted_margin != null && g.actual_margin != null
                      ? signed(g.predicted_margin - g.actual_margin)
                      : "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    {!g.valid ? (
                      <Badge variant="warning" size="sm">Logged late</Badge>
                    ) : g.status === "pending" ? (
                      <Badge variant="neutral" size="sm">Pending</Badge>
                    ) : g.origin === "backfill" && g.correct != null ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Badge variant={g.correct ? "success" : "error"} size="sm">{g.correct ? "Correct" : "Wrong"}</Badge>
                        <Badge variant="info" size="sm">Backfill</Badge>
                      </span>
                    ) : g.correct ? (
                      <Badge variant="success" size="sm">Correct</Badge>
                    ) : (
                      <Badge variant="error" size="sm">Wrong</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
