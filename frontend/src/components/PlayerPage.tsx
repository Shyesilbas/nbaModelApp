import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  ArrowLeft,
  Calendar,
  ArrowRightLeft,
  X,
  User,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { loadPrivateApi } from "../lib/dataCache";
import { CURRENT_SEASON } from "../lib/constants";
import { updateUrlRoute, parseUrlRoute } from "../lib/router";
import PlayerPhoto from "./PlayerPhoto";
import TeamLogo from "./TeamLogo";
import PlayerHeroCard from "./player/PlayerHeroCard";
import { fmtPct, fmtStat } from "./player/format";
import type { PlayerProfile, SeasonAverages } from "./player/types";
import {
  Card,
  Button,
  Badge,
  Input,
  Skeleton,
  EmptyState,
  InlineError,
} from "./common";

/* ─────────── Types ─────────── */
interface GameRow {
  GAME_ID: string;
  GAME_DATE: string | null;
  SEASON: string;
  TEAM_ABBREVIATION: string | null;
  MATCHUP: string | null;
  WL: string | null;
  SEASON_TYPE: string | null;
  DID_NOT_PLAY: boolean;
  HOME_TEAM_ABBREVIATION: string | null;
  HOME_TEAM_NAME: string | null;
  HOME_SCORE: number | null;
  AWAY_TEAM_ABBREVIATION: string | null;
  AWAY_TEAM_NAME: string | null;
  AWAY_SCORE: number | null;
  WINNER_TEAM_ABBREVIATION: string | null;
  IS_PLAYOFF: boolean;
  MIN?: number | null;
  PTS?: number | null;
  REB?: number | null;
  AST?: number | null;
  STL?: number | null;
  BLK?: number | null;
  TOV?: number | null;
  FGM?: number | null;
  FGA?: number | null;
  FG_PCT?: number | null;
  FG3M?: number | null;
  FG3A?: number | null;
  FG3_PCT?: number | null;
  FTM?: number | null;
  FTA?: number | null;
  FT_PCT?: number | null;
  PLUS_MINUS?: number | null;
}

