import { useEffect, useMemo, useState } from "react";
import {
  Search,
  ChevronDown,
  User,
  TrendingUp,
  Calendar,
  AlertCircle,
  Trophy,
  MapPin,
  GraduationCap,
  Globe,
  Ruler,
  Weight,
  Hash,
  ArrowRightLeft,
  Users2,
} from "lucide-react";
import { loadJson, loadPrivateApi } from "../lib/dataCache";
import PlayerPhoto from "./PlayerPhoto";
import TeamLogo from "./TeamLogo";
import GameDetailPanel from "./GameDetailPanel";

/* ─────────── Types ─────────── */
interface PlayerProfile {
  PLAYER_ID: number;
  PLAYER_NAME: string;
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
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

const POSITION_COLOR: Record<string, string> = {
  G: "bg-blue-50 text-blue-700 border-blue-200",
  F: "bg-emerald-50 text-emerald-700 border-emerald-200",
  C: "bg-purple-50 text-purple-700 border-purple-200",
  GUARD: "bg-blue-50 text-blue-700 border-blue-200",
  WING: "bg-emerald-50 text-emerald-700 border-emerald-200",
  BIG: "bg-purple-50 text-purple-700 border-purple-200",
};
const posColor = (p: string | null) =>
  p ? POSITION_COLOR[p.toUpperCase()] ?? "bg-slate-50 text-slate-600 border-slate-200" : "";

/* ─────────── Sub-components ─────────── */

function StatBlock({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center rounded-2xl border px-3 py-3 text-center transition-all duration-200",
        highlight
          ? "border-[#1d428a]/20 bg-gradient-to-br from-[#1d428a]/5 to-white shadow-[0_4px_20px_rgba(29,66,138,0.10)]"
          : "border-slate-200 bg-slate-50/70",
      ].join(" ")}
    >
      <p
        className="text-2xl font-black leading-none text-slate-900"
        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{sub}</p>}
      <p className="mt-1 text-[8px] font-black uppercase tracking-[0.26em] text-slate-400">
        {label}
      </p>
    </div>
  );
}

