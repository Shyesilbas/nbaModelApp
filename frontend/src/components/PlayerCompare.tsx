import React, { useMemo, useRef, useState, useEffect } from "react";
import { ArrowLeftRight, ArrowUpRight, Search, UserRound, X } from "lucide-react";
import { loadPrivateApi } from "../lib/dataCache";
import { CURRENT_SEASON } from "../lib/constants";
import { formatHeight } from "../lib/formatHeight";
import { TEAM_NAME_BY_ABBR, isKnownTeamAbbr } from "../lib/nbaTeams";
import { updateUrlRoute } from "../lib/router";
import PlayerPhoto from "./PlayerPhoto";
import TeamLogo from "./TeamLogo";
import { Button, Card, EmptyState, InlineError, Select, Skeleton } from "./common";
import { useLanguage } from "../context/useLanguage";

interface PlayerProfile {
  PLAYER_ID: number;
  PLAYER_NAME: string;
  CURRENT_TEAM?: string | null;
  CURRENT_TEAM_ABBREVIATION?: string | null;
  OFFICIAL_POSITION?: string | null;
  POSITION_GROUP?: string | null;
  HEIGHT?: string | null;
  WEIGHT?: string | null;
  COUNTRY?: string | null;
}

interface SeasonAverages {
  games_played: number;
  games_total?: number;
  teams?: string[];
  MIN: number | null;
  PTS: number | null;
  REB: number | null;
  OREB?: number | null;
  DREB?: number | null;
  AST: number | null;
  STL: number | null;
  BLK: number | null;
  TOV: number | null;
  PLUS_MINUS: number | null;
  FGM?: number | null;
  FGA?: number | null;
  FG_PCT: number | null;
  FG3M?: number | null;
  FG3A?: number | null;
  FG3_PCT: number | null;
  FTM?: number | null;
  FTA?: number | null;
  FT_PCT: number | null;
}

type AveragesMap = Record<string, Record<string, SeasonAverages>>;

interface CompareData {
  profiles: PlayerProfile[];
  averages: AveragesMap;
  seasons: string[];
}

interface PlayerCompareProps {
  initialP1Id?: number | null;
  initialP2Id?: number | null;
  onSelectPlayerProfile?: (playerId: number) => void;
}

type MetricKey =
  | "games_played"
  | "MIN"
  | "PTS"
  | "AST"
  | "REB"
  | "OREB"
  | "DREB"
  | "STL"
  | "BLK"
  | "TOV"
  | "FG_PCT"
  | "FG3_PCT"
  | "FT_PCT"
  | "PLUS_MINUS";

type StatCategory = "all" | "offense" | "defense" | "shooting";

interface Metric {
  key: MetricKey;
  label: string;
  mobileLabel?: string;
  higherIsBetter: boolean;
  /** Informational rows show both values without picking a leader or drawing bars. */
  informational?: boolean;
  format: (v: number) => string;
  subFormat?: (avgs: SeasonAverages | null) => string | null;
}

const one = (v: number) => v.toFixed(1);
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const signed = (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1));
const shotSub = (made?: number | null, att?: number | null) =>
  made != null && att != null ? `${made.toFixed(1)}/${att.toFixed(1)}` : null;

const foldText = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .toLowerCase()
    .trim();

const getPlayerTeamAbbr = (p?: PlayerProfile, avgs?: SeasonAverages | null): string | null => {
  if (avgs?.teams && avgs.teams.length > 0) return avgs.teams[avgs.teams.length - 1];
  return p?.CURRENT_TEAM || p?.CURRENT_TEAM_ABBREVIATION || null;
};

/** Metrics that count toward the lead score: primary box-score stats only (no rebound splits, no +/-). */
const LEAD_KEYS: MetricKey[] = ["PTS", "AST", "REB", "STL", "BLK", "TOV", "FG_PCT", "FG3_PCT", "FT_PCT"];

