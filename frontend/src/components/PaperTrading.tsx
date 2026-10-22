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
  total_line_close?: number;
  over_odds_close?: number;
  under_odds_close?: number;
  total_line_ref?: number;
  total_line_source?: "snapshot" | "closing";
  total_window?: { line: number; over_odds: number | null; under_odds: number | null }[];
  total_lean?: "over" | "under" | null;
  total_lean_hit?: boolean | null;
  total_line_result?: "over" | "under" | "push";
  line_bet_won?: boolean | null;
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
  games_with_total: number;
  total_leans: number;
  total_lean_hit_rate: number | null;
  line_bets: number;
  line_bet_win_rate: number | null;
  market_mae_total: number | null;
  model_mae_total_on_line: number | null;
};

type Report = { season: string; summary: Summary; games: PaperGame[] };

const pct = (v: number | null, digits = 1) => (v == null ? "-" : `${(v * 100).toFixed(digits)}%`);
const num = (v: number | null | undefined, digits = 2) => (v == null ? "-" : v.toFixed(digits));
const leanOf = (g: PaperGame) => {
  if (g.total_line_ref == null) return null;
  const total = g.predicted_home_score + g.predicted_away_score;
  return total > g.total_line_ref ? "over" : total < g.total_line_ref ? "under" : null;
};
const decimalOdds = (v: number | undefined) =>
  v == null ? "-" : (v > 0 ? 1 + v / 100 : 1 + 100 / -v).toFixed(2);
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
  const [activeTab, setActiveTab] = useState<"over-under" | "moneyline">("over-under");

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
  const dayTotals = dayGames.filter((g) => g.total_line_ref != null);

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

      {/* Tabs Header */}
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab("over-under")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "over-under"
              ? "border-primary text-primary"
              : "border-transparent text-text-secondary hover:border-border hover:text-text-primary"
          }`}
        >
          Over / Under
          {s.games_with_total > 0 && (
            <span className="rounded-full bg-background-tertiary px-1.5 py-0.5 text-[10px] text-text-muted">
              {s.games_with_total}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("moneyline")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "moneyline"
              ? "border-primary text-primary"
              : "border-transparent text-text-secondary hover:border-border hover:text-text-primary"
          }`}
        >
          Moneyline (Winner)
          {s.games_graded > 0 && (
            <span className="rounded-full bg-background-tertiary px-1.5 py-0.5 text-[10px] text-text-muted">
              {s.games_graded}
            </span>
          )}
        </button>
      </div>

      {/* Date Navigation */}
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
          {activeTab === "moneyline" && dayGraded.length > 0 && `, ${dayCorrect} of ${dayGraded.length} picked correctly`}
          {activeTab === "over-under" && dayTotals.length > 0 && `, ${dayTotals.length} with totals line`}
        </span>
      </div>

      {/* TAB CONTENT: Over / Under */}
      {activeTab === "over-under" && (
        <div className="space-y-4">
          {s.games_with_total > 0 && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                label="Total reached model number"
                value={pct(s.total_lean_hit_rate)}
                hint={`${s.total_leans} games. Over: model and game clear the line minus 2. Under: both stay under the line plus 2`}
              />
              <Stat
                label="Total bet at the line"
                value={pct(s.line_bet_win_rate)}
                hint={`${s.line_bets} games, pushes excluded`}
              />
              <Stat
                label="Total error: model / line"
                value={`${num(s.model_mae_total_on_line, 1)} / ${num(s.market_mae_total, 1)}`}
                hint="Mean absolute error in points"
              />
            </div>
          )}

          {dayTotals.length > 0 ? (
            <Card padding="none" className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="border-b border-border-light px-4 py-3 text-left text-sm font-semibold text-text-primary">
                  Over / Under, {activeDate}
                </caption>
                <thead className="bg-background-tertiary text-xs text-text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Game</th>
                    <th className="px-4 py-2 font-medium">Model total</th>
                    <th className="px-4 py-2 font-medium">Market line</th>
                    <th className="px-4 py-2 font-medium">Final total</th>
                    <th className="px-4 py-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {dayTotals.map((g) => {
                    return (
                      <tr key={g.game_id} className="border-t border-border-light align-top">
                        <td className="whitespace-nowrap px-4 py-2">
                          <span className="inline-flex items-center gap-2">
                            <TeamCell abbr={g.away_team} bold={false} />
                            <span className="text-text-muted">@</span>
                            <TeamCell abbr={g.home_team} bold={false} />
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          <p className="text-text-primary">
                            {(g.predicted_home_score + g.predicted_away_score).toFixed(1)}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {(g.total_lean ?? leanOf(g)) ? `Leans ${(g.total_lean ?? leanOf(g)) === "over" ? "Over" : "Under"}` : "On the line"}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          <p className="text-text-primary">
                            {g.total_line_ref?.toFixed(1)}{" "}
                            <span className="text-text-muted">{g.total_line_source === "snapshot" ? "pre-game" : "closing"}</span>
                          </p>
                          <p className="text-xs text-text-secondary">
                            Over {decimalOdds(g.over_odds_close)} / Under {decimalOdds(g.under_odds_close)}
                          </p>
                          {g.total_window && g.total_window.length > 0 && (
                            <p className="text-xs text-text-secondary">
                              {(g.total_lean ?? leanOf(g)) === "under"
                                ? `Under up to ${g.total_window[g.total_window.length - 1].line.toFixed(1)} at ${decimalOdds(g.total_window[g.total_window.length - 1].under_odds ?? undefined)}`
                                : `Over from ${g.total_window[0].line.toFixed(1)} at ${decimalOdds(g.total_window[0].over_odds ?? undefined)}`}
                            </p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          {g.status === "final" ? (
                            <>
                              <p className="text-text-primary">{g.actual_total}</p>
                              <p className="text-xs text-text-secondary">
                                Line result: {g.total_line_result === "push" ? "Push" : g.total_line_result === "over" ? "Over" : "Under"}
                              </p>
                            </>
                          ) : (
                            <span className="text-text-muted">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          {g.status === "pending" ? (
                            <Badge variant="neutral" size="sm">Pending</Badge>
                          ) : g.total_lean_hit == null ? (
                            <Badge variant="neutral" size="sm">No lean</Badge>
                          ) : (
                            <Badge variant={g.total_lean_hit ? "success" : "error"} size="sm">
                              {g.total_lean_hit ? "Reached" : "Missed"}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          ) : (
            <Card padding="md">
              <p className="text-xs text-text-secondary">
                {activeDate} tarihi için Over/Under bahis çizgisi veya maçı bulunamadı.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* TAB CONTENT: Moneyline (Winner) */}
      {activeTab === "moneyline" && (
        <div className="space-y-4">
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

          <Card padding="none" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="border-b border-border-light px-4 py-3 text-left text-sm font-semibold text-text-primary">
                {activeDate} ({s.games_logged} logged this season, {s.games_pending} pending)
              </caption>
              <thead className="bg-background-tertiary text-xs text-text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Game</th>
                  <th className="px-4 py-2 font-medium">Model</th>
                  <th className="px-4 py-2 font-medium">Market (closing odds)</th>
                  <th className="px-4 py-2 font-medium">Final</th>
                  <th className="px-4 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {dayGames.map((g) => {
                  const conf = Math.max(g.home_win_probability, 1 - g.home_win_probability);
                  const hasOdds = g.market_home_probability != null;
                  const marketPickHome = hasOdds && (g.market_home_probability as number) >= 0.5;
                  const marketConf = hasOdds
                    ? Math.max(g.market_home_probability as number, 1 - (g.market_home_probability as number))
                    : 0;
                  return (
                    <tr key={g.game_id} className="border-t border-border-light align-top">
                      <td className="whitespace-nowrap px-4 py-2">
                        <span className="inline-flex items-center gap-2">
                          <TeamCell abbr={g.away_team} bold={g.status === "final" && g.actual_winner === g.away_team} />
                          <span className="text-text-muted">@</span>
                          <TeamCell abbr={g.home_team} bold={g.status === "final" && g.actual_winner === g.home_team} />
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <p className="text-text-primary">
                          {g.predicted_winner} <span className="text-text-muted">{pct(conf, 0)}</span>
                        </p>
                        <p className="text-xs text-text-secondary">
                          Score {g.predicted_away_score.toFixed(0)} - {g.predicted_home_score.toFixed(0)}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        {hasOdds ? (
                          <>
                            <p className="text-text-primary">
                              {marketPickHome ? g.home_team : g.away_team}{" "}
                              <span className="text-text-muted">{pct(marketConf, 0)}</span>
                            </p>
                            <p className="text-xs text-text-secondary">
                              {g.away_team} {decimalOdds(g.away_ml_close)} / {g.home_team} {decimalOdds(g.home_ml_close)}
                            </p>
                          </>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        {g.status === "final" ? (
                          <>
                            <p className="text-text-primary">{g.actual_away_score} - {g.actual_home_score}</p>
                            {g.predicted_margin != null && g.actual_margin != null && (
                              <p className="text-xs text-text-secondary">
                                Margin error {signed(g.predicted_margin - g.actual_margin)}
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
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
      )}
    </div>
  );
}
