import { useMemo } from "react";
import { Card } from "../common";

export interface ChartGame {
  game_date: string;
  home_team: string;
  status: "final" | "pending";
  valid: boolean;
  correct?: boolean;
  actual_winner?: string;
}

export interface ChartBand {
  label: string;
  games: number;
  accuracy: number;
  mean_confidence: number;
}

const WINDOW_DAYS = 30;
const MIN_GAMES = 10;

const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;
const dayNumber = (iso: string) => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000);

interface RollingPoint {
  date: string;
  day: number;
  model: number;
  home: number;
  games: number;
}

function ChartFrame({
  title,
  description,
  summary,
  yTicks,
  xTicks,
  legend,
  children,
}: {
  title: string;
  description: string;
  summary: string;
  yTicks: string[];
  xTicks: string[];
  legend?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card padding="md" className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <p className="text-xs text-text-secondary">{description}</p>
      </div>
      <figure className="m-0" role="img" aria-label={`${title}. ${summary}`}>
        <div className="flex gap-2">
          <div className="flex h-48 flex-col justify-between text-right text-xs tabular-nums text-text-muted" aria-hidden="true">
            {yTicks.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
          <div className="relative h-48 flex-1 border-b border-l border-border-light">{children}</div>
        </div>
        <div className="mt-1 flex justify-between pl-10 text-xs tabular-nums text-text-muted" aria-hidden="true">
          {xTicks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </figure>
      {legend}
      <p className="text-xs text-text-secondary">{summary}</p>
    </Card>
  );
}

function Legend({ items }: { items: { label: string; className: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className={`h-0.5 w-4 ${i.className}`} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function RollingAccuracyChart({ games }: { games: ChartGame[] }) {
  const points = useMemo<RollingPoint[]>(() => {
    const graded = games
      .filter((g) => g.status === "final" && g.valid && g.correct != null)
      .map((g) => ({ ...g, day: dayNumber(g.game_date) }))
      .sort((a, b) => a.day - b.day);
    const dates = Array.from(new Set(graded.map((g) => g.game_date))).sort();
    const out: RollingPoint[] = [];
    for (const date of dates) {
      const end = dayNumber(date);
      const win = graded.filter((g) => g.day <= end && g.day > end - WINDOW_DAYS);
      if (win.length < MIN_GAMES) continue;
      out.push({
        date,
        day: end,
        games: win.length,
        model: win.filter((g) => g.correct).length / win.length,
        home: win.filter((g) => g.actual_winner === g.home_team).length / win.length,
      });
    }
    return out;
  }, [games]);

  if (points.length < 2) {
    return (
      <Card padding="md" className="space-y-1">
        <h2 className="text-sm font-semibold text-text-primary">Rolling accuracy ({WINDOW_DAYS} days)</h2>
        <p className="text-xs text-text-secondary">
          The trend appears once at least two game days have {MIN_GAMES} or more graded games in their trailing
          {" "}{WINDOW_DAYS}-day window.
        </p>
      </Card>
    );
  }

  const values = points.flatMap((p) => [p.model, p.home]);
  const lo = Math.max(0, Math.floor((Math.min(...values) - 0.05) * 20) / 20);
  const hi = Math.min(1, Math.max(Math.ceil((Math.max(...values) + 0.05) * 20) / 20, lo + 0.2));
  const first = points[0].day;
  const span = Math.max(points[points.length - 1].day - first, 1);
  const x = (day: number) => ((day - first) / span) * 100;
  const y = (v: number) => (1 - (v - lo) / (hi - lo)) * 100;
  const line = (key: "model" | "home") => points.map((p) => `${x(p.day).toFixed(2)},${y(p[key]).toFixed(2)}`).join(" ");
  const last = points[points.length - 1];
  const edge = last.model - last.home;

  return (
    <ChartFrame
      title={`Rolling accuracy (${WINDOW_DAYS} days)`}
      description={`Share of correct winner picks in the trailing ${WINDOW_DAYS} days, against always picking the home team.`}
      summary={`Latest (${last.date}, ${last.games} games): model ${pct(last.model, 1)}, home baseline ${pct(last.home, 1)}, edge ${edge >= 0 ? "+" : ""}${(edge * 100).toFixed(1)} points.`}
      yTicks={[pct(hi), pct((hi + lo) / 2), pct(lo)]}
      xTicks={[points[0].date, last.date]}
      legend={
        <Legend
          items={[
            { label: "Model", className: "bg-primary" },
            { label: "Home baseline", className: "bg-text-muted" },
          ]}
        />
      }
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <line x1="0" x2="100" y1="50" y2="50" className="stroke-border-light" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline points={line("home")} fill="none" className="stroke-text-muted" strokeWidth="2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        <polyline points={line("model")} fill="none" className="stroke-primary" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      {points.map((p) => (
        <span
          key={p.date}
          title={`${p.date}: model ${pct(p.model, 1)}, home ${pct(p.home, 1)} (${p.games} games)`}
          className="absolute h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-primary"
          style={{ left: `${x(p.day)}%`, bottom: `${100 - y(p.model)}%` }}
        />
      ))}
    </ChartFrame>
  );
}

export function CalibrationChart({ bands }: { bands: ChartBand[] }) {
  const usable = bands.filter((b) => b.games > 0);
  if (usable.length === 0) return null;

  const total = usable.reduce((n, b) => n + b.games, 0);
  const gap = usable.reduce((n, b) => n + Math.abs(b.accuracy - b.mean_confidence) * b.games, 0) / total;
  const lo = 0.4;
  const hi = 1;
  const pos = (v: number) => ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * 100;

  return (
    <ChartFrame
      title="Calibration"
      description="Each point is a confidence band: what the model said against how often it was right. On the diagonal means calibrated."
      summary={`${usable.length} bands over ${total} graded games; average gap between stated confidence and actual hit rate is ${(gap * 100).toFixed(1)} points.`}
      yTicks={[pct(hi), pct((hi + lo) / 2), pct(lo)]}
      xTicks={[pct(lo), pct((hi + lo) / 2), pct(hi)]}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <line x1="0" y1="100" x2="100" y2="0" className="stroke-text-muted" strokeWidth="1" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      </svg>
      {usable.map((b) => (
        <span
          key={b.label}
          title={`${b.label}: model said ${pct(b.mean_confidence, 1)}, hit ${pct(b.accuracy, 1)} over ${b.games} games`}
          className="absolute h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-full border border-background-primary bg-primary"
          style={{ left: `${pos(b.mean_confidence)}%`, bottom: `${pos(b.accuracy)}%` }}
        />
      ))}
    </ChartFrame>
  );
}