/* ─────────── Helpers ─────────── */

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("tr-TR", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

/* ─────────── Sub-components ─────────── */

type RenderItem =
  | { type: "game"; data: GameRow }
  | {
      type: "trade";
      from: string;
      to: string;
      dateBefore: string | null;
      dateAfter: string | null;
    };

function GameLogTable({
  games,
  onGameClick,
}: {
  games: GameRow[];
  onGameClick?: (game: GameRow) => void;
}) {
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const renderItems = useMemo(() => {
    const items: RenderItem[] = [];
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      items.push({ type: "game", data: g });

      const nextGame = games[i + 1];
      if (
        nextGame &&
        g.TEAM_ABBREVIATION &&
        nextGame.TEAM_ABBREVIATION &&
        g.TEAM_ABBREVIATION !== nextGame.TEAM_ABBREVIATION
      ) {
        items.push({
          type: "trade",
          from: nextGame.TEAM_ABBREVIATION,
          to: g.TEAM_ABBREVIATION,
          dateBefore: nextGame.GAME_DATE,
          dateAfter: g.GAME_DATE,
        });
      }
    }
    return items;
  }, [games]);

  const totalPages = Math.ceil(renderItems.length / PAGE_SIZE);
  const visible = renderItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const wlBadge = (wl: string | null) => {
    if (wl === "W") {
      return (
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-xs font-semibold text-status-success bg-status-success/10 border border-status-success/30"
          title="Galibiyet"
        >
          G
        </span>
      );
    }
    if (wl === "L") {
      return (
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-xs font-semibold text-status-error bg-status-error/10 border border-status-error/30"
          title="Maglubiyet"
        >
          M
        </span>
      );
    }
    return <span className="text-text-muted">—</span>;
  };

  const pmColor = (pm: number | null | undefined) => {
    if (pm == null) return "text-text-muted";
    if (pm > 0) return "text-status-success font-semibold";
    if (pm < 0) return "text-status-error font-semibold";
    return "text-text-secondary";
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded border border-border bg-background-primary">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-background-tertiary border-b border-border text-xs font-semibold text-text-secondary">
              <th className="sticky left-0 bg-background-tertiary px-3 py-2.5 text-left w-28">
                Tarih
              </th>
              <th className="px-2 py-2.5 text-left w-36">Eşleşme</th>
              <th className="px-2 py-2.5 text-center">G/M</th>
              <th className="px-2 py-2.5 text-right">Skor</th>
              <th className="px-2 py-2.5 text-right">MIN</th>
              <th className="px-2 py-2.5 text-right">PTS</th>
              <th className="px-2 py-2.5 text-right">REB</th>
              <th className="px-2 py-2.5 text-right">AST</th>
              <th className="px-2 py-2.5 text-right">STL</th>
              <th className="px-2 py-2.5 text-right">BLK</th>
              <th className="px-2 py-2.5 text-right">TOV</th>
              <th className="px-2 py-2.5 text-right">FG%</th>
              <th className="px-2 py-2.5 text-right">3P%</th>
              <th className="px-2 py-2.5 text-right">FT%</th>
              <th className="px-2 py-2.5 text-right">+/-</th>
              <th className="px-2 py-2.5 text-center">Tür</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {visible.map((item, idx) => {
              if (item.type === "trade") {
                return (
                  <tr
                    key={`trade-${idx}`}
                    className="bg-background-tertiary border-y border-border-light"
                  >
                    <td colSpan={16} className="px-3 py-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <Badge variant="neutral" size="sm">
                            <ArrowRightLeft size={16} strokeWidth={1.5} className="mr-1 inline-block" />
                            Takas / Transfer
                          </Badge>
                          <div className="flex items-center gap-2 font-medium text-text-primary text-xs">
                            <TeamLogo abbr={item.from} name="" size={18} />
                            <span className="text-text-secondary">{item.from}</span>
                            <ArrowRightLeft size={16} strokeWidth={1.5} className="text-text-muted mx-0.5" />
                            <TeamLogo abbr={item.to} name="" size={18} />
                            <span className="text-text-primary font-semibold">{item.to}</span>
                          </div>
                        </div>
                        <p className="text-xs text-text-muted tabular-nums">
                          Geçiş: {fmtDate(item.dateBefore)} → {fmtDate(item.dateAfter)}
                        </p>
                      </div>
                    </td>
                  </tr>
                );
              }

              const g = item.data;
              const isDnp = g.DID_NOT_PLAY;
              const score =
                g.HOME_SCORE != null && g.AWAY_SCORE != null
                  ? `${g.AWAY_SCORE} - ${g.HOME_SCORE}`
                  : "—";
              const clickable = !!onGameClick && !!g.GAME_ID;

              return (
                <tr
                  key={`${g.GAME_ID}-${idx}`}
                  onClick={clickable ? () => onGameClick!(g) : undefined}
                  className={`transition-colors duration-150 ${
                    isDnp
                      ? "bg-background-tertiary/40 opacity-70"
                      : "hover:bg-background-tertiary"
                  } ${clickable ? "cursor-pointer group" : ""}`}
                >
                  <td className="sticky left-0 bg-background-primary px-3 py-2 group-hover:bg-background-tertiary transition-colors">
                    <p className="text-xs font-medium text-text-primary tabular-nums">
                      {fmtDate(g.GAME_DATE)}
                    </p>
                    {clickable && (
                      <p className="text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        Kutu skorunu gör
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      {g.HOME_TEAM_ABBREVIATION && (
                        <TeamLogo
                          abbr={
                            g.MATCHUP?.includes("vs.")
                              ? g.AWAY_TEAM_ABBREVIATION ?? ""
                              : g.HOME_TEAM_ABBREVIATION ?? ""
                          }
                          name=""
                          size={16}
                        />
                      )}
                      <span className="text-xs font-medium text-text-primary whitespace-nowrap">
                        {g.MATCHUP ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center">
                    {isDnp ? (
                      <Badge variant="neutral" size="sm">
                        DNP
                      </Badge>
                    ) : (
                      wlBadge(g.WL)
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {isDnp ? (
                      <span className="text-xs text-text-muted">Oynamadı</span>
                    ) : (
                      <span className="text-xs font-medium text-text-secondary tabular-nums">
                        {score}
                      </span>
                    )}
                  </td>
                  {isDnp ? (
                    <>
                      {Array.from({ length: 11 }).map((_, i) => (
                        <td key={i} className="px-2 py-2 text-right text-text-muted">
                          —
                        </td>
                      ))}
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">
                        {g.MIN != null ? Math.round(g.MIN) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-text-primary tabular-nums">
                        {g.PTS ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-right font-medium text-text-secondary tabular-nums">
                        {g.REB ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-right font-medium text-text-secondary tabular-nums">
                        {g.AST ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">
                        {g.STL ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">
                        {g.BLK ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">
                        {g.TOV ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">
                        {fmtPct(g.FG_PCT)}
                      </td>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">
                        {fmtPct(g.FG3_PCT)}
                      </td>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">
                        {fmtPct(g.FT_PCT)}
                      </td>
                      <td
                        className={`px-2 py-2 text-right tabular-nums ${pmColor(g.PLUS_MINUS)}`}
                      >
                        {g.PLUS_MINUS != null
                          ? `${g.PLUS_MINUS > 0 ? "+" : ""}${g.PLUS_MINUS}`
                          : "—"}
                      </td>
                    </>
                  )}
                  <td className="px-2 py-2 text-center">
                    <Badge variant={g.IS_PLAYOFF ? "primary" : "neutral"} size="sm">
                      {g.IS_PLAYOFF ? "PO" : "RS"}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs font-normal text-text-secondary tabular-nums">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, games.length)} / {games.length} maç
          </p>
          <div className="flex gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Önceki
            </Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
              return (
                <button
                  key={pg}
                  type="button"
                  onClick={() => setPage(pg)}
                  className={`h-8 w-8 rounded text-xs font-medium tabular-nums transition-colors cursor-pointer ${
                    pg === page
                      ? "bg-primary text-white"
                      : "border border-border bg-background-primary text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
                  }`}
                >
                  {pg + 1}
                </button>
              );
            })}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              Sonraki
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────── Player Trend Radar & Sparkline ─────────── */
type TrendMetric = "PTS" | "REB" | "AST" | "MIN" | "PLUS_MINUS";

interface TrendRadarProps {
  games: GameRow[];
  seasonAvgs?: SeasonAverages | null;
}

function PlayerTrendRadar({ games, seasonAvgs }: TrendRadarProps) {
  const [metric, setMetric] = useState<TrendMetric>("PTS");

  // Filter out DNP games and sort chronologically (oldest to newest for charting)
  const playedGamesChronological = useMemo(() => {
    return [...games]
      .filter((g) => !g.DID_NOT_PLAY && g.SEASON_TYPE !== "Pre Season" && (g[metric] != null || metric === "PLUS_MINUS"))
      .sort((a, b) => (a.GAME_DATE ?? "").localeCompare(b.GAME_DATE ?? ""));
  }, [games, metric]);

  const recent10 = useMemo(() => playedGamesChronological.slice(-10), [playedGamesChronological]);
  const recent5 = useMemo(() => playedGamesChronological.slice(-5), [playedGamesChronological]);

  if (recent5.length < 1) {
    return null; // No played game this season yet
  }

  // Calculate averages
  const calcAvg = (rows: GameRow[], m: TrendMetric): number => {
    const valid = rows.map((r) => Number(r[m] ?? 0)).filter((v) => !isNaN(v));
    if (valid.length === 0) return 0;
    return valid.reduce((acc, v) => acc + v, 0) / valid.length;
  };

  const l5Avg = calcAvg(recent5, metric);
  const l10Avg = calcAvg(recent10, metric);
  const seasonBenchmark = seasonAvgs ? Number(seasonAvgs[metric as keyof SeasonAverages] ?? 0) : l10Avg;
  const diffFromSeason = l5Avg - seasonBenchmark;

  // Chart metrics
  const values = recent10.map((g) => Number(g[metric] ?? 0));
  const maxVal = Math.max(...values, seasonBenchmark, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;

  // SVG dimensions
  const svgWidth = 460;
  const svgHeight = 110;
  const padX = 24;
  const padY = 16;
  const chartW = svgWidth - padX * 2;
  const chartH = svgHeight - padY * 2;

  const points = recent10.map((g, idx) => {
    const x = padX + (idx / Math.max(recent10.length - 1, 1)) * chartW;
    const yVal = Number(g[metric] ?? 0);
    const y = padY + chartH - ((yVal - minVal) / range) * chartH;
    return { x, y, val: yVal, game: g };
  });

  const pathD = points.length > 1
    ? points.reduce((acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, "")
    : "";

  const areaD = points.length > 1
    ? `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${svgHeight - padY} L ${points[0].x.toFixed(1)} ${svgHeight - padY} Z`
    : "";

  const benchmarkY = padY + chartH - ((seasonBenchmark - minVal) / range) * chartH;

  const metricLabels: { id: TrendMetric; label: string }[] = [
    { id: "PTS", label: "Sayı (PTS)" },
    { id: "REB", label: "Ribaund (REB)" },
    { id: "AST", label: "Asist (AST)" },
    { id: "MIN", label: "Dakika (MIN)" },
    { id: "PLUS_MINUS", label: "+/- Verimlilik" },
  ];

  return (
    <Card padding="md" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          {diffFromSeason >= 1 ? (
            <div className="flex h-7 w-7 items-center justify-center rounded bg-status-success/10 text-status-success">
              <TrendingUp size={16} strokeWidth={2} />
            </div>
          ) : diffFromSeason <= -1 ? (
            <div className="flex h-7 w-7 items-center justify-center rounded bg-status-error/10 text-status-error">
              <TrendingDown size={16} strokeWidth={2} />
            </div>
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded bg-background-tertiary text-text-secondary">
              <Minus size={16} strokeWidth={2} />
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Form & Trend Radarı</h3>
            <p className="text-xs text-text-secondary">Son maçlar vs sezon ortalaması gidişatı</p>
          </div>
        </div>

        {/* Metric Selector Pills */}
        <div className="flex flex-wrap items-center gap-1">
          {metricLabels.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMetric(m.id)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                metric === m.id
                  ? "bg-primary text-white"
                  : "border border-border bg-background-primary text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
              }`}
            >
              {m.label.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-center">
        {/* Left Side: Summary Badges */}
        <div className="grid grid-cols-3 gap-2 lg:col-span-4">
          <div className="rounded border border-border bg-background-secondary p-2.5">
            <span className="text-xs font-medium text-text-secondary">Son {recent5.length} maç</span>
            <p className="mt-1 text-base font-semibold text-text-primary tabular-nums">
              {l5Avg.toFixed(1)}
            </p>
            <div className="mt-1 flex items-center gap-1 text-xs font-medium">
              {diffFromSeason > 0.3 ? (
                <span className="text-status-success">
                  +{diffFromSeason.toFixed(1)} (Yükselişte)
                </span>
              ) : diffFromSeason < -0.3 ? (
                <span className="text-status-error">
                  {diffFromSeason.toFixed(1)} (Düşüşte)
                </span>
              ) : (
                <span className="text-text-muted">Stabil</span>
              )}
            </div>
          </div>

          <div className="rounded border border-border bg-background-secondary p-2.5">
            <span className="text-xs font-medium text-text-secondary">Son 10 maç</span>
            <p className="mt-1 text-base font-semibold text-text-primary tabular-nums">
              {l10Avg.toFixed(1)}
            </p>
            <span className="mt-1 block text-xs text-text-muted">
              {recent10.length} maç ort.
            </span>
          </div>

          <div className="rounded border border-border bg-background-secondary p-2.5">
            <span className="text-xs font-medium text-text-secondary">Sezon ort.</span>
            <p className="mt-1 text-base font-semibold text-text-primary tabular-nums">
              {seasonBenchmark.toFixed(1)}
            </p>
            <span className="mt-1 block text-xs text-text-muted">Referans</span>
          </div>
        </div>

        {/* Right Side: Trend Sparkline Chart */}
        <div className="relative overflow-hidden rounded border border-border bg-background-secondary p-3 lg:col-span-8">
          <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
            <span>Son {recent10.length} Karşılaşma İlerlemesi</span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="inline-block h-0.5 w-3 bg-text-muted border-b border-dashed border-text-muted" />
              Sezon Ort: {seasonBenchmark.toFixed(1)}
            </span>
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-24 overflow-visible"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary, #10b981)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="var(--color-primary, #10b981)" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Benchmark Reference Line */}
              {benchmarkY >= padY && benchmarkY <= svgHeight - padY && (
                <line
                  x1={padX}
                  y1={benchmarkY}
                  x2={svgWidth - padX}
                  y2={benchmarkY}
                  stroke="currentColor"
                  className="text-text-muted opacity-40"
                  strokeDasharray="4 3"
                  strokeWidth="1.2"
                />
              )}

              {/* Fill Area Under Curve */}
              {areaD && <path d={areaD} fill="url(#trendGradient)" />}

              {/* Main Trend Line */}
              {pathD && (
                <path
                  d={pathD}
                  fill="none"
                  stroke="var(--color-primary, #10b981)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Data Points */}
              {points.map((p, i) => (
                <g key={i} className="group cursor-pointer">
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={i === points.length - 1 ? 4.5 : 3}
                    className={
                      i === points.length - 1
                        ? "fill-primary stroke-background-primary stroke-2"
                        : "fill-primary"
                    }
                  />
                  <title>
                    {`${p.game.GAME_DATE ?? ""} vs ${p.game.MATCHUP ?? "Rakip"}: ${p.val} ${metric}`}
                  </title>
                </g>
              ))}
            </svg>
          </div>

          <div className="flex items-center justify-between text-xs text-text-muted pt-1 border-t border-border-light">
            <span>{recent10[0]?.GAME_DATE ?? "İlk maç"}</span>
            <span className="font-medium text-text-secondary">
              Son Maç: {recent10[recent10.length - 1]?.[metric] ?? 0} {metric} ({recent10[recent10.length - 1]?.MATCHUP ?? ""})
            </span>
            <span>{recent10[recent10.length - 1]?.GAME_DATE ?? "Son maç"}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ─────────── League leaders (landing) ─────────── */
type LeaderKey = "PTS" | "REB" | "AST" | "STL" | "BLK" | "FG_PCT" | "FG3_PCT";
const LEADER_COLS: { key: LeaderKey; label: string; pct?: boolean }[] = [
  { key: "PTS", label: "PTS" },
  { key: "REB", label: "REB" },
  { key: "AST", label: "AST" },
  { key: "STL", label: "STL" },
  { key: "BLK", label: "BLK" },
  { key: "FG_PCT", label: "FG%", pct: true },
  { key: "FG3_PCT", label: "3P%", pct: true },
];
const POSITION_GROUPS = [
  { id: "all", label: "Tümü" },
  { id: "GUARD", label: "Guard" },
  { id: "FORWARD", label: "Forward" },
  { id: "CENTER", label: "Center" },
];
const PAGE_SIZE = 25;

function DiscoveryGrid({
  profiles,
  averagesData,
  onSelect,
  seasons,
}: {
  profiles: PlayerProfile[];
  averagesData: Record<string, Record<string, SeasonAverages>>;
  onSelect: (p: PlayerProfile) => void;
  seasons: string[];
}) {
  const seasonsDesc = useMemo(() => [...seasons].reverse(), [seasons]);
  const defaultSeason = useMemo(
    () =>
      seasonsDesc.find((sn) =>
        profiles.some(
          (p) => (averagesData[String(p.PLAYER_ID)]?.[sn]?.games_played ?? 0) >= 15
        )
      ) ??
      seasonsDesc[0] ??
      "",
    [profiles, averagesData, seasonsDesc]
  );
  const [season, setSeason] = useState(defaultSeason);
  const [team, setTeam] = useState("all");
  const [position, setPosition] = useState("all");
  const [sortKey, setSortKey] = useState<LeaderKey>("PTS");
  const [shown, setShown] = useState(PAGE_SIZE);

  const rows = useMemo(
    () =>
      profiles.flatMap((p) => {
        const a = averagesData[String(p.PLAYER_ID)]?.[season];
        if (!a || a.games_played < 10) return [];
        return [{ p, a, team: a.teams?.[a.teams.length - 1] ?? p.CURRENT_TEAM ?? null }];
      }),
    [profiles, averagesData, season]
  );
  const teams = useMemo(
    () => [...new Set(rows.map((r) => r.team).filter(Boolean) as string[])].sort(),
    [rows]
  );
  const list = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            (team === "all" || r.team === team) &&
            (position === "all" || r.p.POSITION_GROUP === position)
        )
        .sort((x, y) => (y.a[sortKey] ?? -1) - (x.a[sortKey] ?? -1)),
    [rows, team, position, sortKey]
  );
  const reset = () => setShown(PAGE_SIZE);

  const selectCls =
    "h-9 rounded border border-border bg-background-primary px-3 text-sm font-medium text-text-primary focus:border-border-focus focus:ring-1 focus:ring-border-focus focus:outline-none transition-colors";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Lig liderleri</h2>
          <p className="text-xs sm:text-sm text-text-secondary">
            Maç başına ortalamalar · en az 10 maç ·{" "}
            <span className="tabular-nums font-medium text-text-primary">{list.length}</span> oyuncu
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Sezon"
            value={season}
            onChange={(e) => {
              setSeason(e.target.value);
              setTeam("all");
              reset();
            }}
            className={`${selectCls} tabular-nums`}
          >
            {seasonsDesc.map((sn) => (
              <option key={sn} value={sn}>
                {sn}
              </option>
            ))}
          </select>
          <select
            aria-label="Takım"
            value={team}
            onChange={(e) => {
              setTeam(e.target.value);
              reset();
            }}
            className={selectCls}
          >
            <option value="all">Tüm takımlar</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <div
            role="group"
            aria-label="Pozisyon"
            className="inline-flex rounded border border-border bg-background-tertiary p-0.5"
          >
            {POSITION_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={position === g.id}
                onClick={() => {
                  setPosition(g.id);
                  reset();
                }}
                className={`h-8 rounded-sm px-3 text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                  position === g.id
                    ? "bg-background-primary text-text-primary border border-border"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-border bg-background-primary">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background-tertiary text-left text-xs font-semibold text-text-secondary">
              <th className="w-10 px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">Oyuncu</th>
              <th className="px-3 py-2.5">Takım</th>
              <th className="px-3 py-2.5 text-right">GP</th>
              {LEADER_COLS.map((c) => (
                <th key={c.key} className="px-2 py-1 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setSortKey(c.key);
                      reset();
                    }}
                    aria-sort={sortKey === c.key ? "descending" : "none"}
                    className={`rounded px-1.5 py-1 transition-colors cursor-pointer hover:text-text-primary ${
                      sortKey === c.key ? "text-text-primary font-semibold" : ""
                    }`}
                  >
                    {c.label}
                    {sortKey === c.key ? " ↓" : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {list.slice(0, shown).map(({ p, a, team: t }, i) => (
              <tr
                key={p.PLAYER_ID}
                onClick={() => onSelect(p)}
                className="cursor-pointer hover:bg-background-tertiary transition-colors"
              >
                <td className="px-3 py-2.5 tabular-nums text-text-secondary text-xs">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(p);
                    }}
                    className="flex items-center gap-3 text-left cursor-pointer"
                  >
                    <PlayerPhoto
                      playerId={p.PLAYER_ID}
                      name={p.PLAYER_NAME ?? ""}
                      size={32}
                      className="rounded-full border border-border"
                    />
                    <div>
                      <span className="font-medium text-text-primary">{p.PLAYER_NAME}</span>
                      {p.OFFICIAL_POSITION && (
                        <span className="ml-2 text-xs text-text-secondary font-normal">
                          {p.OFFICIAL_POSITION}
                        </span>
                      )}
                    </div>
                  </button>
                </td>
                <td className="px-3 py-2.5">
                  {t && (
                    <span className="flex items-center gap-2 text-text-secondary text-xs font-medium">
                      <TeamLogo abbr={t} name="" size={20} />
                      {t}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary text-xs">
                  {a.games_played}
                </td>
                {LEADER_COLS.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-2.5 text-right tabular-nums text-xs ${
                      sortKey === c.key
                        ? "font-semibold text-text-primary"
                        : "text-text-secondary font-normal"
                    }`}
                  >
                    {c.pct ? fmtPct(a[c.key]) : fmtStat(a[c.key])}
                  </td>
                ))}
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={4 + LEADER_COLS.length} className="px-4 py-8">
                  <EmptyState
                    icon={<User size={28} strokeWidth={1.5} />}
                    title="Oyuncu bulunamadı"
                    description="Seçilen filtre kriterlerine uygun oyuncu kaydı mevcut değil."
                    actionLabel="Filtreleri sıfırla"
                    onAction={() => {
                      setTeam("all");
                      setPosition("all");
                      reset();
                    }}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {shown < list.length && (
        <div className="flex justify-center pt-2">
          <Button variant="secondary" size="md" onClick={() => setShown((n) => n + PAGE_SIZE)}>
            Daha fazla göster
          </Button>
        </div>
      )}
    </div>
  );
}

function PlayerPageSkeleton({ initialPlayer }: { initialPlayer?: boolean }) {
  return (
    <div className="space-y-6">
      {/* Search Bar Skeleton */}
      <Skeleton className="h-10 w-full rounded" />

      {initialPlayer ? (
        <div className="space-y-5">
          {/* Back button skeleton */}
          <Skeleton className="h-8 w-36 rounded" />

          {/* Hero Card Skeleton */}
          <Card padding="md" className="space-y-4">
            <div className="flex items-start gap-4">
              <Skeleton variant="circular" width={64} height={64} className="shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-6 w-48 rounded" />
                <Skeleton className="h-4 w-72 rounded" />
              </div>
              <Skeleton className="h-9 w-28 rounded" />
            </div>
            <div className="border-t border-border-light pt-4 flex gap-6">
              <Skeleton className="h-12 w-20 rounded" />
              <Skeleton className="h-12 w-20 rounded" />
              <Skeleton className="h-12 w-20 rounded" />
              <Skeleton className="h-12 w-32 rounded" />
            </div>
          </Card>

          {/* Table Skeleton */}
          <Card padding="md" className="space-y-4">
            <div className="flex justify-between items-center">
              <Skeleton className="h-5 w-40 rounded" />
              <Skeleton className="h-7 w-24 rounded" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded" />
              ))}
            </div>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="space-y-1">
              <Skeleton className="h-5 w-32 rounded" />
              <Skeleton className="h-4 w-48 rounded" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24 rounded" />
              <Skeleton className="h-9 w-32 rounded" />
              <Skeleton className="h-9 w-40 rounded" />
            </div>
          </div>
          <Card padding="none" className="overflow-hidden">
            <div className="space-y-1 p-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ─────────── Main Component ─────────── */
export default function PlayerPage({
  initialPlayerId = null,
  onSelectGame,
}: {
  initialPlayerId?: number | null;
  onSelectGame?: (gameId: string) => void;
}) {
  const [seasonsList, setSeasonsList] = useState<string[]>([
    "2022-23",
    "2023-24",
    "2024-25",
    "2025-26",
    "2026-27",
  ]);
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [gamesData, setGamesData] = useState<Record<string, Record<string, GameRow[]>>>({});
  const [averagesData, setAveragesData] = useState<Record<string, Record<string, SeasonAverages>>>({});
  const [loading, setLoading] = useState(true);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerProfile | null>(null);
  const [selectedSeason, setSelectedSeason] = useState("2026-27");
  const [opponentSearch, setOpponentSearch] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (initialPlayerId != null) {
        loadPrivateApi(
          `/frontend-data-api/players/${encodeURIComponent(String(initialPlayerId))}`
        ).catch(() => {});
      }

      loadPrivateApi<string[]>("/frontend-data-api/seasons")
        .then((data) => {
          if (Array.isArray(data) && data.length > 0) {
            const asc = [...data].sort((a, b) => a.localeCompare(b));
            setSeasonsList(asc);
          }
        })
        .catch(() => {});

      const [prof, avgs] = await Promise.all([
        loadPrivateApi<PlayerProfile[]>("/frontend-data-api/player-profiles"),
        loadPrivateApi<Record<string, Record<string, SeasonAverages>>>(
          "/frontend-data-api/player-season-averages"
        ),
      ]);
      setProfiles(prof);
      setAveragesData(avgs);
    } catch (e) {
      setError((e instanceof Error && e.message) || "Oyuncu verileri yüklenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }, [initialPlayerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredProfiles = useMemo(() => {
    if (!search.trim()) return profiles.slice(0, 20);
    const q = search.toLowerCase();
    return profiles.filter((p) => p.PLAYER_NAME?.toLowerCase().includes(q)).slice(0, 20);
  }, [profiles, search]);

  const handleSelectPlayer = useCallback((p: PlayerProfile, targetSeason?: string) => {
    setSelectedPlayer(p);
    setOpponentSearch("");
    setSearch("");
    setShowDropdown(false);
    updateUrlRoute({ playerId: p.PLAYER_ID });
    const playerId = String(p.PLAYER_ID);

    setPlayerLoading(true);

    loadPrivateApi<{
      player_id: string;
      games: Record<string, GameRow[]>;
      averages: Record<string, SeasonAverages>;
    }>(`/frontend-data-api/players/${encodeURIComponent(playerId)}`)
      .then((payload) => {
        setGamesData((prev) => ({ ...prev, [payload.player_id]: payload.games }));
        setAveragesData((prev) => ({ ...prev, [payload.player_id]: payload.averages }));

        // Pick best available season for this player
        const games = payload.games ?? {};
        const avgs = payload.averages ?? {};
        const available = seasonsList.filter(
          (s) => games[s]?.length > 0 || avgs[s] != null || s === "2026-27"
        );
        if (targetSeason && available.includes(targetSeason)) {
          setSelectedSeason(targetSeason);
        } else if (available.length > 0) {
          setSelectedSeason(available[available.length - 1]);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setPlayerLoading(false));
  }, [seasonsList]);

  // Initial load or URL prop sync
  useEffect(() => {
    if (initialPlayerId == null || loading) return;
    const target = profiles.find((profile) => profile.PLAYER_ID === initialPlayerId);
    if (target && selectedPlayer?.PLAYER_ID !== target.PLAYER_ID) {
      handleSelectPlayer(target);
    }
  }, [handleSelectPlayer, initialPlayerId, loading, profiles, selectedPlayer?.PLAYER_ID]);

  // Listen to browser popstate (back/forward)
  useEffect(() => {
    const handlePopState = () => {
      const route = parseUrlRoute();
      if (route.tab === "player-profile") {
        if (route.playerId == null) {
          setSelectedPlayer(null);
        } else if (profiles.length > 0) {
          const target = profiles.find((profile) => profile.PLAYER_ID === route.playerId);
          if (target && target.PLAYER_ID !== selectedPlayer?.PLAYER_ID) {
            handleSelectPlayer(target);
          }
        }
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [handleSelectPlayer, profiles, selectedPlayer?.PLAYER_ID]);

  const pid = selectedPlayer ? String(selectedPlayer.PLAYER_ID) : null;
  const playerGames = useMemo(() => (pid ? gamesData[pid] ?? {} : {}), [pid, gamesData]);
  const playerAvgs = useMemo(() => (pid ? averagesData[pid] ?? {} : {}), [pid, averagesData]);
  const availableSeasons = useMemo(() => {
    return seasonsList.filter(
      (s) => playerGames[s]?.length > 0 || playerAvgs[s] != null || s === "2026-27"
    );
  }, [seasonsList, playerGames, playerAvgs]);
  const currentAvgs = playerAvgs[selectedSeason] ?? null;
  const teamForSeason = (s: string) =>
    playerAvgs[s]?.teams?.at(-1) ??
    playerGames[s]?.[0]?.TEAM_ABBREVIATION ??
    (s === "2026-27" ? selectedPlayer?.CURRENT_TEAM ?? null : null);

  const currentGames = useMemo(() => {
    const games = playerGames[selectedSeason] ?? [];
    const sorted = [...games].sort((a, b) => {
      const dateA = a.GAME_DATE ?? "";
      const dateB = b.GAME_DATE ?? "";
      return dateB.localeCompare(dateA);
    });

    const query = opponentSearch.toLowerCase().trim();
    if (!query) return sorted;

    return sorted.filter((g) => {
      const teamAbbr = g.TEAM_ABBREVIATION ?? "";
      const home = g.HOME_TEAM_ABBREVIATION ?? "";
      const away = g.AWAY_TEAM_ABBREVIATION ?? "";
      const homeName = g.HOME_TEAM_NAME ?? "";
      const awayName = g.AWAY_TEAM_NAME ?? "";
      const matchup = g.MATCHUP ?? "";

      const oppAbbr = (teamAbbr === home ? away : home).toLowerCase();
      const oppName = (teamAbbr === home ? awayName : homeName).toLowerCase();

      return (
        oppAbbr.includes(query) ||
        oppName.includes(query) ||
        matchup.toLowerCase().includes(query)
      );
    });
  }, [playerGames, selectedSeason, opponentSearch]);

  if (loading) {
    return <PlayerPageSkeleton initialPlayer={initialPlayerId != null} />;
  }

  if (error) {
    return (
      <div className="py-8">
        <InlineError
          title="Oyuncu verileri yüklenemedi"
          message={error}
          onRetry={loadData}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div className="relative w-full">
        <Input
          id="player-profile-search"
          type="text"
          aria-label="Oyuncu ara"
          autoComplete="off"
          placeholder="Oyuncu ara (örn. LeBron James, Stephen Curry)"
          leftIcon={<Search size={16} strokeWidth={1.5} />}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => {
            if (search.trim().length > 0) setShowDropdown(true);
          }}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && filteredProfiles.length > 0) {
              handleSelectPlayer(filteredProfiles[0]);
              setShowDropdown(false);
            }
          }}
          className="h-10 pr-9"
        />
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setShowDropdown(false);
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus cursor-pointer"
            aria-label="Aramayı temizle"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        )}

        {showDropdown && search.trim().length > 0 && (
          <div className="absolute left-0 right-0 z-50 mt-1.5 max-h-72 overflow-y-auto rounded border border-border bg-background-primary shadow-md divide-y divide-border-light">
            {filteredProfiles.length > 0 ? (
              filteredProfiles.map((p) => (
                <button
                  key={p.PLAYER_ID}
                  type="button"
                  onMouseDown={() => {
                    handleSelectPlayer(p);
                    setShowDropdown(false);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-background-tertiary focus-visible:bg-background-tertiary focus-visible:outline-none cursor-pointer"
                >
                  <PlayerPhoto
                    playerId={p.PLAYER_ID}
                    name={p.PLAYER_NAME ?? ""}
                    size={32}
                    className="border border-border"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text-primary">{p.PLAYER_NAME}</p>
                    <p className="text-xs text-text-secondary truncate">
                      {[
                        p.OFFICIAL_POSITION,
                        p.CURRENT_TEAM,
                        p.FROM_YEAR && p.TO_YEAR && `${p.FROM_YEAR}–${p.TO_YEAR}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-xs text-text-muted">
                &quot;{search}&quot; ile eşleşen oyuncu bulunamadı.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Player Profile View */}
      {selectedPlayer && (
        <div className="space-y-5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedPlayer(null);
              setSearch("");
              updateUrlRoute({ playerId: null });
            }}
            leftIcon={<ArrowLeft size={16} strokeWidth={1.5} />}
          >
            Oyuncu profilleri
          </Button>

          <PlayerHeroCard
            player={selectedPlayer}
            season={selectedSeason}
            seasons={availableSeasons}
            avgs={currentAvgs}
            loading={playerLoading}
            onSeasonChange={setSelectedSeason}
            teamFor={teamForSeason}
          />

          {availableSeasons.length === 0 ? (
            <EmptyState
              icon={<User size={28} strokeWidth={1.5} />}
              title="Maç kaydı bulunamadı"
              description="Bu oyuncu için veritabanında henüz maç kaydı bulunmuyor."
            />
          ) : (
            <>
              {/* Performance Trend Radar */}
              <PlayerTrendRadar
                games={playerGames[CURRENT_SEASON] ?? []}
                seasonAvgs={playerAvgs[CURRENT_SEASON] ?? null}
              />

              {/* Game Log Section */}
              <Card padding="md" className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-light pb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">
                      <span className="tabular-nums">{selectedSeason}</span> maç günlüğü
                    </h2>
                    <p className="text-xs text-text-secondary tabular-nums">
                      {currentGames.length} karşılaşma
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="warning" size="sm">
                      <span className="tabular-nums">
                        {currentGames.filter((g) => g.DID_NOT_PLAY).length}
                      </span>{" "}
                      DNP
                    </Badge>
                    <Badge variant="info" size="sm">
                      <span className="tabular-nums">
                        {currentGames.filter((g) => g.IS_PLAYOFF).length}
                      </span>{" "}
                      playoff
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {(playerGames[selectedSeason] ?? []).length > 0 && (
                    <div className="relative w-full sm:max-w-sm">
                      <Input
                        type="text"
                        aria-label="Rakip takıma göre filtrele"
                        autoComplete="off"
                        placeholder="Rakip takım (örn. GSW)"
                        leftIcon={<Search size={16} strokeWidth={1.5} />}
                        value={opponentSearch}
                        onChange={(e) => setOpponentSearch(e.target.value)}
                        className="h-9 pr-9"
                      />
                      {opponentSearch && (
                        <button
                          type="button"
                          onClick={() => setOpponentSearch("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus cursor-pointer"
                          aria-label="Filtreyi temizle"
                        >
                          <X size={16} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary sm:ml-auto">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-status-warning" aria-hidden="true" />
                      DNP: oynamadı
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Badge variant="primary" size="sm">PO</Badge>
                      Playoff
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Badge variant="neutral" size="sm">RS</Badge>
                      Normal sezon
                    </span>
                  </div>
                </div>

                {(playerGames[selectedSeason] ?? []).length > 0 ? (
                  currentGames.length > 0 ? (
                    <GameLogTable
                      games={currentGames}
                      onGameClick={(g) => {
                        if (onSelectGame) {
                          onSelectGame(g.GAME_ID);
                        } else {
                          updateUrlRoute({ tab: "game-results", gameId: g.GAME_ID });
                        }
                      }}
                    />
                  ) : (
                    <EmptyState
                      title="Eşleşen maç bulunamadı"
                      description={`"${opponentSearch}" aramasıyla eşleşen karşılaşma kaydı bulunmuyor.`}
                      actionLabel="Filtreyi temizle"
                      onAction={() => setOpponentSearch("")}
                    />
                  )
                ) : selectedSeason === "2026-27" ? (
                  <EmptyState
                    icon={<Calendar size={28} strokeWidth={1.5} />}
                    title="Henüz maç oynanmadı"
                    description="Maç kayıtları sezon başladığında burada görüntülenecektir."
                  />
                ) : (
                  <EmptyState
                    icon={<Calendar size={28} strokeWidth={1.5} />}
                    title="Maç kaydı bulunamadı"
                    description={`${selectedSeason} sezonu için kayıtlı maç bulunmuyor.`}
                  />
                )}
              </Card>
            </>
          )}
        </div>
      )}

      {/* Discovery grid (shown when no player selected) */}
      {!selectedPlayer && profiles.length > 0 && (
        <DiscoveryGrid
          profiles={profiles}
          averagesData={averagesData}
          onSelect={handleSelectPlayer}
          seasons={seasonsList}
        />
      )}
    </div>
  );
}
