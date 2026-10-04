import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  ChevronDown,
  User,
  TrendingUp,
  Calendar,
  AlertCircle,
  Trophy,
  GraduationCap,
  Globe,
  Ruler,
  Weight,
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
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

const POSITION_COLOR: Record<string, string> = {
  G: "bg-slate-100 text-slate-600 border-slate-200",
  F: "bg-slate-100 text-slate-600 border-slate-200",
  C: "bg-slate-100 text-slate-600 border-slate-200",
  GUARD: "bg-slate-100 text-slate-600 border-slate-200",
  WING: "bg-slate-100 text-slate-600 border-slate-200",
  BIG: "bg-slate-100 text-slate-600 border-slate-200",
};
const posColor = (p: string | null) =>
  p ? POSITION_COLOR[p.toUpperCase()] ?? "bg-slate-50 text-slate-600 border-slate-200" : "";

/* ─────────── Sub-components ─────────── */

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
    <div className={`flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 ${className || "bg-slate-50"}`}>
      <span className="shrink-0 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-[8px] font-black uppercase tracking-[0.22em] text-slate-400">{label}</p>
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
    <div className="flex flex-wrap gap-4 border-b border-slate-200">
      {seasons.map((s) => {
        const isSelected = selected === s;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={[
              "border-b-2 px-1 py-2 text-[11px] font-bold uppercase tracking-[0.16em] transition-colors duration-200 cursor-pointer",
              isSelected
                ? "border-slate-800 text-slate-900 font-black"
                : "border-transparent text-slate-500 hover:text-slate-900",
            ].join(" ")}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

function AveragesGrid({ avgs }: { avgs: SeasonAverages }) {
  const headline = [
    { label: "Points", short: "PPG", value: fmtStat(avgs.PTS) },
    { label: "Rebounds", short: "RPG", value: fmtStat(avgs.REB) },
    { label: "Assists", short: "APG", value: fmtStat(avgs.AST) },
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

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {headline.map((item, index) => (
          <div key={item.short} className={`rounded-2xl border p-4 sm:p-5 ${index === 0 ? "border-slate-800 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-900"}`}>
            <div className={`text-xs font-medium ${index === 0 ? "text-slate-300" : "text-slate-500"}`}>{item.label}</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">{item.value}</span>
              <span className={`text-xs font-semibold ${index === 0 ? "text-slate-400" : "text-slate-400"}`}>{item.short}</span>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold text-slate-600">Other per-game stats</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {supporting.map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <div className="text-[10px] font-medium text-slate-500">{item.label}</div>
              <div className="mt-1 text-base font-semibold tabular-nums text-slate-900">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold text-slate-600">Shooting</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {shooting.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <div className="text-xs font-medium text-slate-500">{item.label}</div>
                {item.sub && <div className="mt-1 text-[11px] tabular-nums text-slate-400">{item.sub}</div>}
              </div>
              <div className="text-xl font-semibold tabular-nums text-slate-900">{item.value}</div>
            </div>
          ))}
        </div>
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
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
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
                            <span className="text-slate-700 font-semibold">{item.to}</span>
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
                    clickable ? "cursor-pointer hover:bg-slate-50 group" : "",
                  ].join(" ")}
                >
                  <td className="sticky left-0 bg-inherit px-3 py-2.5">
                    <p className="text-[11px] font-semibold text-slate-700">{fmtDate(g.GAME_DATE)}</p>
                    {clickable && (
                      <p className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
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
                      g.IS_PLAYOFF ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500",
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
                      ? "bg-slate-800 text-white"
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
  const teamAbbr = profile.CURRENT_TEAM || avgs?.teams?.[avgs.teams.length - 1] || null;

  return (
    <button
      onClick={onClick}
      className="group w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition-all duration-200 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
    >
      {/* Dynamic Team Accent Stripe */}
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="relative shrink-0">
            <PlayerPhoto
              playerId={profile.PLAYER_ID}
              name={profile.PLAYER_NAME ?? ""}
              size={48}
              className="rounded-full ring-2 ring-slate-100 group-hover:ring-2 transition-all"
            />
            {teamAbbr && (
              <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                <TeamLogo abbr={teamAbbr} name="" size={16} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900 leading-tight">
              {profile.PLAYER_NAME}
            </p>
            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
              {profile.OFFICIAL_POSITION && (
                <span className={`rounded-full border px-1.5 py-0.2 text-[8px] font-black uppercase tracking-wider ${posColor(profile.OFFICIAL_POSITION)}`}>
                  {profile.OFFICIAL_POSITION}
                </span>
              )}
              {teamAbbr && (
                <span
                  className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[8px] font-bold uppercase tracking-wider text-slate-600"
                >
                  {teamAbbr}
                </span>
              )}
              <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[8px] font-bold uppercase tracking-wider text-slate-500">
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
              <div
                key={lbl}
                className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 text-center"
              >
                <p className="text-sm font-semibold leading-none tabular-nums text-slate-900">
                  {v != null ? v.toFixed(1) : "—"}
                </p>
                <p className="mt-0.5 text-[7px] font-black uppercase tracking-widest text-slate-400">{lbl}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-slate-400">Veri bulunamadı</p>
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
  const latestSeason = useMemo(() =>
    [...seasons].reverse().find((season) => profiles.some((profile) =>
      (averagesData[String(profile.PLAYER_ID)]?.[season]?.games_played ?? 0) >= 15
    )) ?? seasons[seasons.length - 1] ?? "2025-26",
  [profiles, averagesData, seasons]);
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
      .slice(0, 10)
      .map(({ p, res }) => ({ p, avgs: res!.avgs, label: "Scorer" })),
  [profiles, averagesData, seasons, latestSeason]);

  return (
    <div>
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="m-0 text-base font-semibold text-slate-900">Players to explore</h2>
        <p className="text-xs text-slate-500">Top scorers · {latestSeason}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {topScorers.map(({ p, avgs, label }) => (
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
    const playerAvgs = averagesData[pid] ?? {};
    const available = seasonsList.filter((s) => (playerGames[s]?.length > 0) || (playerAvgs[s] != null) || s === "2026-27");
    if (available.length > 0 && !available.includes(selectedSeason)) {
      setSelectedSeason(available[available.length - 1]);
    }
  }, [selectedPlayer, gamesData, averagesData, seasonsList, selectedSeason]);

  const handleSelectPlayer = useCallback((p: PlayerProfile) => {
    setSelectedPlayer(p);
    setSelectedGame(null);
    setOpponentSearch("");
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
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-transparent" />
        <p className="text-[10px] font-black uppercase tracking-[0.32em] text-slate-400">
          Loading player data...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-4 rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <div className="rounded-md bg-rose-50 p-4 text-rose-600">
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
    <div className="space-y-6">

      {/* ── Search bar ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">NBA player profiles</p>
            <h1 className="mt-1 text-3xl font-semibold leading-none tracking-tight text-slate-900">Players</h1>
          </div>
          <p className="text-xs text-slate-500">{profiles.length.toLocaleString()} profiles · 2018–26</p>
        </div>
        <label htmlFor="player-profile-search" className="mb-2 block text-xs font-medium text-slate-600">Find a player</label>
        <div className="relative">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="player-profile-search"
              type="text"
              placeholder="Search by player name"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-10 text-sm font-medium text-slate-800 placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
            <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>

          {showDropdown && filteredProfiles.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
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
          {(() => {
            const primaryTeamAbbr =
              (selectedSeason === "2026-27" ? (currentAvgs?.teams?.[0] || selectedPlayer.CURRENT_TEAM) : null) ||
              currentAvgs?.teams?.[currentAvgs.teams.length - 1] ||
              selectedPlayer.CURRENT_TEAM ||
              null;
            return (
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="relative z-10 p-5 sm:p-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                    <div className="shrink-0">
                      <div className="relative">
                        <PlayerPhoto
                          playerId={selectedPlayer.PLAYER_ID}
                          name={selectedPlayer.PLAYER_NAME ?? ""}
                          size={104}
                          className="rounded-2xl ring-1 ring-slate-200"
                        />
                      </div>
                    </div>

                    <div className="flex-1 space-y-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="text-[9px] font-black uppercase tracking-[0.32em] text-slate-400">
                            NBA Player Profile
                          </p>
                          {primaryTeamAbbr && (
                            <div
                              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600"
                            >
                              <TeamLogo abbr={primaryTeamAbbr} name="" size={13} />
                              <span>{primaryTeamAbbr}</span>
                            </div>
                          )}
                        </div>

                        <h2
                          className="text-3xl font-semibold leading-tight tracking-tight text-slate-900 md:text-4xl"
                        >
                          {selectedPlayer.PLAYER_NAME}
                        </h2>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {selectedPlayer.OFFICIAL_POSITION && <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${posColor(selectedPlayer.OFFICIAL_POSITION)}`}>{selectedPlayer.OFFICIAL_POSITION}</span>}
                          {selectedPlayer.POSITION_GROUP && <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${posColor(selectedPlayer.POSITION_GROUP)}`}>{selectedPlayer.POSITION_GROUP}</span>}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                        {currentAvgs?.teams && currentAvgs.teams.length > 1 && (
                          <InfoChip
                            icon={<ArrowRightLeft size={12} />}
                            label="Takımlar (Takas)"
                            value={currentAvgs.teams.join(" ➔ ")}
                            className="bg-slate-50"
                          />
                        )}
                        {primaryTeamAbbr && (!currentAvgs?.teams || currentAvgs.teams.length <= 1) && (
                          <InfoChip
                            icon={<Users2 size={12} />}
                            label="Güncel Takım"
                            value={primaryTeamAbbr}
                          />
                        )}
                        <InfoChip icon={<Ruler size={12} />} label="Boy (Height)" value={selectedPlayer.HEIGHT} />
                        <InfoChip
                          icon={<Weight size={12} />}
                          label="Kilo (Weight)"
                          value={selectedPlayer.WEIGHT ? `${selectedPlayer.WEIGHT} lbs` : null}
                        />
                        <InfoChip icon={<Globe size={12} />} label="Ülke" value={selectedPlayer.COUNTRY} />
                        <InfoChip icon={<GraduationCap size={12} />} label="Kolej" value={selectedPlayer.COLLEGE} />
                        <InfoChip icon={<Trophy size={12} />} label="Draft" value={draftStr(selectedPlayer)} />
                        <InfoChip
                          icon={<Calendar size={12} />}
                          label="NBA Sezonları"
                          value={
                            selectedPlayer.FROM_YEAR && selectedPlayer.TO_YEAR
                              ? `${selectedPlayer.FROM_YEAR} – ${selectedPlayer.TO_YEAR}`
                              : null
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {availableSeasons.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
              <AlertCircle size={24} className="mx-auto mb-2 text-slate-400" />
              <p className="text-sm font-medium text-slate-600">No game data found for this player in the database.</p>
            </div>
          ) : (
            <>
              {/* Season selector */}
              {(() => {
                return (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Season</p>
                        <p className="mt-0.5 text-sm font-bold text-slate-700">{selectedSeason}</p>
                      </div>
                      <SeasonSelector
                        seasons={availableSeasons}
                        selected={selectedSeason}
                        onChange={setSelectedSeason}
                      />
                    </div>
                  </div>
                );
              })()}

              {/* Season Averages */}
              {currentAvgs && currentAvgs.games_total > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-5 flex items-end justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                        <TrendingUp size={17} />
                      </div>
                      <div>
                        <h2 className="m-0 text-base font-semibold text-slate-900">Season averages</h2>
                        <p className="mt-0.5 text-xs text-slate-500">{selectedSeason} · per game</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium tabular-nums text-slate-600">
                      {currentAvgs.games_played} / {currentAvgs.games_total} GP
                    </span>
                  </div>
                  <AveragesGrid avgs={currentAvgs} />
                </div>
              )}


              {/* Game Log */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-slate-500" />
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">
                      {selectedSeason} Game Log
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 ml-auto">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold text-slate-500">{currentGames.length} games</span>
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-bold text-amber-700">
                      {currentGames.filter((g) => g.DID_NOT_PLAY).length} DNP
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold text-slate-600">
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
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-4 text-xs font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200 animate-fade-in"
                    />
                  </div>
                )}

                <div className="mb-3 flex items-center gap-3 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-amber-100 border border-amber-200" />
                    DNP = Sakat / Oynamadı
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[8px] font-black text-white">PO</span>
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
                ) : selectedSeason === "2026-27" ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-10 px-4 text-center">
                    <Calendar size={28} className="mx-auto mb-2 text-slate-400" />
                    <p className="text-sm font-bold text-slate-800">2026-27 Sezonu Fikstürü Hazırlandı</p>
                    <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                      1,274 maçlık yeni sezon fikstürü sisteme yüklenmiştir. Maçlar oynandıkça maç sonuçları ve detaylı kutu istatistikleri burada otomatik olarak listelenecektir.
                    </p>
                  </div>
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
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
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
