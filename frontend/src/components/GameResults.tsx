import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Users2,
} from "lucide-react";
import TeamLogo from "./TeamLogo";
import PlayerPhoto from "./PlayerPhoto";
import type { GameDetail, GameFeedRow } from "../types/gameFeed";

interface TeamBoxScore {
  GAME_ID: string;
  TEAM_ABBREVIATION: string;
  TEAM_NAME: string | null;
  MATCHUP: string | null;
  WL: string | null;
  PTS: number | null;
  FGM?: number | null;
  FGA?: number | null;
  FG_PCT: number | null;
  FG3M?: number | null;
  FG3A?: number | null;
  FG3_PCT: number | null;
  FTM?: number | null;
  FTA?: number | null;
  FT_PCT: number | null;
  REB: number | null;
  AST: number | null;
  TOV: number | null;
  PLUS_MINUS: number | null;
}

interface PlayerBoxScore {
  GAME_ID: string;
  TEAM_ABBREVIATION: string;
  PLAYER_ID: number;
  PLAYER_NAME: string;
  MIN: number | null;
  PTS: number | null;
  FGM?: number | null;
  FGA?: number | null;
  FG_PCT: number | null;
  FG3M?: number | null;
  FG3A?: number | null;
  FG3_PCT: number | null;
  FTM?: number | null;
  FTA?: number | null;
  FT_PCT: number | null;
  REB: number | null;
  AST: number | null;
  STL: number | null;
  BLK: number | null;
  TOV: number | null;
  PLUS_MINUS: number | null;
}

const fmtPct   = (v: number | null) => (v != null ? `${(v * 100).toFixed(1)}%` : "—");
const fmtInt   = (v: number | null) => (v != null ? Math.round(v).toString() : "—");
const fmtPair  = (made: number | null | undefined, att: number | null | undefined) =>
  made != null || att != null ? `${fmtInt(made ?? null)} / ${fmtInt(att ?? null)}` : "—";
const fmtDate  = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

const playerTeamFilter = (players: PlayerBoxScore[], abbr: string) =>
  players.filter((p) => p.TEAM_ABBREVIATION === abbr);

// Full team name lookup (fallback to abbreviation)
const TEAM_FULL: Record<string, string> = {
  ATL:"Hawks", BOS:"Celtics", BKN:"Nets", CHA:"Hornets", CHI:"Bulls",
  CLE:"Cavaliers", DAL:"Mavericks", DEN:"Nuggets", DET:"Pistons", GSW:"Warriors",
  HOU:"Rockets", IND:"Pacers", LAC:"Clippers", LAL:"Lakers", MEM:"Grizzlies",
  MIA:"Heat", MIL:"Bucks", MIN:"Timberwolves", NOP:"Pelicans", NYK:"Knicks",
  OKC:"Thunder", ORL:"Magic", PHI:"76ers", PHX:"Suns", POR:"Trail Blazers",
  SAC:"Kings", SAS:"Spurs", TOR:"Raptors", UTA:"Jazz", WAS:"Wizards",
};
const TEAM_CITY: Record<string, string> = {
  ATL:"Atlanta", BOS:"Boston", BKN:"Brooklyn", CHA:"Charlotte", CHI:"Chicago",
  CLE:"Cleveland", DAL:"Dallas", DEN:"Denver", DET:"Detroit", GSW:"Golden State",
  HOU:"Houston", IND:"Indiana", LAC:"LA", LAL:"Los Angeles", MEM:"Memphis",
  MIA:"Miami", MIL:"Milwaukee", MIN:"Minnesota", NOP:"New Orleans", NYK:"New York",
  OKC:"Oklahoma City", ORL:"Orlando", PHI:"Philadelphia", PHX:"Phoenix", POR:"Portland",
  SAC:"Sacramento", SAS:"San Antonio", TOR:"Toronto", UTA:"Utah", WAS:"Washington",
};
const teamFull = (abbr: string, fallback?: string | null) =>
  TEAM_FULL[abbr] ?? fallback ?? abbr;
const teamCity = (abbr: string) => TEAM_CITY[abbr] ?? abbr;

/* ── small helpers ── */

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-full px-5 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-all duration-200",
        active
          ? "bg-[#1d428a] text-white shadow-md shadow-[#1d428a]/20"
          : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">{title}</p>
      {subtitle && <p className="text-sm font-semibold text-slate-600">{subtitle}</p>}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
        {value}
      </p>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

