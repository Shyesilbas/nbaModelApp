import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import TeamLogo from "./TeamLogo";
import PlayerPhoto from "./PlayerPhoto";
import { Button, Card, DatePicker, EmptyState, InlineError, Select, Skeleton } from "./common";
import { loadPrivateApi } from "../lib/dataCache";
import { TEAM_NAME_BY_ABBR, type NbaTeamAbbr } from "../lib/nbaTeams";
import { useLanguage } from "../context/useLanguage";

interface TradeSide {
  team: string;
  from: string[];
  players: { id: number; name: string; pos: string | null; impact: number | null }[];
  assets: string[];
}

interface Trade {
  kind: "trade";
  id: string;
  date: string;
  sides: TradeSide[];
}

interface Move {
  kind: "move";
  id: string;
  date: string;
  player: { id: number; name: string; impact: number | null };
  teams: string;
  how: string;
}

type Event = Trade | Move;

type Tier = "cornerstone" | "costar" | "starter" | "rotation";
const TIERS: { id: Tier; label: string; tr: string; min: number }[] = [
  { id: "cornerstone", label: "Franchise Cornerstone", tr: "Takımın direği", min: 45 },
  { id: "costar", label: "All-Star / Co-Star", tr: "Yıldız oyuncu", min: 32 },
  { id: "starter", label: "Key Starter", tr: "Kilit ilk beş", min: 22 },
  { id: "rotation", label: "Rotation Piece", tr: "Rotasyon oyuncusu", min: -Infinity },
];
const tierOf = (impact: number | null | undefined) => TIERS.find((t) => (impact ?? 0) >= t.min)!;

const topImpact = (e: Event) =>
  Math.max(
    ...(e.kind === "trade"
      ? e.sides.flatMap((s) => s.players.map((p) => p.impact ?? 0))
      : [e.player.impact ?? 0])
  );

function TierTag({ impact }: { impact: number | null | undefined }) {
  const { language } = useLanguage();
  if (impact == null) return null;
  const tier = tierOf(impact);
  return (
    <span className="rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
      {language === "tr" ? tier.tr : tier.label} · <span className="tabular-nums">{impact.toFixed(1)}</span>
    </span>
  );
}

// NBA seasons run July to June, so July onward belongs to the season starting that year.
const seasonOf = (iso: string) => {
  const y = Number(iso.slice(0, 4));
  const start = Number(iso.slice(5, 7)) >= 7 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
};

const POS_LABEL: Record<string, { tr: string; en: string }> = {
  guard: { tr: "Guard", en: "Guard" },
  forward: { tr: "Forvet", en: "Forward" },
  center: { tr: "Pivot", en: "Center" },
};

const HOW_TR: Record<string, string> = {
  "Claimed on waivers": "Waiver'dan alındı",
  "Contract converted": "Sözleşme dönüştürüldü",
  Signed: "İmzalandı",
  Waived: "Serbest bırakıldı",
};

const formatMoveHow = (how: string, tr: boolean) => {
  if (!tr) return how;
  for (const [prefix, trLabel] of Object.entries(HOW_TR)) {
    if (how.startsWith(prefix)) {
      return `${trLabel}${how.slice(prefix.length)}`;
    }
  }
  return how;
};

const teamName = (abbr: string) => TEAM_NAME_BY_ABBR[abbr as NbaTeamAbbr] ?? abbr;
const posLabel = (pos: string | null, tr: boolean) =>
  pos
    ? pos
        .split("-")
        .map((p) => POS_LABEL[p.toLowerCase()]?.[tr ? "tr" : "en"] ?? p)
        .join("-")
    : null;