function InfoChip({
  icon,
  label,
  value,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  className?: string;
}) {
  if (!value) return null;
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${className || "border-slate-200 bg-slate-50"}`}>
      <span className="shrink-0 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-[8px] font-black uppercase tracking-[0.24em] text-slate-400">{label}</p>
        <p className="text-[12px] font-bold text-slate-800 leading-tight truncate">{value}</p>
      </div>
    </div>
  );
}

function SeasonSelector({
  seasons,
  selected,
  onChange,
}: {
  seasons: string[];
  selected: string;
  onChange: (s: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {seasons.map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={[
            "rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] transition-all duration-200",
            selected === s
              ? "bg-[#1d428a] text-white shadow-md shadow-[#1d428a]/25"
              : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700",
          ].join(" ")}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function AveragesGrid({ avgs }: { avgs: SeasonAverages }) {
  const primary = [
    { label: "PPG", value: fmtStat(avgs.PTS), highlight: true },
    { label: "RPG", value: fmtStat(avgs.REB) },
    { label: "APG", value: fmtStat(avgs.AST) },
    { label: "SPG", value: fmtStat(avgs.STL) },
    { label: "BPG", value: fmtStat(avgs.BLK) },
    { label: "TPG", value: fmtStat(avgs.TOV) },
    { label: "MIN", value: fmtStat(avgs.MIN) },
    { label: "+/-", value: fmtStat(avgs.PLUS_MINUS) },
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
    { label: "OREB", value: fmtStat(avgs.OREB) },
    { label: "DREB", value: fmtStat(avgs.DREB) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">
          Per-Game Averages
        </p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">
          {avgs.games_played} GP
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {primary.map((item) => (
          <StatBlock key={item.label} {...item} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {shooting.map((item) => (
          <StatBlock key={item.label} {...item} />
        ))}
      </div>
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
        // In descending order, g is the newer game (new team), nextGame is the older game (old team).
        // So the trade went from nextGame.TEAM_ABBREVIATION to g.TEAM_ABBREVIATION.
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

  const wlColor = (wl: string | null) => {
    if (wl === "W") return "text-emerald-600 font-black";
    if (wl === "L") return "text-rose-500 font-black";
    return "text-slate-400";
  };

  const pmColor = (pm: number | null | undefined) => {
    if (pm == null) return "text-slate-400";
    if (pm > 0) return "text-emerald-600 font-bold";
    if (pm < 0) return "text-rose-500 font-bold";
    return "text-slate-500";
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50/80">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-slate-50 px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.24em] text-slate-500 min-w-[120px]">Date</th>
              <th className="px-2 py-3 text-left text-[9px] font-black uppercase tracking-[0.24em] text-slate-500 min-w-[130px]">Matchup</th>
              <th className="px-2 py-3 text-center text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">W/L</th>
              <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">Score</th>
              <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">MIN</th>
              <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">PTS</th>
              <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">REB</th>
              <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">AST</th>
              <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">STL</th>
              <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">BLK</th>
              <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">TOV</th>
              <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">FG%</th>
              <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">3P%</th>
              <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">FT%</th>
              <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">+/-</th>
              <th className="px-2 py-3 text-center text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">Type</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item, idx) => {
              if (item.type === "trade") {
                return (
                  <tr key={`trade-${idx}`} className="bg-amber-50/40 border-t border-b border-amber-100/80">
                    <td colSpan={16} className="px-3 py-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 bg-amber-500/10 text-amber-700 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest">
                            <ArrowRightLeft size={10} className="animate-pulse" />
                            Trade Transaction
                          </div>
                          <div className="flex items-center gap-2 font-bold text-slate-800 text-[11px]">
                            <TeamLogo abbr={item.from} name="" size={18} />
                            <span className="text-slate-400 font-semibold">{item.from}</span>
                            <ArrowRightLeft size={12} className="text-amber-400 mx-1 animate-pulse" />
                            <TeamLogo abbr={item.to} name="" size={18} />
                            <span className="text-[#1d428a] font-bold">{item.to}</span>
                          </div>
                        </div>
                        <p className="text-[10px] font-semibold text-slate-400">
                          Stint Transition: {fmtDate(item.dateBefore)} ➔ {fmtDate(item.dateAfter)}
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
                  className={[
                    "border-t border-slate-100 transition-colors",
                    isDnp ? "bg-amber-50/60 hover:bg-amber-50" : "bg-white hover:bg-slate-50",
                    clickable ? "cursor-pointer hover:bg-[#1d428a]/5 group" : "",
                  ].join(" ")}
                >
                  <td className="sticky left-0 bg-inherit px-3 py-2.5">
                    <p className="text-[11px] font-semibold text-slate-700">{fmtDate(g.GAME_DATE)}</p>
                    {clickable && (
                      <p className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-[#1d428a] opacity-0 group-hover:opacity-100 transition-opacity">
                        View box score
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {g.HOME_TEAM_ABBREVIATION && (
                        <TeamLogo
                          abbr={g.MATCHUP?.includes("vs.") ? g.AWAY_TEAM_ABBREVIATION ?? "" : g.HOME_TEAM_ABBREVIATION ?? ""}
                          name=""
                          size={16}
                        />
                      )}
                      <span className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                        {g.MATCHUP ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    {isDnp ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-amber-700">DNP</span>
                    ) : (
                      <span className={wlColor(g.WL)}>{g.WL ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    {isDnp ? (
                      <span className="text-[10px] font-medium text-amber-600">Sakat / Oynamadı</span>
                    ) : (
                      <span className="text-[11px] font-semibold text-slate-600 tabular-nums">{score}</span>
                    )}
                  </td>
                  {isDnp ? (
                    <>
                      {Array.from({ length: 11 }).map((_, i) => (
                        <td key={i} className="px-2 py-2.5 text-right text-slate-300">—</td>
                      ))}
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-2.5 text-right font-medium text-slate-500 tabular-nums">{g.MIN != null ? Math.round(g.MIN) : "—"}</td>
                      <td className="px-2 py-2.5 text-right font-black text-slate-900 tabular-nums">{g.PTS ?? "—"}</td>
                      <td className="px-2 py-2.5 text-right font-medium text-slate-600 tabular-nums">{g.REB ?? "—"}</td>
                      <td className="px-2 py-2.5 text-right font-medium text-slate-600 tabular-nums">{g.AST ?? "—"}</td>
                      <td className="px-2 py-2.5 text-right font-medium text-slate-600 tabular-nums">{g.STL ?? "—"}</td>
                      <td className="px-2 py-2.5 text-right font-medium text-slate-600 tabular-nums">{g.BLK ?? "—"}</td>
                      <td className="px-2 py-2.5 text-right font-medium text-slate-600 tabular-nums">{g.TOV ?? "—"}</td>
                      <td className="px-2 py-2.5 text-right font-medium text-slate-500 tabular-nums">{fmtPct(g.FG_PCT)}</td>
                      <td className="px-2 py-2.5 text-right font-medium text-slate-500 tabular-nums">{fmtPct(g.FG3_PCT)}</td>
                      <td className="px-2 py-2.5 text-right font-medium text-slate-500 tabular-nums">{fmtPct(g.FT_PCT)}</td>
                      <td className={`px-2 py-2.5 text-right tabular-nums ${pmColor(g.PLUS_MINUS)}`}>
                        {g.PLUS_MINUS != null ? `${g.PLUS_MINUS > 0 ? "+" : ""}${g.PLUS_MINUS}` : "—"}
                      </td>
                    </>
                  )}
                  <td className="px-2 py-2.5 text-center">
                    <span className={[
                      "rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-widest",
                      g.IS_PLAYOFF ? "bg-[#1d428a]/10 text-[#1d428a]" : "bg-slate-100 text-slate-400",
                    ].join(" ")}>
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
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-slate-400">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, games.length)} of {games.length} games
          </p>
          <div className="flex gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all"
            >
              Prev
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
              return (
                <button
                  key={pg}
                  onClick={() => setPage(pg)}
                  className={[
                    "rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all",
                    pg === page
                      ? "bg-[#1d428a] text-white"
                      : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {pg + 1}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-all"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────── Featured player card ─────────── */
function FeaturedCard({
  profile,
  label,
  avgs,
  onClick,
}: {
  profile: PlayerProfile;
  label: string;
  avgs: SeasonAverages | null;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-[0_4px_20px_rgba(15,23,42,0.05)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(15,23,42,0.12)] hover:border-[#1d428a]/30"
    >
      <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, #1d428a, #c9082a)" }} />
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <PlayerPhoto playerId={profile.PLAYER_ID} name={profile.PLAYER_NAME ?? ""} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-black text-slate-900 leading-tight">
              {profile.PLAYER_NAME}
            </p>
            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
              {profile.OFFICIAL_POSITION && (
                <span className={`rounded-full border px-1.5 py-0.5 text-[7px] font-black uppercase tracking-widest ${posColor(profile.OFFICIAL_POSITION)}`}>
                  {profile.OFFICIAL_POSITION}
                </span>
              )}
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-widest text-slate-500">
                {label}
              </span>
            </div>
          </div>
        </div>

        {avgs ? (
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { v: avgs.PTS, lbl: "PPG" },
              { v: avgs.REB, lbl: "RPG" },
              { v: avgs.AST, lbl: "APG" },
            ].map(({ v, lbl }) => (
              <div key={lbl} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 text-center">
                <p className="text-sm font-black leading-none text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {v != null ? v.toFixed(1) : "—"}
                </p>
                <p className="mt-0.5 text-[7px] font-black uppercase tracking-widest text-slate-400">{lbl}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-slate-400">No recent data</p>
        )}
      </div>
    </button>
  );
}

/* ─────────── Discovery / suggestion grid ─────────── */
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
  const latestSeason = seasons[seasons.length - 1] || "2025-26";
  const otherSeasons = seasons.filter((s) => s !== latestSeason);

  const getBestAvgs = (pid: number, preferSeason?: string): { avgs: SeasonAverages; season: string } | null => {
    const pidStr = String(pid);
    const pAvgs = averagesData[pidStr];
    if (!pAvgs) return null;
    const ordered = preferSeason
      ? [preferSeason, ...seasons.filter((s) => s !== preferSeason).reverse()]
      : [...seasons].reverse();
    for (const s of ordered) {
      if (pAvgs[s] && pAvgs[s].games_played >= 15) return { avgs: pAvgs[s], season: s };
    }
    return null;
  };

  // Top scorers in latestSeason
  const topScorers = useMemo(() =>
    profiles
      .map((p) => ({ p, res: getBestAvgs(p.PLAYER_ID, latestSeason) }))
      .filter((x) => x.res?.season === latestSeason && (x.res.avgs.PTS ?? 0) > 0)
      .sort((a, b) => (b.res!.avgs.PTS ?? 0) - (a.res!.avgs.PTS ?? 0))
      .slice(0, 5)
      .map(({ p, res }) => ({ p, avgs: res!.avgs, label: "Scorer" })),
  [profiles, averagesData, seasons, latestSeason]);

  // Top playmakers latestSeason
  const topPlaymakers = useMemo(() =>
    profiles
      .map((p) => ({ p, res: getBestAvgs(p.PLAYER_ID, latestSeason) }))
      .filter((x) => x.res?.season === latestSeason && (x.res.avgs.AST ?? 0) > 0)
      .sort((a, b) => (b.res!.avgs.AST ?? 0) - (a.res!.avgs.AST ?? 0))
      .slice(0, 4)
      .map(({ p, res }) => ({ p, avgs: res!.avgs, label: "Playmaker" })),
  [profiles, averagesData, seasons, latestSeason]);

  // Top rebounders latestSeason
  const topRebounders = useMemo(() =>
    profiles
      .map((p) => ({ p, res: getBestAvgs(p.PLAYER_ID, latestSeason) }))
      .filter((x) => x.res?.season === latestSeason && (x.res.avgs.REB ?? 0) > 0)
      .sort((a, b) => (b.res!.avgs.REB ?? 0) - (a.res!.avgs.REB ?? 0))
      .slice(0, 4)
      .map(({ p, res }) => ({ p, avgs: res!.avgs, label: "Rebounder" })),
  [profiles, averagesData, seasons, latestSeason]);

  // Legacy — players NOT in latestSeason
  const legacyPlayers = useMemo(() => {
    return profiles
      .filter((p) => {
        const pAvgs = averagesData[String(p.PLAYER_ID)];
        if (!pAvgs) return false;
        const inCurrent = pAvgs[latestSeason] && pAvgs[latestSeason].games_played > 5;
        if (inCurrent) return false;
        return otherSeasons.some(
          (s) => pAvgs[s] && pAvgs[s].games_played >= 20
        );
      })
      .map((p) => {
        const res = getBestAvgs(p.PLAYER_ID);
        return { p, avgs: res?.avgs ?? null, label: "Legacy" };
      })
      .filter((x) => x.avgs != null)
      .sort((a, b) => (b.avgs?.PTS ?? 0) - (a.avgs?.PTS ?? 0))
      .slice(0, 5);
  }, [profiles, averagesData, seasons, latestSeason, otherSeasons]);

  const renderSection = (
    title: string,
    subtitle: string,
    items: Array<{ p: PlayerProfile; avgs: SeasonAverages | null; label: string }>
  ) => {
    if (items.length === 0) return null;
    return (
      <div>
        <div className="mb-3 flex items-baseline gap-2">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">{title}</p>
          <p className="text-[10px] text-slate-400">{subtitle}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map(({ p, avgs, label }) => (
            <FeaturedCard
              key={p.PLAYER_ID}
              profile={p}
              label={label}
              avgs={avgs}
              onClick={() => onSelect(p)}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {renderSection("Top Scorers", "2025–26 · PPG leaders", topScorers)}
      {renderSection("Playmakers", "2025–26 · APG leaders", topPlaymakers)}
      {renderSection("Glass Eaters", "2025–26 · RPG leaders", topRebounders)}
      {renderSection("In the Archives", "Players from 2018–25 seasons · no longer active", legacyPlayers)}
    </div>
  );
}

function calculateAveragesFromGames(seasonGames: GameRow[]): SeasonAverages {

  const activeGames = seasonGames.filter(g => !g.DID_NOT_PLAY);
  const gp = activeGames.length;
  
  if (gp === 0) {
    return {
      games_played: 0,
      games_total: seasonGames.length,
      teams: [],
      MIN: null, PTS: null, REB: null, AST: null, STL: null, BLK: null, TOV: null,
      FGM: null, FGA: null, FG_PCT: null, FG3M: null, FG3A: null, FG3_PCT: null,
      FTM: null, FTA: null, FT_PCT: null, OREB: null, DREB: null, PLUS_MINUS: null
    };
  }

  const sum = (key: keyof GameRow) => {
    let s = 0;
    let count = 0;
    for (const g of activeGames) {
      const val = g[key];
      if (typeof val === 'number') {
        s += val;
        count++;
      }
    }
    return count > 0 ? s : null;
  };

  const avg = (key: keyof GameRow) => {
    const s = sum(key);
    return s !== null ? s / gp : null;
  };

  const uniqueTeams = new Set<string>();
  for (const g of seasonGames) {
    if (g.TEAM_ABBREVIATION) uniqueTeams.add(g.TEAM_ABBREVIATION);
  }

  const fgmSum = sum("FGM");
  const fgaSum = sum("FGA");
  const fgPct = (fgmSum !== null && fgaSum !== null && fgaSum > 0) ? fgmSum / fgaSum : null;

  const fg3mSum = sum("FG3M");
  const fg3aSum = sum("FG3A");
  const fg3Pct = (fg3mSum !== null && fg3aSum !== null && fg3aSum > 0) ? fg3mSum / fg3aSum : null;

  const ftmSum = sum("FTM");
  const ftaSum = sum("FTA");
  const ftPct = (ftmSum !== null && ftaSum !== null && ftaSum > 0) ? ftmSum / ftaSum : null;

  return {
    games_played: gp,
    games_total: seasonGames.length,
    teams: Array.from(uniqueTeams),
    MIN: avg("MIN"),
    PTS: avg("PTS"),
    REB: avg("REB"),
    AST: avg("AST"),
    STL: avg("STL"),
    BLK: avg("BLK"),
    TOV: avg("TOV"),
    FGM: avg("FGM"),
    FGA: avg("FGA"),
    FG_PCT: fgPct,
    FG3M: avg("FG3M"),
    FG3A: avg("FG3A"),
    FG3_PCT: fg3Pct,
    FTM: avg("FTM"),
    FTA: avg("FTA"),
    FT_PCT: ftPct,
    OREB: null,
    DREB: null,
    PLUS_MINUS: avg("PLUS_MINUS"),
    confidence_warning: "estimated client-side"
  } as any;
}

/* ─────────── Main Component ─────────── */
export default function PlayerPage() {
  const [seasonsList, setSeasonsList] = useState<string[]>(["2022-23", "2023-24", "2024-25", "2025-26"]);
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [gamesData, setGamesData] = useState<Record<string, Record<string, GameRow[]>>>({});
  const [averagesData, setAveragesData] = useState<Record<string, Record<string, SeasonAverages>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerProfile | null>(null);
  const [selectedSeason, setSelectedSeason] = useState("2025-26");
  const [selectedGame, setSelectedGame] = useState<GameRow | null>(null);
  const [opponentSearch, setOpponentSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        loadJson<string[]>("/data/seasons.json", [])
          .then((data) => {
            if (Array.isArray(data) && data.length > 0) {
              const asc = [...data].sort((a, b) => a.localeCompare(b));
              setSeasonsList(asc);
            }
          })
          .catch(() => {});

        const [prof, avgs] = await Promise.all([
          loadJson<PlayerProfile[]>("/data/player_profiles.json"),
          loadJson<Record<string, Record<string, SeasonAverages>>>("/data/player_season_averages.json"),
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

  // Auto-select best available season
  useEffect(() => {
    if (!selectedPlayer) return;
    const pid = String(selectedPlayer.PLAYER_ID);
    const playerGames = gamesData[pid] ?? {};
    const available = seasonsList.filter((s) => playerGames[s]?.length > 0);
    if (available.length > 0 && !available.includes(selectedSeason)) {
      setSelectedSeason(available[available.length - 1]);
    }
    // Clear states when player changes
    setSelectedGame(null);
    setOpponentSearch("");
  }, [selectedPlayer, gamesData]);

  // Clear selected game and opponent search when season changes
  useEffect(() => {
    setSelectedGame(null);
    setOpponentSearch("");
  }, [selectedSeason]);

  const handleSelectPlayer = (p: PlayerProfile) => {
    setSelectedPlayer(p);
    setSearch(p.PLAYER_NAME ?? "");
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
      .catch(() => {
        loadJson<Record<string, GameRow[]>>(`/data/player_games/${encodeURIComponent(playerId)}.json`, {})
          .then((games) => {
            setGamesData((prev) => ({ ...prev, [playerId]: games }));
            
            const calculatedAverages: Record<string, SeasonAverages> = {};
            for (const s of Object.keys(games)) {
              calculatedAverages[s] = calculateAveragesFromGames(games[s]);
            }
            setAveragesData((prev) => ({ ...prev, [playerId]: calculatedAverages }));
          })
          .catch((e) => setError(e.message));
      });
  };

  const pid = selectedPlayer ? String(selectedPlayer.PLAYER_ID) : null;
  const playerGames = pid ? (gamesData[pid] ?? {}) : {};
  const playerAvgs = pid ? (averagesData[pid] ?? {}) : {};
  const availableSeasons = seasonsList.filter((s) => playerGames[s]?.length > 0);
  const currentAvgs = playerAvgs[selectedSeason] ?? null;

  const currentGames = useMemo(() => {
    const games = playerGames[selectedSeason] ?? [];
    // Sort descending by date (latest/newest game first)
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
    if (!p.DRAFT_YEAR) return "Undrafted";
    const round = p.DRAFT_ROUND ? `Round ${p.DRAFT_ROUND}` : "";
    const pick = p.DRAFT_NUMBER ? `Pick ${p.DRAFT_NUMBER}` : "";
    return [p.DRAFT_YEAR, round, pick].filter(Boolean).join(" · ");
  };

  if (loading) {
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#1d428a] border-t-transparent" />
        <p className="text-[10px] font-black uppercase tracking-[0.32em] text-slate-400">
          Loading player data...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-4 rounded-[2rem] border border-rose-200 bg-white p-8 text-center shadow-lg">
        <div className="rounded-2xl bg-rose-50 p-4 text-rose-600">
          <AlertCircle size={28} />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-900">Data not found</h2>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
        </div>
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[11px] text-slate-500">
          python3 scripts/export_player_profiles.py
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in-up">

      {/* ── Search bar ── */}
      <div className="rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.07)]">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Player Search</p>
          <p className="text-[10px] text-slate-400">{profiles.length} players · 2018–26</p>
        </div>
        <div className="relative">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search any player from 2018–19 onwards (inc. retired)..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1d428a]/30 transition-all"
            />
            <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>

          {showDropdown && filteredProfiles.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.12)]">
              {filteredProfiles.map((p) => (
                <button
                  key={p.PLAYER_ID}
                  onClick={() => handleSelectPlayer(p)}
                  className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors hover:bg-slate-50 last:border-b-0"
                >
                  <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME ?? ""} size={32} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-slate-800">{p.PLAYER_NAME}</p>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                      {[
                        p.OFFICIAL_POSITION,
                        p.FROM_YEAR && p.TO_YEAR && `${p.FROM_YEAR}–${p.TO_YEAR}`,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedPlayer && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
            <User size={11} className="shrink-0" />
            <span>Viewing: <span className="font-bold text-slate-800">{selectedPlayer.PLAYER_NAME}</span></span>
          </div>
        )}
      </div>

      {/* ── Player Profile (when selected) ── */}
      {selectedPlayer && (
        <div className="space-y-5 animate-fade-in">

          {/* Hero Card */}
          <div className="rounded-[1.75rem] border border-slate-100 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)] overflow-hidden">
            <div className="h-2 w-full" style={{ background: "linear-gradient(90deg, #1d428a, #c9082a)" }} />
            <div className="p-6">
              <div className="flex flex-col gap-6 md:flex-row md:items-start">
                <div className="flex flex-col items-center gap-3 md:items-start">
                  <div className="relative">
                    <PlayerPhoto
                      playerId={selectedPlayer.PLAYER_ID}
                      name={selectedPlayer.PLAYER_NAME ?? ""}
                      size={120}
                      className="ring-4 ring-slate-100 shadow-xl"
                    />
                    {selectedPlayer.OFFICIAL_POSITION && (
                      <span className={`absolute -bottom-1 -right-1 rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.22em] shadow-sm ${posColor(selectedPlayer.OFFICIAL_POSITION)}`}>
                        {selectedPlayer.OFFICIAL_POSITION}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-1 space-y-4">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.32em] text-slate-400">NBA Player Profile</p>
                    <h2 className="mt-0.5 text-3xl font-black leading-tight text-slate-900 md:text-4xl" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                      {selectedPlayer.PLAYER_NAME}
                    </h2>
                    {selectedPlayer.POSITION_GROUP && (
                      <span className={`mt-1 inline-block rounded-full border px-3 py-0.5 text-[10px] font-black uppercase tracking-[0.22em] ${posColor(selectedPlayer.POSITION_GROUP)}`}>
                        {selectedPlayer.POSITION_GROUP}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {currentAvgs?.teams && currentAvgs.teams.length > 1 && (
                      <InfoChip
                        icon={<ArrowRightLeft size={12} className="text-amber-500 animate-pulse" />}
                        label="Teams (Traded)"
                        value={currentAvgs.teams.join(" ➔ ")}
                        className="bg-amber-50/50 border-amber-200/80"
                      />
                    )}
                    {currentAvgs?.teams && currentAvgs.teams.length === 1 && (
                      <InfoChip
                        icon={<Users2 size={12} className="text-[#1d428a]" />}
                        label="Current Team"
                        value={currentAvgs.teams[0]}
                      />
                    )}
                    <InfoChip icon={<Ruler size={12} />} label="Height" value={selectedPlayer.HEIGHT} />
                    <InfoChip icon={<Weight size={12} />} label="Weight" value={selectedPlayer.WEIGHT ? `${selectedPlayer.WEIGHT} lbs` : null} />
                    <InfoChip icon={<Globe size={12} />} label="Country" value={selectedPlayer.COUNTRY} />
                    <InfoChip icon={<GraduationCap size={12} />} label="College" value={selectedPlayer.COLLEGE} />
                    <InfoChip icon={<Trophy size={12} />} label="Draft" value={draftStr(selectedPlayer)} />
                    <InfoChip
                      icon={<Calendar size={12} />}
                      label="NBA Seasons"
                      value={selectedPlayer.FROM_YEAR && selectedPlayer.TO_YEAR ? `${selectedPlayer.FROM_YEAR} – ${selectedPlayer.TO_YEAR}` : null}
                    />
                    <InfoChip icon={<MapPin size={12} />} label="Position" value={selectedPlayer.OFFICIAL_POSITION} />
                    {availableSeasons.length > 0 && (
                      <InfoChip icon={<Hash size={12} />} label="Seasons in DB" value={`${availableSeasons.length} season${availableSeasons.length > 1 ? "s" : ""}`} />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {availableSeasons.length === 0 ? (
            <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-6 text-center">
              <AlertCircle size={24} className="mx-auto mb-2 text-amber-500" />
              <p className="text-sm font-semibold text-amber-700">No game data found for this player in the database.</p>
            </div>
          ) : (
            <>
              {/* Season selector */}
              <div className="rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Season</p>
                    <p className="mt-0.5 text-sm font-bold text-slate-700">{selectedSeason}</p>
                  </div>
                  <SeasonSelector seasons={availableSeasons} selected={selectedSeason} onChange={setSelectedSeason} />
                </div>
              </div>

              {/* Season Averages */}
              {currentAvgs && (
                <div className="rounded-[1.75rem] border border-slate-100 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
                  <div className="mb-4 flex items-center gap-2">
                    <TrendingUp size={16} className="text-[#1d428a]" />
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">
                      {selectedSeason} Season Averages
                    </p>
                    {(currentAvgs as any).confidence_warning && (
                      <span className="rounded-full bg-amber-50 text-amber-700 border border-amber-200/80 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest animate-pulse">
                        Tahmini Ortalama
                      </span>
                    )}
                    <span className="ml-auto rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[9px] font-bold text-slate-500">
                      {currentAvgs.games_played} played / {currentAvgs.games_total} total
                    </span>
                  </div>
                  <AveragesGrid avgs={currentAvgs} />
                </div>
              )}

              {/* Game Log */}
              <div className="rounded-[1.75rem] border border-slate-100 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-[#1d428a]" />
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">
                      {selectedSeason} Game Log
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 ml-auto">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold text-slate-500">{currentGames.length} games</span>
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-bold text-amber-700">
                      {currentGames.filter((g) => g.DID_NOT_PLAY).length} DNP
                    </span>
                    <span className="rounded-full bg-[#1d428a]/10 px-2.5 py-1 text-[9px] font-bold text-[#1d428a]">
                      {currentGames.filter((g) => g.IS_PLAYOFF).length} playoff
                    </span>
                  </div>
                </div>
                {!selectedGame && (playerGames[selectedSeason] ?? []).length > 0 && (
                  <div className="mb-4 relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Search size={13} className="text-slate-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="Search opponent team name or abbreviation (e.g. Boston, LAL, Nuggets)..."
                      value={opponentSearch}
                      onChange={(e) => setOpponentSearch(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200/80 bg-slate-50/50 py-2 pl-8 pr-4 text-xs font-semibold text-slate-700 outline-none ring-offset-2 transition-all placeholder:text-slate-400 focus:border-[#1d428a] focus:bg-white focus:ring-2 focus:ring-[#1d428a]/10 animate-fade-in"
                    />
                  </div>
                )}

                <div className="mb-3 flex items-center gap-3 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-amber-100 border border-amber-200" />
                    DNP = Sakat / Oynamadı
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="rounded-full bg-[#1d428a]/10 px-1.5 py-0.5 text-[8px] font-black text-[#1d428a]">PO</span>
                    Playoff
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-black text-slate-400">RS</span>
                    Regular Season
                  </span>
                </div>
                {selectedGame ? (
                  <GameDetailPanel
                    game={selectedGame}
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
                    <div className="py-12 text-center animate-fade-in">
                      <p className="text-xs font-semibold text-slate-400">No games matching "{opponentSearch}" found.</p>
                      <button
                        onClick={() => setOpponentSearch("")}
                        className="mt-3 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition shadow-sm"
                      >
                        Clear Search
                      </button>
                    </div>
                  )
                ) : (
                  <div className="py-12 text-center text-xs font-semibold text-slate-400">No games found for {selectedSeason}.</div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Discovery grid (shown when no player selected) ── */}
      {!selectedPlayer && profiles.length > 0 && (
        <div className="rounded-[1.75rem] border border-slate-200/80 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.07)]">
          <div className="mb-6">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Player Discovery</p>
            <h2 className="mt-1 text-xl font-black text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Browse Players · 2018–26
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {profiles.length} players across 8 seasons — including retired &amp; traded players. Click any card or search above.
            </p>
          </div>
          <DiscoveryGrid
            profiles={profiles}
            averagesData={averagesData}
            onSelect={handleSelectPlayer}
            seasons={seasonsList}
          />
        </div>
      )}
    </div>
  );
}
