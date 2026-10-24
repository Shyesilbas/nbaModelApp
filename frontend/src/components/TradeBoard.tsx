import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, ChevronLeft, ChevronRight } from "lucide-react";
import TeamLogo from "./TeamLogo";
import PlayerPhoto from "./PlayerPhoto";
import { loadPrivateApi } from "../lib/dataCache";
import { TEAM_NAME_BY_ABBR, type NbaTeamAbbr } from "../lib/nbaTeams";
import { useLanguage } from "../context/LanguageContext";

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
const TIERS: { id: Tier; label: string; min: number }[] = [
  { id: "cornerstone", label: "Franchise Cornerstone", min: 45 },
  { id: "costar", label: "All-Star / Co-Star", min: 32 },
  { id: "starter", label: "Key Starter", min: 22 },
  { id: "rotation", label: "Rotation Piece", min: -Infinity },
];
const tierOf = (impact: number | null | undefined) => TIERS.find((t) => (impact ?? 0) >= t.min)!;

const topImpact = (e: Event) =>
  Math.max(...(e.kind === "trade" ? e.sides.flatMap((s) => s.players.map((p) => p.impact ?? 0)) : [e.player.impact ?? 0]));

function TierTag({ impact }: { impact: number | null | undefined }) {
  if (impact == null) return null;
  return (
    <span className="rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
      {tierOf(impact).label} · <span className="tabular-nums">{impact.toFixed(1)}</span>
    </span>
  );
}

// NBA seasons run July to June, so July onward belongs to the season starting that year.
const seasonOf = (iso: string) => {
  const y = Number(iso.slice(0, 4));
  const start = Number(iso.slice(5, 7)) >= 7 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
};

const POS_TR: Record<string, string> = { guard: "Guard", forward: "Forward", center: "Center" };
const teamName = (abbr: string) => TEAM_NAME_BY_ABBR[abbr as NbaTeamAbbr] ?? abbr;
const posLabel = (pos: string | null) =>
  pos ? pos.split("-").map((p) => POS_TR[p] ?? p).join("-") : null;

function SideColumn({ side }: { side: TradeSide }) {
  const { language } = useLanguage();
  return (
    <div className="flex min-w-0 flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <TeamLogo abbr={side.team} name="" size={32} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary">{teamName(side.team)}</p>
          <p className="text-sm text-text-secondary">
            {language === "tr"
              ? `${side.from.join(", ")} takımından alıyor`
              : `Acquires from ${side.from.join(", ")}`}
          </p>
        </div>
      </div>
      <ul className="flex flex-col">
        {side.players.map((p) => (
          <li key={p.id} className="flex items-center gap-3 border-t border-border-light py-2 first:border-t-0">
            <PlayerPhoto playerId={p.id} name={p.name} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text-primary">{p.name}</p>
              {posLabel(p.pos) && <p className="text-xs text-text-secondary">{posLabel(p.pos)}</p>}
            </div>
            <span className="ml-auto hidden shrink-0 lg:block"><TierTag impact={p.impact} /></span>
          </li>
        ))}
      </ul>
      {side.assets.length > 0 && (
        <p className="border-t border-border-light pt-2 text-sm text-text-secondary">
          + {side.assets.join(", ")}
        </p>
      )}
    </div>
  );
}

