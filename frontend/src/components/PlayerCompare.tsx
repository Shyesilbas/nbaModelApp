import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, ExternalLink, Search, UserRound, X } from "lucide-react";
import { loadPrivateApi } from "../lib/dataCache";
import { CURRENT_SEASON } from "../lib/constants";
import { TEAM_NAME_BY_ABBR, isKnownTeamAbbr } from "../lib/nbaTeams";
import PlayerPhoto from "./PlayerPhoto";
import TeamLogo from "./TeamLogo";
import { Button, Card, EmptyState, InlineError, Select, Skeleton } from "./common";
import { useLanguage } from "../context/LanguageContext";

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
  onSelectGame?: (gameId: string) => void;
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

interface Metric {
  key: MetricKey;
  label: string;
  shortLabel: string;
  higherIsBetter: boolean;
  /** Informational rows show both values without picking a leader. */
  informational?: boolean;
  format: (v: number) => string;
  subFormat?: (avgs: SeasonAverages | null) => string | null;
}

const one = (v: number) => v.toFixed(1);
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const signed = (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1));
const shotSub = (made?: number | null, att?: number | null) =>
  made != null && att != null ? `${made.toFixed(1)}/${att.toFixed(1)}` : null;

const getPlayerTeamAbbr = (p?: PlayerProfile, avgs?: SeasonAverages | null): string | null => {
  if (avgs?.teams && avgs.teams.length > 0) return avgs.teams[avgs.teams.length - 1];
  return p?.CURRENT_TEAM || p?.CURRENT_TEAM_ABBREVIATION || null;
};

const matchesQuery = (p: PlayerProfile, q: string) => {
  const team = (p.CURRENT_TEAM || p.CURRENT_TEAM_ABBREVIATION || "").toLowerCase();
  return p.PLAYER_NAME.toLowerCase().includes(q) || team.includes(q);
};

type CategoryTabId = "all" | "scoring" | "shooting" | "defense";

/* ─────────── Player card with photo, full name, and GP + MPG only ─────────── */