function SideColumn({
  side,
  onSelectPlayer,
  onSelectTeam,
}: {
  side: TradeSide;
  onSelectPlayer?: (playerId: number) => void;
  onSelectTeam?: (abbr: string) => void;
}) {
  const { language } = useLanguage();
  const tr = language === "tr";
  const resolvedTeam = teamName(side.team);

  return (
    <div className="flex min-w-0 flex-col gap-2 p-3 sm:p-4">
      <div className="flex items-center gap-3">
        <TeamLogo abbr={side.team} name={resolvedTeam} size={32} />
        <div className="min-w-0">
          {onSelectTeam ? (
            <button
              type="button"
              onClick={() => onSelectTeam(side.team)}
              className="cursor-pointer truncate text-left text-sm font-semibold text-text-primary transition-colors hover:text-primary hover:underline"
            >
              {resolvedTeam}
            </button>
          ) : (
            <p className="truncate text-sm font-semibold text-text-primary">{resolvedTeam}</p>
          )}
          <p className="text-xs text-text-secondary">
            {tr ? `${side.from.join(", ")} takımından alıyor` : `Acquires from ${side.from.join(", ")}`}
          </p>
        </div>
      </div>
      <ul className="flex flex-col">
        {side.players.map((p) => {
          const pPos = posLabel(p.pos, tr);
          return (
            <li
              key={p.id}
              className="flex items-center gap-3 border-t border-border-light py-1.5 first:border-t-0"
            >
              <PlayerPhoto playerId={p.id} name={p.name} size={32} className="shrink-0" />
              <div className="min-w-0 flex-1">
                {onSelectPlayer ? (
                  <button
                    type="button"
                    onClick={() => onSelectPlayer(p.id)}
                    className="block max-w-full cursor-pointer truncate text-left text-sm font-semibold text-text-primary transition-colors hover:text-primary hover:underline"
                  >
                    {p.name}
                  </button>
                ) : (
                  <p className="truncate text-sm font-semibold text-text-primary">{p.name}</p>
                )}
                {pPos && <p className="text-xs text-text-secondary">{pPos}</p>}
              </div>
              <span className="ml-auto hidden shrink-0 lg:block">
                <TierTag impact={p.impact} />
              </span>
            </li>
          );
        })}
      </ul>
      {side.assets.length > 0 && (
        <p className="border-t border-border-light pt-2 text-xs text-text-secondary">
          + {side.assets.join(", ")}
        </p>
      )}
    </div>
  );
}

