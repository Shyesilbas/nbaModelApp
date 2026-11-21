import { useEffect, useState } from "react";
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
  /** Seconds on court; present only when `GameQuarters.minutes_available` is true. */
  sec?: number;
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
  /** True when the lineup rebuild matched the box score, so each period line carries `sec`. */
  minutes_available?: boolean;
}

export const EMPTY_QUARTER_LINE: QuarterStatLine = {
  pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
};

/** Quarter data comes from the full play-by-play file, so it only exists for seasons that have one. */
export function useGameQuarters(gameId: string | null | undefined, season: string | null | undefined) {
  const requestKey = gameId ? `${season ?? ""}:${gameId}` : null;
  const [result, setResult] = useState<{ key: string; data: GameQuarters | null } | null>(null);

  useEffect(() => {
    if (!gameId || !requestKey) return;
    let cancelled = false;
    const query = season ? `?season=${encodeURIComponent(season)}` : "";
    loadPrivateApi<GameQuarters>(`/frontend-data-api/game-quarters/${encodeURIComponent(gameId)}${query}`)
      .then((res) => {
        if (!cancelled) {
          setResult({ key: requestKey, data: res && Array.isArray(res.players) ? res : null });
        }
      })
      .catch(() => {
        if (!cancelled) setResult({ key: requestKey, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, season, requestKey]);

  const data = requestKey && result?.key === requestKey ? result.data : null;
  const loading = Boolean(requestKey) && result?.key !== requestKey;
  return { data, loading };
}

export function sumPeriods(player: QuarterPlayer, periods?: number[]): QuarterStatLine {
  const keys = periods ? periods.map(String) : Object.keys(player.periods);
  const out = { ...EMPTY_QUARTER_LINE };
  for (const k of keys) {
    const row = player.periods[k];
    if (!row) continue;
    (Object.keys(EMPTY_QUARTER_LINE) as (keyof QuarterStatLine)[]).forEach((s) => {
      out[s] = (out[s] ?? 0) + (row[s] ?? 0);
    });
    if (row.sec !== undefined) out.sec = (out.sec ?? 0) + row.sec;
  }
  return out;
}

/** Seconds on court as m:ss, or a dash when unknown. */
export function formatSeconds(sec: number | undefined): string {
  if (sec === undefined) return "—";
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