const OFFENSE_KEYS: MetricKey[] = ["PTS", "AST", "TOV", "PLUS_MINUS"];
const DEFENSE_KEYS: MetricKey[] = ["REB", "OREB", "DREB", "STL", "BLK"];
const SHOOTING_KEYS: MetricKey[] = ["FG_PCT", "FG3_PCT", "FT_PCT"];
const CONTEXT_KEYS: MetricKey[] = ["MIN", "games_played"];

const DEFAULT_LOAD_ERROR = "__COMPARE_LOAD_ERROR__";

/* ─────────── Player Hero Card with Selector Dropdown ─────────── */

function PlayerCompareCard({
  slot,
  player,
  avgs,
  season,
  seasonAverages,
  profiles,
  excludeId,
  onPick,
  onOpenProfile,
  isLeadingOverall,
}: {
  slot: string;
  player: PlayerProfile | undefined;
  avgs: SeasonAverages | null;
  season: string;
  seasonAverages: AveragesMap;
  profiles: PlayerProfile[];
  excludeId: number | undefined;
  onPick: (id: number) => void;
  onOpenProfile?: (id: number) => void;
  isLeadingOverall: boolean;
}) {
  const { t, language } = useLanguage();
  const tr = language === "tr";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const results = useMemo(() => {
    const q = foldText(query);
    const filtered = profiles.filter((p) => {
      if (p.PLAYER_ID === excludeId) return false;
      if (!q) return true;
      const name = foldText(p.PLAYER_NAME);
      const abbr = (p.CURRENT_TEAM || p.CURRENT_TEAM_ABBREVIATION || "").toLowerCase();
      const teamFull = abbr && isKnownTeamAbbr(abbr) ? foldText(TEAM_NAME_BY_ABBR[abbr]) : "";
      return name.includes(q) || abbr.includes(q) || teamFull.includes(q);
    });

    filtered.sort((a, b) => {
      const aActive = seasonAverages[String(a.PLAYER_ID)]?.[season] != null ? 0 : 1;
      const bActive = seasonAverages[String(b.PLAYER_ID)]?.[season] != null ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      if (q) {
        const aPrefix = foldText(a.PLAYER_NAME).startsWith(q) ? 0 : 1;
        const bPrefix = foldText(b.PLAYER_NAME).startsWith(q) ? 0 : 1;
        if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      }
      return a.PLAYER_NAME.localeCompare(b.PLAYER_NAME);
    });

    return filtered.slice(0, 20);
  }, [profiles, query, excludeId, seasonAverages, season]);

  const selectPlayer = (id: number) => {
    onPick(id);
    setOpen(false);
    setQuery("");
  };

  const teamAbbr = getPlayerTeamAbbr(player, avgs);
  const teamName = teamAbbr && isKnownTeamAbbr(teamAbbr) ? TEAM_NAME_BY_ABBR[teamAbbr] : teamAbbr;
  const multiTeamLabel = avgs?.teams && avgs.teams.length > 1 ? avgs.teams.join(" / ") : null;
  const pos = player?.OFFICIAL_POSITION || player?.POSITION_GROUP;
  const bioMeta = [pos, formatHeight(player?.HEIGHT)].filter(Boolean);

  const gpText = avgs
    ? avgs.games_total && avgs.games_total > avgs.games_played
      ? `${avgs.games_played}/${avgs.games_total}`
      : String(avgs.games_played)
    : null;
  const minText = avgs?.MIN != null ? `${avgs.MIN.toFixed(1)} ${tr ? "dk" : "MPG"}` : null;

  return (
    <Card
      padding="sm"
      className={`h-full transition-colors lg:relative ${isLeadingOverall ? "border-primary/50" : ""}`}
      ref={ref}
      aria-label={slot}
    >
      <div className="flex h-full flex-col items-center justify-between gap-2 text-center md:flex-row md:gap-3 md:text-left">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 md:flex-row md:items-center md:gap-3">
          {player ? (
            <PlayerPhoto playerId={player.PLAYER_ID} name={player.PLAYER_NAME} size={44} className="shrink-0" />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-background-tertiary text-text-secondary">
              <UserRound size={20} strokeWidth={1.5} aria-hidden="true" />
            </span>
          )}

          <div className="min-w-0 flex-1">
            {player && onOpenProfile ? (
              <button
                type="button"
                onClick={() => onOpenProfile(player.PLAYER_ID)}
                title={tr ? "Oyuncu profiline git" : "Open player profile"}
                className="group inline-flex max-w-full cursor-pointer items-center justify-center gap-1 text-sm font-semibold leading-snug text-text-primary transition-colors hover:text-primary md:justify-start"
              >
                <span className="group-hover:underline">{player.PLAYER_NAME}</span>
                <ArrowUpRight
                  size={13}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className="hidden shrink-0 text-text-muted transition-colors group-hover:text-primary md:inline-block"
                />
              </button>
            ) : (
              <h2 className="text-sm font-semibold leading-snug text-text-primary">
                {player?.PLAYER_NAME ?? (tr ? "Oyuncu seçilmedi" : "No player selected")}
              </h2>
            )}

            <p className="mt-0.5 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-xs tabular-nums text-text-secondary md:justify-start">
              {teamAbbr && (
                <span
                  className="inline-flex items-center gap-1"
                  title={multiTeamLabel ? `${multiTeamLabel} (${season})` : undefined}
                >
                  <TeamLogo abbr={teamAbbr} name={teamName || teamAbbr} size={14} />
                  <span className="font-medium text-text-primary">
                    <span className="md:hidden">{teamAbbr}</span>
                    <span className="hidden md:inline">{multiTeamLabel ?? teamName}</span>
                  </span>
                </span>
              )}
              {teamAbbr && bioMeta.length > 0 && (
                <span className="text-text-muted" aria-hidden="true">
                  ·
                </span>
              )}
              {bioMeta.length > 0 && <span className="text-text-muted">{bioMeta.join(" · ")}</span>}
            </p>

            {player && (
              <p className="mt-1 text-xs tabular-nums text-text-secondary">
                {avgs ? (
                  <span>
                    {gpText} {tr ? "maç" : "GP"}
                    {minText ? ` · ${minText}` : ""}
                  </span>
                ) : (
                  <span className="text-text-muted">
                    {tr ? `${season} sezonunda veri yok` : `No data for ${season}`}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          aria-expanded={open}
          aria-label={tr ? `${slot}: oyuncuyu değiştir` : `${slot}: change player`}
          title={tr ? "Oyuncuyu değiştir" : "Change player"}
          onClick={() => setOpen((o) => !o)}
          className="h-8 shrink-0 px-2.5"
        >
          <Search size={13} strokeWidth={1.5} aria-hidden="true" />
          <span>{player ? (tr ? "Değiştir" : "Change") : t.compare.selectPlayer}</span>
        </Button>
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 rounded border border-border bg-background-primary p-2.5 shadow-md">
          <div className="relative">
            <Search
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
            />
            <input
              type="text"
              autoFocus
              autoComplete="off"
              aria-label={tr ? `${slot} için oyuncu ara` : `Search player for ${slot}`}
              placeholder={tr ? "Oyuncu adı veya takım ara..." : "Search player name or team..."}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results.length > 0) {
                  e.preventDefault();
                  selectPlayer(results[0].PLAYER_ID);
                }
              }}
              className="h-9 w-full rounded border border-border bg-background-primary pl-8 pr-8 text-xs text-text-primary outline-none focus:border-border-focus"
            />
            {query && (
              <button
                type="button"
                aria-label={tr ? "Aramayı temizle" : "Clear search"}
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer p-1 text-text-secondary hover:text-text-primary"
              >
                <X size={14} strokeWidth={1.5} aria-hidden="true" />
              </button>
            )}
          </div>
          <ul className="mt-2 max-h-64 divide-y divide-border-light overflow-y-auto">
            {results.length === 0 ? (
              <li className="p-3 text-center text-xs text-text-secondary">
                {tr
                  ? `"${query}" ile eşleşen oyuncu bulunamadı.`
                  : `No players found matching "${query}".`}
              </li>
            ) : (
              results.map((p) => {
                const pAvg = seasonAverages[String(p.PLAYER_ID)]?.[season];
                const pTeam = getPlayerTeamAbbr(p, pAvg);
                const pPos = p.OFFICIAL_POSITION || p.POSITION_GROUP;
                const subMeta = [
                  pPos,
                  pAvg?.PTS != null ? `${pAvg.PTS.toFixed(1)} PTS` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={p.PLAYER_ID}>
                    <button
                      type="button"
                      onClick={() => selectPlayer(p.PLAYER_ID)}
                      className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-sm px-2.5 py-2 text-left text-sm text-text-primary transition-colors hover:bg-background-tertiary focus-visible:bg-background-tertiary focus-visible:outline-none"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME} size={28} className="shrink-0" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-text-primary">{p.PLAYER_NAME}</p>
                          {subMeta && <p className="text-xs tabular-nums text-text-secondary">{subMeta}</p>}
                        </div>
                      </div>
                      {pTeam && (
                        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-text-secondary">
                          <TeamLogo abbr={pTeam} name={pTeam} size={16} />
                          <span>{pTeam}</span>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </Card>
  );
}

/* ─────────── Comparison Row & Leader Helper ─────────── */

function CompareRow({
  metric,
  s1,
  s2,
  lead,
  lowerIsBetterHint,
}: {
  metric: Metric;
  s1: SeasonAverages | null;
  s2: SeasonAverages | null;
  lead: 1 | 2 | null;
  lowerIsBetterHint?: string;
}) {
  const v1 = s1?.[metric.key] ?? null;
  const v2 = s2?.[metric.key] ?? null;
  const sub1 = metric.subFormat ? metric.subFormat(s1) : null;
  const sub2 = metric.subFormat ? metric.subFormat(s2) : null;

  const showBars = !metric.informational && v1 != null && v2 != null && v1 >= 0 && v2 >= 0 && Math.max(v1, v2) > 0;
  const max = showBars ? Math.max(v1, v2) : 1;

  const valClass = (side: 1 | 2, val: number | null) => {
    if (val == null) return "text-text-muted";
    if (lead === side) return "font-semibold text-primary";
    if (metric.informational) return "font-medium text-text-primary";
    return "font-medium text-text-secondary";
  };

  return (
    <div className="grid grid-cols-[1fr_116px_1fr] items-center gap-2 px-3.5 py-2 transition-colors hover:bg-background-tertiary/50 sm:grid-cols-[1fr_140px_1fr] sm:gap-3">
      {/* Player 1 Side */}
      <div className="flex items-center justify-end gap-2.5">
        {showBars && v1 != null && (
          <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-background-tertiary sm:flex sm:justify-end md:w-28 lg:w-36">
            <div
              className={`h-full rounded-full ${lead === 1 ? "bg-primary" : "bg-border"}`}
              style={{ width: `${v1 > 0 ? Math.max(6, Math.min(100, Math.round((v1 / max) * 100))) : 0}%` }}
            />
          </div>
        )}
        <div className="text-right tabular-nums">
          <span className={`text-sm ${valClass(1, v1)}`}>{v1 == null ? "—" : metric.format(v1)}</span>
          {sub1 && <span className="ml-1.5 hidden text-xs text-text-muted md:inline">({sub1})</span>}
        </div>
      </div>

      {/* Center Metric Label */}
      <div className="text-center" title={!metric.higherIsBetter ? lowerIsBetterHint : undefined}>
        <span className="inline-block rounded-sm bg-background-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
          <span className={metric.mobileLabel ? "hidden sm:inline" : undefined}>{metric.label}</span>
          {metric.mobileLabel && <span className="sm:hidden">{metric.mobileLabel}</span>}
        </span>
      </div>

      {/* Player 2 Side */}
      <div className="flex items-center justify-start gap-2.5">
        <div className="text-left tabular-nums">
          <span className={`text-sm ${valClass(2, v2)}`}>{v2 == null ? "—" : metric.format(v2)}</span>
          {sub2 && <span className="ml-1.5 hidden text-xs text-text-muted md:inline">({sub2})</span>}
        </div>
        {showBars && v2 != null && (
          <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-background-tertiary sm:flex md:w-28 lg:w-36">
            <div
              className={`h-full rounded-full ${lead === 2 ? "bg-primary" : "bg-border"}`}
              style={{ width: `${v2 > 0 ? Math.max(6, Math.min(100, Math.round((v2 / max) * 100))) : 0}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function leader(metric: Metric, a: number | null | undefined, b: number | null | undefined): 1 | 2 | null {
  if (metric.informational || a == null || b == null || a === b) return null;
  const firstWins = metric.higherIsBetter ? a > b : a < b;
  return firstWins ? 1 : 2;
}

function CompareSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={label}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Skeleton className="h-24 w-full rounded" />
        <Skeleton className="h-10 w-14 rounded" />
        <Skeleton className="h-24 w-full rounded" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-72 rounded" />
        <Skeleton className="hidden h-4 w-48 rounded md:block" />
      </div>
      <Skeleton className="h-96 w-full rounded" />
    </div>
  );
}

/* ─────────── Page ─────────── */

export const PlayerCompare: React.FC<PlayerCompareProps> = ({
  initialP1Id,
  initialP2Id,
  onSelectPlayerProfile,
}) => {
  const { t, language } = useLanguage();
  const tr = language === "tr";
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<{ key: number; data?: CompareData; error?: string } | null>(null);
  const [seasonChoice, setSeasonChoice] = useState<string | null>(null);
  const [category, setCategory] = useState<StatCategory>("all");

  const metrics: Metric[] = useMemo(
    () => [
      {
        key: "games_played",
        label: t.compare.gamesPlayed,
        higherIsBetter: true,
        informational: true,
        format: (v) => String(v),
      },
      {
        key: "MIN",
        label: t.compare.minutes,
        higherIsBetter: true,
        informational: true,
        format: one,
      },
      {
        key: "PTS",
        label: t.compare.points,
        higherIsBetter: true,
        format: one,
      },
      {
        key: "AST",
        label: t.compare.assists,
        higherIsBetter: true,
        format: one,
      },
      {
        key: "REB",
        label: t.compare.rebounds,
        higherIsBetter: true,
        format: one,
      },
      {
        key: "OREB",
        label: tr ? "Hücum Ribaundu" : "Off. Rebounds",
        mobileLabel: tr ? "Hücum Rib." : "Off. Reb.",
        higherIsBetter: true,
        format: one,
      },
      {
        key: "DREB",
        label: tr ? "Savunma Ribaundu" : "Def. Rebounds",
        mobileLabel: tr ? "Savunma Rib." : "Def. Reb.",
        higherIsBetter: true,
        format: one,
      },
      {
        key: "STL",
        label: t.compare.steals,
        higherIsBetter: true,
        format: one,
      },
      {
        key: "BLK",
        label: t.compare.blocks,
        higherIsBetter: true,
        format: one,
      },
      {
        key: "TOV",
        label: t.compare.turnovers,
        higherIsBetter: false,
        format: one,
      },
      {
        key: "FG_PCT",
        label: t.compare.fieldGoalPct,
        higherIsBetter: true,
        format: pct,
        subFormat: (a) => shotSub(a?.FGM, a?.FGA),
      },
      {
        key: "FG3_PCT",
        label: t.compare.threePointPct,
        higherIsBetter: true,
        format: pct,
        subFormat: (a) => shotSub(a?.FG3M, a?.FG3A),
      },
      {
        key: "FT_PCT",
        label: t.compare.freeThrowPct,
        higherIsBetter: true,
        format: pct,
        subFormat: (a) => shotSub(a?.FTM, a?.FTA),
      },
      {
        key: "PLUS_MINUS",
        label: t.compare.plusMinus,
        higherIsBetter: true,
        format: signed,
      },
    ],
    [t, tr]
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadPrivateApi<PlayerProfile[]>("/frontend-data-api/player-profiles"),
      loadPrivateApi<AveragesMap>("/frontend-data-api/player-season-averages"),
      loadPrivateApi<string[]>("/frontend-data-api/seasons"),
    ])
      .then(([profiles, averages, seasons]) => {
        if (cancelled) return;
        setResult({
          key: reloadKey,
          data: {
            profiles: profiles ?? [],
            averages: averages ?? {},
            seasons: [...(seasons ?? [])].sort((a, b) => a.localeCompare(b)),
          },
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setResult({
          key: reloadKey,
          error: e instanceof Error && e.message ? e.message : DEFAULT_LOAD_ERROR,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const loading = result?.key !== reloadKey;
  const data = result?.key === reloadKey ? result.data : undefined;
  const rawError = result?.key === reloadKey ? result.error : undefined;
  const error =
    rawError === DEFAULT_LOAD_ERROR
      ? tr
        ? "Oyuncu verileri yüklenemedi."
        : "Failed to load player data."
      : rawError;

  const profiles = useMemo(() => data?.profiles ?? [], [data]);
  const averagesMap = useMemo(() => data?.averages ?? {}, [data]);
  const seasons = useMemo(() => data?.seasons ?? [], [data]);

  const byId = (id: number | null | undefined) =>
    id == null ? undefined : profiles.find((p) => p.PLAYER_ID === id);
  const defaultP1 = profiles.find((p) => p.PLAYER_NAME.includes("Luka")) ?? profiles[0];
  const defaultP2 =
    profiles.find((p) => p.PLAYER_NAME.includes("Gilgeous")) ?? profiles.find((p) => p !== defaultP1);

  const p1 = byId(initialP1Id) ?? defaultP1;
  const rawP2 = byId(initialP2Id);
  const p2 =
    rawP2 && rawP2 !== p1
      ? rawP2
      : defaultP2 && defaultP2 !== p1
        ? defaultP2
        : profiles.find((p) => p !== p1);

  const hasData = (p: PlayerProfile | undefined, sea: string) =>
    Boolean(p && averagesMap[String(p.PLAYER_ID)]?.[sea]);
  const dataSeasons = seasons.filter((sea) => hasData(p1, sea) || hasData(p2, sea));
  const availableSeasons = dataSeasons.length > 0 ? dataSeasons : seasons;

  const season =
    seasonChoice && availableSeasons.includes(seasonChoice)
      ? seasonChoice
      : availableSeasons.includes(CURRENT_SEASON)
        ? CURRENT_SEASON
        : (availableSeasons.at(-1) ?? CURRENT_SEASON);

  const statsFor = (p: PlayerProfile | undefined): SeasonAverages | null =>
    p ? (averagesMap[String(p.PLAYER_ID)]?.[season] ?? null) : null;
  const s1 = statsFor(p1);
  const s2 = statsFor(p2);
  const bothHaveData = s1 != null && s2 != null;

  const lead = useMemo(() => {
    let a = 0;
    let b = 0;
    if (!bothHaveData) return { a, b };
    for (const m of metrics) {
      if (!LEAD_KEYS.includes(m.key)) continue;
      const w = leader(m, s1?.[m.key], s2?.[m.key]);
      if (w === 1) a += 1;
      if (w === 2) b += 1;
    }
    return { a, b };
  }, [s1, s2, bothHaveData, metrics]);

  const handlePick1 = (id: number) => {
    updateUrlRoute({ compareP1: id, compareP2: p2?.PLAYER_ID ?? null });
  };

  const handlePick2 = (id: number) => {
    updateUrlRoute({ compareP1: p1?.PLAYER_ID ?? null, compareP2: id });
  };

  const handleSwapPlayers = () => {
    if (!p1 || !p2) return;
    updateUrlRoute({ compareP1: p2.PLAYER_ID, compareP2: p1.PLAYER_ID });
  };

  const metricByKey = useMemo(() => {
    const map = new Map<MetricKey, Metric>();
    for (const m of metrics) map.set(m.key, m);
    return map;
  }, [metrics]);

  const groups = useMemo(() => {
    const pickMetrics = (keys: MetricKey[]) =>
      keys.map((k) => metricByKey.get(k)).filter((m): m is Metric => Boolean(m));

    if (category === "offense") {
      return [{ id: "offense", title: null, items: pickMetrics(OFFENSE_KEYS) }];
    }
    if (category === "defense") {
      return [{ id: "defense", title: null, items: pickMetrics(DEFENSE_KEYS) }];
    }
    if (category === "shooting") {
      return [{ id: "shooting", title: null, items: pickMetrics(SHOOTING_KEYS) }];
    }
    return [
      { id: "offense", title: tr ? "Skor ve oyun kurma" : "Scoring & playmaking", items: pickMetrics(OFFENSE_KEYS) },
      { id: "defense", title: tr ? "Ribaund ve savunma" : "Rebounding & defense", items: pickMetrics(DEFENSE_KEYS) },
      { id: "shooting", title: tr ? "Şut yüzdeleri" : "Shooting splits", items: pickMetrics(SHOOTING_KEYS) },
      { id: "context", title: tr ? "Süre ve katılım" : "Minutes & availability", items: pickMetrics(CONTEXT_KEYS) },
    ];
  }, [category, metricByKey, tr]);

  const categoryTabs: { id: StatCategory; label: string }[] = [
    { id: "all", label: t.common.all },
    { id: "offense", label: tr ? "Hücum" : "Offense" },
    { id: "defense", label: tr ? "Ribaund & Savunma" : "Reb. & Defense" },
    { id: "shooting", label: tr ? "Şut" : "Shooting" },
  ];

  const lowerIsBetterHint = tr ? "Düşük değer daha iyidir" : "Lower is better";
  const leadTooltip = tr
    ? `${LEAD_KEYS.length} ana kategoride üstünlük (PTS, REB, AST, STL, BLK, TOV, FG%, 3P%, FT%)`
    : `Lead across ${LEAD_KEYS.length} core categories (PTS, REB, AST, STL, BLK, TOV, FG%, 3P%, FT%)`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 sm:items-center">
        <div>
          <h1 className="text-lg font-semibold text-text-primary sm:text-xl">{t.compare.title}</h1>
          <p className="mt-0.5 text-xs text-text-secondary">{t.compare.subtitle}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {p1 && p2 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSwapPlayers}
              aria-label={tr ? "Oyuncuların yerini değiştir" : "Swap players"}
              title={tr ? "Oyuncuların yerini değiştir" : "Swap players"}
              className="h-9 px-2.5"
            >
              <ArrowLeftRight size={14} strokeWidth={1.5} aria-hidden="true" />
              <span className="hidden sm:inline">{tr ? "Yer Değiştir" : "Swap"}</span>
            </Button>
          )}
          {availableSeasons.length > 0 && (
            <div className="w-28">
              <Select
                aria-label={t.common.season}
                value={season}
                onChange={(e) => setSeasonChoice(e.target.value)}
                className="h-9"
              >
                {[...availableSeasons].reverse().map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <CompareSkeleton label={t.compare.loading} />
      ) : error ? (
        <InlineError
          title={t.player.loadError}
          message={error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : profiles.length === 0 ? (
        <EmptyState
          icon={<UserRound size={24} strokeWidth={1.5} />}
          title={tr ? "Oyuncu bulunamadı" : "No players found"}
          description={
            tr
              ? "Karşılaştırma için kullanılabilir oyuncu profili yok."
              : "No player profiles available for comparison."
          }
        />
      ) : (
        <>
          {/* Player Hero Cards & Head-to-Head Lead Summary */}
          <div className="relative grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 lg:static">
            <PlayerCompareCard
              slot={t.compare.slot1}
              player={p1}
              avgs={s1}
              season={season}
              seasonAverages={averagesMap}
              profiles={profiles}
              excludeId={p2?.PLAYER_ID}
              onPick={handlePick1}
              onOpenProfile={onSelectPlayerProfile}
              isLeadingOverall={bothHaveData && lead.a > lead.b}
            />

            <div className="flex flex-col items-center justify-center px-1 md:px-3" title={leadTooltip}>
              {bothHaveData ? (
                <>
                  <div className="flex items-baseline gap-1.5 text-xl font-semibold tabular-nums">
                    <span
                      className={
                        lead.a > lead.b
                          ? "text-primary"
                          : lead.a === lead.b
                            ? "text-text-primary"
                            : "text-text-secondary"
                      }
                    >
                      {lead.a}
                    </span>
                    <span className="text-sm font-normal text-text-muted">-</span>
                    <span
                      className={
                        lead.b > lead.a
                          ? "text-primary"
                          : lead.b === lead.a
                            ? "text-text-primary"
                            : "text-text-secondary"
                      }
                    >
                      {lead.b}
                    </span>
                  </div>
                  <span className="text-xs text-text-muted">
                    {lead.a === lead.b ? (tr ? "eşit" : "tied") : tr ? "üstünlük" : "lead"}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold text-text-muted">vs</span>
                  <span className="text-xs tabular-nums text-text-muted">{season}</span>
                </>
              )}
            </div>

            <PlayerCompareCard
              slot={t.compare.slot2}
              player={p2}
              avgs={s2}
              season={season}
              seasonAverages={averagesMap}
              profiles={profiles}
              excludeId={p1?.PLAYER_ID}
              onPick={handlePick2}
              onOpenProfile={onSelectPlayerProfile}
              isLeadingOverall={bothHaveData && lead.b > lead.a}
            />
          </div>

          {/* Category Filter + Side-by-Side Metric Table */}
          {s1 == null && s2 == null ? (
            <EmptyState
              icon={<ArrowLeftRight size={24} strokeWidth={1.5} />}
              title={tr ? "Bu sezon için veri yok" : "No data for this season"}
              description={
                tr
                  ? `${season} sezonunda seçili oyunculardan hiçbirinin maç ortalaması bulunmuyor. Farklı bir sezon seçin.`
                  : `Neither selected player has recorded averages in ${season}. Select a different season.`
              }
            />
          ) : (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  role="group"
                  aria-label={tr ? "İstatistik kategorisi" : "Stat category"}
                  className="inline-flex flex-wrap items-center rounded border border-border bg-background-tertiary p-0.5 text-xs font-medium"
                >
                  {categoryTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      aria-pressed={category === tab.id}
                      onClick={() => setCategory(tab.id)}
                      className={`cursor-pointer rounded-sm px-2.5 py-1 transition-colors ${
                        category === tab.id
                          ? "bg-background-primary font-semibold text-text-primary"
                          : "text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <span className="hidden text-xs text-text-muted md:inline">{leadTooltip}</span>
              </div>

              <Card padding="none" className="overflow-hidden">
                <div className="grid grid-cols-[1fr_116px_1fr] items-center gap-2 border-b border-border bg-background-tertiary/60 px-3.5 py-2 text-xs font-medium text-text-secondary sm:grid-cols-[1fr_140px_1fr] sm:gap-3">
                  <span className="truncate text-right font-semibold text-text-primary">
                    {p1?.PLAYER_NAME ?? t.compare.slot1}
                  </span>
                  <span className="text-center tabular-nums text-text-secondary">{season}</span>
                  <span className="truncate text-left font-semibold text-text-primary">
                    {p2?.PLAYER_NAME ?? t.compare.slot2}
                  </span>
                </div>

                {groups.map((group, idx) => (
                  <div key={group.id}>
                    {group.title && (
                      <div
                        className={`border-b border-border-light bg-background-secondary px-3.5 py-1.5 text-xs font-medium text-text-secondary ${
                          idx > 0 ? "border-t" : ""
                        }`}
                      >
                        {group.title}
                      </div>
                    )}
                    <div className="divide-y divide-border-light">
                      {group.items.map((m) => (
                        <CompareRow
                          key={m.key}
                          metric={m}
                          s1={s1}
                          s2={s2}
                          lead={leader(m, s1?.[m.key], s2?.[m.key])}
                          lowerIsBetterHint={lowerIsBetterHint}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
};
