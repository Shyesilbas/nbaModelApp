import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Check, Search, UserRound } from "lucide-react";
import { loadPrivateApi } from "../lib/dataCache";
import { CURRENT_SEASON } from "../lib/constants";
import PlayerPhoto from "./PlayerPhoto";
import { Badge, Button, Card, EmptyState, InlineError, Input, Select, Skeleton } from "./common";

interface PlayerProfile {
  PLAYER_ID: number;
  PLAYER_NAME: string;
  CURRENT_TEAM_ABBREVIATION?: string | null;
  POSITION_GROUP?: string | null;
  HEIGHT?: string | null;
}

interface SeasonAverages {
  games_played: number;
  games_total?: number;
  MIN: number | null;
  PTS: number | null;
  REB: number | null;
  AST: number | null;
  STL: number | null;
  BLK: number | null;
  TOV: number | null;
  PLUS_MINUS: number | null;
  FG_PCT: number | null;
  FG3_PCT: number | null;
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

type MetricKey = Exclude<keyof SeasonAverages, "games_total">;

interface Metric {
  key: MetricKey;
  label: string;
  hint?: string;
  higherIsBetter: boolean;
  /** Informational rows show both values without picking a leader. */
  informational?: boolean;
  format: (v: number) => string;
}

const one = (v: number) => v.toFixed(1);
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const signed = (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1));

const METRICS: Metric[] = [
  { key: "games_played", label: "Oynanan maç", higherIsBetter: true, informational: true, format: (v) => String(v) },
  { key: "PTS", label: "Sayı", higherIsBetter: true, format: one },
  { key: "REB", label: "Ribaund", higherIsBetter: true, format: one },
  { key: "AST", label: "Asist", higherIsBetter: true, format: one },
  { key: "MIN", label: "Dakika", higherIsBetter: true, informational: true, format: one },
  { key: "STL", label: "Top çalma", higherIsBetter: true, format: one },
  { key: "BLK", label: "Blok", higherIsBetter: true, format: one },
  { key: "TOV", label: "Top kaybı", hint: "düşük olan iyi", higherIsBetter: false, format: one },
  { key: "PLUS_MINUS", label: "Artı/eksi", higherIsBetter: true, format: signed },
  { key: "FG_PCT", label: "Saha içi isabet", higherIsBetter: true, format: pct },
  { key: "FG3_PCT", label: "3 sayılık isabet", higherIsBetter: true, format: pct },
  { key: "FT_PCT", label: "Serbest atış isabet", higherIsBetter: true, format: pct },
];

const matchesQuery = (p: PlayerProfile, q: string) => p.PLAYER_NAME.toLowerCase().includes(q);

/* ─────────── Player picker ─────────── */

