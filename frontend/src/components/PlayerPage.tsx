import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  ChevronDown,
  Check,
  ArrowLeft,
  Calendar,
  AlertCircle,
  ArrowRightLeft,
  X,
} from "lucide-react";
import { loadPrivateApi } from "../lib/dataCache";
import PlayerPhoto from "./PlayerPhoto";
import TeamLogo from "./TeamLogo";
import GameDetailPanel from "./GameDetailPanel";

/* ─────────── Types ─────────── */
interface PlayerProfile {
  PLAYER_ID: number;
  PLAYER_NAME: string;
  CURRENT_TEAM?: string | null;
  CURRENT_TEAM_ABBREVIATION?: string | null;
  HEIGHT: string | null;
  WEIGHT: string | null;
  COLLEGE: string | null;
  COUNTRY: string | null;
  OFFICIAL_POSITION: string | null;
  POSITION_GROUP: string | null;
  DRAFT_YEAR: number | null;
  DRAFT_ROUND: number | null;
  DRAFT_NUMBER: number | null;
  FROM_YEAR: number | null;
  TO_YEAR: number | null;
  ROSTER_STATUS: string | null;
}

interface SeasonAverages {
  games_played: number;
  games_total: number;
  teams?: string[];
  MIN: number | null;
  PTS: number | null;
  REB: number | null;
  AST: number | null;
  STL: number | null;
  BLK: number | null;
  TOV: number | null;
  FGM: number | null;
  FGA: number | null;
  FG_PCT: number | null;
  FG3M: number | null;
  FG3A: number | null;
  FG3_PCT: number | null;
  FTM: number | null;
  FTA: number | null;
  FT_PCT: number | null;
  OREB: number | null;
  DREB: number | null;
  PLUS_MINUS: number | null;
  is_roster_preview?: boolean;
  IMPORTANCE_SCORE?: number | null;
}

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

const fmtPct = (v: number | null | undefined) =>
  v != null ? `${(v * 100).toFixed(1)}%` : "—";
const fmtStat = (v: number | null | undefined, dec = 1) =>
  v != null ? v.toFixed(dec) : "—";
const fmtDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("tr-TR", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

/* ─────────── Sub-components ─────────── */

function SeasonSelector({
  seasons,
  selected,
  onChange,
  teamFor,
}: {
  seasons: string[];
  selected: string;
  onChange: (s: string) => void;
  teamFor: (s: string) => string | null;
}) {
  const [open, setOpen] = useState(false);
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

  const label = (s: string) => {
    const team = teamFor(s);
    return (
      <>
        {team && <TeamLogo abbr={team} name="" size={20} />}
        <span className="tabular-nums">{s}</span>
        {team && <span className="text-text-secondary">{team}</span>}
      </>
    );
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 items-center gap-2 rounded border border-border bg-background-primary px-3 text-sm font-medium text-text-primary hover:border-card-border-hover focus-visible:border-border-focus focus-visible:outline-none cursor-pointer"
      >
        {label(selected)}
        <ChevronDown size={16} strokeWidth={1.5} className="text-text-muted" />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-50 mt-1 max-h-72 min-w-full overflow-y-auto rounded border border-border bg-background-primary py-1 shadow-sm"
        >
          {[...seasons].reverse().map((sn) => (
            <li key={sn} role="option" aria-selected={sn === selected}>
              <button
                type="button"
                onClick={() => { onChange(sn); setOpen(false); }}
                className="flex h-10 w-full items-center gap-2 px-3 text-left text-sm text-text-primary hover:bg-background-tertiary cursor-pointer"
              >
                {label(sn)}
                {sn === selected && <Check size={16} strokeWidth={1.5} className="ml-auto text-text-muted" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AveragesGrid({ avgs }: { avgs: SeasonAverages }) {
  const headline = [
    { label: "Sayı (PPG)", short: "PPG", value: fmtStat(avgs.PTS) },
    { label: "Ribaund (RPG)", short: "RPG", value: fmtStat(avgs.REB) },
    { label: "Asist (APG)", short: "APG", value: fmtStat(avgs.AST) },
  ];
  const supporting = [
    { label: "MIN", value: fmtStat(avgs.MIN) },
    { label: "STL", value: fmtStat(avgs.STL) },
    { label: "BLK", value: fmtStat(avgs.BLK) },
    { label: "TOV", value: fmtStat(avgs.TOV) },
    { label: "+/-", value: fmtStat(avgs.PLUS_MINUS) },
    { label: "OREB", value: fmtStat(avgs.OREB) },
    { label: "DREB", value: fmtStat(avgs.DREB) },
  ];
  const shooting = [
    {
      label: "FG%",
      value: fmtPct(avgs.FG_PCT),
      sub: avgs.FGM != null && avgs.FGA != null ? `${fmtStat(avgs.FGM)} / ${fmtStat(avgs.FGA)}` : undefined,
    },
    {
      label: "3P%",
      value: fmtPct(avgs.FG3_PCT),
      sub: avgs.FG3M != null && avgs.FG3A != null ? `${fmtStat(avgs.FG3M)} / ${fmtStat(avgs.FG3A)}` : undefined,
    },
    {
      label: "FT%",
      value: fmtPct(avgs.FT_PCT),
      sub: avgs.FTM != null && avgs.FTA != null ? `${fmtStat(avgs.FTM)} / ${fmtStat(avgs.FTA)}` : undefined,
    },
  ];

  const stat = (label: string, value: string, sub?: string, big = false) => (
    <div key={label}>
      <p className="text-xs text-text-secondary">{label}</p>
      <p className={`tabular-nums text-text-primary ${big ? "text-xl font-semibold" : "text-sm font-medium"}`}>
        {value}
        {sub && <span className="ml-1 text-xs font-normal text-text-muted">({sub})</span>}
      </p>
    </div>
  );

  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3">
      {headline.map((h) => stat(h.short, h.value, undefined, true))}
      <span className="hidden sm:block w-px self-stretch bg-border-light" />
      {supporting.map((i) => stat(i.label, i.value))}
      <span className="hidden sm:block w-px self-stretch bg-border-light" />
      {shooting.map((i) => stat(i.label, i.value, i.sub))}
    </div>
  );
}

type RenderItem =
  | { type: "game"; data: GameRow }
  | { type: "trade"; from: string; to: string; dateBefore: string | null; dateAfter: string | null };

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
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-xs font-semibold text-white bg-status-success"
          title="Galibiyet"
        >
          G
        </span>
      );
    }
    if (wl === "L") {
      return (
        <span
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-xs font-semibold text-white bg-status-error"
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
            <tr className="bg-background-tertiary/60 border-b border-border text-xs font-semibold text-text-muted">
              <th className="sticky left-0 bg-background-tertiary px-3 py-2.5 text-left min-w-[120px]">Tarih</th>
              <th className="px-2 py-2.5 text-left min-w-[130px]">Eşleşme</th>
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
          <tbody className="divide-y divide-border">
            {visible.map((item, idx) => {
              if (item.type === "trade") {
                return (
                  <tr key={`trade-${idx}`} className="bg-background-tertiary/70 border-t border-b border-border">
                    <td colSpan={16} className="px-3 py-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1.5 bg-background-primary border border-border text-text-primary px-2 py-0.5 rounded text-xs font-semibold">
                            <ArrowRightLeft size={12} />
                            Takas / Transfer
                          </span>
                          <div className="flex items-center gap-2 font-semibold text-text-primary text-xs">
                            <TeamLogo abbr={item.from} name="" size={18} />
                            <span className="text-text-secondary">{item.from}</span>
                            <ArrowRightLeft size={12} className="text-text-muted mx-1" />
                            <TeamLogo abbr={item.to} name="" size={18} />
                            <span className="text-text-primary font-semibold">{item.to}</span>
                          </div>
                        </div>
                        <p className="text-xs text-text-muted">
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
                  className={`transition-colors ${
                    isDnp ? "bg-background-tertiary/40 opacity-70" : "hover:bg-background-tertiary/70"
                  } ${clickable ? "cursor-pointer group" : ""}`}
                >
                  <td className="sticky left-0 bg-background-primary px-3 py-2">
                    <p className="text-xs font-semibold text-text-primary tabular-nums">{fmtDate(g.GAME_DATE)}</p>
                    {clickable && (
                      <p className="text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        Kutu skorunu gör
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      {g.HOME_TEAM_ABBREVIATION && (
                        <TeamLogo
                          abbr={g.MATCHUP?.includes("vs.") ? g.AWAY_TEAM_ABBREVIATION ?? "" : g.HOME_TEAM_ABBREVIATION ?? ""}
                          name=""
                          size={16}
                        />
                      )}
                      <span className="text-xs font-semibold text-text-primary whitespace-nowrap">
                        {g.MATCHUP ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center">
                    {isDnp ? (
                      <span className="rounded-sm bg-background-tertiary border border-border px-1.5 py-0.5 text-xs font-semibold text-text-muted">DNP</span>
                    ) : (
                      wlBadge(g.WL)
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {isDnp ? (
                      <span className="text-xs text-text-muted">Oynamadı</span>
                    ) : (
                      <span className="text-xs font-semibold text-text-secondary tabular-nums">{score}</span>
                    )}
                  </td>
                  {isDnp ? (
                    <>
                      {Array.from({ length: 11 }).map((_, i) => (
                        <td key={i} className="px-2 py-2 text-right text-text-muted">—</td>
                      ))}
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">{g.MIN != null ? Math.round(g.MIN) : "—"}</td>
                      <td className="px-2 py-2 text-right font-semibold text-text-primary tabular-nums">{g.PTS ?? "—"}</td>
                      <td className="px-2 py-2 text-right font-semibold text-text-secondary tabular-nums">{g.REB ?? "—"}</td>
                      <td className="px-2 py-2 text-right font-semibold text-text-secondary tabular-nums">{g.AST ?? "—"}</td>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">{g.STL ?? "—"}</td>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">{g.BLK ?? "—"}</td>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">{g.TOV ?? "—"}</td>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">{fmtPct(g.FG_PCT)}</td>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">{fmtPct(g.FG3_PCT)}</td>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">{fmtPct(g.FT_PCT)}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${pmColor(g.PLUS_MINUS)}`}>
                        {g.PLUS_MINUS != null ? `${g.PLUS_MINUS > 0 ? "+" : ""}${g.PLUS_MINUS}` : "—"}
                      </td>
                    </>
                  )}
                  <td className="px-2 py-2 text-center">
                    <span className="rounded-sm  px-1.5 py-0.5 text-xs font-semibold bg-background-tertiary border border-border text-text-secondary">
                      {g.IS_PLAYOFF ? "PO" : "RS"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs font-medium text-text-secondary">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, games.length)} / {games.length} maç
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="h-8 rounded border border-border bg-background-primary px-3 text-xs font-semibold text-text-primary hover:bg-background-tertiary disabled:opacity-30 transition-all cursor-pointer"
            >
              Önceki
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
              return (
                <button
                  key={pg}
                  type="button"
                  onClick={() => setPage(pg)}
                  className={`h-8 w-8 rounded text-xs font-semibold transition-all cursor-pointer ${
                    pg === page
                      ? "bg-primary text-white"
                      : "border border-border bg-background-primary text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
                  }`}
                >
                  {pg + 1}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="h-8 rounded border border-border bg-background-primary px-3 text-xs font-semibold text-text-primary hover:bg-background-tertiary disabled:opacity-30 transition-all cursor-pointer"
            >
              Sonraki
            </button>
          </div>
        </div>
      )}
    </div>
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
        profiles.some((p) => (averagesData[String(p.PLAYER_ID)]?.[sn]?.games_played ?? 0) >= 15)
      ) ?? seasonsDesc[0] ?? "",
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
  const teams = useMemo(() => [...new Set(rows.map((r) => r.team).filter(Boolean) as string[])].sort(), [rows]);
  const list = useMemo(
    () =>
      rows
        .filter((r) => (team === "all" || r.team === team) && (position === "all" || r.p.POSITION_GROUP === position))
        .sort((x, y) => (y.a[sortKey] ?? -1) - (x.a[sortKey] ?? -1)),
    [rows, team, position, sortKey]
  );
  const reset = () => setShown(PAGE_SIZE);

  const selectCls =
    "h-10 rounded border border-border bg-background-primary px-3 text-sm font-medium text-text-primary focus:border-border-focus focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Lig liderleri</h2>
          <p className="text-sm text-text-secondary">
            Maç başına ortalamalar · en az 10 maç · <span className="tabular-nums">{list.length}</span> oyuncu
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Sezon" value={season} onChange={(e) => { setSeason(e.target.value); setTeam("all"); reset(); }} className={`${selectCls} tabular-nums`}>
            {seasonsDesc.map((sn) => <option key={sn} value={sn}>{sn}</option>)}
          </select>
          <select aria-label="Takım" value={team} onChange={(e) => { setTeam(e.target.value); reset(); }} className={selectCls}>
            <option value="all">Tüm takımlar</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div role="group" aria-label="Pozisyon" className="inline-flex rounded border border-border bg-background-tertiary p-0.5">
            {POSITION_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={position === g.id}
                onClick={() => { setPosition(g.id); reset(); }}
                className={`h-9 rounded-sm px-3 text-sm font-medium cursor-pointer ${
                  position === g.id ? "bg-background-primary text-text-primary" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-background-tertiary text-left text-text-secondary">
              <th className="w-10 px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Oyuncu</th>
              <th className="px-3 py-2 font-medium">Takım</th>
              <th className="px-3 py-2 text-right font-medium">GP</th>
              {LEADER_COLS.map((c) => (
                <th key={c.key} className="px-1 py-1 text-right font-medium">
                  <button
                    type="button"
                    onClick={() => { setSortKey(c.key); reset(); }}
                    aria-sort={sortKey === c.key ? "descending" : "none"}
                    className={`rounded px-2 py-1 cursor-pointer hover:text-text-primary ${
                      sortKey === c.key ? "text-text-primary font-semibold" : ""
                    }`}
                  >
                    {c.label}{sortKey === c.key ? " ↓" : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.slice(0, shown).map(({ p, a, team: t }, i) => (
              <tr
                key={p.PLAYER_ID}
                onClick={() => onSelect(p)}
                className="cursor-pointer border-b border-border-light last:border-b-0 hover:bg-background-tertiary"
              >
                <td className="px-3 py-2 tabular-nums text-text-secondary">{i + 1}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSelect(p); }}
                    className="flex items-center gap-3 text-left cursor-pointer"
                  >
                    <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME ?? ""} size={32} />
                    <span className="font-medium text-text-primary">{p.PLAYER_NAME}</span>
                    {p.OFFICIAL_POSITION && <span className="text-xs text-text-secondary">{p.OFFICIAL_POSITION}</span>}
                  </button>
                </td>
                <td className="px-3 py-2">
                  {t && (
                    <span className="flex items-center gap-2 text-text-secondary">
                      <TeamLogo abbr={t} name="" size={20} />
                      {t}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{a.games_played}</td>
                {LEADER_COLS.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-2 text-right tabular-nums ${sortKey === c.key ? "font-semibold text-text-primary" : "text-text-secondary"}`}
                  >
                    {c.pct ? fmtPct(a[c.key]) : fmtStat(a[c.key])}
                  </td>
                ))}
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={4 + LEADER_COLS.length} className="px-3 py-10 text-center text-text-secondary">
                  Bu filtrelerle eşleşen oyuncu yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {shown < list.length && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE_SIZE)}
            className="h-10 rounded border border-border px-4 text-sm font-medium text-text-primary hover:border-card-border-hover cursor-pointer"
          >
            Daha fazla göster
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────── Main Component ─────────── */
export default function PlayerPage({ initialPlayerId = null }: { initialPlayerId?: number | null }) {
  const [seasonsList, setSeasonsList] = useState<string[]>(["2022-23", "2023-24", "2024-25", "2025-26", "2026-27"]);
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [gamesData, setGamesData] = useState<Record<string, Record<string, GameRow[]>>>({});
  const [averagesData, setAveragesData] = useState<Record<string, Record<string, SeasonAverages>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerProfile | null>(null);
  const [selectedSeason, setSelectedSeason] = useState("2026-27");
  const [selectedGame, setSelectedGame] = useState<GameRow | null>(null);
  const [opponentSearch, setOpponentSearch] = useState("");

  useEffect(() => {
    // Start the opened player's history now instead of after the profile list arrives;
    // handleSelectPlayer reuses this request.
    if (initialPlayerId != null) {
      loadPrivateApi(`/frontend-data-api/players/${encodeURIComponent(String(initialPlayerId))}`).catch(() => {});
    }
    const load = async () => {
      try {
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
          loadPrivateApi<Record<string, Record<string, SeasonAverages>>>("/frontend-data-api/player-season-averages"),
        ]);
        setProfiles(prof);
        setAveragesData(avgs);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filteredProfiles = useMemo(() => {
    if (!search.trim()) return profiles.slice(0, 20);
    const q = search.toLowerCase();
    return profiles.filter((p) => p.PLAYER_NAME?.toLowerCase().includes(q)).slice(0, 20);
  }, [profiles, search]);

  useEffect(() => {
    if (!selectedPlayer) return;
    const playerId = String(selectedPlayer.PLAYER_ID);
    const pGames = gamesData[playerId] ?? {};
    const pAvgs = averagesData[playerId] ?? {};
    const available = seasonsList.filter((s) => (pGames[s]?.length > 0) || (pAvgs[s] != null) || s === "2026-27");
    if (available.length > 0 && !available.includes(selectedSeason)) {
      setSelectedSeason(available[available.length - 1]);
    }
  }, [selectedPlayer, gamesData, averagesData, seasonsList, selectedSeason]);

  const handleSelectPlayer = useCallback((p: PlayerProfile) => {
    setSelectedPlayer(p);
    setSelectedGame(null);
    setOpponentSearch("");
    setSearch("");
    setShowDropdown(false);
    const playerId = String(p.PLAYER_ID);
    loadPrivateApi<{
      player_id: string;
      games: Record<string, GameRow[]>;
      averages: Record<string, SeasonAverages>;
    }>(`/frontend-data-api/players/${encodeURIComponent(playerId)}`)
      .then((payload) => {
        setGamesData((prev) => ({ ...prev, [payload.player_id]: payload.games }));
        setAveragesData((prev) => ({ ...prev, [payload.player_id]: payload.averages }));
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (initialPlayerId == null || loading) return;
    const target = profiles.find((profile) => profile.PLAYER_ID === initialPlayerId);
    if (target) handleSelectPlayer(target);
  }, [handleSelectPlayer, initialPlayerId, loading, profiles]);

  const pid = selectedPlayer ? String(selectedPlayer.PLAYER_ID) : null;
  const playerGames = useMemo(() => (pid ? (gamesData[pid] ?? {}) : {}), [pid, gamesData]);
  const playerAvgs = useMemo(() => (pid ? (averagesData[pid] ?? {}) : {}), [pid, averagesData]);
  const availableSeasons = useMemo(() => {
    return seasonsList.filter((s) => (playerGames[s]?.length > 0) || (playerAvgs[s] != null) || s === "2026-27");
  }, [seasonsList, playerGames, playerAvgs]);
  const currentAvgs = playerAvgs[selectedSeason] ?? null;
  const teamForSeason = (s: string) =>
    playerAvgs[s]?.teams?.at(-1) ?? playerGames[s]?.[0]?.TEAM_ABBREVIATION ?? (s === "2026-27" ? selectedPlayer?.CURRENT_TEAM ?? null : null);

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

      return oppAbbr.includes(query) ||
             oppName.includes(query) ||
             matchup.toLowerCase().includes(query);
    });
  }, [playerGames, selectedSeason, opponentSearch]);

  const draftStr = (p: PlayerProfile) => {
    if (!p.DRAFT_YEAR) return "Draft Edilmedi";
    const round = p.DRAFT_ROUND ? `${p.DRAFT_ROUND}. Tur` : "";
    const pick = p.DRAFT_NUMBER ? `${p.DRAFT_NUMBER}. Sıra` : "";
    return [p.DRAFT_YEAR, round, pick].filter(Boolean).join(" · ");
  };

  if (loading) {
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-3">
        <p className="text-sm text-text-secondary">
          Oyuncu verileri yükleniyor
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-3 rounded border border-status-error/20 bg-background-primary p-6 text-center">
        <div className="rounded p-2 text-status-error">
          <AlertCircle size={24} />
        </div>
        <div>
          <h2 className="text-base font-semibold text-text-primary">Veri bulunamadı</h2>
          <p className="mt-1 text-xs text-text-secondary">{error}</p>
        </div>
        <p className="rounded border border-border bg-background-secondary px-3 py-1.5 text-xs text-text-secondary">
          PYTHONPATH=. python3 scripts/build_frontend_store.py
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div className="relative w-full">
        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          id="player-profile-search"
          type="text"
          placeholder="Oyuncu ara (örn. LeBron James, Stephen Curry)..."
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
          className="w-full h-11 rounded-xl border border-border bg-background-primary pl-10 pr-9 text-xs sm:text-sm font-medium text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-border-focus shadow-xs"
        />
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setShowDropdown(false);
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary rounded transition-colors cursor-pointer"
            title="Aramayı temizle"
          >
            <X size={15} />
          </button>
        )}

        {showDropdown && search.trim().length > 0 && (
          <div className="absolute left-0 right-0 z-50 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-border bg-background-primary shadow-xl divide-y divide-border">
            {filteredProfiles.length > 0 ? (
              filteredProfiles.map((p) => (
                <button
                  key={p.PLAYER_ID}
                  type="button"
                  onMouseDown={() => {
                    handleSelectPlayer(p);
                    setShowDropdown(false);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-background-tertiary cursor-pointer"
                >
                  <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME ?? ""} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-text-primary">{p.PLAYER_NAME}</p>
                    <p className="text-[11px] text-text-muted truncate">
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

      {/* Player Profile (when selected) */}
      {selectedPlayer && (
        <div className="space-y-5">
          <button
            type="button"
            onClick={() => { setSelectedPlayer(null); setSearch(""); setSelectedGame(null); }}
            className="inline-flex h-9 items-center gap-1.5 rounded px-2 -ml-2 text-sm font-medium text-text-secondary hover:text-text-primary cursor-pointer"
          >
            <ArrowLeft size={16} strokeWidth={1.5} />
            Oyuncu profilleri
          </button>
          {/* Hero Card */}
          {(() => {
            return (
              <div className="rounded border border-border bg-background-primary p-4 sm:p-5">
                <div className="flex items-start gap-4">
                  <PlayerPhoto
                    playerId={selectedPlayer.PLAYER_ID}
                    name={selectedPlayer.PLAYER_NAME ?? ""}
                    size={64}
                    className="shrink-0 rounded border border-border"
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-2xl font-semibold text-text-primary">{selectedPlayer.PLAYER_NAME}</h2>
                    <p className="mt-0.5 text-sm text-text-secondary">
                      {[
                        [selectedPlayer.OFFICIAL_POSITION, selectedPlayer.POSITION_GROUP].filter(Boolean).join(" · "),
                        currentAvgs?.teams && currentAvgs.teams.length > 1 ? currentAvgs.teams.join(" → ") : null,
                        selectedPlayer.HEIGHT,
                        selectedPlayer.WEIGHT ? `${selectedPlayer.WEIGHT} lbs` : null,
                        selectedPlayer.COUNTRY,
                        selectedPlayer.COLLEGE,
                        draftStr(selectedPlayer),
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {availableSeasons.length > 0 && (
                    <SeasonSelector
                      seasons={availableSeasons}
                      selected={selectedSeason}
                      onChange={setSelectedSeason}
                      teamFor={teamForSeason}
                    />
                  )}
                </div>

                {availableSeasons.length > 0 && (
                  <div className="mt-4 border-t border-border pt-4">
                    {currentAvgs && currentAvgs.games_total > 0 ? (
                      <>
                        <AveragesGrid avgs={currentAvgs} />
                        <p className="mt-3 text-xs tabular-nums text-text-secondary">
                          {currentAvgs.games_played} / {currentAvgs.games_total} maç · maç başına ortalamalar
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-text-secondary">{selectedSeason} sezonu için ortalama verisi bulunamadı.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {availableSeasons.length === 0 ? (
            <div className="rounded border border-border bg-background-primary p-6 text-center">
              <AlertCircle size={22} className="mx-auto mb-2 text-text-secondary" />
              <p className="text-xs font-semibold text-text-secondary">Bu oyuncu için veritabanında maç kaydı bulunamadı.</p>
            </div>
          ) : (
            <>
              {/* Game Log */}
              <div className="rounded border border-border bg-background-primary p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-primary" />
                    <div>
                      <h2 className="text-base font-semibold text-text-primary">
                        {selectedSeason} Maç Günlüğü
                      </h2>
                      <p className="text-xs text-text-muted">
                        Toplam {currentGames.length} karşılaşma
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-sm bg-background-tertiary border border-border px-2 py-0.5 text-xs font-semibold text-text-secondary">
                      {currentGames.length} maç
                    </span>
                    <span className="rounded-sm bg-status-warning/10 border border-status-warning/20 px-2 py-0.5 text-xs font-semibold text-status-warning">
                      {currentGames.filter((g) => g.DID_NOT_PLAY).length} DNP
                    </span>
                    <span className="rounded-sm bg-background-tertiary border border-border px-2 py-0.5 text-xs font-semibold text-text-secondary">
                      {currentGames.filter((g) => g.IS_PLAYOFF).length} playoff
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {!selectedGame && (playerGames[selectedSeason] ?? []).length > 0 && (
                    <div className="relative flex-1 max-w-sm">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Rakip takıma göre filtrele (örn. GSW)..."
                        value={opponentSearch}
                        onChange={(e) => setOpponentSearch(e.target.value)}
                        className="w-full h-9 rounded border border-border bg-background-tertiary pl-9 pr-4 text-xs font-medium text-text-primary placeholder:text-text-muted focus:border-border-focus focus:bg-background-primary focus:outline-none transition-all"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-xs text-text-muted ml-auto font-medium">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-status-warning/60" />
                      DNP = Oynamadı
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="rounded-sm  bg-background-tertiary border border-border px-1.5 py-0.5 text-xs font-semibold text-text-primary">PO</span>
                      Playoff
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="rounded-sm  bg-background-tertiary border border-border px-1.5 py-0.5 text-xs font-semibold text-text-secondary">RS</span>
                      Normal Sezon
                    </span>
                  </div>
                </div>

                {selectedGame ? (
                  <GameDetailPanel
                    game={selectedGame as any}
                    season={selectedSeason}
                    highlightPlayerId={selectedPlayer?.PLAYER_ID}
                    onBack={() => setSelectedGame(null)}
                  />
                ) : (playerGames[selectedSeason] ?? []).length > 0 ? (
                  currentGames.length > 0 ? (
                    <GameLogTable
                      games={currentGames}
                      onGameClick={(g) => setSelectedGame(g)}
                    />
                  ) : (
                    <div className="py-8 text-center space-y-2">
                      <p className="text-xs text-text-secondary">&quot;{opponentSearch}&quot; ile eşleşen maç bulunamadı.</p>
                      <button
                        type="button"
                        onClick={() => setOpponentSearch("")}
                        className="h-8 rounded border border-border bg-background-primary px-3 text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                      >
                        Aramayı Temizle
                      </button>
                    </div>
                  )
                ) : selectedSeason === "2026-27" ? (
                  <div className="py-8 text-center">
                    <p className="text-sm font-medium text-text-primary">Henüz maç oynanmadı</p>
                    <p className="mt-1 text-sm text-text-secondary">Maç kayıtları sezon başladığında burada görünecek.</p>
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-text-muted">{selectedSeason} için maç kaydı bulunamadı.</div>
                )}
              </div>
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