function TradeCard({ trade }: { trade: Trade }) {
  const { language, formatDate } = useLanguage();
  const count = trade.sides.reduce((n, s) => n + s.players.length, 0);
  return (
    <article className="rounded border border-border bg-background-primary hover:border-card-border-hover">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          {trade.sides.map((s, i) => (
            <span key={s.team} className="flex items-center gap-2">
              {i > 0 && <ArrowRightLeft size={16} strokeWidth={1.5} className="text-text-tertiary" />}
              {s.team}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm text-text-secondary">
          <span className="tabular-nums">{formatDate(trade.date)}</span>
          <span className="rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-xs font-medium">
            {count} {language === "tr" ? "oyuncu" : "players"}
          </span>
        </div>
      </div>
      <div
        className={`grid divide-y divide-border-light sm:divide-y-0 sm:divide-x ${
          trade.sides.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"
        }`}
      >
        {trade.sides.map((s) => (
          <SideColumn key={s.team} side={s} />
        ))}
      </div>
    </article>
  );
}

function MovesCard({ moves }: { moves: Move[] }) {
  const { language, formatDate } = useLanguage();
  return (
    <article className="rounded border border-border bg-background-primary">
      <div className="flex items-center justify-between gap-3 border-b border-border-light px-4 py-3 text-sm sm:px-5">
        <span className="font-semibold text-text-primary">
          {language === "tr" ? "Kadro dışı hareketler" : "Roster moves & Waivers"}
        </span>
        <span className="tabular-nums text-text-secondary">{formatDate(moves[0].date)}</span>
      </div>
      <ul className="px-4 sm:px-5">
        {moves.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 border-t border-border-light py-3 first:border-t-0">
            <PlayerPhoto playerId={m.player.id} name={m.player.name} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text-primary">{m.player.name}</p>
              <p className="text-xs text-text-secondary">
                {m.teams.split(", ").join(" → ")} · {m.how}
              </p>
            </div>
            <TierTag impact={m.player.impact} />
          </li>
        ))}
      </ul>
    </article>
  );
}

const PAGE = 20;
const KINDS = [
  { id: "all", label: "Tümü" },
  { id: "trade", label: "Takas" },
  { id: "move", label: "Kadro dışı" },
] as const;

export default function TradeBoard() {
  const { t, language, formatDate } = useLanguage();
  const [events, setEvents] = useState<Event[]>([]);
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("all");
  const [tier, setTier] = useState<Tier | "all">("all");
  const [season, setSeason] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPrivateApi<Event[]>("/frontend-data-api/trades")
      .then((data) => {
        setEvents(data);
        setDate(data[0]?.date ?? "");
        setSeason(data[0] ? seasonOf(data[0].date) : "");
      })
      .catch((e) => setError(e.message));
  }, []);

  const visible = useMemo(
    () =>
      events.filter((e) => {
        if (season && seasonOf(e.date) !== season) return false;
        if (kind !== "all" && e.kind !== kind) return false;
        if (tier === "all") return true;
        const impacts = e.kind === "trade" ? e.sides.flatMap((s) => s.players.map((p) => p.impact)) : [e.player.impact];
        return impacts.some((i) => i != null && tierOf(i).id === tier);
      }),
    [events, kind, tier, season]
  );
  const seasons = useMemo(() => [...new Set(events.map((e) => seasonOf(e.date)))], [events]);
  const dates = useMemo(() => [...new Set(visible.map((e) => e.date))].sort(), [visible]);
  // A tier filter lists every matching event by impact score, whatever the date; otherwise one day at a time.
  const byTier = tier !== "all";
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [kind, tier]);
  const todays = useMemo(
    () => (byTier ? [...visible].sort((x, y) => topImpact(y) - topImpact(x)).slice(0, shown) : visible.filter((e) => e.date === date)),
    [byTier, visible, shown, date]
  );
  const todayTrades = todays.filter((e): e is Trade => e.kind === "trade");
  const todayMoves = todays.filter((e): e is Move => e.kind === "move");
  const prev = [...dates].reverse().find((d) => d < date);
  const next = dates.find((d) => d > date);
  const latest = dates[dates.length - 1] ?? date;

  if (error) {
    return (
      <p className="text-sm text-status-error">
        {language === "tr" ? `Takas verisi yüklenemedi: ${error}` : `Failed to load trade data: ${error}`}
      </p>
    );
  }
  if (!date) {
    return <p className="text-sm text-text-secondary">{t.trades.loading}</p>;
  }

  const stepBtn =
    "inline-flex h-10 w-10 items-center justify-center rounded border border-border bg-background-primary text-text-primary hover:border-card-border-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">{t.trades.title}</h1>
        <p className="text-sm text-text-secondary">{t.trades.subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={stepBtn} disabled={byTier || !prev} onClick={() => prev && setDate(prev)} aria-label={t.common.previousDay}>
          <ChevronLeft size={16} strokeWidth={1.5} />
        </button>
        <label className={`inline-flex h-10 items-center rounded border border-border bg-background-primary px-3 focus-within:border-border-focus ${byTier ? "opacity-40" : ""}`}>
          <span className="sr-only">{t.common.date}</span>
          <input
            type="date"
            value={date}
            disabled={byTier}
            min={dates[0]}
            max={latest}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded bg-transparent text-sm font-medium tabular-nums text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
          />
        </label>
        <button type="button" className={stepBtn} disabled={byTier || !next} onClick={() => next && setDate(next)} aria-label={t.common.nextDay}>
          <ChevronRight size={16} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => setDate(latest)}
          disabled={byTier || date === latest}
          className="h-10 rounded border border-border bg-background-primary px-3 text-sm font-medium text-text-primary hover:border-card-border-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {language === "tr" ? "Son kayıt" : "Latest"}
        </button>
        <span className="ml-auto text-sm tabular-nums text-text-secondary">
          {byTier
            ? (language === "tr" ? `${visible.length} kayıt · tüm tarihler` : `${visible.length} entries · all dates`)
            : todays.length
            ? (language === "tr"
                ? `${todayTrades.length} takas · ${todayMoves.length} kadro dışı`
                : `${todayTrades.length} trades · ${todayMoves.length} moves`)
            : (language === "tr" ? "Kayıt yok" : "No records")}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
          {t.common.season}
          <select
            value={season}
            onChange={(e) => {
              setSeason(e.target.value);
              const first = events.find((ev) => seasonOf(ev.date) === e.target.value);
              if (first) setDate(first.date);
            }}
            className="h-10 rounded border border-border bg-background-primary px-3 text-sm font-medium tabular-nums text-text-primary focus:border-border-focus focus:outline-none"
          >
            {seasons.map((sn) => (
              <option key={sn} value={sn}>{sn}</option>
            ))}
          </select>
        </label>
        <div role="group" aria-label={language === "tr" ? "Hareket türü" : "Movement type"} className="inline-flex rounded border border-border bg-background-tertiary p-0.5">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
              className={`h-9 rounded-sm px-3 text-sm font-medium cursor-pointer ${
                kind === k.id ? "bg-background-primary text-text-primary" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {k.id === "all" ? t.common.all : k.id === "trade" ? (language === "tr" ? "Takas" : "Trades") : (language === "tr" ? "Kadro dışı" : "Moves")}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
          {language === "tr" ? "Etki seviyesi" : "Impact level"}
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as Tier | "all")}
            className="h-10 rounded border border-border bg-background-primary px-3 text-sm font-medium text-text-primary focus:border-border-focus focus:outline-none"
          >
            <option value="all">{t.common.all}</option>
            {TIERS.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </label>
      </div>

      {todays.length > 0 ? (
        byTier ? (
          <>
            {todays.map((e) =>
              e.kind === "trade" ? <TradeCard key={e.id} trade={e} /> : <MovesCard key={e.id} moves={[e]} />
            )}
            {shown < visible.length && (
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                className="h-10 self-center rounded border border-border px-4 text-sm font-medium text-text-primary hover:border-card-border-hover cursor-pointer"
              >
                {language === "tr" ? "Daha fazla göster" : "Show more"}
              </button>
            )}
          </>
        ) : (
          <>
            {todayTrades.map((t) => <TradeCard key={t.id} trade={t} />)}
            {todayMoves.length > 0 && <MovesCard moves={todayMoves} />}
          </>
        )
      ) : (
        <div className="flex flex-col items-center gap-3 rounded border border-border bg-background-primary px-4 py-12 text-center text-sm text-text-secondary">
          <p>
            {language === "tr"
              ? `${formatDate(date)} tarihinde kayıt yok.`
              : `No moves recorded on ${formatDate(date)}.`}
          </p>
          <button
            type="button"
            onClick={() => setDate(prev ?? next ?? latest)}
            className="h-10 rounded border border-border px-3 font-medium text-text-primary hover:border-card-border-hover cursor-pointer"
          >
            {language === "tr" ? "En yakın kayıt gününe git" : "Jump to nearest active date"}
          </button>
        </div>
      )}
    </div>
  );
}