function PlayerCompareCard({
  slot,
  player,
  avgs,
  profiles,
  excludeId,
  onPick,
  onOpenProfile,
  isLeadingOverall,
}: {
  slot: string;
  player: PlayerProfile | undefined;
  avgs: SeasonAverages | null;
  profiles: PlayerProfile[];
  excludeId: number | undefined;
  onPick: (id: number) => void;
  onOpenProfile?: (id: number) => void;
  isLeadingOverall: boolean;
}) {
  const { language } = useLanguage();
  const tr = language === "tr";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return profiles
      .filter((p) => p.PLAYER_ID !== excludeId && (!q || matchesQuery(p, q)))
      .slice(0, 15);
  }, [profiles, query, excludeId]);

  const teamAbbr = getPlayerTeamAbbr(player, avgs);
  const teamName = teamAbbr && isKnownTeamAbbr(teamAbbr) ? TEAM_NAME_BY_ABBR[teamAbbr] : teamAbbr;
  const pos = player?.OFFICIAL_POSITION || player?.POSITION_GROUP;
  const bioMeta = [pos, player?.HEIGHT].filter(Boolean);

  return (
    <Card
      padding="sm"
      className={`relative transition-colors ${isLeadingOverall ? "border-primary/50" : ""}`}
      ref={ref}
      aria-label={slot}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {player ? (
            <PlayerPhoto
              playerId={player.PLAYER_ID}
              name={player.PLAYER_NAME}
              size={56}
              className="shrink-0"
            />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-border bg-background-tertiary text-text-secondary">
              <UserRound size={22} strokeWidth={1.5} aria-hidden="true" />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {player && onOpenProfile ? (
                <button
                  type="button"
                  onClick={() => onOpenProfile(player.PLAYER_ID)}
                  className="group inline-flex items-center gap-1.5 text-left text-base font-semibold leading-snug text-text-primary transition-colors hover:text-primary"
                >
                  <span>{player.PLAYER_NAME}</span>
                  <ExternalLink
                    size={13}
                    className="shrink-0 text-text-secondary opacity-70 transition-opacity group-hover:text-primary group-hover:opacity-100"
                  />
                </button>
              ) : (
                <h2 className="text-base font-semibold leading-snug text-text-primary">
                  {player?.PLAYER_NAME ?? (tr ? "Oyuncu seçilmedi" : "No player selected")}
                </h2>
              )}
            </div>

            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-secondary">
              {teamAbbr && (
                <span className="inline-flex items-center gap-1 font-medium text-text-primary">
                  <TeamLogo abbr={teamAbbr} name={teamName || teamAbbr} size={15} />
                  <span>{teamName}</span>
                </span>
              )}
              {bioMeta.length > 0 && (
                <span>
                  {teamAbbr ? "· " : ""}
                  {bioMeta.join(" · ")}
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs tabular-nums text-text-secondary">
              <span className="rounded-sm bg-background-tertiary px-1.5 py-0.5 font-medium text-text-primary">
                {avgs ? `${avgs.games_played} ${tr ? "maç" : "GP"}` : `— ${tr ? "maç" : "GP"}`}
              </span>
              <span className="rounded-sm bg-background-tertiary px-1.5 py-0.5 font-medium text-text-primary">
                {avgs?.MIN != null ? `${one(avgs.MIN)} ${tr ? "dk ort." : "MPG"}` : `— ${tr ? "dk ort." : "MPG"}`}
              </span>
            </div>
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          leftIcon={<Search size={14} strokeWidth={1.5} />}
          className="shrink-0"
        >
          {tr ? "Değiştir" : "Change"}
        </Button>
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 rounded border border-border bg-background-primary p-2.5 shadow-md">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
            />
            <input
              type="text"
              autoFocus
              autoComplete="off"
              aria-label={tr ? `${slot} için oyuncu ara` : `Search player for ${slot}`}
              placeholder={tr ? "Oyuncu adı veya takım kısaltması ara..." : "Search player name or team..."}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-full rounded border border-border bg-background-primary pl-8 pr-8 text-xs text-text-primary outline-none focus:border-border-focus"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-secondary hover:text-text-primary"
              >
                <X size={14} />
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
                const pTeam = p.CURRENT_TEAM || p.CURRENT_TEAM_ABBREVIATION;
                const pPos = p.OFFICIAL_POSITION || p.POSITION_GROUP;
                return (
                  <li key={p.PLAYER_ID}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(p.PLAYER_ID);
                        setOpen(false);
                        setQuery("");
                      }}
                      className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-sm px-2.5 py-2 text-left text-sm text-text-primary transition-colors hover:bg-background-tertiary focus-visible:bg-background-tertiary focus-visible:outline-none"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME} size={28} className="shrink-0" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-text-primary">{p.PLAYER_NAME}</p>
                          {pPos && <p className="text-xs text-text-secondary">{pPos}</p>}
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

/* ─────────── Compact Comparison Row & Category Tabs ─────────── */

const CATEGORY_TABS: { id: CategoryTabId; tr: string; en: string; keys: MetricKey[] }[] = [
  {
    id: "all",
    tr: "Tümü",
    en: "All stats",
    keys: ["PTS", "AST", "REB", "OREB", "DREB", "STL", "BLK", "TOV", "FG_PCT", "FG3_PCT", "FT_PCT", "PLUS_MINUS"],
  },
  {
    id: "scoring",
    tr: "Skor ve oyun kurma",
    en: "Scoring & playmaking",
    keys: ["PTS", "AST", "TOV", "PLUS_MINUS"],
  },
  {
    id: "shooting",
    tr: "Şut ve verimlilik",
    en: "Shooting & efficiency",
    keys: ["FG_PCT", "FG3_PCT", "FT_PCT", "PLUS_MINUS"],
  },
  {
    id: "defense",
    tr: "Savunma ve ribaund",
    en: "Defense & rebounding",
    keys: ["REB", "OREB", "DREB", "STL", "BLK", "TOV"],
  },
];

function CompareRow({
  metric,
  s1,
  s2,
  lead,
}: {
  metric: Metric;
  s1: SeasonAverages | null;
  s2: SeasonAverages | null;
  lead: 1 | 2 | null;
}) {
  const v1 = s1?.[metric.key] ?? null;
  const v2 = s2?.[metric.key] ?? null;
  const sub1 = metric.subFormat ? metric.subFormat(s1) : null;
  const sub2 = metric.subFormat ? metric.subFormat(s2) : null;

  const showBars = v1 != null && v2 != null && v1 >= 0 && v2 >= 0 && Math.max(v1, v2) > 0;
  const max = showBars ? Math.max(v1, v2) : 1;

  return (
    <div className="grid grid-cols-[1fr_116px_1fr] items-center gap-2 px-3.5 py-2 transition-colors hover:bg-background-tertiary/50 sm:grid-cols-[1fr_132px_1fr] sm:gap-3">
      {/* Player 1 Side */}
      <div className="flex items-center justify-end gap-2.5">
        {showBars && v1 != null && (
          <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-background-tertiary sm:flex sm:justify-end">
            <div
              className={`h-full rounded-full ${lead === 1 ? "bg-primary" : "bg-border"}`}
              style={{ width: `${Math.min(100, Math.round((v1 / max) * 100))}%` }}
            />
          </div>
        )}
        <div className="text-right tabular-nums">
          <span
            className={`text-sm ${v1 == null
                ? "text-text-muted"
                : lead === 1
                  ? "font-semibold text-text-primary"
                  : "font-medium text-text-secondary"
              }`}
          >
            {v1 == null ? "—" : metric.format(v1)}
          </span>
          {sub1 && <span className="ml-1.5 hidden text-xs text-text-secondary xl:inline">({sub1})</span>}
        </div>
      </div>

      {/* Center Metric Label */}
      <div className="text-center">
        <span className="inline-block rounded-sm bg-background-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
          {metric.label}
        </span>
      </div>

      {/* Player 2 Side */}
      <div className="flex items-center justify-start gap-2.5">
        <div className="text-left tabular-nums">
          <span
            className={`text-sm ${v2 == null
                ? "text-text-muted"
                : lead === 2
                  ? "font-semibold text-text-primary"
                  : "font-medium text-text-secondary"
              }`}
          >
            {v2 == null ? "—" : metric.format(v2)}
          </span>
          {sub2 && <span className="ml-1.5 hidden text-xs text-text-secondary xl:inline">({sub2})</span>}
        </div>
        {showBars && v2 != null && (
          <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-background-tertiary sm:flex">
            <div
              className={`h-full rounded-full ${lead === 2 ? "bg-primary" : "bg-border"}`}
              style={{ width: `${Math.min(100, Math.round((v2 / max) * 100))}%` }}
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

function CompareSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Karşılaştırma yükleniyor">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Skeleton className="h-32 w-full rounded" />
        <Skeleton className="h-32 w-full rounded" />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Skeleton className="h-44 w-full rounded" />
        <Skeleton className="h-44 w-full rounded" />
        <Skeleton className="h-40 w-full rounded" />
        <Skeleton className="h-40 w-full rounded" />
      </div>
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
  const [p1Choice, setP1Choice] = useState<number | null>(initialP1Id || null);
  const [p2Choice, setP2Choice] = useState<number | null>(initialP2Id || null);
  const [activeTab, setActiveTab] = useState<CategoryTabId>("all");

  const metrics: Metric[] = useMemo(
    () => [
      {
        key: "games_played",
        label: t.compare.gamesPlayed,
        shortLabel: tr ? "Maç" : "GP",
        higherIsBetter: true,
        informational: true,
        format: (v) => String(v),
      },
      {
        key: "MIN",
        label: t.compare.minutes,
        shortLabel: tr ? "Dk" : "MIN",
        higherIsBetter: true,
        informational: true,
        format: one,
      },
      {
        key: "PTS",
        label: t.compare.points,
        shortLabel: tr ? "Sayı" : "PTS",
        higherIsBetter: true,
        format: one,
      },
      {
        key: "AST",
        label: t.compare.assists,
        shortLabel: tr ? "Asist" : "AST",
        higherIsBetter: true,
        format: one,
      },
      {
        key: "REB",
        label: t.compare.rebounds,
        shortLabel: tr ? "Rib" : "REB",
        higherIsBetter: true,
        format: one,
      },
      {
        key: "OREB",
        label: tr ? "Hücum Ribaundu" : "Off. Rebounds",
        shortLabel: "OREB",
        higherIsBetter: true,
        format: one,
      },
      {
        key: "DREB",
        label: tr ? "Savunma Ribaundu" : "Def. Rebounds",
        shortLabel: "DREB",
        higherIsBetter: true,
        format: one,
      },
      {
        key: "STL",
        label: t.compare.steals,
        shortLabel: "STL",
        higherIsBetter: true,
        format: one,
      },
      {
        key: "BLK",
        label: t.compare.blocks,
        shortLabel: "BLK",
        higherIsBetter: true,
        format: one,
      },
      {
        key: "TOV",
        label: t.compare.turnovers,
        shortLabel: "TOV",
        higherIsBetter: false,
        format: one,
      },
      {
        key: "FG_PCT",
        label: t.compare.fieldGoalPct,
        shortLabel: "FG%",
        higherIsBetter: true,
        format: pct,
        subFormat: (a) => shotSub(a?.FGM, a?.FGA),
      },
      {
        key: "FG3_PCT",
        label: t.compare.threePointPct,
        shortLabel: "3P%",
        higherIsBetter: true,
        format: pct,
        subFormat: (a) => shotSub(a?.FG3M, a?.FG3A),
      },
      {
        key: "FT_PCT",
        label: t.compare.freeThrowPct,
        shortLabel: "FT%",
        higherIsBetter: true,
        format: pct,
        subFormat: (a) => shotSub(a?.FTM, a?.FTA),
      },
      {
        key: "PLUS_MINUS",
        label: t.compare.plusMinus,
        shortLabel: "+/-",
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
          error: e instanceof Error && e.message ? e.message : "Oyuncu verileri yüklenemedi.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const loading = result?.key !== reloadKey;
  const data = result?.key === reloadKey ? result.data : undefined;
  const error = result?.key === reloadKey ? result.error : undefined;

  const profiles = useMemo(() => data?.profiles ?? [], [data]);
  const seasons = useMemo(() => data?.seasons ?? [], [data]);

  const season =
    seasonChoice && seasons.includes(seasonChoice)
      ? seasonChoice
      : seasons.includes(CURRENT_SEASON)
        ? CURRENT_SEASON
        : (seasons.at(-1) ?? CURRENT_SEASON);

  const byId = (id: number | null) => (id == null ? undefined : profiles.find((p) => p.PLAYER_ID === id));
  const defaultP1 = profiles.find((p) => p.PLAYER_NAME.includes("Luka")) ?? profiles[0];
  const defaultP2 =
    profiles.find((p) => p.PLAYER_NAME.includes("Gilgeous")) ?? profiles.find((p) => p !== defaultP1);
  const p1 = byId(p1Choice) ?? defaultP1;
  const p2 = byId(p2Choice) ?? (defaultP2 !== p1 ? defaultP2 : profiles.find((p) => p !== p1));

  const statsFor = (p: PlayerProfile | undefined): SeasonAverages | null =>
    p ? (data?.averages[String(p.PLAYER_ID)]?.[season] ?? null) : null;
  const s1 = statsFor(p1);
  const s2 = statsFor(p2);

  const lead = useMemo(() => {
    let a = 0;
    let b = 0;
    for (const m of metrics) {
      const w = leader(m, s1?.[m.key], s2?.[m.key]);
      if (w === 1) a += 1;
      if (w === 2) b += 1;
    }
    return { a, b };
  }, [s1, s2, metrics]);

  const handleSwapPlayers = () => {
    if (!p1 || !p2) return;
    setP1Choice(p2.PLAYER_ID);
    setP2Choice(p1.PLAYER_ID);
  };

  return (
    <div className="space-y-4">
      {/* Compact Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h1 className="text-lg font-semibold text-text-primary sm:text-xl">{t.compare.title}</h1>
          <p className="text-xs text-text-secondary">{t.compare.subtitle}</p>
        </div>

        <div className="flex items-center gap-2.5">
          {p1 && p2 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSwapPlayers}
              leftIcon={<ArrowLeftRight size={14} strokeWidth={1.5} />}
              title={tr ? "Oyuncuların yerini değiştir" : "Swap players"}
            >
              {tr ? "Yer değiştir" : "Swap"}
            </Button>
          )}
          {seasons.length > 0 && (
            <div className="w-32">
              <Select
                aria-label={t.common.season}
                value={season}
                onChange={(e) => setSeasonChoice(e.target.value)}
                className="h-9"
              >
                {[...seasons].reverse().map((s) => (
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
        <CompareSkeleton />
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
          {/* Player Hero Cards with Photos, Full Names & GP/MPG only */}
          <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr]">
            <PlayerCompareCard
              slot={t.compare.slot1}
              player={p1}
              avgs={s1}
              profiles={profiles}
              excludeId={p2?.PLAYER_ID}
              onPick={setP1Choice}
              onOpenProfile={onSelectPlayerProfile}
              isLeadingOverall={lead.a > lead.b}
            />

            {/* Center Scoreboard Pillar */}
            <div className="flex items-center justify-center rounded border border-border bg-background-primary px-4 py-2 lg:flex-col lg:justify-center">
              <span className="mr-3 text-xs font-medium text-text-secondary lg:mr-0 lg:mb-0.5">
                {tr ? "Üstünlük" : "Lead"}
              </span>
              <div className="flex items-baseline gap-2 text-2xl font-semibold tabular-nums sm:text-3xl">
                <span className={lead.a >= lead.b ? "text-primary" : "text-text-secondary"}>{lead.a}</span>
                <span className="text-base font-normal text-text-muted">–</span>
                <span className={lead.b >= lead.a ? "text-primary" : "text-text-secondary"}>{lead.b}</span>
              </div>
              <span className="ml-3 text-xs tabular-nums text-text-secondary lg:ml-0 lg:mt-0.5">{season}</span>
            </div>

            <PlayerCompareCard
              slot={t.compare.slot2}
              player={p2}
              avgs={s2}
              profiles={profiles}
              excludeId={p1?.PLAYER_ID}
              onPick={setP2Choice}
              onOpenProfile={onSelectPlayerProfile}
              isLeadingOverall={lead.b > lead.a}
            />
          </div>

          {/* Tabbed Statistics Section — All or Category Filtered */}
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
            <Card padding="none" className="overflow-hidden">
              {/* Category Tabs Bar */}
              <div
                role="tablist"
                aria-label={tr ? "İstatistik kategorileri" : "Stat categories"}
                className="flex flex-wrap items-center gap-6 border-b border-border px-4 pt-2.5"
              >
                {CATEGORY_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`-mb-px cursor-pointer border-b-2 pb-2.5 text-xs font-medium transition-colors sm:text-sm ${activeTab === tab.id
                        ? "border-primary font-semibold text-text-primary"
                        : "border-transparent text-text-secondary hover:text-text-primary"
                      }`}
                  >
                    {tr ? tab.tr : tab.en}
                  </button>
                ))}
              </div>

              {/* Player Subheader inside Comparison Table */}
              <div className="grid grid-cols-[1fr_116px_1fr] items-center gap-2 border-b border-border bg-background-tertiary/60 px-3.5 py-2 text-xs sm:grid-cols-[1fr_132px_1fr] sm:gap-3">
                <div className="flex min-w-0 items-center justify-end gap-2 text-right">
                  <span className="truncate font-semibold text-text-primary">{p1?.PLAYER_NAME}</span>
                  {p1 && <PlayerPhoto playerId={p1.PLAYER_ID} name={p1.PLAYER_NAME} size={22} className="shrink-0" />}
                </div>
                <div className="text-center font-semibold text-text-secondary">
                  {tr ? "İstatistik" : "Metric"}
                </div>
                <div className="flex min-w-0 items-center justify-start gap-2 text-left">
                  {p2 && <PlayerPhoto playerId={p2.PLAYER_ID} name={p2.PLAYER_NAME} size={22} className="shrink-0" />}
                  <span className="truncate font-semibold text-text-primary">{p2?.PLAYER_NAME}</span>
                </div>
              </div>

              {/* Rows for Selected Tab */}
              <div className="divide-y divide-border-light">
                {(CATEGORY_TABS.find((tab) => tab.id === activeTab) ?? CATEGORY_TABS[0]).keys.map((k) => {
                  const m = metrics.find((x) => x.key === k);
                  if (!m) return null;
                  return (
                    <CompareRow
                      key={k}
                      metric={m}
                      s1={s1}
                      s2={s2}
                      lead={leader(m, s1?.[k], s2?.[k])}
                    />
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
