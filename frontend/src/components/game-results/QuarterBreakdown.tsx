import { useEffect, useState } from "react";
import PlayerPhoto from "../PlayerPhoto";
import { loadPrivateApi } from "../../lib/dataCache";

export interface QuarterStatLine {
  pts: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
}

export interface QuarterPlayer {
  player_id: number;
  name: string;
  team: string;
  periods: Record<string, QuarterStatLine>;
}

export interface GameQuarters {
  game_id: string;
  home_team: string;
  away_team: string;
  periods: { period: number; label: string }[];
  quarter_scores: { quarter: string; home: number; away: number }[];
  players: QuarterPlayer[];
}

const EMPTY: QuarterStatLine = {
  pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
};

/** Quarter data comes from the full play-by-play file, so it only exists for seasons that have one. */
export function useGameQuarters(gameId: string | null | undefined, season: string | null | undefined) {
  const [data, setData] = useState<GameQuarters | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!gameId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const query = season ? `?season=${encodeURIComponent(season)}` : "";
    loadPrivateApi<GameQuarters>(`/frontend-data-api/game-quarters/${encodeURIComponent(gameId)}${query}`)
      .then((res) => {
        if (!cancelled) setData(res && Array.isArray(res.players) ? res : null);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, season]);

  return { data, loading };
}

export function sumPeriods(player: QuarterPlayer, periods?: number[]): QuarterStatLine {
  const keys = periods ? periods.map(String) : Object.keys(player.periods);
  const out = { ...EMPTY };
  for (const k of keys) {
    const row = player.periods[k];
    if (!row) continue;
    (Object.keys(out) as (keyof QuarterStatLine)[]).forEach((s) => {
      out[s] += row[s];
    });
  }
  return out;
}

export function PeriodTabs({
  periods,
  value,
  onChange,
  totalLabel,
}: {
  periods: { period: number; label: string }[];
  value: number | "total";
  onChange: (v: number | "total") => void;
  totalLabel: string;
}) {
  const items: { id: number | "total"; label: string }[] = [
    { id: "total", label: totalLabel },
    ...periods.map((p) => ({ id: p.period, label: p.label })),
  ];
  return (
    <div role="tablist" className="flex gap-4 text-xs">
      {items.map((it) => (
        <button
          key={String(it.id)}
          type="button"
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={`cursor-pointer transition-colors ${
            value === it.id ? "font-semibold text-text-primary" : "text-text-muted hover:text-text-primary"
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

const made = (m: number, a: number) => (a > 0 ? `${m}/${a}` : "—");

/** One team's players for a single period, sorted by points. */
export function QuarterPlayerTable({
  data,
  team,
  period,
  nameById,
  onSelectPlayer,
}: {
  data: GameQuarters;
  team: string;
  period: number;
  nameById?: Record<number, string>;
  onSelectPlayer?: (id: number) => void;
}) {
  const rows = data.players
    .filter((p) => p.team === team && p.periods[String(period)])
    .map((p) => ({ p, s: p.periods[String(period)] }))
    .filter(({ s }) => s.pts + s.reb + s.ast + s.stl + s.blk + s.tov + s.fga + s.fta > 0)
    .sort((a, b) => b.s.pts - a.s.pts || b.s.reb + b.s.ast - (a.s.reb + a.s.ast));

  if (rows.length === 0) return <p className="py-4 text-xs text-text-muted">—</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-text-secondary">
            <th className="py-2 pr-3 text-left font-medium">Oyuncu</th>
            {["PTS", "REB", "AST"].map((h) => (
              <th key={h} className="px-2 py-2 text-right font-medium text-text-primary">{h}</th>
            ))}
            {["FG", "3P", "FT", "STL", "BLK", "TOV", "PF"].map((h) => (
              <th key={h} className="px-2 py-2 text-right font-normal text-text-muted">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-light">
          {rows.map(({ p, s }) => (
            <tr key={p.player_id} className="hover:bg-background-tertiary">
              <td className="py-2 pr-3">
                <button
                  type="button"
                  disabled={!onSelectPlayer}
                  onClick={() => onSelectPlayer?.(p.player_id)}
                  className="flex cursor-pointer items-center gap-2 text-left disabled:cursor-default"
                >
                  <PlayerPhoto playerId={p.player_id} name={nameById?.[p.player_id] ?? p.name} size={24} />
                  <span className="text-sm text-text-primary">{nameById?.[p.player_id] ?? p.name}</span>
                </button>
              </td>
              <td className="px-2 py-2 text-right text-sm font-semibold tabular-nums text-text-primary">{s.pts}</td>
              <td className="px-2 py-2 text-right text-sm font-semibold tabular-nums text-text-primary">{s.reb}</td>
              <td className="px-2 py-2 text-right text-sm font-semibold tabular-nums text-text-primary">{s.ast}</td>
              <td className="px-2 py-2 text-right tabular-nums text-text-muted">{made(s.fgm, s.fga)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-text-muted">{made(s.fg3m, s.fg3a)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-text-muted">{made(s.ftm, s.fta)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-text-muted">{s.stl}</td>
              <td className="px-2 py-2 text-right tabular-nums text-text-muted">{s.blk}</td>
              <td className="px-2 py-2 text-right tabular-nums text-text-muted">{s.tov}</td>
              <td className="px-2 py-2 text-right tabular-nums text-text-muted">{s.pf}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A single player's line split by period, with a total row. */
export function PlayerQuarterTable({ data, playerId }: { data: GameQuarters; playerId: number }) {
  const player = data.players.find((p) => p.player_id === playerId);
  if (!player) return null;
  const total = sumPeriods(player);
  const rows: { label: string; s: QuarterStatLine; strong?: boolean }[] = [
    ...data.periods.map((p) => ({ label: p.label, s: player.periods[String(p.period)] ?? EMPTY })),
    { label: "Toplam", s: total, strong: true },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-text-secondary">
            <th className="py-2 pr-3 text-left font-medium">Periyot</th>
            {["PTS", "REB", "AST"].map((h) => (
              <th key={h} className="px-2 py-2 text-right font-medium text-text-primary">{h}</th>
            ))}
            {["FG", "3P", "FT", "STL", "BLK", "TOV", "PF"].map((h) => (
              <th key={h} className="px-2 py-2 text-right font-normal text-text-muted">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-light">
          {rows.map(({ label, s, strong }) => (
            <tr key={label} className={strong ? "border-t border-border font-semibold" : ""}>
              <td className="py-2 pr-3 text-sm text-text-primary">{label}</td>
              <td className="px-2 py-2 text-right text-sm font-semibold tabular-nums text-text-primary">{s.pts}</td>
              <td className="px-2 py-2 text-right text-sm font-semibold tabular-nums text-text-primary">{s.reb}</td>
              <td className="px-2 py-2 text-right text-sm font-semibold tabular-nums text-text-primary">{s.ast}</td>
              <td className="px-2 py-2 text-right tabular-nums text-text-muted">{made(s.fgm, s.fga)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-text-muted">{made(s.fg3m, s.fg3a)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-text-muted">{made(s.ftm, s.fta)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-text-muted">{s.stl}</td>
              <td className="px-2 py-2 text-right tabular-nums text-text-muted">{s.blk}</td>
              <td className="px-2 py-2 text-right tabular-nums text-text-muted">{s.tov}</td>
              <td className="px-2 py-2 text-right tabular-nums text-text-muted">{s.pf}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
