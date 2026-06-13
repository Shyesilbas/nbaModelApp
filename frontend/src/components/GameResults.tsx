import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Users2,
  Cpu,
  Activity,
  Calendar,
  Zap,
} from "lucide-react";
import TeamLogo from "./TeamLogo";
import PlayerPhoto from "./PlayerPhoto";
import type { GameDetail, GameFeedRow } from "../types/gameFeed";
import {
  NBA_TEAMS,
  WinProbabilityArc,
  SignalCards,
  NarrativeBlock,
  PlayerSpotlight,
  ModelDiagnostics,
  ModelExplanationSection,
} from "./NbaPrediction";

// Normalize GAME_ID to 10-digit zero-padded string.
// all_seasons_games.json stores IDs without leading zeros (e.g. "42300405")
// but boxscore files always use 10-digit padded IDs (e.g. "0042300405").
const normGid = (id: string | null | undefined): string =>
  id ? id.padStart(10, "0") : "";

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
  game, gameDetail, homeBS, awayBS, homePlayers, awayPlayers, initialTab = "game",
}: {
  game: GameFeedRow;
  gameDetail: GameDetail | null;
  homeBS: TeamBoxScore | null;
  awayBS: TeamBoxScore | null;
  homePlayers: PlayerBoxScore[];
  awayPlayers: PlayerBoxScore[];
  initialTab?: "game" | "home" | "away" | "prediction";
}) {
  const [activeTab, setActiveTab] = useState<"game" | "home" | "away" | "prediction">(initialTab);
  const [predResult, setPredResult] = useState<any>(null);
  const [predLoading, setPredLoading] = useState<boolean>(false);
  const [predError, setPredError] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<any>(null);

  const getTeamInfo = (abbr: string) =>
    NBA_TEAMS.find((t) => t.abbr === abbr) || { abbr, name: abbr, color: "#475569" };

  const exportPredictionAsPDF = (resData: any, predDate: string) => {
    if (!resData) return;
    const hInfo = getTeamInfo(resData.home_team || game.HOME_TEAM_ABBREVIATION);
    const aInfo = getTeamInfo(resData.away_team || game.AWAY_TEAM_ABBREVIATION);
    const winnerAbbr = resData.win_probability?.predicted_winner || resData.predicted_winner;
    const winnerInfo = getTeamInfo(winnerAbbr);
    const winProb = Math.max(resData.win_probability?.home_win_probability ?? 0, resData.win_probability?.away_win_probability ?? 0);
    const confidence = resData.win_probability?.confidence_bucket || "MEDIUM";
    const margin = resData.score_prediction?.predicted_margin ?? 0;
    const total = resData.score_prediction?.predicted_total_points ?? 0;

    const expl = resData.explanation;
    const winExpl = expl?.win_probability;
    const winFeatures = (winExpl?.features || []).filter(
      (f: any) => Math.abs(f.contribution) > 0.0001
    );
    const top3 = winFeatures.slice(0, 3);
    const other2 = winFeatures.slice(3, 5);

    const getReasonText = (f: any) => {
      const name = f.feature_name;
      const val = f.value;

      const isAwayFeature = name.startsWith("OPP_") || name.startsWith("AWAY_");
      const ownerTeam = isAwayFeature ? aInfo : hInfo;
      const otherTeam = isAwayFeature ? hInfo : aInfo;

      const favorsHome = f.influence === "FAVORS_HOME";
      const favorsAway = f.influence === "FAVORS_AWAY";
      const favorsTeam = favorsHome ? hInfo : favorsAway ? aInfo : null;

      if (name === "IS_HOME") {
        return `Home Court Advantage: Playing at home gives ${hInfo.name} a strong environmental edge.`;
      }
      if (name === "DAYS_REST" || name === "OPP_DAYS_REST") {
        return `Rest Advantage: ${ownerTeam.name} has a recovery edge with ${val} days of rest.`;
      }
      if (name === "IS_B2B" || name === "OPP_IS_B2B") {
        return val === 1
          ? `Fatigue Factor: ${ownerTeam.name} is playing on a back-to-back, creating a physical stamina disadvantage.`
          : `Schedule Advantage: ${ownerTeam.name} avoided back-to-back fatigue, entering the matchup fresher.`;
      }
      if (name.includes("WINRATE_LAST_")) {
        const games = name.split("_").pop();
        if (name.includes("HOME_")) {
          return `Home Splits Win Rate: ${ownerTeam.name} (${ownerTeam.abbr}) won ${(val * 100).toFixed(0)}% of their last 5 home games.`;
        }
        if (name.includes("AWAY_")) {
          return `Away Splits Win Rate: ${ownerTeam.name} (${ownerTeam.abbr}) won ${(val * 100).toFixed(0)}% of their last 5 road games.`;
        }
        return `Recent Momentum: ${ownerTeam.name} (${ownerTeam.abbr}) won ${(val * 100).toFixed(0)}% of their last ${games} games.`;
      }
      if (name.includes("PTS_ALLOWED_LAST_")) {
        const games = name.split("_").pop();
        if (name.includes("HOME_")) {
          return `Home Splits Defense: ${ownerTeam.name} (${ownerTeam.abbr}) allowed an average of ${val} points at home in their last 5 home games.`;
        }
        if (name.includes("AWAY_")) {
          return `Away Splits Defense: ${ownerTeam.name} (${ownerTeam.abbr}) allowed an average of ${val} points on the road in their last 5 away games.`;
        }
        return `Overall Defense: ${ownerTeam.name} (${ownerTeam.abbr}) allowed an average of ${val} points in their last ${games} games.`;
      }
      if (name.includes("PTS_LAST_")) {
        const games = name.split("_").pop();
        if (name.includes("HOME_")) {
          return `Home Splits Offense: ${ownerTeam.name} (${ownerTeam.abbr}) scored an average of ${val} points at home in their last 5 home games.`;
        }
        if (name.includes("AWAY_")) {
          return `Away Splits Offense: ${ownerTeam.name} (${ownerTeam.abbr}) scored an average of ${val} points on the road in their last 5 away games.`;
        }
        return `Recent Offense: ${ownerTeam.name} (${ownerTeam.abbr}) scored an average of ${val} points in their last ${games} games.`;
      }
      if (name.includes("PROJ_PTS_SUM")) {
        return `Roster Firepower: Projections forecast high-scoring active players (${val} points) for ${ownerTeam.name} (${ownerTeam.abbr}).`;
      }
      if (name.includes("PROJ_PRA_SUM")) {
        return `All-Around Depth: Combined projected Points, Rebounds, and Assists (${val} PRA) favor ${ownerTeam.name} (${ownerTeam.abbr}).`;
      }
      if (name.includes("OFF_RTG_LAST_")) {
        const games = name.split("_").pop();
        return `Offensive Efficiency: ${ownerTeam.name} (${ownerTeam.abbr}) boasts a rating of ${val} points per 100 possessions (last ${games} games).`;
      }
      if (name.includes("DEF_RTG_LAST_")) {
        const games = name.split("_").pop();
        return `Defensive Strength: ${ownerTeam.name} (${ownerTeam.abbr}) locked down opponents with a defensive rating of ${val} (last ${games} games).`;
      }
      if (name.includes("H2H_WINRATE")) {
        return `Head-to-Head History: ${ownerTeam.name} holds a matchup edge, winning ${(val * 100).toFixed(0)}% of recent meetings against ${otherTeam.abbr}.`;
      }
      if (name === "TRAVEL_DISTANCE") {
        return `Travel Factor: Less travel fatigue favors ${favorsTeam ? favorsTeam.name : hInfo.name} (distance: ${val} miles).`;
      }

      const favorsText = favorsTeam ? `, favoring ${favorsTeam.name} (${favorsTeam.abbr})` : "";
      let cleanDisplayName = f.display_name || f.feature_name || "";
      if (cleanDisplayName.startsWith("Opponent ")) {
        cleanDisplayName = cleanDisplayName.replace("Opponent ", "");
      }
      return `${cleanDisplayName} for ${ownerTeam.name} (${ownerTeam.abbr}): ${val}${favorsText}, driving the model's prediction.`;
    };

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const html = `
      <html>
        <head>
          <title>NBA Prediction Report - ${aInfo.abbr} @ ${hInfo.abbr}</title>
          <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=Inter:wght@400;600;800;900&display=swap" rel="stylesheet">
          <style>
            body {
              font-family: 'Inter', sans-serif;
              color: #1e293b;
              background-color: #ffffff;
              margin: 0;
              padding: 30px;
              font-size: 11px;
              line-height: 1.4;
            }
            @media print {
              body { padding: 0; }
              .no-print { display: none; }
            }
            .header {
              border-bottom: 2px solid #e2e8f0;
              padding-bottom: 12px;
              margin-bottom: 18px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .title {
              font-family: 'Barlow Condensed', sans-serif;
              font-size: 24px;
              font-weight: 900;
              text-transform: uppercase;
              color: #0f172a;
              margin: 0;
              letter-spacing: -0.5px;
            }
            .subtitle {
              font-size: 9px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 2px;
              color: #64748b;
              margin-top: 3px;
            }
            .meta-date {
              font-family: monospace;
              font-size: 11px;
              font-weight: bold;
              color: #64748b;
            }
            .matchup-hero {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 16px;
              margin-bottom: 18px;
              display: grid;
              grid-template-columns: 1fr auto 1fr;
              align-items: center;
              gap: 15px;
            }
            .team-row {
              display: flex;
              align-items: center;
              gap: 12px;
            }
            .team-row.away {
              justify-content: flex-start;
              text-align: left;
            }
            .team-row.home {
              justify-content: flex-end;
              text-align: right;
            }
            .team-logo {
              width: 40px;
              height: 40px;
              object-fit: contain;
            }
            .team-meta {
              display: flex;
              flex-direction: column;
              flex-grow: 1;
              min-width: 0;
            }
            .team-name {
              font-family: 'Barlow Condensed', sans-serif;
              font-size: 18px;
              font-weight: 900;
              text-transform: uppercase;
              color: #0f172a;
              margin: 0;
            }
            .team-sub {
              font-size: 8px;
              font-weight: 850;
              color: #64748b;
              text-transform: uppercase;
              margin-top: 1px;
              letter-spacing: 0.5px;
            }
            .team-score {
              font-family: 'Barlow Condensed', sans-serif;
              font-size: 30px;
              font-weight: 900;
              line-height: 1;
            }
            .vs-divider {
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .vs-text {
              font-family: 'Barlow Condensed', sans-serif;
              font-size: 11px;
              font-weight: 900;
              color: #94a3b8;
              padding: 4px 8px;
              border: 1px dashed #cbd5e1;
              border-radius: 50%;
              background: #ffffff;
            }
            .win-banner {
              grid-column: 1 / span 3;
              margin-top: 10px;
              background: #f0fdf4;
              border: 1px solid #bbf7d0;
              padding: 6px;
              border-radius: 6px;
              color: #15803d;
              font-size: 10px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 1px;
              text-align: center;
            }
            .grid-2 {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 15px;
              margin-bottom: 18px;
            }
            .card {
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              padding: 14px;
              background: #ffffff;
            }
            .card-title {
              font-size: 9px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 1.5px;
              color: #64748b;
              margin-bottom: 10px;
              border-bottom: 1px solid #f1f5f9;
              padding-bottom: 5px;
            }
            .kpi-row {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 10px;
            }
            .kpi-box {
              background: #f8fafc;
              border: 1px solid #f1f5f9;
              padding: 8px;
              border-radius: 6px;
              text-align: center;
            }
            .kpi-value {
              font-size: 14px;
              font-weight: 900;
              font-family: monospace;
              color: #0f172a;
            }
            .kpi-label {
              font-size: 7.5px;
              font-weight: 800;
              color: #64748b;
              text-transform: uppercase;
              margin-top: 1px;
            }
            .narrative-text {
              font-size: 11px;
              color: #334155;
              line-height: 1.5;
              margin: 0;
              font-weight: 500;
              text-align: left;
            }
            .page-break {
              page-break-before: always;
            }
            .roster-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 9.5px;
              margin-top: 6px;
            }
            .roster-table th {
              background: #f8fafc;
              color: #475569;
              font-weight: 800;
              text-transform: uppercase;
              font-size: 8px;
              letter-spacing: 1px;
              padding: 5px 6px;
              border-bottom: 1px solid #cbd5e1;
              text-align: right;
            }
            .roster-table th:first-child { text-align: left; }
            .roster-table td {
              padding: 5px 6px;
              border-bottom: 1px solid #f1f5f9;
              text-align: right;
            }
            .roster-table td:first-child {
              text-align: left;
              font-weight: bold;
              color: #1e293b;
            }
            .roster-table tr:hover { background: #f8fafc; }
            .footer-section {
              margin-top: 30px;
              padding-top: 12px;
              border-top: 1px solid #e2e8f0;
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 8px;
              color: #94a3b8;
            }
            .xai-section {
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              padding: 14px;
              margin-bottom: 18px;
              background: #ffffff;
            }
            .xai-driver-item {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 8px 10px;
              background: #f8fafc;
              border-radius: 8px;
              border: 1px solid #f1f5f9;
              margin-bottom: 6px;
            }
            .xai-driver-item:last-child {
              margin-bottom: 0;
            }
            .xai-driver-left {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .xai-driver-num {
              display: flex;
              align-items: center;
              justify-content: center;
              width: 16px;
              height: 16px;
              border-radius: 50%;
              color: #ffffff;
              font-size: 9px;
              font-weight: bold;
            }
            .xai-driver-text {
              font-size: 11px;
              font-weight: 500;
              color: #334155;
            }
            .xai-driver-right {
              display: flex;
              align-items: center;
              gap: 6px;
            }
            .xai-badge {
              font-size: 8px;
              font-weight: 850;
              padding: 2px 6px;
              border-radius: 4px;
              text-transform: uppercase;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">NBA Prediction Report</h1>
              <div class="subtitle">Powered by Antigravity Predictive Engine</div>
            </div>
            <div class="meta-date">Date: ${predDate}</div>
          </div>

          <div class="matchup-hero">
            <div class="team-row away">
              <img class="team-logo" src="https://a.espncdn.com/i/teamlogos/nba/500/${aInfo.abbr.toLowerCase()}.png" alt="${aInfo.name}" />
              <div class="team-meta">
                <div class="team-name">${aInfo.name}</div>
                <div class="team-sub">Away · ${(resData.win_probability?.away_win_probability * 100).toFixed(1)}% Win Prob</div>
              </div>
              <div class="team-score" style="color: ${aInfo.color};">${resData.score_prediction?.predicted_away_score?.toFixed(1)}</div>
            </div>

            <div class="vs-divider">
              <div class="vs-text">VS</div>
            </div>

            <div class="team-row home">
              <div class="team-score" style="color: ${hInfo.color};">${resData.score_prediction?.predicted_home_score?.toFixed(1)}</div>
              <div class="team-meta">
                <div class="team-name">${hInfo.name}</div>
                <div class="team-sub">Home · ${(resData.win_probability?.home_win_probability * 100).toFixed(1)}% Win Prob</div>
              </div>
              <img class="team-logo" src="https://a.espncdn.com/i/teamlogos/nba/500/${hInfo.abbr.toLowerCase()}.png" alt="${hInfo.name}" />
            </div>

            <div class="win-banner">
              Projected Winner: ${winnerInfo.name} (${confidence} Confidence)
            </div>
          </div>

          <div class="grid-2">
            <div class="card">
              <div class="card-title">Score Predictions</div>
              <div class="kpi-row">
                <div class="kpi-box">
                  <div class="kpi-value">${resData.score_prediction?.predicted_away_score?.toFixed(1)}</div>
                  <div class="kpi-label">${aInfo.abbr} Expected</div>
                </div>
                <div class="kpi-box">
                  <div class="kpi-value">${resData.score_prediction?.predicted_home_score?.toFixed(1)}</div>
                  <div class="kpi-label">${hInfo.abbr} Expected</div>
                </div>
                <div class="kpi-box">
                  <div class="kpi-value">${Math.abs(margin).toFixed(1)} pts</div>
                  <div class="kpi-label">Expected Margin (${winnerInfo.abbr})</div>
                </div>
                <div class="kpi-box">
                  <div class="kpi-value">${total?.toFixed(1)} pts</div>
                  <div class="kpi-label">Expected Total</div>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-title">Matchup Analysis</div>
              <p class="narrative-text">
                The model projects ${winnerInfo.name} to control this matchup, assigning a ${(winProb * 100).toFixed(1)}% win probability. 
                The expected winning margin of ${Math.abs(margin).toFixed(1)} points suggests ${winnerInfo.abbr} maintains a meaningful edge throughout. 
                Offensive efficiency, squad rosters, and home court factors contribute significantly to the forecast.
              </p>
            </div>
          </div>

          ${expl && winFeatures.length > 0 ? `
            <div class="xai-section">
              <div class="card-title">Model Prediction Drivers (Explainable AI)</div>
              <div style="display: flex; flex-direction: column; gap: 6px;">
                ${top3.map((f: any, idx: number) => {
                  const favorsHome = f.influence === "FAVORS_HOME";
                  const favorsAway = f.influence === "FAVORS_AWAY";
                  const teamColor = favorsHome ? hInfo.color : favorsAway ? aInfo.color : "#64748b";
                  const teamAbbr = favorsHome ? hInfo.abbr : favorsAway ? aInfo.abbr : "NEUT";
                  const weightPct = Math.abs(f.contribution * 100).toFixed(1);
                  const isSupporting = (favorsHome && winnerAbbr === hInfo.abbr) || (favorsAway && winnerAbbr === aInfo.abbr);
                  
                  return `
                    <div class="xai-driver-item" style="border-left: 4px solid ${teamColor};">
                      <div class="xai-driver-left">
                        <div class="xai-driver-num" style="background: ${teamColor};">${idx + 1}</div>
                        <div class="xai-driver-text">${getReasonText(f)}</div>
                      </div>
                      <div class="xai-driver-right">
                        <span class="xai-badge" style="background: ${teamColor}15; color: ${teamColor};">Favors ${teamAbbr}</span>
                        <span class="xai-badge" style="background: #f1f5f9; color: #475569;">${isSupporting ? "+" : "-"}${weightPct}% Impact</span>
                      </div>
                    </div>
                  `;
                }).join("")}
                ${other2.map((f: any, idx: number) => {
                  const favorsHome = f.influence === "FAVORS_HOME";
                  const favorsAway = f.influence === "FAVORS_AWAY";
                  const teamColor = favorsHome ? hInfo.color : favorsAway ? aInfo.color : "#64748b";
                  const teamAbbr = favorsHome ? hInfo.abbr : favorsAway ? aInfo.abbr : "NEUT";
                  const weightPct = Math.abs(f.contribution * 100).toFixed(1);
                  const isSupporting = (favorsHome && winnerAbbr === hInfo.abbr) || (favorsAway && winnerAbbr === aInfo.abbr);

                  return `
                    <div class="xai-driver-item" style="background: #ffffff; border: 1px solid #f1f5f9;">
                      <div class="xai-driver-left">
                        <div class="xai-driver-num" style="background: #94a3b8;">${idx + 4}</div>
                        <div class="xai-driver-text" style="color: #475569;">${getReasonText(f)}</div>
                      </div>
                      <div class="xai-driver-right">
                        <span class="xai-badge" style="background: ${teamColor}10; color: ${teamColor};">Favors ${teamAbbr}</span>
                        <span class="xai-badge" style="background: #f1f5f9; color: #64748b;">${isSupporting ? "+" : "-"}${weightPct}% Impact</span>
                      </div>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>
          ` : ""}

          <div class="page-break"></div>

          <div class="header">
            <div>
              <h1 class="title">Roster Projections</h1>
              <div class="subtitle">${aInfo.abbr} vs ${hInfo.abbr} Player Details</div>
            </div>
          </div>

          <div class="grid-2">
            <div class="card">
              <div class="card-title">${aInfo.name} Projections</div>
              <table class="roster-table">
                <thead>
                  <tr>
                    <th style="text-align: left;">Player</th>
                    <th>Pos</th>
                    <th>PTS</th>
                    <th>REB</th>
                    <th>AST</th>
                    <th>PRA</th>
                  </tr>
                </thead>
                <tbody>
                  ${resData.player_predictions?.away_players?.map((p: any) => `
                    <tr>
                      <td style="text-align: left;">${p.player_name}</td>
                      <td style="text-align: right; color: #64748b; font-weight: bold; text-transform: uppercase;">${p.position_group}</td>
                      <td>${p.predicted_pts.toFixed(1)}</td>
                      <td>${p.predicted_reb.toFixed(1)}</td>
                      <td>${p.predicted_ast.toFixed(1)}</td>
                      <td style="font-weight: bold; color: #0f172a;">${p.predicted_pra.toFixed(1)}</td>
                    </tr>
                  `).join("") || "<tr><td colspan='6'>No projections</td></tr>"}
                </tbody>
              </table>
            </div>

            <div class="card">
              <div class="card-title">${hInfo.name} Projections</div>
              <table class="roster-table">
                <thead>
                  <tr>
                    <th style="text-align: left;">Player</th>
                    <th>Pos</th>
                    <th>PTS</th>
                    <th>REB</th>
                    <th>AST</th>
                    <th>PRA</th>
                  </tr>
                </thead>
                <tbody>
                  ${resData.player_predictions?.home_players?.map((p: any) => `
                    <tr>
                      <td style="text-align: left;">${p.player_name}</td>
                      <td style="text-align: right; color: #64748b; font-weight: bold; text-transform: uppercase;">${p.position_group}</td>
                      <td>${p.predicted_pts.toFixed(1)}</td>
                      <td>${p.predicted_reb.toFixed(1)}</td>
                      <td>${p.predicted_ast.toFixed(1)}</td>
                      <td style="font-weight: bold; color: #0f172a;">${p.predicted_pra.toFixed(1)}</td>
                    </tr>
                  `).join("") || "<tr><td colspan='6'>No projections</td></tr>"}
                </tbody>
              </table>
            </div>
          </div>

          <div class="footer-section">
            <div>Model Version: ${resData.win_probability?.model_version ? (resData.win_probability.model_version.startsWith('v') ? resData.win_probability.model_version : 'v' + resData.win_probability.model_version) : 'v6.0'} · Score Model: ${resData.score_prediction?.model_version ? (resData.score_prediction.model_version.startsWith('v') ? resData.score_prediction.model_version : 'v' + resData.score_prediction.model_version) : 'v6.0'}</div>
            <div>Report generated automatically. All predictions are statistical estimates.</div>
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 300);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  useEffect(() => {
    if (activeTab !== "prediction" || predResult !== null || predLoading) return;

    const runPredict = async () => {
      setPredLoading(true);
      setPredError(null);
      try {
        const [res, statusRes] = await Promise.all([
          fetch("http://localhost:8001/predict/game_full", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              game_id: game.GAME_ID,
              home_team_id: game.HOME_TEAM_ABBREVIATION,
              away_team_id: game.AWAY_TEAM_ABBREVIATION,
              prediction_date: game.GAME_DATE,
            }),
          }),
          fetch("http://localhost:8001/model-status").catch(() => null)
        ]);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Server returned ${res.status}`);
        }
        const data = await res.json();
        if (statusRes && statusRes.ok) {
          setModelStatus(await statusRes.json());
        }
        
        const normalized = {
          home_team: game.HOME_TEAM_ABBREVIATION,
          away_team: game.AWAY_TEAM_ABBREVIATION,
          prediction_date: game.GAME_DATE,
          win_probability: {
            predicted_winner: data.win_probability.home_win_prob >= 0.5 ? game.HOME_TEAM_ABBREVIATION : game.AWAY_TEAM_ABBREVIATION,
            home_win_probability: data.win_probability.home_win_prob,
            away_win_probability: data.win_probability.away_win_prob,
            confidence_bucket: Math.max(data.win_probability.home_win_prob, data.win_probability.away_win_prob) >= 0.7 ? "STRONG" : "MODERATE",
            model_version: data.win_probability.model_version || "6.0",
          },
          score_prediction: {
            predicted_home_score: data.score_prediction.home,
            home_score_range: data.score_prediction.home_range,
            predicted_away_score: data.score_prediction.away,
            away_score_range: data.score_prediction.away_range,
            predicted_total_points: data.score_prediction.total,
            total_points_range: data.score_prediction.total_range,
            predicted_margin: data.score_prediction.margin,
            margin_range: data.score_prediction.margin_range,
            score_model_winner: data.score_prediction.margin >= 0 ? game.HOME_TEAM_ABBREVIATION : game.AWAY_TEAM_ABBREVIATION,
            model_version: data.score_prediction.model_version,
          },
          player_predictions: {
            home_players: data.home_players.map((p: any) => ({
              player_id: p.player_name,
              player_name: p.player_name,
              position_group: p.position_group,
              predicted_pts: p.proj_pts,
              predicted_reb: p.proj_reb,
              predicted_ast: p.proj_ast,
              predicted_pra: p.proj_pra
            })),
            away_players: data.away_players.map((p: any) => ({
              player_id: p.player_name,
              player_name: p.player_name,
              position_group: p.position_group,
              predicted_pts: p.proj_pts,
              predicted_reb: p.proj_reb,
              predicted_ast: p.proj_ast,
              predicted_pra: p.proj_pra
            }))
          },
          explanation: data.explanation
        };
        setPredResult(normalized);
      } catch (err: any) {
        setPredError(err.message || "Could not run model prediction.");
      } finally {
        setPredLoading(false);
      }
    };
    runPredict();
  }, [activeTab, game.GAME_ID, game.HOME_TEAM_ABBREVIATION, game.AWAY_TEAM_ABBREVIATION, game.GAME_DATE, predResult, predLoading]);
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
          <TabButton label="Model Prediction"                          active={activeTab === "prediction"} onClick={() => setActiveTab("prediction")} />
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

      {/* ══════════════════════════════════════
          MODEL PREDICTION TAB
          ══════════════════════════════════════ */}
      {activeTab === "prediction" && (
        <div className="animate-fade-in space-y-5">
          {predLoading && (
            <div className="rounded-[1.5rem] border border-slate-100 bg-white p-12 flex flex-col items-center justify-center gap-4 shadow-sm">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-4 border-indigo-100" />
                <div className="w-12 h-12 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin absolute inset-0" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Running prediction engine for this matchup...</p>
            </div>
          )}

          {predError && (
            <div className="p-4 bg-rose-50 text-rose-700 rounded-xl border border-rose-200 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle size={14} />
              {predError}
            </div>
          )}

          {predResult && !predLoading && (
            <div className="space-y-5">
              {/* Prediction Hero card */}
              {(() => {
                const homeInfo = getTeamInfo(game.HOME_TEAM_ABBREVIATION);
                const awayInfo = getTeamInfo(game.AWAY_TEAM_ABBREVIATION);
                const winnerAbbr = predResult.win_probability?.predicted_winner || predResult.predicted_winner;
                const winnerInfo = getTeamInfo(winnerAbbr);
                
                const hasActualResult = game.HOME_SCORE !== null && game.AWAY_SCORE !== null;
                const isPredictionCorrect = winnerAbbr === game.WINNER_TEAM_ABBREVIATION;
                const confidence = predResult.win_probability?.confidence_bucket || "MEDIUM";
                const winProb = Math.max(predResult.win_probability?.home_win_probability ?? 0, predResult.win_probability?.away_win_probability ?? 0);

                return (
                  <div className="space-y-5">
                    
                    <div className="prediction-hero rounded-[2rem] overflow-hidden relative">
                      <div
                        className="absolute inset-y-0 left-0 w-1/3 opacity-20 pointer-events-none"
                        style={{ background: `radial-gradient(ellipse at left center, ${awayInfo.color}, transparent 70%)` }}
                      />
                      <div
                        className="absolute inset-y-0 right-0 w-1/3 opacity-20 pointer-events-none"
                        style={{ background: `radial-gradient(ellipse at right center, ${homeInfo.color}, transparent 70%)` }}
                      />
                      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                      <div className="relative p-6 lg:p-8">
                        <div className="flex items-center justify-between mb-8">
                          <div className="flex items-center gap-2">
                            <Cpu size={12} className="text-white/30" />
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">
                              NBA Prediction Engine
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => exportPredictionAsPDF(predResult, game.GAME_DATE)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-wider transition-all duration-200 border border-white/10 shadow-xs"
                            >
                              Export PDF
                            </button>
                            <div className="flex items-center gap-2">
                              <Calendar size={11} className="text-white/30" />
                              <span className="text-[9px] font-mono font-bold text-white/30">{game.GAME_DATE}</span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 lg:gap-8">
                          {/* Away */}
                          <div className="text-center space-y-3">
                            <div className="flex justify-center">
                              <div
                                className="w-20 h-20 rounded-2xl flex items-center justify-center ring-2 ring-white/10 shadow-xl"
                                style={{ backgroundColor: `${awayInfo.color}22`, borderColor: `${awayInfo.color}44` }}
                              >
                                <TeamLogo abbr={awayInfo.abbr} name={awayInfo.name} size={56} />
                              </div>
                            </div>
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Away</p>
                              <h2 className="text-xl font-black uppercase tracking-tight text-white leading-tight mt-1" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                                {awayInfo.name}
                              </h2>
                              <p className="text-3xl font-black font-mono mt-2" style={{ color: awayInfo.color }}>
                                {(predResult.win_probability.away_win_probability * 100).toFixed(1)}%
                              </p>
                              <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider mt-1">Win Probability</p>
                            </div>
                            {winnerAbbr === awayInfo.abbr && (
                              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 winner-pulse">
                                <Trophy size={11} className="text-emerald-400" />
                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">Predicted Winner</span>
                              </div>
                            )}
                          </div>

                          {/* Arc */}
                          <div className="flex flex-col items-center gap-2">
                            <WinProbabilityArc
                              homeProb={predResult.win_probability.home_win_probability}
                              awayProb={predResult.win_probability.away_win_probability}
                              homeColor={homeInfo.color}
                              awayColor={awayInfo.color}
                              homeAbbr={homeInfo.abbr}
                              awayAbbr={awayInfo.abbr}
                              confidence={predResult.win_probability.confidence_bucket || ""}
                              margin={predResult.score_prediction?.predicted_margin ?? 0}
                              winnerAbbr={winnerInfo.abbr}
                            />
                            <div
                              className="px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest"
                              style={{
                                backgroundColor: confidence.toUpperCase().includes("STRONG") ? "rgba(16,185,129,0.15)" : "rgba(59,130,246,0.15)",
                                borderColor: confidence.toUpperCase().includes("STRONG") ? "rgba(16,185,129,0.3)" : "rgba(59,130,246,0.3)",
                                color: confidence.toUpperCase().includes("STRONG") ? "#10b981" : "#60a5fa",
                              }}
                            >
                              {confidence}
                            </div>
                          </div>

                          {/* Home */}
                          <div className="text-center space-y-3">
                            <div className="flex justify-center">
                              <div
                                className="w-20 h-20 rounded-2xl flex items-center justify-center ring-2 ring-white/10 shadow-xl"
                                style={{ backgroundColor: `${homeInfo.color}22`, borderColor: `${homeInfo.color}44` }}
                              >
                                <TeamLogo abbr={homeInfo.abbr} name={homeInfo.name} size={56} />
                              </div>
                            </div>
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Home</p>
                              <h2 className="text-xl font-black uppercase tracking-tight text-white leading-tight mt-1" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                                {homeInfo.name}
                              </h2>
                              <p className="text-3xl font-black font-mono mt-2" style={{ color: homeInfo.color }}>
                                {(predResult.win_probability.home_win_probability * 100).toFixed(1)}%
                              </p>
                              <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider mt-1">Win Probability</p>
                            </div>
                            {winnerAbbr === homeInfo.abbr && (
                              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 winner-pulse">
                                <Trophy size={11} className="text-emerald-400" />
                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">Predicted Winner</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {predResult.score_prediction && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 pt-6 border-t border-white/08">
                            {[
                              {
                                label: "Predicted Score",
                                value: `${predResult.score_prediction.predicted_home_score?.toFixed(0)} – ${predResult.score_prediction.predicted_away_score?.toFixed(0)}`,
                                sub: `${homeInfo.abbr} – ${awayInfo.abbr}`,
                              },
                              {
                                label: "Expected Margin",
                                value: `${Math.abs(predResult.score_prediction.predicted_margin).toFixed(1)} pts`,
                                sub: `${winnerInfo.abbr} lead`,
                              },
                              {
                                label: "Total Points",
                                value: `${predResult.score_prediction.predicted_total_points?.toFixed(0)} pts`,
                                sub: `${predResult.score_prediction.total_points_range?.[0]}–${predResult.score_prediction.total_points_range?.[1]} range`,
                              },
                              {
                                label: "Confidence",
                                value: confidence,
                                sub: "Model signal strength",
                              },
                            ].map((kpi, i) => (
                              <div key={i} className="text-center p-3 rounded-xl bg-white/04 border border-white/06">
                                <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{kpi.label}</p>
                                <p className="text-sm font-black text-white mt-1.5 font-mono" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                                  {kpi.value}
                                </p>
                                <p className="text-[9px] text-white/25 font-bold mt-1">{kpi.sub}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Zap size={13} className="text-indigo-500" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Why the Model Favors {winnerInfo.name}
                        </p>
                      </div>
                      <SignalCards result={predResult} homeInfo={homeInfo} awayInfo={awayInfo} winnerInfo={winnerInfo} />
                    </div>

                    <NarrativeBlock result={predResult} homeInfo={homeInfo} awayInfo={awayInfo} winnerInfo={winnerInfo} />

                    {predResult.explanation && (
                      <ModelExplanationSection
                        result={predResult}
                        homeInfo={homeInfo}
                        awayInfo={awayInfo}
                      />
                    )}

                    {predResult.player_predictions && (
                      <div className="surface rounded-[1.5rem] p-5 lg:p-6">
                        <PlayerSpotlight players={predResult.player_predictions} homeInfo={homeInfo} awayInfo={awayInfo} />
                      </div>
                    )}

                    {hasActualResult && (
                      <div className={isPredictionCorrect ? "verdict-card-correct" : "verdict-card-wrong"}>
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <Activity size={14} className={isPredictionCorrect ? "text-emerald-600" : "text-rose-500"} />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Model vs Actual Outcome</p>
                          </div>
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase border ${isPredictionCorrect ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "bg-rose-100 text-rose-700 border-rose-300"}`}>
                            {isPredictionCorrect ? "Correct Prediction" : "Incorrect Prediction"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-4 bg-white/60 rounded-xl border border-white/80">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Model Predicted</p>
                            <div className="flex items-center gap-2.5">
                              <TeamLogo abbr={winnerAbbr} name={winnerInfo.name} size={28} />
                              <div>
                                <p className="text-xs font-black text-slate-800">{winnerInfo.abbr} to Win</p>
                                <p className="text-[10px] font-bold text-slate-400 mt-0.5 font-mono">
                                  {(winProb * 100).toFixed(1)}% prob
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="p-4 bg-white/60 rounded-xl border border-white/80">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Actual Outcome</p>
                            <div className="flex items-center gap-2.5">
                              <TeamLogo abbr={game.WINNER_TEAM_ABBREVIATION || ""} name={getTeamInfo(game.WINNER_TEAM_ABBREVIATION || "").name} size={28} />
                              <div>
                                <p className="text-xs font-black text-slate-800">
                                  {game.WINNER_TEAM_ABBREVIATION} Won {game.HOME_SCORE} – {game.AWAY_SCORE}
                                </p>
                                <p className="text-[10px] font-bold text-slate-400 mt-0.5 font-mono uppercase">
                                  {game.GAME_STATUS || "Final"}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Model diagnostics (collapsible) */}
                    <ModelDiagnostics modelStatus={modelStatus} result={predResult} />

                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Game Card (list view) ── */
function GameCard({ game, onOpen, onPredict }: { game: GameFeedRow; onOpen: () => void; onPredict: () => void }) {
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
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700">
            {game.GAME_STATUS}
          </span>
          <span
            onClick={(e) => {
              e.stopPropagation();
              onPredict();
            }}
            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-indigo-700 hover:bg-indigo-100 hover:border-indigo-200 transition-colors cursor-pointer"
          >
            <Cpu size={9} /> Predict
          </span>
        </div>
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

/* ── Main exported component ── */
export default function GameResults() {
  const [seasonsList, setSeasonsList] = useState<string[]>(["2025-26", "2024-25", "2023-24", "2022-23"]);
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
  const [initialDetailTab, setInitialDetailTab] = useState<"game" | "home" | "away" | "prediction">("game");
  const [gameDetails, setGameDetails] = useState<GameDetail[]>([]);

  const handleOpenGame = (gameId: string, startTab: "game" | "home" | "away" | "prediction" = "game") => {
    setInitialDetailTab(startTab);
    setSelectedGameId(gameId);
  };
  const [selectedSeason, setSelectedSeason] = useState<string>("2025-26");

  // Initial load: games index + current season boxscores
  useEffect(() => {
    fetch("/data/seasons.json")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setSeasonsList(data);
        }
      })
      .catch(() => {});

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
    const gid = normGid(selectedGame.GAME_ID);
    const homeBS      = activeTeamBS.find((t) => normGid(t.GAME_ID) === gid && t.TEAM_ABBREVIATION === selectedGame.HOME_TEAM_ABBREVIATION) ?? null;
    const awayBS      = activeTeamBS.find((t) => normGid(t.GAME_ID) === gid && t.TEAM_ABBREVIATION === selectedGame.AWAY_TEAM_ABBREVIATION) ?? null;
    const gamePlayers = activePlayerBS.filter((p) => normGid(p.GAME_ID) === gid);

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
            key={selectedGame.GAME_ID}
            game={selectedGame}
            gameDetail={selectedGameDetail}
            homeBS={homeBS}
            awayBS={awayBS}
            homePlayers={playerTeamFilter(gamePlayers, selectedGame.HOME_TEAM_ABBREVIATION)}
            awayPlayers={playerTeamFilter(gamePlayers, selectedGame.AWAY_TEAM_ABBREVIATION)}
            initialTab={initialDetailTab}
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
            {seasonsList.map((s) => (
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
            <GameCard
              key={game.GAME_ID}
              game={game}
              onOpen={() => handleOpenGame(game.GAME_ID, "game")}
              onPredict={() => handleOpenGame(game.GAME_ID, "prediction")}
            />
          ))}
        </div>
      )}
    </div>
  );
}