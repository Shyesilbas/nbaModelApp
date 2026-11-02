import { Card } from "../common";
import { fill } from "../../lib/fill";
import { useLanguage } from "../../context/LanguageContext";

export interface BootstrapCi {
  mean_diff: number;
  ci_low: number;
  ci_high: number;
  n: number;
}

export interface GroupSummary {
  games: number;
  accuracy?: number;
  brier?: number;
  mae_total?: number;
  mae_margin?: number;
  elo_games?: number;
  elo_brier?: number;
  elo_accuracy?: number;
  baseline_games?: number;
  base_mae_total?: number;
  base_mae_margin?: number;
  brier_vs_elo?: BootstrapCi | null;
  total_vs_last10?: BootstrapCi | null;
  margin_vs_last10?: BootstrapCi | null;
}

export interface Evaluation {
  production_release: string;
  current_live: GroupSummary;
  by_version: (GroupSummary & { version: string; origin: "live" | "backfill" })[];
}

const pct = (v: number | undefined) => (v == null ? "-" : `${(v * 100).toFixed(1)}%`);
const num = (v: number | undefined, digits: number) => (v == null ? "-" : v.toFixed(digits));
const signed = (v: number, digits: number) => `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;

type Verdict = "better" | "worse" | "unclear" | "insufficient";

// Loss differences (model minus baseline): an interval entirely below zero means the model is better.
const verdictOf = (ci: BootstrapCi | null | undefined): Verdict => {
  if (!ci) return "insufficient";
  if (ci.ci_high < 0) return "better";
  if (ci.ci_low > 0) return "worse";
  return "unclear";
};

const VERDICT_TONE: Record<Verdict, string> = {
  better: "text-status-success",
  worse: "text-status-error",
  unclear: "text-text-secondary",
  insufficient: "text-text-muted",
};

interface Row {
  label: string;
  model: string;
  baseline: string;
  diff: string;
  ci?: BootstrapCi | null;
  digits: number;
}

export function BaselineComparison({ evaluation }: { evaluation: Evaluation }) {
  const { t } = useLanguage();
  const p = t.paper;
  const s = evaluation.current_live;
  const verdictLabel: Record<Verdict, string> = {
    better: p.verdictBetter,
    worse: p.verdictWorse,
    unclear: p.verdictUnclear,
    insufficient: p.verdictInsufficient,
  };

  const diff = (a?: number, b?: number, digits = 2) => (a == null || b == null ? "-" : signed(a - b, digits));
  const rows: Row[] = [
    { label: p.metricBrier, model: num(s.brier, 4), baseline: num(s.elo_brier, 4), diff: diff(s.brier, s.elo_brier, 4), ci: s.brier_vs_elo, digits: 4 },
    {
      label: p.metricAccuracy,
      model: pct(s.accuracy),
      baseline: pct(s.elo_accuracy),
      diff: s.accuracy == null || s.elo_accuracy == null ? "-" : `${signed((s.accuracy - s.elo_accuracy) * 100, 1)} pp`,
      digits: 1,
    },
    { label: p.metricTotal, model: num(s.mae_total, 2), baseline: num(s.base_mae_total, 2), diff: diff(s.mae_total, s.base_mae_total), ci: s.total_vs_last10, digits: 2 },
    { label: p.metricMargin, model: num(s.mae_margin, 2), baseline: num(s.base_mae_margin, 2), diff: diff(s.mae_margin, s.base_mae_margin), ci: s.margin_vs_last10, digits: 2 },
  ];

  return (
    <section aria-labelledby="paper-baselines">
      <h2 id="paper-baselines" className="mb-1 text-sm font-semibold text-text-primary">
        {fill(p.baselineTitle, { version: evaluation.production_release })}
      </h2>
      <p className="mb-3 max-w-3xl text-xs leading-relaxed text-text-secondary">{p.baselineHint}</p>
      {s.games === 0 ? (
        <Card padding="md">
          <p className="text-sm text-text-secondary">{p.baselineNone}</p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="border-b border-border-light px-4 py-3 text-left text-xs tabular-nums text-text-secondary">
              {fill(p.baselineSample, { games: s.games, baseGames: s.baseline_games ?? 0 })}
            </caption>
            <thead className="bg-background-tertiary text-xs text-text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">{p.colMetric}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">{p.colModel}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">{p.colBaseline}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">{p.colDiff}</th>
                <th scope="col" className="px-4 py-2 font-medium">{p.colVerdict}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {rows.map((r) => {
                const v = r.ci === undefined ? null : verdictOf(r.ci);
                return (
                  <tr key={r.label}>
                    <td className="whitespace-nowrap px-4 py-2 text-text-primary">{r.label}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-text-primary">{r.model}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{r.baseline}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{r.diff}</td>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                      {v == null ? (
                        <span className="text-text-muted">-</span>
                      ) : (
                        <>
                          <span className={`block font-medium ${VERDICT_TONE[v]}`}>{verdictLabel[v]}</span>
                          {r.ci && (
                            <span className="block text-xs text-text-muted">
                              [{signed(r.ci.ci_low, r.digits)}, {signed(r.ci.ci_high, r.digits)}]
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}

export function VersionTable({ evaluation }: { evaluation: Evaluation }) {
  const { t } = useLanguage();
  const p = t.paper;
  if (evaluation.by_version.length === 0) return null;

  return (
    <Card padding="none" className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="border-b border-border-light px-4 py-3 text-left">
          <span className="block text-sm font-semibold text-text-primary">{p.versionsTitle}</span>
          <span className="mt-0.5 block text-xs font-normal text-text-secondary">{p.versionsHint}</span>
        </caption>
        <thead className="bg-background-tertiary text-xs text-text-muted">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">{p.colVersion}</th>
            <th scope="col" className="px-4 py-2 font-medium">{p.colOrigin}</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">{p.colGames}</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">{p.colAccuracy}</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">{p.colBrier}</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">{p.colEloBrier}</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">{p.colTotalMae}</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">{p.colMarginMae}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-light">
          {evaluation.by_version.map((g) => {
            const current = g.version === evaluation.production_release && g.origin === "live";
            return (
              <tr key={`${g.version}/${g.origin}`}>
                <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                  <span className={current ? "font-semibold text-text-primary" : "text-text-secondary"}>{g.version}</span>
                  {current && <span className="ml-2 text-xs text-text-muted">{p.currentBadge}</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-text-secondary">
                  {g.origin === "live" ? p.originLive : p.originBackfill}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{g.games}</td>
                <td className="px-4 py-2 text-right tabular-nums text-text-primary">{pct(g.accuracy)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-text-primary">{num(g.brier, 4)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{num(g.elo_brier, 4)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{num(g.mae_total, 2)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{num(g.mae_margin, 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
