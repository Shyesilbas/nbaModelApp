import { useMemo, useState } from "react";
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

const VERDICT_BADGE: Record<Verdict, string> = {
  better: "bg-status-success/10 text-status-success",
  worse: "bg-status-error/10 text-status-error",
  unclear: "bg-background-tertiary text-text-secondary",
  insufficient: "bg-background-tertiary text-text-secondary",
};

interface Row {
  label: string;
  model: string;
  baseline: string;
  diff: string;
  betterWhenNegative: boolean;
  rawDiff?: number;
  ci?: BootstrapCi | null;
  digits: number;
}

const versionSortNum = (v: string): number => {
  const m = v.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
};

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
    {
      label: p.metricBrier,
      model: num(s.brier, 4),
      baseline: num(s.elo_brier, 4),
      diff: diff(s.brier, s.elo_brier, 4),
      rawDiff: s.brier != null && s.elo_brier != null ? s.brier - s.elo_brier : undefined,
      betterWhenNegative: true,
      ci: s.brier_vs_elo,
      digits: 4,
    },
    {
      label: p.metricAccuracy,
      model: pct(s.accuracy),
      baseline: pct(s.elo_accuracy),
      diff: s.accuracy == null || s.elo_accuracy == null ? "-" : `${signed((s.accuracy - s.elo_accuracy) * 100, 1)} pp`,
      rawDiff: s.accuracy != null && s.elo_accuracy != null ? s.accuracy - s.elo_accuracy : undefined,
      betterWhenNegative: false,
      digits: 1,
    },
    {
      label: p.metricTotal,
      model: num(s.mae_total, 2),
      baseline: num(s.base_mae_total, 2),
      diff: diff(s.mae_total, s.base_mae_total),
      rawDiff: s.mae_total != null && s.base_mae_total != null ? s.mae_total - s.base_mae_total : undefined,
      betterWhenNegative: true,
      ci: s.total_vs_last10,
      digits: 2,
    },
    {
      label: p.metricMargin,
      model: num(s.mae_margin, 2),
      baseline: num(s.base_mae_margin, 2),
      diff: diff(s.mae_margin, s.base_mae_margin),
      rawDiff: s.mae_margin != null && s.base_mae_margin != null ? s.mae_margin - s.base_mae_margin : undefined,
      betterWhenNegative: true,
      ci: s.margin_vs_last10,
      digits: 2,
    },
  ];

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 id="paper-baselines" className="text-sm font-semibold text-text-primary">
            {fill(p.baselineTitle, { version: evaluation.production_release })}
          </h2>
          <p className="mt-0.5 text-xs text-text-secondary">{p.baselineHint}</p>
        </div>
        {s.games > 0 && (
          <span className="rounded-sm bg-background-tertiary px-2 py-0.5 text-xs font-medium tabular-nums text-text-secondary">
            {fill(p.baselineSample, { games: s.games, baseGames: s.baseline_games ?? 0 })}
          </span>
        )}
      </div>

      {s.games === 0 ? (
        <div className="p-4">
          <p className="text-sm text-text-secondary">{p.baselineNone}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-background-tertiary/60 text-xs font-semibold text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-2.5">{p.colMetric}</th>
                <th scope="col" className="px-4 py-2.5 text-right">{p.colModel}</th>
                <th scope="col" className="px-4 py-2.5 text-right">{p.colBaseline}</th>
                <th scope="col" className="px-4 py-2.5 text-right">{p.colDiff}</th>
                <th scope="col" className="px-4 py-2.5">{p.colVerdict}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {rows.map((r) => {
                const v = r.ci === undefined ? null : verdictOf(r.ci);
                const isGoodDiff =
                  r.rawDiff != null && r.rawDiff !== 0
                    ? r.betterWhenNegative
                      ? r.rawDiff < 0
                      : r.rawDiff > 0
                    : null;
                return (
                  <tr key={r.label} className="transition-colors hover:bg-background-tertiary/40">
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-text-primary">{r.label}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-text-primary">{r.model}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{r.baseline}</td>
                    <td
                      className={`px-4 py-2.5 text-right font-semibold tabular-nums ${isGoodDiff === true
                          ? "text-status-success"
                          : isGoodDiff === false
                            ? "text-status-error"
                            : "text-text-secondary"
                        }`}
                    >
                      {r.diff}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                      {v == null ? (
                        <span className="text-xs text-text-secondary">—</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-sm px-2 py-0.5 text-xs font-semibold ${VERDICT_BADGE[v]}`}>
                            {verdictLabel[v]}
                          </span>
                          {r.ci && (
                            <span className="text-xs text-text-secondary">
                              [{signed(r.ci.ci_low, r.digits)}, {signed(r.ci.ci_high, r.digits)}]
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

interface MergedVersionRow {
  key: string;
  version: string;
  liveGames: number;
  backfillGames: number;
  games: number;
  accuracy?: number;
  brier?: number;
  elo_brier?: number;
  mae_total?: number;
  mae_margin?: number;
}

export function VersionTable({ evaluation }: { evaluation: Evaluation }) {
  const { t, language } = useLanguage();
  const tr = language === "tr";
  const p = t.paper;
  const [splitByOrigin, setSplitByOrigin] = useState(false);

  const hasDuplicateVersions = useMemo(() => {
    const seen = new Set<string>();
    for (const row of evaluation.by_version) {
      if (seen.has(row.version)) return true;
      seen.add(row.version);
    }
    return false;
  }, [evaluation.by_version]);

  const rows = useMemo<MergedVersionRow[]>(() => {
    if (splitByOrigin) {
      return [...evaluation.by_version]
        .sort((a, b) => {
          const d = versionSortNum(b.version) - versionSortNum(a.version);
          if (d !== 0) return d;
          return a.origin === "live" ? -1 : 1;
        })
        .map((g) => ({
          key: `${g.version}/${g.origin}`,
          version: g.version,
          liveGames: g.origin === "live" ? g.games : 0,
          backfillGames: g.origin === "backfill" ? g.games : 0,
          games: g.games,
          accuracy: g.accuracy,
          brier: g.brier,
          elo_brier: g.elo_brier,
          mae_total: g.mae_total,
          mae_margin: g.mae_margin,
        }));
    }

    const byVer = new Map<string, (GroupSummary & { version: string; origin: "live" | "backfill" })[]>();
    for (const item of evaluation.by_version) {
      const list = byVer.get(item.version) ?? [];
      list.push(item);
      byVer.set(item.version, list);
    }

    const weighted = (
      items: (GroupSummary & { version: string; origin: "live" | "backfill" })[],
      getter: (x: GroupSummary) => number | undefined,
      weightGetter: (x: GroupSummary) => number = (x) => x.games
    ): number | undefined => {
      let sum = 0;
      let wSum = 0;
      for (const it of items) {
        const val = getter(it);
        const w = weightGetter(it);
        if (val != null && w > 0) {
          sum += val * w;
          wSum += w;
        }
      }
      return wSum > 0 ? sum / wSum : undefined;
    };

    return Array.from(byVer.entries())
      .sort(([vA], [vB]) => versionSortNum(vB) - versionSortNum(vA))
      .map(([version, items]) => {
        const liveGames = items.filter((i) => i.origin === "live").reduce((acc, i) => acc + i.games, 0);
        const backfillGames = items.filter((i) => i.origin === "backfill").reduce((acc, i) => acc + i.games, 0);
        const games = liveGames + backfillGames;
        return {
          key: version,
          version,
          liveGames,
          backfillGames,
          games,
          accuracy: weighted(items, (x) => x.accuracy),
          brier: weighted(items, (x) => x.brier),
          elo_brier: weighted(
            items,
            (x) => x.elo_brier,
            (x) => x.elo_games ?? x.games
          ),
          mae_total: weighted(items, (x) => x.mae_total),
          mae_margin: weighted(items, (x) => x.mae_margin),
        };
      });
  }, [evaluation.by_version, splitByOrigin]);

  if (evaluation.by_version.length === 0) return null;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{p.versionsTitle}</h2>
          <p className="mt-0.5 text-xs text-text-secondary">{p.versionsHint}</p>
        </div>
        {hasDuplicateVersions && (
          <div className="inline-flex items-center rounded border border-border bg-background-tertiary p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setSplitByOrigin(false)}
              className={`cursor-pointer rounded-sm px-2.5 py-1 transition-colors ${!splitByOrigin
                  ? "bg-background-primary font-semibold text-text-primary"
                  : "text-text-secondary hover:text-text-primary"
                }`}
            >
              {tr ? "Sürüme göre birleşik" : "Merged by version"}
            </button>
            <button
              type="button"
              onClick={() => setSplitByOrigin(true)}
              className={`cursor-pointer rounded-sm px-2.5 py-1 transition-colors ${splitByOrigin
                  ? "bg-background-primary font-semibold text-text-primary"
                  : "text-text-secondary hover:text-text-primary"
                }`}
            >
              {tr ? "Kayıt türüne göre ayrı" : "Split by origin"}
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-background-tertiary/60 text-xs font-semibold text-text-secondary">
            <tr>
              <th scope="col" className="px-4 py-2.5">{p.colVersion}</th>
              <th scope="col" className="px-4 py-2.5">{p.colOrigin}</th>
              <th scope="col" className="px-4 py-2.5 text-right">{p.colGames}</th>
              <th scope="col" className="px-4 py-2.5 text-right">{p.colAccuracy}</th>
              <th scope="col" className="px-4 py-2.5 text-right">{p.colBrier}</th>
              <th scope="col" className="px-4 py-2.5 text-right">{p.colEloBrier}</th>
              <th scope="col" className="px-4 py-2.5 text-right">{p.colTotalMae}</th>
              <th scope="col" className="px-4 py-2.5 text-right">{p.colMarginMae}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {rows.map((g) => {
              const current = g.version === evaluation.production_release && g.liveGames > 0;
              const beatsElo = g.brier != null && g.elo_brier != null && g.brier < g.elo_brier;
              return (
                <tr key={g.key} className="transition-colors hover:bg-background-tertiary/40">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                    <div className="flex items-center gap-2">
                      <span className={current ? "font-semibold text-text-primary" : "font-medium text-text-secondary"}>
                        {g.version}
                      </span>
                      {current && (
                        <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                          {p.currentBadge}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs">
                    {g.liveGames > 0 && g.backfillGames > 0 ? (
                      <div className="flex items-center gap-1.5 tabular-nums">
                        <span className="rounded-sm bg-status-success/10 px-1.5 py-0.5 font-medium text-status-success">
                          {p.originLive}: {g.liveGames}
                        </span>
                        <span className="rounded-sm bg-background-tertiary px-1.5 py-0.5 font-medium text-text-secondary">
                          {p.originBackfill}: {g.backfillGames}
                        </span>
                      </div>
                    ) : g.liveGames > 0 ? (
                      <span className="rounded-sm bg-status-success/10 px-2 py-0.5 font-medium text-status-success">
                        {p.originLive}
                      </span>
                    ) : (
                      <span className="rounded-sm bg-background-tertiary px-2 py-0.5 font-medium text-text-secondary">
                        {p.originBackfill}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums text-text-primary">{g.games}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-text-primary">{pct(g.accuracy)}</td>
                  <td
                    className={`px-4 py-2.5 text-right font-semibold tabular-nums ${beatsElo ? "text-status-success" : "text-text-primary"
                      }`}
                  >
                    {num(g.brier, 4)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{num(g.elo_brier, 4)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{num(g.mae_total, 2)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{num(g.mae_margin, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
