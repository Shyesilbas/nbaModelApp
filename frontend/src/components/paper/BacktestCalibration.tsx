import { useCallback, useEffect, useState } from "react";
import { Card, EmptyState, InlineError, Select, Skeleton } from "../common";
import { loadPrivateApi } from "../../lib/dataCache";
import { fill } from "../../lib/fill";
import { useLanguage } from "../../context/LanguageContext";

interface CalibrationBand {
  label: string;
  games: number;
  mean_confidence: number;
  accuracy: number;
}

interface CalibrationTable {
  games: number;
  accuracy: number;
  mean_confidence: number;
  ece: number;
  bands: CalibrationBand[];
}

type SeasonTable = CalibrationTable & { season: string };

interface BacktestCalibrationData {
  seasons: SeasonTable[];
  pooled: CalibrationTable | null;
}

const POOLED = "pooled";
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

// Gap between what the model said and what happened, in percentage points, signed.
const gap = (b: CalibrationBand) => {
  const d = (b.accuracy - b.mean_confidence) * 100;
  return `${d > 0 ? "+" : ""}${d.toFixed(1)}`;
};

export default function BacktestCalibration() {
  const { t } = useLanguage();
  const p = t.paper;
  const [data, setData] = useState<BacktestCalibrationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(POOLED);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    loadPrivateApi<BacktestCalibrationData>("/frontend-data-api/backtest-calibration")
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (error) return <InlineError title={t.common.loadFailed} message={error} onRetry={load} />;
  if (loading || !data) return <Skeleton height={240} />;
  if (!data.pooled || data.seasons.length === 0) {
    return <EmptyState title={p.backtestEmptyTitle} description={p.backtestEmptyBody} />;
  }

  const table: CalibrationTable = selected === POOLED ? data.pooled : data.seasons.find((s) => s.season === selected) ?? data.pooled;
  const options = [
    { value: POOLED, label: fill(p.backtestAllSeasons, { n: data.seasons.length }) },
    ...data.seasons.map((s) => ({ value: s.season, label: s.season })),
  ];

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 id="backtest-calibration" className="text-sm font-semibold text-text-primary">{p.backtestTitle}</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-text-secondary">{p.backtestHint}</p>
        </div>
        <div className="w-48">
          <Select
            aria-label={p.backtestSeason}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            options={options}
            className="h-9"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-background-tertiary/60 text-xs font-semibold text-text-secondary">
            <tr>
              <th scope="col" className="px-4 py-2.5">{p.colConfidence}</th>
              <th scope="col" className="px-4 py-2.5 text-right">{p.colGames}</th>
              <th scope="col" className="px-4 py-2.5 text-right">{p.colModelSaid}</th>
              <th scope="col" className="px-4 py-2.5 text-right">{p.colHitRate}</th>
              <th scope="col" className="px-4 py-2.5 text-right">{p.backtestGap}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {table.bands.map((b) => (
              <tr key={b.label} className="transition-colors hover:bg-background-tertiary/40">
                <td className="px-4 py-2.5 font-medium tabular-nums text-text-primary">{b.label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{b.games}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{pct(b.mean_confidence)}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-text-primary">{pct(b.accuracy)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{gap(b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border bg-background-tertiary/30 px-4 py-2.5 text-xs tabular-nums text-text-secondary">
        {fill(p.backtestFooter, { games: table.games, acc: pct(table.accuracy), ece: (table.ece * 100).toFixed(1) })}
      </p>
    </Card>
  );
}
