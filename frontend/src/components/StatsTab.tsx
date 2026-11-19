import { useEffect, useMemo, useState } from "react";
import { Card, EmptyState, InlineError, Select, Skeleton } from "./common";
import PlayerPhoto from "./PlayerPhoto";
import TeamLogo from "./TeamLogo";
import { loadPrivateApi, loadPrivateApiFresh } from "../lib/dataCache";
import { loadArchivedGameIndex } from "../lib/archiveData";
import { CURRENT_SEASON } from "../lib/constants";
import { useLanguage } from "../context/useLanguage";
import type { GameFeedRow } from "../types/gameFeed";

type Profile = { PLAYER_ID: number; PLAYER_NAME: string; CURRENT_TEAM_ABBREVIATION?: string | null };
type Avg = { games_played: number; MIN: number | null; PTS: number | null };
type AveragesMap = Record<string, Record<string, Avg>>;
type Row = { id: number; name: string; team: string; value: number; sub: string; gameId?: string };
type StatKey = "PTS" | "AST" | "REB";

const TOP_N = 5;
const MIN_GAMES_CURRENT = 5;
const MIN_GAMES_COMPLETED = 25;
const MIN_MINUTES = 10;

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {hint && <span className="text-xs text-text-muted">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function PlayerList({ title, rows, digits = 0, onSelectPlayer, onSelectGame }: {
  title: string;
  rows: Row[];
  digits?: number;
  onSelectPlayer?: (id: number) => void;
  onSelectGame?: (gameId: string) => void;
}) {
  return (
    <Card padding="none">
      <p className="border-b border-border px-4 py-3 text-xs font-medium text-text-secondary">{title}</p>
      <ol className="divide-y divide-border-light">
        {rows.map((r, i) => (
          <li key={`${r.id}-${r.gameId ?? i}`} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-4 text-xs tabular-nums text-text-muted">{i + 1}</span>
            <PlayerPhoto playerId={r.id} name={r.name} size={i === 0 ? 48 : 36} />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onSelectPlayer?.(r.id)}
                className="block max-w-full cursor-pointer truncate text-left text-sm font-medium text-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                {r.name}
              </button>
              <div className="flex items-center gap-1.5 text-xs tabular-nums text-text-muted">
                {r.team && <TeamLogo abbr={r.team} size={14} />}
                {r.gameId && onSelectGame ? (
                  <button
                    type="button"
                    onClick={() => onSelectGame(r.gameId!)}
                    className="cursor-pointer truncate hover:text-text-primary hover:underline"
                  >
                    {r.sub}
                  </button>
                ) : (
                  <span className="truncate">{r.sub}</span>
                )}
              </div>
            </div>
            <span className={`tabular-nums text-text-primary ${i === 0 ? "text-2xl font-semibold" : "text-lg font-medium"}`}>
              {r.value.toFixed(digits)}
            </span>
          </li>
        ))}
        {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-text-muted">-</li>}
      </ol>
    </Card>
  );
}

function GameList({ title, games, onSelectGame }: {
  title: string;
  games: GameFeedRow[];
  onSelectGame?: (gameId: string) => void;
}) {
  const { formatDate } = useLanguage();
  return (
    <Card padding="none">
      <p className="border-b border-border px-4 py-3 text-xs font-medium text-text-secondary">{title}</p>
      <ol className="divide-y divide-border-light">
        {games.map((g, i) => {
          const total = (g.HOME_SCORE ?? 0) + (g.AWAY_SCORE ?? 0);
          return (
            <li key={g.GAME_ID}>
              <button
                type="button"
                onClick={() => onSelectGame?.(g.GAME_ID)}
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-background-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <span className="w-4 text-xs tabular-nums text-text-muted">{i + 1}</span>
                <div className="flex min-w-0 flex-1 items-center gap-2 text-sm tabular-nums">
                  <TeamLogo abbr={g.AWAY_TEAM_ABBREVIATION} size={28} />
                  <span className="font-medium text-text-primary">{g.AWAY_SCORE}</span>
                  <span className="text-text-muted">-</span>
                  <span className="font-medium text-text-primary">{g.HOME_SCORE}</span>
                  <TeamLogo abbr={g.HOME_TEAM_ABBREVIATION} size={28} />
                  <span className="ml-2 truncate text-xs text-text-muted">
                    {g.AWAY_TEAM_ABBREVIATION} @ {g.HOME_TEAM_ABBREVIATION}, {formatDate(g.GAME_DATE)}
                  </span>
                </div>
                <span className={`tabular-nums text-text-primary ${i === 0 ? "text-2xl font-semibold" : "text-lg font-medium"}`}>
                  {total}
                </span>
              </button>
            </li>
          );
        })}
        {games.length === 0 && <li className="px-4 py-6 text-center text-sm text-text-muted">-</li>}
      </ol>
    </Card>
  );
}

export default function StatsTab({ onSelectPlayer, onSelectGame }: {
  onSelectPlayer?: (id: number) => void;
  onSelectGame?: (gameId: string) => void;
}) {
  const { language } = useLanguage();
  const tr = language === "tr";
  const [season, setSeason] = useState(CURRENT_SEASON);
  const [seasons, setSeasons] = useState<string[]>([CURRENT_SEASON]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [averages, setAverages] = useState<AveragesMap>({});
  const [loaded, setLoaded] = useState<{ season: string; games: GameFeedRow[] } | null>(null);
  const [highsState, setHighsState] = useState<{ season: string; rows: Record<StatKey, Row[]> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadPrivateApi<Profile[]>("/frontend-data-api/player-profiles"),
      loadPrivateApi<AveragesMap>("/frontend-data-api/player-season-averages"),
      loadPrivateApi<string[]>("/frontend-data-api/seasons"),
    ])
      .then(([p, a, s]) => {
        if (cancelled) return;
        setProfiles(p ?? []);
        setAverages(a ?? {});
        const list = [...(s ?? [])].sort((x, y) => y.localeCompare(x));
        if (list.length) {
          setSeasons(list);
          setSeason((cur) => (list.includes(cur) ? cur : list[0]));
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const games = useMemo(() => (loaded?.season === season ? loaded.games : []), [loaded, season]);
  const loading = loaded?.season !== season;
  const emptyHighs = useMemo<Record<StatKey, Row[]>>(() => ({ PTS: [], AST: [], REB: [] }), []);
  const highs = highsState?.season === season ? highsState.rows : emptyHighs;

  const finals = useMemo(() => {
    const done = games.filter((g) => g.GAME_STATUS === "Final" && g.HOME_SCORE != null && g.AWAY_SCORE != null);
    const regular = done.filter((g) => g.SEASON_TYPE === "Regular Season");
    return regular.length ? regular : done;
  }, [games]);

  useEffect(() => {
    let cancelled = false;
    loadArchivedGameIndex(season)
      .then((rows) => {
        if (cancelled) return;
        setLoaded({ season, games: rows });
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [season, tick]);

  // Single-game highs are precomputed server side (stored in the season DB for closed seasons).
  useEffect(() => {
    let cancelled = false;
    loadPrivateApiFresh<Record<StatKey, Row[]>>(`/frontend-data-api/season-highs?season=${encodeURIComponent(season)}`)
      .then((rows) => !cancelled && setHighsState({ season, rows }))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [season, tick]);

  const names = useMemo(() => new Map(profiles.map((p) => [String(p.PLAYER_ID), p])), [profiles]);

  const minGames = season === CURRENT_SEASON ? MIN_GAMES_CURRENT : MIN_GAMES_COMPLETED;

  const { top, low } = useMemo(() => {
    const list: Row[] = [];
    for (const [pid, bySeason] of Object.entries(averages)) {
      const a = bySeason?.[season];
      if (!a || a.PTS == null || a.games_played < minGames || (a.MIN ?? 0) < MIN_MINUTES) continue;
      const p = names.get(pid);
      list.push({
        id: Number(pid),
        name: p?.PLAYER_NAME ?? pid,
        team: p?.CURRENT_TEAM_ABBREVIATION ?? "",
        value: a.PTS,
        sub: `${a.games_played} ${tr ? "maç" : "GP"}, ${(a.MIN ?? 0).toFixed(1)} MIN`,
      });
    }
    list.sort((x, y) => y.value - x.value);
    return { top: list.slice(0, TOP_N), low: list.slice(-TOP_N).sort((a, b) => a.value - b.value) };
  }, [averages, names, season, tr, minGames]);

  const byTotal = useMemo(
    () => [...finals].sort((a, b) => a.HOME_SCORE! + a.AWAY_SCORE! - (b.HOME_SCORE! + b.AWAY_SCORE!)),
    [finals]
  );
  const highGames = useMemo(() => byTotal.slice(-TOP_N).reverse(), [byTotal]);
  const lowGames = useMemo(() => byTotal.slice(0, TOP_N), [byTotal]);

  if (error) return <InlineError title={tr ? "Yüklenemedi" : "Load failed"} message={error} onRetry={() => setTick((n) => n + 1)} />;

  const empty = !loading && !finals.length && !top.length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-base font-semibold text-text-primary">{tr ? "İstatistikler" : "Statistics"}</h2>
        <div className="w-40">
          <Select
            aria-label={tr ? "Sezon" : "Season"}
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            options={seasons.map((s) => ({ value: s, label: s }))}
          />
        </div>
      </div>

      {loading && !finals.length ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded" />
          ))}
        </div>
      ) : empty ? (
        <EmptyState title={tr ? "Bu sezon için veri yok" : "No data for this season"} />
      ) : (
        <>
          <Section title={tr ? "Maçlar" : "Games"} hint={tr ? "Toplam sayıya göre" : "By combined score"}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <GameList title={tr ? "En çok sayı çıkan maçlar" : "Highest-scoring games"} games={highGames} onSelectGame={onSelectGame} />
              <GameList title={tr ? "En az sayı çıkan maçlar" : "Lowest-scoring games"} games={lowGames} onSelectGame={onSelectGame} />
            </div>
          </Section>

          <Section
            title={tr ? "Tek maçta en yüksek" : "Single-game highs"}
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <PlayerList title={tr ? "Sayı" : "Points"} rows={highs.PTS} onSelectPlayer={onSelectPlayer} onSelectGame={onSelectGame} />
              <PlayerList title={tr ? "Asist" : "Assists"} rows={highs.AST} onSelectPlayer={onSelectPlayer} onSelectGame={onSelectGame} />
              <PlayerList title={tr ? "Ribaund" : "Rebounds"} rows={highs.REB} onSelectPlayer={onSelectPlayer} onSelectGame={onSelectGame} />
            </div>
          </Section>

          <Section
            title={tr ? "Sezon sayı ortalaması" : "Season scoring average"}
            hint={tr ? `En az ${minGames} maç, ${MIN_MINUTES} dk` : `Min. ${minGames} games, ${MIN_MINUTES} min`}
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <PlayerList title={tr ? "En yüksek" : "Highest"} rows={top} digits={1} onSelectPlayer={onSelectPlayer} />
              <PlayerList title={tr ? "En düşük" : "Lowest"} rows={low} digits={1} onSelectPlayer={onSelectPlayer} />
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