/* ── Premium Team Comparison Bars ── */
function TeamComparisonBars({ home, away }: { home: TeamBoxScore | null; away: TeamBoxScore | null }) {
  if (!home || !away) {
    return (
      <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 text-sm text-slate-500">
        Team stats are not available for this game.
      </div>
    );
  }

  type BarRow = {
    label: string;
    hVal: number | null;
    aVal: number | null;
    higherIsBetter: boolean;
    fmt: (v: number | null) => string;
  };

  const rows: BarRow[] = [
    { label: "Points",      hVal: home.PTS,     aVal: away.PTS,     higherIsBetter: true,  fmt: fmtInt },
    { label: "FG%",         hVal: home.FG_PCT,  aVal: away.FG_PCT,  higherIsBetter: true,  fmt: fmtPct },
    { label: "3PT%",        hVal: home.FG3_PCT, aVal: away.FG3_PCT, higherIsBetter: true,  fmt: fmtPct },
    { label: "FT%",         hVal: home.FT_PCT,  aVal: away.FT_PCT,  higherIsBetter: true,  fmt: fmtPct },
    { label: "Rebounds",    hVal: home.REB,     aVal: away.REB,     higherIsBetter: true,  fmt: fmtInt },
    { label: "Assists",     hVal: home.AST,     aVal: away.AST,     higherIsBetter: true,  fmt: fmtInt },
    { label: "Turnovers",   hVal: home.TOV,     aVal: away.TOV,     higherIsBetter: false, fmt: fmtInt },
  ];

  return (
    <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Team Comparison</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-700">Side-by-side performance</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest">
          <span className="text-[#1d428a]">{home.TEAM_ABBREVIATION}</span>
          <span className="text-slate-300">vs</span>
          <span className="text-[#c9082a]">{away.TEAM_ABBREVIATION}</span>
        </div>
      </div>

      <div className="space-y-3.5">
        {rows.map((row) => {
          const hv = row.hVal ?? 0;
          const av = row.aVal ?? 0;
          const total = hv + av;
          const homePct = total > 0 ? (hv / total) * 100 : 50;
          const homeWins = row.higherIsBetter ? hv >= av : hv <= av;
          const awayWins = row.higherIsBetter ? av >= hv : av <= hv;
          const tied = hv === av;

          return (
            <div key={row.label}>
              {/* Label row */}
              <div className="mb-1.5 flex items-center justify-between">
                <span
                  className={`text-sm font-black tabular-nums ${homeWins && !tied ? "text-slate-900" : "text-slate-400"}`}
                >
                  {row.fmt(row.hVal)}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-400">
                  {row.label}
                </span>
                <span
                  className={`text-sm font-black tabular-nums ${awayWins && !tied ? "text-slate-900" : "text-slate-400"}`}
                >
                  {row.fmt(row.aVal)}
                </span>
              </div>

              {/* Bar */}
              <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
                {/* Home fill (left) */}
                <div
                  className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${homePct}%`,
                    background: homeWins && !tied ? "#1d428a" : "#cbd5e1",
                  }}
                />
                {/* Away fill (right) */}
                <div
                  className="absolute right-0 top-0 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${100 - homePct}%`,
                    background: awayWins && !tied ? "#c9082a" : "#cbd5e1",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Game Summary Block ── */
function GameSummaryBlock({
  game,
  topPlayers,
}: {
  game: GameFeedRow;
  home: TeamBoxScore | null;
  away: TeamBoxScore | null;
  topPlayers: any[];
}) {
  const margin = Math.abs((game.HOME_SCORE ?? 0) - (game.AWAY_SCORE ?? 0));
  const winnerAbbr = game.WINNER_TEAM_ABBREVIATION ?? "";
  const winnerFull = teamFull(winnerAbbr);
  const isClose = margin <= 5;

  const topScorer    = topPlayers[0];
  const topRebounder = [...topPlayers].sort((a, b) => (b.REB ?? b.reb ?? 0) - (a.REB ?? a.reb ?? 0))[0];
  const topAssist    = [...topPlayers].sort((a, b) => (b.AST ?? b.ast ?? 0) - (a.AST ?? a.ast ?? 0))[0];

  const summaryItems = [
    {
      label: isClose ? "Closest Game" : "Game Type",
      value: isClose ? `${margin}-point margin` : margin >= 20 ? "Blowout" : "Comfortable win",
      show: true,
    },
    { label: "Winner",        value: winnerFull,  show: !!winnerFull },
    {
      label: "Top Scorer",
      value: topScorer ? `${topScorer.PLAYER_NAME ?? topScorer.player_name} (${topScorer.PTS ?? topScorer.pts})` : "",
      show: !!topScorer,
    },
    {
      label: "Top Rebounder",
      value: topRebounder
        ? `${topRebounder.PLAYER_NAME ?? topRebounder.player_name} (${topRebounder.REB ?? topRebounder.reb})`
        : "",
      show: !!topRebounder,
    },
    {
      label: "Top Assists",
      value: topAssist
        ? `${topAssist.PLAYER_NAME ?? topAssist.player_name} (${topAssist.AST ?? topAssist.ast})`
        : "",
      show: !!topAssist,
    },
  ].filter((item) => item.show && item.value);

  return (
    <div className="rounded-[1.5rem] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.05)]">
      <div className="mb-4">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Game Summary</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-700">10-second read</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {summaryItems.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm"
          >
            <p className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">{item.label}</p>
            <p className="mt-1 text-[13px] font-bold leading-tight text-slate-800">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Shooting Summary ── */
function ShootingSummary({ home, away }: { home: TeamBoxScore | null; away: TeamBoxScore | null }) {
  if (!home && !away) return null;

  const hasFG  = (home?.FGM != null || home?.FGA != null) || (away?.FGM != null || away?.FGA != null);
  const has3PT = (home?.FG3M != null || home?.FG3A != null) || (away?.FG3M != null || away?.FG3A != null);
  const hasFT  = (home?.FTM != null || home?.FTA != null) || (away?.FTM != null || away?.FTA != null);

  if (!hasFG && !has3PT && !hasFT) return null;

  const rows = [
    {
      key: "fg", label: "Field Goals",
      homeVal: fmtPair(home?.FGM, home?.FGA), awayVal: fmtPair(away?.FGM, away?.FGA),
      homePct: fmtPct(home?.FG_PCT ?? null), awayPct: fmtPct(away?.FG_PCT ?? null),
      show: hasFG,
    },
    {
      key: "3pt", label: "Three Pointers",
      homeVal: fmtPair(home?.FG3M, home?.FG3A), awayVal: fmtPair(away?.FG3M, away?.FG3A),
      homePct: fmtPct(home?.FG3_PCT ?? null), awayPct: fmtPct(away?.FG3_PCT ?? null),
      show: has3PT,
    },
    {
      key: "ft", label: "Free Throws",
      homeVal: fmtPair(home?.FTM, home?.FTA), awayVal: fmtPair(away?.FTM, away?.FTA),
      homePct: fmtPct(home?.FT_PCT ?? null), awayPct: fmtPct(away?.FT_PCT ?? null),
      show: hasFT,
    },
  ].filter((r) => r.show);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Shooting</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-700">Made / Attempted · Percentage</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest">
          {home && <span className="text-[#1d428a]">{home.TEAM_ABBREVIATION}</span>}
          {away && <span className="text-[#c9082a]">{away.TEAM_ABBREVIATION}</span>}
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3 first:pt-0 last:pb-0">
            {/* Home */}
            <div className="text-left">
              <p className="text-sm font-black text-slate-900">{row.homeVal}</p>
              <p className="text-[11px] font-semibold text-[#1d428a]">{row.homePct}</p>
            </div>
            {/* Label */}
            <div className="text-center">
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">{row.label}</p>
            </div>
            {/* Away */}
            <div className="text-right">
              <p className="text-sm font-black text-slate-900">{row.awayVal}</p>
              <p className="text-[11px] font-semibold text-[#c9082a]">{row.awayPct}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Top Performer Spotlight Cards ── */
function TopPerformers({ topGame }: { topGame: any[] }) {
  if (topGame.length === 0) return null;

  const stars = topGame.slice(0, 6);

  return (
    <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
      <div className="mb-4">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Top Performers</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-700">Game stars</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stars.map((p: any, idx: number) => {
          const pts  = p.PTS  ?? p.pts  ?? null;
          const reb  = p.REB  ?? p.reb  ?? null;
          const ast  = p.AST  ?? p.ast  ?? null;
          const min  = p.MIN  ?? p.min  ?? null;
          const name = p.PLAYER_NAME ?? p.player_name ?? "—";
          const team = p.TEAM_ABBREVIATION ?? p.team_abbreviation ?? "";
          const pid  = p.PLAYER_ID ?? p.player_id ?? 0;
          const isTopScorer = idx === 0;

          return (
            <div
              key={`${pid}-${team}-${idx}`}
              className={[
                "relative overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5",
                isTopScorer
                  ? "border-[#1d428a]/20 bg-gradient-to-br from-[#1d428a]/5 to-white shadow-[0_8px_30px_rgba(29,66,138,0.10)]"
                  : "border-slate-200 bg-slate-50/70 shadow-sm hover:shadow-md",
              ].join(" ")}
            >
              {isTopScorer && (
                <div className="absolute right-3 top-3">
                  <span className="rounded-full bg-[#1d428a] px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white">
                    Top Scorer
                  </span>
                </div>
              )}
              {/* Player identity */}
              <div className="flex items-center gap-3 mb-3">
                <PlayerPhoto playerId={pid} name={name} size={40} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold leading-tight text-slate-900">{name}</p>
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">{team}</p>
                </div>
              </div>
              {/* Stat line */}
              <div className="grid grid-cols-3 gap-1.5">
                <div className="rounded-lg bg-white border border-slate-200 px-2 py-1.5 text-center shadow-sm">
                  <p className="text-base font-black leading-none text-slate-900">{pts ?? "—"}</p>
                  <p className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-slate-400">PTS</p>
                </div>
                <div className="rounded-lg bg-white border border-slate-200 px-2 py-1.5 text-center shadow-sm">
                  <p className="text-base font-black leading-none text-slate-900">{reb != null ? Math.round(reb) : "—"}</p>
                  <p className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-slate-400">REB</p>
                </div>
                <div className="rounded-lg bg-white border border-slate-200 px-2 py-1.5 text-center shadow-sm">
                  <p className="text-base font-black leading-none text-slate-900">{ast != null ? Math.round(ast) : "—"}</p>
                  <p className="mt-0.5 text-[8px] font-black uppercase tracking-widests text-slate-400">AST</p>
                </div>
              </div>
              {/* Minutes */}
              {min != null && (
                <p className="mt-2 text-right text-[9px] font-semibold text-slate-400">
                  {Math.round(min)} MIN
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Game Leaders (compact) ── */
function GameLeaders({ leaders }: { leaders: { points?: any; rebounds?: any; assists?: any } | null | undefined }) {
  if (!leaders) return null;

  const items = [
    { label: "Points",   data: leaders.points   },
    { label: "Rebounds", data: leaders.rebounds },
    { label: "Assists",  data: leaders.assists  },
  ].filter((item) => item.data && (item.data.player_name || item.data.n));

  if (items.length === 0) return null;

  return (
    <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
      <div className="mb-4">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Game Leaders</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-700">Category leaders</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {items.map((entry) => (
          <div key={entry.label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">{entry.label}</p>
            <p className="mt-1.5 text-[13px] font-bold leading-tight text-slate-900">
              {entry.data.player_name || entry.data.n}
            </p>
            {entry.data.value != null && (
              <p className="mt-0.5 text-xl font-black text-[#1d428a]">{entry.data.value}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Quarter Scores Strip ── */
function QuarterScores({
  homeAbbr,
  awayAbbr,
  homeQS,
  awayQS,
}: {
  homeAbbr: string;
  awayAbbr: string;
  homeQS: number[] | null | undefined;
  awayQS: number[] | null | undefined;
}) {
  if (!Array.isArray(homeQS) || !Array.isArray(awayQS) || (homeQS.length === 0 && awayQS.length === 0)) return null;

  const quarters = Math.max(homeQS.length, awayQS.length);
  const cols = Array.from({ length: quarters }, (_, i) => i);

  return (
    <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
      <div className="mb-4">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Quarter Scores</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="pb-2 text-left text-[9px] font-black uppercase tracking-[0.24em] text-slate-400 w-16">Team</th>
              {cols.map((i) => (
                <th key={i} className="pb-2 text-center text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">
                  Q{i + 1}
                </th>
              ))}
              <th className="pb-2 text-center text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="py-2 text-left text-[10px] font-black text-[#1d428a]">{homeAbbr}</td>
              {cols.map((i) => (
                <td key={i} className="py-2 text-center font-semibold text-slate-700">{homeQS[i] ?? "—"}</td>
              ))}
              <td className="py-2 text-center font-black text-slate-900">{homeQS.reduce((a, b) => a + b, 0)}</td>
            </tr>
            <tr>
              <td className="py-2 text-left text-[10px] font-black text-[#c9082a]">{awayAbbr}</td>
              {cols.map((i) => (
                <td key={i} className="py-2 text-center font-semibold text-slate-700">{awayQS[i] ?? "—"}</td>
              ))}
              <td className="py-2 text-center font-black text-slate-900">{awayQS.reduce((a, b) => a + b, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Game Detail View ── */
function GameCardDetail({
  game, gameDetail, homeBS, awayBS, homePlayers, awayPlayers,
}: {
  game: GameFeedRow;
  gameDetail: GameDetail | null;
  homeBS: TeamBoxScore | null;
  awayBS: TeamBoxScore | null;
  homePlayers: PlayerBoxScore[];
  awayPlayers: PlayerBoxScore[];
}) {
  const [activeTab, setActiveTab] = useState<"game" | "home" | "away">("game");
  const margin   = Math.abs((game.HOME_SCORE ?? 0) - (game.AWAY_SCORE ?? 0));
  const topHome  = [...homePlayers].sort((a, b) => (b.PTS ?? 0) - (a.PTS ?? 0) || (b.MIN ?? 0) - (a.MIN ?? 0));
  const topAway  = [...awayPlayers].sort((a, b) => (b.PTS ?? 0) - (a.PTS ?? 0) || (b.MIN ?? 0) - (a.MIN ?? 0));
  const topGame  = [...(gameDetail?.player_stats ?? [...homePlayers, ...awayPlayers])]
    .sort((a: any, b: any) => (b.PTS ?? b.pts ?? 0) - (a.PTS ?? a.pts ?? 0) || (b.MIN ?? b.min ?? 0) - (a.MIN ?? a.min ?? 0));

  const officials  = (gameDetail?.officials ?? []).filter((o: any) => o?.name || o?.n);
  const arenaName  = gameDetail?.arena?.name?.trim();
  const arenaCity  = [gameDetail?.arena?.city, gameDetail?.arena?.state].filter(Boolean).join(", ");
  const teamStatHome = (gameDetail?.team_stats ?? []).find((t: any) => t.TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION || t.team_abbreviation === game.HOME_TEAM_ABBREVIATION) ?? homeBS;
  const teamStatAway = (gameDetail?.team_stats ?? []).find((t: any) => t.TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION || t.team_abbreviation === game.AWAY_TEAM_ABBREVIATION) ?? awayBS;

  const homeWon   = game.WINNER_TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION;
  const awayWon   = game.WINNER_TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION;
  const homeScore = gameDetail?.home_team?.score ?? game.HOME_SCORE;
  const awayScore = gameDetail?.away_team?.score ?? game.AWAY_SCORE;
  const seasonLabel = game.PLAYOFF_ROUND ?? game.SEASON_TYPE ?? "NBA";
  const homeQS = gameDetail?.home_team?.quarter_scores;
  const awayQS = gameDetail?.away_team?.quarter_scores;

  const renderPlayerList = (players: PlayerBoxScore[]) => (
    <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-slate-200 bg-slate-50/80">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-slate-50 px-3 py-2.5 text-left  text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">Player</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">MIN</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">PTS</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">FG</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">FG%</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">3P</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">3P%</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">FT</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">FT%</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">REB</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">AST</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">STL</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">BLK</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">TOV</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">+/-</th>
          </tr>
        </thead>
        <tbody>
          {players.length ? players.map((p) => (
            <tr key={p.PLAYER_ID} className="border-t border-slate-100 bg-white hover:bg-slate-50 transition-colors">
              <td className="sticky left-0 bg-white px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME} size={24} />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-bold text-slate-800">{p.PLAYER_NAME}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">{p.TEAM_ABBREVIATION}</p>
                  </div>
                </div>
              </td>
              <td className="px-2 py-2.5 text-right font-medium text-slate-500">{p.MIN != null ? Math.round(p.MIN) : "—"}</td>
              <td className="px-2 py-2.5 text-right font-black text-slate-900">{fmtInt(p.PTS)}</td>
              <td className="px-2 py-2.5 text-right font-medium text-slate-600">{fmtPair(p.FGM ?? null, p.FGA ?? null)}</td>
              <td className="px-2 py-2.5 text-right font-medium text-slate-600">{fmtPct(p.FG_PCT)}</td>
              <td className="px-2 py-2.5 text-right font-medium text-slate-600">{fmtPair(p.FG3M ?? null, p.FG3A ?? null)}</td>
              <td className="px-2 py-2.5 text-right font-medium text-slate-600">{fmtPct(p.FG3_PCT)}</td>
              <td className="px-2 py-2.5 text-right font-medium text-slate-600">{fmtPair(p.FTM ?? null, p.FTA ?? null)}</td>
              <td className="px-2 py-2.5 text-right font-medium text-slate-600">{fmtPct(p.FT_PCT)}</td>
              <td className="px-2 py-2.5 text-right font-medium text-slate-600">{fmtInt(p.REB)}</td>
              <td className="px-2 py-2.5 text-right font-medium text-slate-600">{fmtInt(p.AST)}</td>
              <td className="px-2 py-2.5 text-right font-medium text-slate-600">{fmtInt(p.STL)}</td>
              <td className="px-2 py-2.5 text-right font-medium text-slate-600">{fmtInt(p.BLK)}</td>
              <td className="px-2 py-2.5 text-right font-medium text-slate-600">{fmtInt(p.TOV)}</td>
              <td className="px-2 py-2.5 text-right font-medium text-slate-600">{fmtInt(p.PLUS_MINUS)}</td>
            </tr>
          )) : (
            <tr>
              <td colSpan={15} className="px-3 py-6 text-center text-sm text-slate-400 border-t border-slate-100">No player rows for this side.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in-up">

      {/* ══════════════════════════════════════
          PREMIUM HERO — Score-centric layout
          ══════════════════════════════════════ */}
      <section className="relative overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        {/* Subtle gradient backdrop */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 20% 50%, rgba(29,66,138,0.04) 0%, transparent 60%), " +
              "radial-gradient(ellipse at 80% 50%, rgba(201,8,42,0.03) 0%, transparent 60%)",
          }}
        />

        {/* Top bar: competition + date */}
        <div className="relative flex items-center justify-between border-b border-slate-100 px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#1d428a]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#1d428a]">
              {seasonLabel}
            </span>
            {game.SERIES_GAME_NUMBER != null && (
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
                Game {game.SERIES_GAME_NUMBER}
              </span>
            )}
            {game.IS_ELIMINATION_GAME && (
              <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-red-500">Elimination</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">
              {game.GAME_STATUS}
            </span>
            <span className="font-medium">{fmtDate(game.GAME_DATE)}</span>
          </div>
        </div>

        {/* Main score area */}
        <div className="relative px-6 py-8">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">

            {/* Away Team */}
            <div className={`flex flex-col items-center gap-3 ${awayWon ? "" : "opacity-50"}`}>
              <TeamLogo abbr={game.AWAY_TEAM_ABBREVIATION} name={game.AWAY_TEAM_NAME} size={56} />
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">
                  {teamCity(game.AWAY_TEAM_ABBREVIATION)}
                </p>
                <p className="text-lg font-black leading-tight text-slate-900">
                  {teamFull(game.AWAY_TEAM_ABBREVIATION, game.AWAY_TEAM_NAME)}
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-slate-400">Away</p>
              </div>
              {awayWon && (
                <span className="rounded-full bg-[#c9082a]/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-[#c9082a]">
                  Winner
                </span>
              )}
            </div>

            {/* Score block */}
            <div className="flex flex-col items-center gap-2 min-w-[160px]">
              {/* Scores */}
              <div className="flex items-center gap-3">
                <span
                  className={`text-6xl font-black leading-none tabular-nums ${awayWon ? "text-slate-900" : "text-slate-300"}`}
                  style={{ fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: "-0.04em" }}
                >
                  {awayScore ?? "—"}
                </span>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="h-px w-5 bg-slate-200" />
                  <span className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">Final</span>
                  <div className="h-px w-5 bg-slate-200" />
                </div>
                <span
                  className={`text-6xl font-black leading-none tabular-nums ${homeWon ? "text-slate-900" : "text-slate-300"}`}
                  style={{ fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: "-0.04em" }}
                >
                  {homeScore ?? "—"}
                </span>
              </div>

              {/* Margin tag */}
              {game.WINNER_TEAM_ABBREVIATION && (
                <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-center">
                  <p className="text-[10px] font-bold text-slate-500">
                    {teamFull(game.WINNER_TEAM_ABBREVIATION)} won by{" "}
                    <span className="font-black text-slate-800">{margin} {margin === 1 ? "point" : "points"}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Home Team */}
            <div className={`flex flex-col items-center gap-3 ${homeWon ? "" : "opacity-50"}`}>
              <TeamLogo abbr={game.HOME_TEAM_ABBREVIATION} name={game.HOME_TEAM_NAME} size={56} />
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">
                  {teamCity(game.HOME_TEAM_ABBREVIATION)}
                </p>
                <p className="text-lg font-black leading-tight text-slate-900">
                  {teamFull(game.HOME_TEAM_ABBREVIATION, game.HOME_TEAM_NAME)}
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-slate-400">Home</p>
              </div>
              {homeWon && (
                <span className="rounded-full bg-[#1d428a]/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-[#1d428a]">
                  Winner
                </span>
              )}
            </div>
          </div>

          {/* Arena info row — only if data exists */}
          {(arenaName || arenaCity) && (
            <div className="mt-4 flex justify-center">
              <p className="text-[10px] text-slate-400 font-medium">
                {[arenaName, arenaCity].filter(Boolean).join(" · ")}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════
          TAB BAR
          ══════════════════════════════════════ */}
      <div className="rounded-[1.5rem] border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <TabButton label="Game Overview"                             active={activeTab === "game"} onClick={() => setActiveTab("game")} />
          <TabButton label={`${game.HOME_TEAM_ABBREVIATION} Box Score`} active={activeTab === "home"} onClick={() => setActiveTab("home")} />
          <TabButton label={`${game.AWAY_TEAM_ABBREVIATION} Box Score`} active={activeTab === "away"} onClick={() => setActiveTab("away")} />
        </div>
      </div>

      {/* ══════════════════════════════════════
          GAME OVERVIEW TAB
          ══════════════════════════════════════ */}
      {activeTab === "game" && (
        <div className="space-y-4 animate-fade-in">

          {/* 1. Game Summary */}
          <GameSummaryBlock
            game={game}
            home={homeBS}
            away={awayBS}
            topPlayers={topGame}
          />

          {/* 2. Team Comparison Bars */}
          <TeamComparisonBars home={homeBS} away={awayBS} />

          {/* 3. Shooting Summary */}
          <ShootingSummary home={teamStatHome as TeamBoxScore | null} away={teamStatAway as TeamBoxScore | null} />

          {/* 4. Top Performers */}
          <TopPerformers topGame={topGame} />

          {/* 5. Game Leaders (only if data exists) */}
          <GameLeaders leaders={gameDetail?.game_leaders} />

          {/* 6. Quarter Scores (only if data exists) */}
          <QuarterScores
            homeAbbr={game.HOME_TEAM_ABBREVIATION}
            awayAbbr={game.AWAY_TEAM_ABBREVIATION}
            homeQS={homeQS}
            awayQS={awayQS}
          />

          {/* 7. Officials (only if data exists) */}
          {officials.length > 0 && (
            <div className="rounded-[1.5rem] border border-slate-100 bg-white px-5 py-4 shadow-sm">
              <p className="mb-2 text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Officials</p>
              <p className="text-[11px] font-medium text-slate-600">
                {officials.slice(0, 3).map((o: any) => o.name || o.n).filter(Boolean).join(" · ")}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════
          HOME BOX SCORE TAB
          ══════════════════════════════════════ */}
      {activeTab === "home" && (
        <div className="animate-fade-in space-y-4">
          <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">{game.HOME_TEAM_ABBREVIATION} · Home</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-700">
                  {gameDetail?.home_team?.team_name || game.HOME_TEAM_NAME || game.HOME_TEAM_ABBREVIATION}
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                  <p className="text-xl font-black text-slate-900">{homeScore ?? "—"}</p>
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">PTS</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                  <p className="text-xl font-black text-slate-900">{fmtInt(homeBS?.REB ?? null)}</p>
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">REB</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                  <p className="text-xl font-black text-slate-900">{fmtInt(homeBS?.AST ?? null)}</p>
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">AST</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                  <p className="text-xl font-black text-slate-900">{fmtInt(homeBS?.TOV ?? null)}</p>
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">TOV</p>
                </div>
              </div>
            </div>
            {renderPlayerList(topHome)}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          AWAY BOX SCORE TAB
          ══════════════════════════════════════ */}
      {activeTab === "away" && (
        <div className="animate-fade-in space-y-4">
          <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">{game.AWAY_TEAM_ABBREVIATION} · Away</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-700">
                  {gameDetail?.away_team?.team_name || game.AWAY_TEAM_NAME || game.AWAY_TEAM_ABBREVIATION}
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                  <p className="text-xl font-black text-slate-900">{awayScore ?? "—"}</p>
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">PTS</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                  <p className="text-xl font-black text-slate-900">{fmtInt(awayBS?.REB ?? null)}</p>
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">REB</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                  <p className="text-xl font-black text-slate-900">{fmtInt(awayBS?.AST ?? null)}</p>
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">AST</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                  <p className="text-xl font-black text-slate-900">{fmtInt(awayBS?.TOV ?? null)}</p>
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">TOV</p>
                </div>
              </div>
            </div>
            {renderPlayerList(topAway)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Game Card (list view) ── */
function GameCard({ game, onOpen }: { game: GameFeedRow; onOpen: () => void }) {
  const margin       = Math.abs((game.HOME_SCORE ?? 0) - (game.AWAY_SCORE ?? 0));
  const awayWon      = game.WINNER_TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION;
  const homeWon      = game.WINNER_TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION;
  const awayFull     = teamFull(game.AWAY_TEAM_ABBREVIATION, game.AWAY_TEAM_NAME);
  const homeFull     = teamFull(game.HOME_TEAM_ABBREVIATION, game.HOME_TEAM_NAME);
  const winnerFull   = homeWon ? homeFull : awayFull;
  const seasonLabel  = game.SEASON_TYPE === "Regular Season" ? "Regular" : (game.SEASON_TYPE ?? "Regular");

  return (
    <button
      onClick={onOpen}
      className="group w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.06)] transition-all duration-200 hover:shadow-[0_8px_32px_rgba(15,23,42,0.10)] hover:-translate-y-0.5 text-left"
    >
      {/* Card top bar: status + season type */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">{seasonLabel}</span>
          {game.SERIES_GAME_NUMBER != null && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
              Game {game.SERIES_GAME_NUMBER}
            </span>
          )}
          {game.IS_ELIMINATION_GAME && (
            <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-bold text-red-500">Elim</span>
          )}
        </div>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700">
          {game.GAME_STATUS}
        </span>
      </div>

      {/* Main matchup + score area */}
      <div className="px-4 py-3">
        {/* Teams row */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {/* Away */}
          <div className="flex items-center gap-2.5">
            <TeamLogo abbr={game.AWAY_TEAM_ABBREVIATION} name={game.AWAY_TEAM_NAME} size={34} />
            <div className="min-w-0">
              <p className={`text-sm font-black leading-tight ${awayWon ? "text-slate-900" : "text-slate-400"}`}>
                {awayFull}
              </p>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Away</p>
            </div>
          </div>

          {/* Score */}
          <div className="min-w-[5.5rem] text-center" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            <div className="flex items-baseline justify-center gap-1">
              <span className={`text-3xl font-black leading-none ${awayWon ? "text-slate-900" : "text-slate-400"}`}>
                {game.AWAY_SCORE ?? "—"}
              </span>
              <span className="text-lg font-semibold text-slate-300">–</span>
              <span className={`text-3xl font-black leading-none ${homeWon ? "text-slate-900" : "text-slate-400"}`}>
                {game.HOME_SCORE ?? "—"}
              </span>
            </div>
            {game.WINNER_TEAM_ABBREVIATION && (
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
                {winnerFull} +{margin}
              </p>
            )}
          </div>

          {/* Home */}
          <div className="flex items-center justify-end gap-2.5">
            <div className="min-w-0 text-right">
              <p className={`text-sm font-black leading-tight ${homeWon ? "text-slate-900" : "text-slate-400"}`}>
                {homeFull}
              </p>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Home</p>
            </div>
            <TeamLogo abbr={game.HOME_TEAM_ABBREVIATION} name={game.HOME_TEAM_NAME} size={34} />
          </div>
        </div>

        {/* Info row */}
        <div className="mt-2.5 flex items-center justify-between">
          <p className="text-[10px] text-slate-400">
            {fmtDate(game.GAME_DATE)}
          </p>
          <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.22em] text-[#1d428a] opacity-0 transition-opacity group-hover:opacity-100">
            <Users2 size={10} /> Details
          </span>
        </div>
      </div>
    </button>
  );
}

const ALL_SEASONS = ["2025-26", "2024-25", "2023-24", "2022-23"];

/* ── Main exported component ── */
export default function GameResults() {
  const [allResults,  setAllResults]  = useState<(GameFeedRow & { SEASON?: string })[]>([]);
  const [results,     setResults]     = useState<GameFeedRow[]>([]);
  const [teamBS,      setTeamBS]      = useState<TeamBoxScore[]>([]);
  const [playerBS,    setPlayerBS]    = useState<PlayerBoxScore[]>([]);
  // Per-season lazy-loaded boxscores cache
  const [seasonTeamBS,   setSeasonTeamBS]   = useState<Record<string, TeamBoxScore[]>>({ "2025-26": [] });
  const [seasonPlayerBS, setSeasonPlayerBS] = useState<Record<string, PlayerBoxScore[]>>({ "2025-26": [] });
  const [bsLoading,   setBsLoading]   = useState<Record<string, boolean>>({});
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [search,      setSearch]      = useState("");
  const [selectedDate,setSelectedDate]= useState<string>("");
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [gameDetails, setGameDetails] = useState<GameDetail[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>("2025-26");

  // Initial load: games index + current season boxscores
  useEffect(() => {
    Promise.all([
      fetch("/data/all_seasons_games.json").then((r) => r.json()).catch(() => []),
      fetch("/data/games.json").then((r) => r.json()),
      fetch("/data/team_boxscores.json").then((r) => r.json()),
      fetch("/data/player_boxscores.json").then((r) => r.json()),
      fetch("/data/game_details.json").then((r) => r.json()).catch(() => []),
    ])
      .then(([allGames, r, t, p, d]) => {
        const currentIds = new Set((r as GameFeedRow[]).map((g) => g.GAME_ID));
        const taggedCurrent = (r as any[]).map((g) => ({ ...g, SEASON: "2025-26" }));
        const historical = (allGames as any[]).filter(
          (g: any) => !currentIds.has(g.GAME_ID) && g.SEASON !== "2025-26"
        );
        setAllResults([...taggedCurrent, ...historical]);
        setResults(r);
        setTeamBS(t);
        setPlayerBS(p);
        setGameDetails(d);
        // Seed 2025-26 into per-season cache
        setSeasonTeamBS({ "2025-26": t });
        setSeasonPlayerBS({ "2025-26": p });
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  // Lazy-load boxscores when switching to a historical season
  useEffect(() => {
    if (selectedSeason === "2025-26") return;
    if (seasonTeamBS[selectedSeason] || bsLoading[selectedSeason]) return;
    setBsLoading((prev) => ({ ...prev, [selectedSeason]: true }));
    Promise.all([
      fetch(`/data/team_boxscores_${selectedSeason}.json`).then((r) => r.json()).catch(() => []),
      fetch(`/data/player_boxscores_${selectedSeason}.json`).then((r) => r.json()).catch(() => []),
    ]).then(([t, p]) => {
      setSeasonTeamBS((prev) => ({ ...prev, [selectedSeason]: t }));
      setSeasonPlayerBS((prev) => ({ ...prev, [selectedSeason]: p }));
      setBsLoading((prev) => ({ ...prev, [selectedSeason]: false }));
    });
  }, [selectedSeason]);

  const sortedResults = useMemo(() => {
    const q = search.trim().toUpperCase();
    const seasonPool = selectedSeason === "2025-26" ? results : allResults.filter((g: any) => g.SEASON === selectedSeason);
    return [...seasonPool]
      .filter((x) => !q || (x.HOME_TEAM_ABBREVIATION ?? "").includes(q) || (x.AWAY_TEAM_ABBREVIATION ?? "").includes(q) || x.GAME_ID.includes(q))
      .sort((a, b) => (b.GAME_DATE ?? "").localeCompare(a.GAME_DATE ?? ""));
  }, [results, allResults, selectedSeason, search]);

  const uniqueDates = useMemo(
    () => Array.from(new Set(sortedResults.map((g) => g.GAME_DATE ?? "").filter(Boolean))).sort((a, b) => b.localeCompare(a)),
    [sortedResults],
  );

  useEffect(() => {
    // Reset date when season changes
    setSelectedDate(uniqueDates[0] ?? "");
  }, [selectedSeason, uniqueDates.length]);

  const selectedDateIndex = uniqueDates.indexOf(selectedDate);
  const selectedDateGames = useMemo(
    () => sortedResults.filter((g) => g.GAME_DATE === selectedDate),
    [sortedResults, selectedDate],
  );
  const selectedGame       = useMemo(() => results.find((g) => g.GAME_ID === selectedGameId) ?? (allResults.find((g) => g.GAME_ID === selectedGameId) as GameFeedRow | undefined) ?? null, [results, allResults, selectedGameId]);
  const selectedGameDetail = useMemo(() => gameDetails.find((d) => d.game_id === selectedGameId) ?? null, [gameDetails, selectedGameId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1d428a] border-t-transparent" />
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Loading results...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <AlertTriangle size={32} className="mx-auto mb-3 text-rose-500" />
        <p className="text-sm font-bold text-rose-600">{error}</p>
        <p className="mt-2 font-mono text-xs text-slate-400">
          Run: <code className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5">python3 main.py --fetch-boxscores</code>
        </p>
      </div>
    );
  }

  // Resolve active boxscore arrays for selected season
  const activeTeamBS   = seasonTeamBS[selectedSeason]   ?? teamBS;
  const activePlayerBS = seasonPlayerBS[selectedSeason] ?? playerBS;
  const isSeasonBsLoading = !!bsLoading[selectedSeason];

  if (selectedGame) {
    const gid = selectedGame.GAME_ID;
    const homeBS      = activeTeamBS.find((t) => t.GAME_ID === gid && t.TEAM_ABBREVIATION === selectedGame.HOME_TEAM_ABBREVIATION) ?? null;
    const awayBS      = activeTeamBS.find((t) => t.GAME_ID === gid && t.TEAM_ABBREVIATION === selectedGame.AWAY_TEAM_ABBREVIATION) ?? null;
    const gamePlayers = activePlayerBS.filter((p) => p.GAME_ID === gid);

    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelectedGameId(null)}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
        >
          <ArrowLeft size={11} />
          Back to games
        </button>
        {isSeasonBsLoading ? (
          <div className="flex h-32 items-center justify-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1d428a] border-t-transparent" />
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Loading box scores...</span>
          </div>
        ) : (
          <GameCardDetail
            game={selectedGame}
            gameDetail={selectedGameDetail}
            homeBS={homeBS}
            awayBS={awayBS}
            homePlayers={playerTeamFilter(gamePlayers, selectedGame.HOME_TEAM_ABBREVIATION)}
            awayPlayers={playerTeamFilter(gamePlayers, selectedGame.AWAY_TEAM_ABBREVIATION)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Hero ── */}
      <section className="rounded-[1.75rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#1d428a]/10">
              <Trophy size={15} className="text-[#1d428a]" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                Game Scores
              </h2>
              <p className="text-xs text-slate-500">Final scores, team edges and player logs.</p>
            </div>
          </div>
          {/* Season selector pills */}
          <div className="flex flex-wrap gap-1.5">
            {ALL_SEASONS.map((s) => (
              <button
                key={s}
                onClick={() => { setSelectedSeason(s); setSelectedGameId(null); }}
                className={[
                  "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] transition-all duration-200",
                  selectedSeason === s
                    ? "bg-[#1d428a] text-white shadow-md shadow-[#1d428a]/25"
                    : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700",
                ].join(" ")}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        {isSeasonBsLoading && (
          <p className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold text-slate-500">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#1d428a] border-t-transparent" />
            Loading {selectedSeason} box scores...
          </p>
        )}
      </section>

      {/* ── Date navigation ── */}
      <section className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Nav controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedDate(uniqueDates[selectedDateIndex + 1] ?? selectedDate)}
              disabled={selectedDateIndex >= uniqueDates.length - 1}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>

            <div className="text-center">
              <p className="text-sm font-black text-slate-900">{selectedDate ? fmtDate(selectedDate) : "No date"}</p>
              <p className="text-[10px] text-slate-400">
                {selectedDateGames.length} game{selectedDateGames.length !== 1 ? "s" : ""}
                {" · "}
                {uniqueDates.length} days total
              </p>
            </div>

            <button
              onClick={() => setSelectedDate(uniqueDates[selectedDateIndex - 1] ?? selectedDate)}
              disabled={selectedDateIndex <= 0}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search team…"
            className="w-48 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#1d428a] focus:bg-white focus:ring-2 focus:ring-[#1d428a]/10 transition"
          />
        </div>
      </section>

      {/* ── Game cards grid ── */}
      {selectedDateGames.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">
          No games for this date.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {selectedDateGames.map((game) => (
            <GameCard key={game.GAME_ID} game={game} onOpen={() => setSelectedGameId(game.GAME_ID)} />
          ))}
        </div>
      )}
    </div>
  );
}