function PlayerPicker({
  slot,
  player,
  profiles,
  excludeId,
  onPick,
  onOpenProfile,
}: {
  slot: string;
  player: PlayerProfile | undefined;
  profiles: PlayerProfile[];
  excludeId: number | undefined;
  onPick: (id: number) => void;
  onOpenProfile?: (id: number) => void;
}) {
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
      .slice(0, 12);
  }, [profiles, query, excludeId]);

  const meta = [player?.CURRENT_TEAM_ABBREVIATION, player?.POSITION_GROUP, player?.HEIGHT].filter(Boolean);

  return (
    <Card padding="md" className="relative" ref={ref} aria-label={slot}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {player ? (
            <PlayerPhoto playerId={player.PLAYER_ID} name={player.PLAYER_NAME} size={56} className="shrink-0" />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-border bg-background-tertiary text-text-muted">
              <UserRound size={20} strokeWidth={1.5} aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <p className="text-xs text-text-muted">{slot}</p>
            <h2 className="truncate text-lg font-semibold text-text-primary">
              {player?.PLAYER_NAME ?? "Oyuncu seçilmedi"}
            </h2>
            {meta.length > 0 && <p className="truncate text-xs text-text-secondary">{meta.join(" · ")}</p>}
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          leftIcon={<Search size={16} strokeWidth={1.5} />}
        >
          Değiştir
        </Button>
      </div>

      {player && onOpenProfile && (
        <div className="mt-4 border-t border-border-light pt-3">
          <Button variant="ghost" size="sm" onClick={() => onOpenProfile(player.PLAYER_ID)}>
            Profili aç
          </Button>
        </div>
      )}

      {open && (
        <div className="absolute inset-x-3 top-full z-20 mt-1 rounded border border-border bg-background-primary p-2 shadow-md">
          <Input
            type="text"
            autoFocus
            autoComplete="off"
            aria-label={`${slot} için oyuncu ara`}
            placeholder="Oyuncu ara"
            leftIcon={<Search size={16} strokeWidth={1.5} />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9"
          />
          <ul className="mt-2 max-h-56 divide-y divide-border-light overflow-y-auto">
            {results.length === 0 ? (
              <li className="p-3 text-center text-xs text-text-muted">
                &quot;{query}&quot; ile eşleşen oyuncu bulunamadı.
              </li>
            ) : (
              results.map((p) => (
                <li key={p.PLAYER_ID}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(p.PLAYER_ID);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex h-10 w-full items-center justify-between gap-3 px-2 text-left text-sm text-text-primary hover:bg-background-tertiary focus-visible:bg-background-tertiary focus-visible:outline-none cursor-pointer"
                  >
                    <span className="truncate">{p.PLAYER_NAME}</span>
                    <span className="shrink-0 text-xs text-text-muted">{p.CURRENT_TEAM_ABBREVIATION}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </Card>
  );
}

/* ─────────── Comparison table ─────────── */

function ValueCell({
  value,
  metric,
  leads,
  align,
}: {
  value: number | null | undefined;
  metric: Metric;
  leads: boolean;
  align: "left" | "right";
}) {
  const alignClass = align === "left" ? "text-left" : "text-right";
  const justify = align === "left" ? "justify-start" : "justify-end";
  if (value == null) {
    return <td className={`px-4 py-3 text-sm text-text-muted ${alignClass}`}>—</td>;
  }
  return (
    <td className={`px-4 py-3 text-sm tabular-nums ${alignClass}`}>
      <span
        className={`inline-flex items-center gap-1.5 ${justify} ${
          leads ? "font-semibold text-status-success" : "text-text-primary"
        }`}
      >
        {leads && align === "right" && <Check size={16} strokeWidth={1.5} aria-hidden="true" />}
        {metric.format(value)}
        {leads && align === "left" && <Check size={16} strokeWidth={1.5} aria-hidden="true" />}
        {leads && <span className="sr-only">(önde)</span>}
      </span>
    </td>
  );
}

function leader(metric: Metric, a: number | null | undefined, b: number | null | undefined): 1 | 2 | null {
  if (metric.informational || a == null || b == null || a === b) return null;
  const firstWins = metric.higherIsBetter ? a > b : a < b;
  return firstWins ? 1 : 2;
}

function CompareSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Karşılaştırma yükleniyor">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-28 w-full rounded" />
        <Skeleton className="h-28 w-full rounded" />
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
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<{ key: number; data?: CompareData; error?: string } | null>(null);
  const [seasonChoice, setSeasonChoice] = useState<string | null>(null);
  const [p1Choice, setP1Choice] = useState<number | null>(initialP1Id || null);
  const [p2Choice, setP2Choice] = useState<number | null>(initialP2Id || null);

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
    for (const m of METRICS) {
      const w = leader(m, s1?.[m.key], s2?.[m.key]);
      if (w === 1) a += 1;
      if (w === 2) b += 1;
    }
    return { a, b };
  }, [s1, s2]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Oyuncu karşılaştırma</h1>
          <p className="mt-1 text-xs text-text-secondary">
            İki oyuncunun sezon ortalamaları; normal sezon ve playoff maçları, hazırlık maçları hariç.
          </p>
        </div>
        {seasons.length > 0 && (
          <div className="w-full sm:w-40">
            <Select label="Sezon" value={season} onChange={(e) => setSeasonChoice(e.target.value)} className="h-10">
              {[...seasons].reverse().map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {loading ? (
        <CompareSkeleton />
      ) : error ? (
        <InlineError
          title="Oyuncu verileri yüklenemedi"
          message={error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : profiles.length === 0 ? (
        <EmptyState
          icon={<UserRound size={24} strokeWidth={1.5} />}
          title="Oyuncu bulunamadı"
          description="Karşılaştırma için kullanılabilir oyuncu profili yok."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <PlayerPicker
              slot="Oyuncu 1"
              player={p1}
              profiles={profiles}
              excludeId={p2?.PLAYER_ID}
              onPick={setP1Choice}
              onOpenProfile={onSelectPlayerProfile}
            />
            <PlayerPicker
              slot="Oyuncu 2"
              player={p2}
              profiles={profiles}
              excludeId={p1?.PLAYER_ID}
              onPick={setP2Choice}
              onOpenProfile={onSelectPlayerProfile}
            />
          </div>

          {s1 == null && s2 == null ? (
            <EmptyState
              icon={<ArrowLeftRight size={24} strokeWidth={1.5} />}
              title="Bu sezon için veri yok"
              description={`${season} sezonunda seçili oyunculardan hiçbirinin maç ortalaması bulunmuyor. Farklı bir sezon seç.`}
            />
          ) : (
            <Card padding="none" className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-light px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">
                    <span className="tabular-nums">{season}</span> maç başına karşılaştırma
                  </h2>
                  <p className="text-xs text-text-secondary">Önde olan değer yeşil ve onay işaretiyle gösterilir.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="neutral" size="sm">
                    <span className="max-w-24 truncate">{p1?.PLAYER_NAME}</span>{" "}
                    <span className="tabular-nums">{lead.a}</span>
                  </Badge>
                  <Badge variant="neutral" size="sm">
                    <span className="max-w-24 truncate">{p2?.PLAYER_NAME}</span>{" "}
                    <span className="tabular-nums">{lead.b}</span>
                  </Badge>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full table-fixed border-collapse">
                  <caption className="sr-only">
                    {p1?.PLAYER_NAME} ve {p2?.PLAYER_NAME} için {season} sezonu maç başına istatistikler
                  </caption>
                  <thead>
                    <tr className="bg-background-tertiary text-xs text-text-secondary">
                      <th scope="col" className="w-1/3 px-4 py-2 text-left font-medium">
                        {p1?.PLAYER_NAME}
                      </th>
                      <th scope="col" className="w-1/3 px-4 py-2 text-center font-medium">
                        İstatistik
                      </th>
                      <th scope="col" className="w-1/3 px-4 py-2 text-right font-medium">
                        {p2?.PLAYER_NAME}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {METRICS.map((m) => {
                      const v1 = s1?.[m.key];
                      const v2 = s2?.[m.key];
                      const w = leader(m, v1, v2);
                      return (
                        <tr key={m.key} className="hover:bg-background-secondary">
                          <ValueCell value={v1} metric={m} leads={w === 1} align="left" />
                          <th scope="row" className="px-4 py-3 text-center text-xs font-medium text-text-secondary">
                            {m.label}
                            {m.hint && <span className="block font-normal text-text-muted">{m.hint}</span>}
                          </th>
                          <ValueCell value={v2} metric={m} leads={w === 2} align="right" />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