function TradeCard({
  trade,
  onSelectPlayer,
  onSelectTeam,
}: {
  trade: Trade;
  onSelectPlayer?: (playerId: number) => void;
  onSelectTeam?: (abbr: string) => void;
}) {
  const { language, formatDate } = useLanguage();
  const count = trade.sides.reduce((n, s) => n + s.players.length, 0);
  const tr = language === "tr";
  return (
    <Card padding="none" className="overflow-hidden transition-colors hover:border-card-border-hover">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          {trade.sides.map((s, i) => (
            <span key={s.team} className="flex items-center gap-2">
              {i > 0 && <ArrowRightLeft size={15} strokeWidth={1.5} className="text-text-muted" aria-hidden="true" />}
              <span>{s.team}</span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-text-secondary">
          <span className="tabular-nums">{formatDate(trade.date)}</span>
          <span className="rounded-sm border border-border bg-background-tertiary px-2 py-0.5 font-medium tabular-nums">
            {count} {tr ? "oyuncu" : count === 1 ? "player" : "players"}
          </span>
        </div>
      </div>
      <div
        className={`grid divide-y divide-border-light sm:divide-y-0 sm:divide-x ${
          trade.sides.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"
        }`}
      >
        {trade.sides.map((s) => (
          <SideColumn
            key={s.team}
            side={s}
            onSelectPlayer={onSelectPlayer}
            onSelectTeam={onSelectTeam}
          />
        ))}
      </div>
    </Card>
  );
}

function MovesCard({
  moves,
  onSelectPlayer,
}: {
  moves: Move[];
  onSelectPlayer?: (playerId: number) => void;
}) {
  const { t, language, formatDate } = useLanguage();
  const tr = language === "tr";
  if (moves.length === 0) return null;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border-light px-4 py-2.5 text-sm">
        <span className="font-semibold text-text-primary">{t.trades.offRosterMoves}</span>
        <span className="text-xs tabular-nums text-text-secondary">{formatDate(moves[0].date)}</span>
      </div>
      <ul className="px-4">
        {moves.map((m) => (
          <li
            key={m.id}
            className="flex flex-wrap items-center gap-3 border-t border-border-light py-2 first:border-t-0"
          >
            <PlayerPhoto playerId={m.player.id} name={m.player.name} size={32} className="shrink-0" />
            <div className="min-w-0 flex-1">
              {onSelectPlayer ? (
                <button
                  type="button"
                  onClick={() => onSelectPlayer(m.player.id)}
                  className="block max-w-full cursor-pointer truncate text-left text-sm font-semibold text-text-primary transition-colors hover:text-primary hover:underline"
                >
                  {m.player.name}
                </button>
              ) : (
                <p className="truncate text-sm font-semibold text-text-primary">{m.player.name}</p>
              )}
              <p className="text-xs text-text-secondary">
                {m.teams.split(", ").join(" → ")} · {formatMoveHow(m.how, tr)}
              </p>
            </div>
            <TierTag impact={m.player.impact} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TradesSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={label}>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-56 rounded" />
        <Skeleton className="h-9 w-28 rounded" />
        <Skeleton className="h-9 w-48 rounded" />
        <Skeleton className="h-9 w-40 rounded" />
      </div>
      <Skeleton className="h-44 w-full rounded" />
      <Skeleton className="h-44 w-full rounded" />
    </div>
  );
}

const PAGE = 20;
const KINDS = ["all", "trade", "move"] as const;
const DEFAULT_TRADE_ERROR = "__TRADE_LOAD_ERROR__";

export default function TradeBoard({
  onSelectPlayer,
  onSelectTeam,
}: {
  onSelectPlayer?: (playerId: number) => void;
  onSelectTeam?: (abbr: string) => void;
} = {}) {
  const { t, language, formatDate } = useLanguage();
  const tr = language === "tr";
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<{ key: number; data?: Event[]; error?: string } | null>(null);
  const [kind, setKind] = useState<(typeof KINDS)[number]>("all");
  const [tier, setTier] = useState<Tier | "all">("all");
  const [seasonChoice, setSeasonChoice] = useState<string | null>(null);
  const [dateChoice, setDateChoice] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let active = true;
    loadPrivateApi<Event[]>("/frontend-data-api/trades")
      .then((data) => {
        if (!active) return;
        setResult({ key: reloadKey, data: data ?? [] });
      })
      .catch((e: unknown) => {
        if (!active) return;
        setResult({
          key: reloadKey,
          error: e instanceof Error && e.message ? e.message : DEFAULT_TRADE_ERROR,
        });
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const loading = result?.key !== reloadKey;
  const events = useMemo(() => (result?.key === reloadKey ? (result.data ?? []) : []), [result, reloadKey]);
  const rawError = result?.key === reloadKey ? result.error : undefined;
  const error =
    rawError === DEFAULT_TRADE_ERROR
      ? tr
        ? "Takas ve kadro hareketleri yüklenemedi."
        : "Failed to load trade and roster move data."
      : rawError;

  const seasons = useMemo(
    () => [...new Set(events.map((e) => seasonOf(e.date)))].sort((a, b) => b.localeCompare(a)),
    [events]
  );

  const season = seasonChoice && seasons.includes(seasonChoice) ? seasonChoice : (seasons[0] ?? "");

  const visible = useMemo(
    () =>
      events.filter((e) => {
        if (season && seasonOf(e.date) !== season) return false;
        if (kind !== "all" && e.kind !== kind) return false;
        if (tier === "all") return true;
        const impacts =
          e.kind === "trade" ? e.sides.flatMap((s) => s.players.map((p) => p.impact)) : [e.player.impact];
        return impacts.some((i) => i != null && tierOf(i).id === tier);
      }),
    [events, kind, tier, season]
  );

  const dates = useMemo(() => [...new Set(visible.map((e) => e.date))].sort(), [visible]);
  const countsByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of visible) {
      counts[e.date] = (counts[e.date] ?? 0) + 1;
    }
    return counts;
  }, [visible]);

  const byTier = tier !== "all";
  const latest = dates[dates.length - 1] ?? "";
  const date = dateChoice && dates.includes(dateChoice) ? dateChoice : latest;

  const todays = useMemo(
    () =>
      byTier
        ? [...visible].sort((x, y) => topImpact(y) - topImpact(x)).slice(0, shown)
        : visible.filter((e) => e.date === date),
    [byTier, visible, shown, date]
  );
  const todayTrades = todays.filter((e): e is Trade => e.kind === "trade");
  const todayMoves = todays.filter((e): e is Move => e.kind === "move");

  const summary = byTier
    ? tr
      ? `${visible.length} kayıt · tüm tarihler`
      : `${visible.length} entries · all dates`
    : todays.length
      ? tr
        ? `${todayTrades.length} takas · ${todayMoves.length} kadro dışı`
        : `${todayTrades.length} trades · ${todayMoves.length} moves`
      : tr
        ? "Kayıt yok"
        : "No records";

  const resetFilters = () => {
    setKind("all");
    setTier("all");
    setDateChoice(null);
    setShown(PAGE);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-text-primary sm:text-xl">{t.trades.title}</h1>
          <p className="mt-0.5 text-xs text-text-secondary">{t.trades.subtitle}</p>
        </div>
        {!loading && !error && events.length > 0 && (
          <span className="text-xs tabular-nums text-text-secondary">{summary}</span>
        )}
      </div>

      {loading ? (
        <TradesSkeleton label={t.trades.loading} />
      ) : error ? (
        <InlineError
          title={t.common.loadFailed}
          message={error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : events.length === 0 ? (
        <EmptyState
          icon={<ArrowRightLeft size={24} strokeWidth={1.5} />}
          title={t.common.noData}
          description={tr ? "Kayıtlı takas veya kadro hareketi bulunmuyor." : "No recorded trades or roster moves found."}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {!byTier && dates.length > 0 && (
              <div className="flex items-center gap-1.5">
                <DatePicker
                  dates={dates}
                  value={date}
                  onChange={setDateChoice}
                  counts={countsByDate}
                  countLabel={tr ? "kayıt" : "moves"}
                  formatDate={formatDate}
                  order="desc"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDateChoice(latest)}
                  disabled={!latest || date === latest}
                  className="h-9 px-3"
                >
                  {tr ? "Son" : "Latest"}
                </Button>
              </div>
            )}

            {seasons.length > 0 && (
              <div className="w-28">
                <Select
                  aria-label={t.common.season}
                  value={season}
                  onChange={(e) => {
                    setSeasonChoice(e.target.value);
                    setDateChoice(null);
                    setShown(PAGE);
                  }}
                  className="h-9 tabular-nums"
                >
                  {seasons.map((sn) => (
                    <option key={sn} value={sn}>
                      {sn}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div
              role="group"
              aria-label={tr ? "Hareket türü" : "Movement type"}
              className="inline-flex items-center rounded border border-border bg-background-tertiary p-0.5 text-xs font-medium"
            >
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => {
                    setKind(k);
                    setDateChoice(null);
                    setShown(PAGE);
                  }}
                  className={`cursor-pointer rounded-sm px-2.5 py-1.5 transition-colors ${
                    kind === k
                      ? "bg-background-primary font-semibold text-text-primary"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {k === "all" ? t.trades.all : k === "trade" ? t.trades.tradesOnly : t.trades.waiversOnly}
                </button>
              ))}
            </div>

            <div className="w-48">
              <Select
                aria-label={tr ? "Etki seviyesi" : "Impact level"}
                value={tier}
                onChange={(e) => {
                  setTier(e.target.value as Tier | "all");
                  setShown(PAGE);
                }}
                className="h-9"
              >
                <option value="all">{tr ? "Tüm etki seviyeleri" : "All impact levels"}</option>
                {TIERS.map((ti) => (
                  <option key={ti.id} value={ti.id}>
                    {tr ? ti.tr : ti.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {todays.length > 0 ? (
            byTier ? (
              <div className="flex flex-col gap-3">
                {todays.map((e) =>
                  e.kind === "trade" ? (
                    <TradeCard
                      key={e.id}
                      trade={e}
                      onSelectPlayer={onSelectPlayer}
                      onSelectTeam={onSelectTeam}
                    />
                  ) : (
                    <MovesCard key={e.id} moves={[e]} onSelectPlayer={onSelectPlayer} />
                  )
                )}
                {shown < visible.length && (
                  <Button
                    variant="secondary"
                    onClick={() => setShown((n) => n + PAGE)}
                    className="self-center"
                  >
                    {tr
                      ? `Daha fazla göster (${visible.length - shown})`
                      : `Show more (${visible.length - shown})`}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {todayTrades.map((trd) => (
                  <TradeCard
                    key={trd.id}
                    trade={trd}
                    onSelectPlayer={onSelectPlayer}
                    onSelectTeam={onSelectTeam}
                  />
                ))}
                {todayMoves.length > 0 && (
                  <MovesCard moves={todayMoves} onSelectPlayer={onSelectPlayer} />
                )}
              </div>
            )
          ) : (
            <EmptyState
              icon={<ArrowRightLeft size={24} strokeWidth={1.5} />}
              title={tr ? "Kayıt bulunamadı" : "No matching records"}
              description={
                tr
                  ? "Seçili sezon ve filtreler için takas veya kadro hareketi bulunmuyor."
                  : "No trades or roster moves match the active season and filters."
              }
              actionLabel={t.common.clearFilters}
              onAction={resetFilters}
            />
          )}
        </>
      )}
    </div>
  );
}
