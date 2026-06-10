import { useEffect, useState, useMemo, type ReactNode } from "react";
import {
  Trophy,
  Search,
  ChevronDown,
  ChevronUp,
  BarChart2,
  Users,
  AlertTriangle,
  SortAsc,
  SortDesc,
  Flame,
  Snowflake,
  Sparkles,
  Award,
  Calendar,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface GameResult {
  GAME_ID: string;
  GAME_DATE: string;
  HOME_TEAM_ABBREVIATION: string;
  HOME_TEAM_NAME: string | null;
  HOME_SCORE: number;
  AWAY_TEAM_ABBREVIATION: string;
  AWAY_TEAM_NAME: string | null;
  AWAY_SCORE: number;
  WINNER_TEAM_ABBREVIATION: string;
  LOSER_TEAM_ABBREVIATION: string;
  SEASON_TYPE: string;
  IS_PLAYOFF: boolean;
  GAME_STATUS: string;
  PLAYOFF_ROUND: string | null;
  SERIES_GAME_NUMBER: number | null;
  HOME_SERIES_WINS: number | null;
  AWAY_SERIES_WINS: number | null;
  IS_ELIMINATION_GAME: boolean | null;
  CAN_CLINCH_SERIES: boolean | null;
  WEEK?: number | null;
}

interface TeamBoxScore {
  GAME_ID: string;
  GAME_DATE: string;
  TEAM_ABBREVIATION: string;
  TEAM_NAME: string | null;
  MATCHUP: string | null;
  WL: string | null;
  MIN: number | null;
  PTS: number | null;
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
  REB: number | null;
  AST: number | null;
  STL: number | null;
  BLK: number | null;
  TOV: number | null;
  PF: number | null;
  PLUS_MINUS: number | null;
}

interface PlayerBoxScore {
  GAME_ID: string;
  GAME_DATE: string;
  TEAM_ABBREVIATION: string;
  PLAYER_ID: number;
  PLAYER_NAME: string;
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
  PLUS_MINUS: number | null;
  WL: string | null;
}

type SeasonFilter = "ALL" | "Regular Season" | "Playoffs" | "PlayIn";
type DetailTab = "summary" | "teams" | "players" | "data";
type TeamSide = "away" | "home";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const fmtPct = (v: number | null) => (v != null ? `${(v * 100).toFixed(1)}%` : "—");
const fmtInt = (v: number | null) => (v != null ? Math.round(v).toString() : "—");

const seasonMeta = (type: string) => {
  if (type === "Playoffs")       return { badge: "badge-playoff", card: "card-playoff" };
  if (type === "PlayIn")         return { badge: "badge-playin",  card: "glass" };
  return { badge: "badge-regular", card: "glass" };
};

const DETAIL_TABS: { key: DetailTab; label: string; icon: ReactNode }[] = [
  { key: "summary", label: "Summary", icon: <Sparkles size={11} /> },
  { key: "teams", label: "Teams", icon: <BarChart2 size={11} /> },
  { key: "players", label: "Players", icon: <Users size={11} /> },
  { key: "data", label: "Data", icon: <AlertTriangle size={11} /> },
];

const TEAM_SIDES: { key: TeamSide; label: string }[] = [
  { key: "away", label: "Away" },
  { key: "home", label: "Home" },
];

const fmtSigned = (v: number | null | undefined) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`;

const fmtShortDate = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const getTeamSideConfig = (side: TeamSide) => ({
  label: side === "home" ? "HOME" : "AWAY",
  ringClass: side === "home" ? "team-ring-playoff" : "team-ring",
  accent: side === "home" ? "#1d428a" : "#c9082a",
  panel: side === "home" ? "border-[#1d428a]/20 bg-[#1d428a]/5" : "border-[#c9082a]/20 bg-[#c9082a]/5",
});

const compareBetter = (teamVal: number | null | undefined, oppVal: number | null | undefined, higherIsBetter = true) => {
  const a = teamVal ?? 0;
  const b = oppVal ?? 0;
  if (a === b) return "text-slate-600";
  const wins = higherIsBetter ? a > b : a < b;
  return wins ? "text-slate-900 font-black" : "text-slate-300";
};

const playerTeamFilter = (players: PlayerBoxScore[], abbr: string) =>
  players.filter((p) => p.TEAM_ABBREVIATION === abbr);

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function TeamCompareStrip({
  home,
  away,
}: {
  home: TeamBoxScore | null;
  away: TeamBoxScore | null;
}) {
  if (!home || !away) {
    return <p className="text-xs text-slate-500 text-center py-2">Team stats not loaded yet</p>;
  }

  const rows = [
    { label: "FG%", h: home.FG_PCT, a: away.FG_PCT, high: true, fmt: fmtPct },
    { label: "3PT%", h: home.FG3_PCT, a: away.FG3_PCT, high: true, fmt: fmtPct },
    { label: "FT%", h: home.FT_PCT, a: away.FT_PCT, high: true, fmt: fmtPct },
    { label: "REB", h: home.REB, a: away.REB, high: true, fmt: fmtInt },
    { label: "AST", h: home.AST, a: away.AST, high: true, fmt: fmtInt },
    { label: "TOV", h: home.TOV, a: away.TOV, high: false, fmt: fmtInt },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Team snapshot</p>
          <p className="text-sm font-bold text-slate-700">Side-by-side box score edge</p>
        </div>
        <div className="text-[10px] text-slate-400 font-semibold">
          Better side is highlighted
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50">
              <th className="text-right pb-2 pr-3 pt-2 text-[9px] font-black text-[#1d428a] uppercase tracking-widest w-[38%]">
                {home.TEAM_ABBREVIATION}
              </th>
              <th className="pb-2 pt-2 text-center text-[9px] font-semibold text-slate-400 w-[24%]">Metric</th>
              <th className="text-left pb-2 pl-3 pt-2 text-[9px] font-black text-[#c9082a] uppercase tracking-widest w-[38%]">
                {away.TEAM_ABBREVIATION}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, h, a, high, fmt }) => (
              <tr key={label} className="border-b border-slate-100 last:border-0">
                <td className={`stat-cell text-right pr-3 ${compareBetter(h, a, high)}`}>
                  {fmt(h)}
                </td>
                <td className="stat-cell text-center text-[9px] text-slate-400 font-semibold uppercase tracking-wider">
                  {label}
                </td>
                <td className={`stat-cell text-left pl-3 ${compareBetter(a, h, high)}`}>
                  {fmt(a)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamDetailCard({
  team,
  opponent,
  side,
  game,
}: {
  team: TeamBoxScore | null;
  opponent: TeamBoxScore | null;
  side: TeamSide;
  game: GameResult;
}) {
  if (!team) {
    return <p className="text-xs text-slate-500 text-center py-3">Team box score not available</p>;
  }

  const cfg = getTeamSideConfig(side);
  const isWinner = game.WINNER_TEAM_ABBREVIATION === team.TEAM_ABBREVIATION;

  const statCards = [
    { label: "PTS", value: fmtInt(team.PTS), accent: "text-slate-900" },
    { label: "FG%", value: fmtPct(team.FG_PCT), accent: "text-slate-900" },
    { label: "REB", value: fmtInt(team.REB), accent: "text-slate-900" },
    { label: "AST", value: fmtInt(team.AST), accent: "text-slate-900" },
    { label: "TOV", value: fmtInt(team.TOV), accent: "text-slate-900" },
    { label: "+/-", value: fmtSigned(team.PLUS_MINUS), accent: isWinner ? "text-emerald-600" : "text-rose-600" },
  ];

  return (
    <div className={`rounded-2xl border ${cfg.panel} bg-white p-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cfg.ringClass} style={{ width: 48, height: 48, fontSize: 15 }}>
            {team.TEAM_ABBREVIATION}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-black text-slate-900 tracking-tight" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {team.TEAM_ABBREVIATION}
              </h3>
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${isWinner ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
                {isWinner ? "Winner" : "Loss"}
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate">{team.TEAM_NAME ?? team.TEAM_ABBREVIATION}</p>
            <p className="text-[10px] font-semibold text-slate-400">{team.MATCHUP}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-black text-slate-900 leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            {team.PTS}
          </p>
          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">Points</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
        {statCards.map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
            <p className={`text-sm font-black ${s.accent}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-slate-200 px-3 py-2">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Shooting</p>
          <div className="flex items-center justify-between mt-1">
            <span className="text-slate-600">FG</span>
            <span className="font-bold">{fmtPct(team.FG_PCT)}</span>
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-slate-600">3P</span>
            <span className="font-bold">{fmtPct(team.FG3_PCT)}</span>
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-slate-600">FT</span>
            <span className="font-bold">{fmtPct(team.FT_PCT)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 px-3 py-2">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Rebounds & Defense</p>
          <div className="flex items-center justify-between mt-1">
            <span className="text-slate-600">OREB / DREB</span>
            <span className="font-bold">{fmtInt(team.OREB)} / {fmtInt(team.DREB)}</span>
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-slate-600">STL / BLK</span>
            <span className="font-bold">{fmtInt(team.STL)} / {fmtInt(team.BLK)}</span>
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-slate-600">TO / PF</span>
            <span className="font-bold">{fmtInt(team.TOV)} / {fmtInt(team.PF)}</span>
          </div>
        </div>
      </div>

      {opponent && (
        <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-500">
          <span className="font-bold text-slate-700">{team.TEAM_ABBREVIATION}</span> vs <span className="font-bold text-slate-700">{opponent.TEAM_ABBREVIATION}</span>{" "}
          | margin {fmtSigned(team.PLUS_MINUS)}
        </div>
      )}
    </div>
  );
}

function PlayerTable({
  players,
  teamLabel,
}: {
  players: PlayerBoxScore[];
  teamLabel?: string;
}) {
  if (players.length === 0) return (
    <p className="text-xs text-slate-400 text-center py-3">No player data available for this game</p>
  );

  // Sort by PTS desc, then minutes desc
  const sorted = [...players].sort((a, b) => {
    if ((b.PTS ?? 0) !== (a.PTS ?? 0)) return (b.PTS ?? 0) - (a.PTS ?? 0);
    return (b.MIN ?? 0) - (a.MIN ?? 0);
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {teamLabel && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/80">
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Roster view</p>
            <p className="text-sm font-bold text-slate-700">{teamLabel} player log</p>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-500">
            {players.length} players
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
        <thead>
          <tr className="border-b border-slate-200">
            {["Team", "Player", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV", "FG%", "3P%", "FT%", "+/-"].map(h => (
              <th key={h} className="px-2 py-1.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr key={`${p.PLAYER_ID}-${i}`} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
              <td className="px-2 py-1.5 font-bold text-[#1d428a]">{p.TEAM_ABBREVIATION}</td>
              <td className="px-2 py-1.5 text-slate-700 font-semibold max-w-[140px] truncate">{p.PLAYER_NAME}</td>
              <td className="px-2 py-1.5 text-slate-500">{p.MIN != null ? Math.round(p.MIN) : "—"}</td>
              <td className={`px-2 py-1.5 font-black ${(p.PTS ?? 0) >= 25 ? "text-[#c9082a]" : (p.PTS ?? 0) >= 15 ? "text-slate-800" : "text-slate-600"}`}>
                {fmtInt(p.PTS)}
              </td>
              <td className="px-2 py-1.5 text-slate-600">{fmtInt(p.REB)}</td>
              <td className="px-2 py-1.5 text-slate-600">{fmtInt(p.AST)}</td>
              <td className="px-2 py-1.5 text-slate-500">{fmtInt(p.STL)}</td>
              <td className="px-2 py-1.5 text-slate-500">{fmtInt(p.BLK)}</td>
              <td className="px-2 py-1.5 text-slate-500">{fmtInt(p.TOV)}</td>
              <td className="px-2 py-1.5 text-slate-500">{fmtPct(p.FG_PCT)}</td>
              <td className="px-2 py-1.5 text-slate-500">{fmtPct(p.FG3_PCT)}</td>
              <td className="px-2 py-1.5 text-slate-500">{fmtPct(p.FT_PCT)}</td>
              <td className={`px-2 py-1.5 font-bold ${(p.PLUS_MINUS ?? 0) > 0 ? "text-emerald-600" : (p.PLUS_MINUS ?? 0) < 0 ? "text-rose-600" : "text-slate-400"}`}>
                {p.PLUS_MINUS != null ? (p.PLUS_MINUS > 0 ? `+${p.PLUS_MINUS}` : p.PLUS_MINUS) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/** Single game result row/card */
function GameCard({
  game,
  teamBoxScores,
  playerBoxScores,
  gameDetail,
  index,
  initiallyExpanded = false,
  autoExpandSignal,
  preferredTab,
}: {
  game: GameResult;
  teamBoxScores: TeamBoxScore[];
  playerBoxScores: PlayerBoxScore[];
  gameDetail?: GameDetail | null;
  index: number;
  initiallyExpanded?: boolean;
  autoExpandSignal?: string;
  preferredTab?: DetailTab;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [detailTab, setDetailTab] = useState<DetailTab>("summary");
  const [teamSide, setTeamSide] = useState<TeamSide>("away");
  const [playerSide, setPlayerSide] = useState<TeamSide>("away");

  useEffect(() => {
    if (initiallyExpanded) {
      setExpanded(true);
      setDetailTab("summary");
    }
  }, [initiallyExpanded]);

  useEffect(() => {
    if (autoExpandSignal) {
      setExpanded(true);
      setDetailTab(preferredTab || "summary");
    }
  }, [autoExpandSignal, preferredTab]);

  const meta = seasonMeta(game.SEASON_TYPE);
  const margin = Math.abs(game.HOME_SCORE - game.AWAY_SCORE);
  const homeWon = game.WINNER_TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION;
  const homeSide = getTeamSideConfig("home");
  const awaySide = getTeamSideConfig("away");

  // Find team box scores for this game
  const homeBS = teamBoxScores.find(t => t.GAME_ID === game.GAME_ID && t.TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION) ?? null;
  const awayBS = teamBoxScores.find(t => t.GAME_ID === game.GAME_ID && t.TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION) ?? null;
  const gamePlayers = playerBoxScores.filter(p => p.GAME_ID === game.GAME_ID);
  const homePlayers = playerTeamFilter(gamePlayers, game.HOME_TEAM_ABBREVIATION);
  const awayPlayers = playerTeamFilter(gamePlayers, game.AWAY_TEAM_ABBREVIATION);
  const detail = gameDetail;

  const staggerClass = `stagger-${Math.min((index % 6) + 1, 6)}`;

  const quickStats = [
    { label: "FG%", home: homeBS?.FG_PCT, away: awayBS?.FG_PCT, fmt: fmtPct },
    { label: "REB", home: homeBS?.REB, away: awayBS?.REB, fmt: fmtInt },
    { label: "AST", home: homeBS?.AST, away: awayBS?.AST, fmt: fmtInt },
    { label: "TO", home: homeBS?.TOV, away: awayBS?.TOV, fmt: fmtInt },
  ];

  return (
    <div id={`game-result-${game.GAME_ID}`} className={`animate-fade-in-up ${staggerClass} ${meta.card} rounded-2xl overflow-hidden transition-all duration-300`}>
      <button
        className="w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="px-4 sm:px-5 py-4">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-14 h-14 rounded-2xl border border-slate-200 bg-white flex flex-col items-center justify-center shadow-sm">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">
                  {new Date(game.GAME_DATE + "T12:00:00").toLocaleDateString("en-US", { month: "short" })}
                </span>
                <span className="text-xl font-black text-slate-700 leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {new Date(game.GAME_DATE + "T12:00:00").getDate()}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={meta.badge}>{game.SEASON_TYPE === "Regular Season" ? "Regular" : game.SEASON_TYPE}</span>
                  {game.SERIES_GAME_NUMBER != null && (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      Game {game.SERIES_GAME_NUMBER}
                    </span>
                  )}
                  {margin <= 3 && (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200">
                      Close {margin}pt
                    </span>
                  )}
                </div>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight uppercase text-slate-900 leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {game.AWAY_TEAM_ABBREVIATION} <span className="text-slate-300 font-normal">vs</span> {game.HOME_TEAM_ABBREVIATION}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {fmtShortDate(game.GAME_DATE)} · {game.GAME_STATUS}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-500">
                <Calendar size={11} />
                {game.WINNER_TEAM_ABBREVIATION}
              </div>
              {expanded ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto_1fr] gap-4 items-center">
            <div className="flex items-center gap-3">
              <div className={game.WINNER_TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION ? awaySide.ringClass : "team-ring"} style={{ width: 52, height: 52 }}>
                {game.AWAY_TEAM_ABBREVIATION}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900 truncate">{game.AWAY_TEAM_NAME ?? game.AWAY_TEAM_ABBREVIATION}</p>
                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">Away</p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 px-4">
              <div className={`text-5xl sm:text-6xl font-black tabular-nums ${homeWon ? "text-slate-300" : "text-slate-900"}`} style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {game.AWAY_SCORE}
              </div>
              <div className="text-center">
                <div className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">Final</div>
                <div className="mt-1 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-600">
                  {game.WINNER_TEAM_ABBREVIATION} won by {margin}
                </div>
              </div>
              <div className={`text-5xl sm:text-6xl font-black tabular-nums ${homeWon ? "text-slate-900" : "text-slate-300"}`} style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {game.HOME_SCORE}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <div className="text-right min-w-0">
                <p className="text-sm font-black text-slate-900 truncate">{game.HOME_TEAM_NAME ?? game.HOME_TEAM_ABBREVIATION}</p>
                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">Home</p>
              </div>
              <div className={game.WINNER_TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION ? homeSide.ringClass : "team-ring"} style={{ width: 52, height: 52 }}>
                {game.HOME_TEAM_ABBREVIATION}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {quickStats.map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className={`font-black ${compareBetter(s.home, s.away, s.label !== "TO")}`}>{s.fmt(s.home ?? null)}</span>
                  <span className="text-slate-300 font-bold">vs</span>
                  <span className={`font-black ${compareBetter(s.away, s.home, s.label !== "TO")}`}>{s.fmt(s.away ?? null)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </button>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 sm:px-5 pb-5 pt-4 space-y-4 bg-slate-50/60">
          <div className="flex flex-wrap items-center gap-2">
            {DETAIL_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setDetailTab(tab.key)}
                className={`results-tab ${detailTab === tab.key ? "results-tab-active" : ""}`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
            {game.IS_ELIMINATION_GAME && (
              <span className="ml-auto text-[9px] font-black px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-200">
                ELIMINATION GAME
              </span>
            )}
          </div>

          {detailTab === "summary" && (
            <div className="space-y-4 animate-fade-in-up">
              <TeamCompareStrip home={homeBS} away={awayBS} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Game context</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Winner</p>
                      <p className="text-sm font-black text-slate-900">{game.WINNER_TEAM_ABBREVIATION}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Margin</p>
                      <p className="text-sm font-black text-slate-900">{margin}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Season</p>
                      <p className="text-sm font-black text-slate-900">{game.SEASON_TYPE}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</p>
                      <p className="text-sm font-black text-slate-900">{game.GAME_STATUS}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Arena</p>
                      <p className="text-sm font-black text-slate-900">{detail?.arena?.name || "—"}</p>
                      <p className="text-[10px] text-slate-500">{detail?.arena?.city || ""}{detail?.arena?.state ? `, ${detail.arena.state}` : ""}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Leaders</p>
                      <p className="text-[10px] text-slate-700">PTS: {detail?.game_leaders?.points?.PLAYER_NAME || detail?.game_leaders?.points?.n || "—"} ({detail?.game_leaders?.points?.PTS ?? detail?.game_leaders?.points?.v ?? "—"})</p>
                      <p className="text-[10px] text-slate-700">REB: {detail?.game_leaders?.rebounds?.PLAYER_NAME || detail?.game_leaders?.rebounds?.n || "—"} ({detail?.game_leaders?.rebounds?.REB ?? detail?.game_leaders?.rebounds?.v ?? "—"})</p>
                      <p className="text-[10px] text-slate-700">AST: {detail?.game_leaders?.assists?.PLAYER_NAME || detail?.game_leaders?.assists?.n || "—"} ({detail?.game_leaders?.assists?.AST ?? detail?.game_leaders?.assists?.v ?? "—"})</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Officials</p>
                      <p className="text-[10px] text-slate-700">{(detail?.officials || []).slice(0, 3).map((o) => o.name || o.n).filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 col-span-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Top players</p>
                      <div className="mt-1 grid grid-cols-2 gap-1 text-[10px] text-slate-700">
                        {(detail?.player_stats || []).slice(0, 6).map((p: any) => (
                          <div key={`${p.PLAYER_ID}-${p.TEAM_ABBREVIATION}`} className="flex items-center justify-between gap-2">
                            <span className="truncate">{p.PLAYER_NAME}</span>
                            <span className="font-black text-slate-900">{p.PTS ?? p.pts ?? "—"} pts</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Top player spark</p>
                  <div className="space-y-2">
                    {[awayPlayers, homePlayers].map((teamPlayers, idx) => {
                      const label = idx === 0 ? game.AWAY_TEAM_ABBREVIATION : game.HOME_TEAM_ABBREVIATION;
                      const top = [...teamPlayers].sort((a, b) => (b.PTS ?? 0) - (a.PTS ?? 0)).slice(0, 3);
                      return (
                        <div key={label} className="rounded-xl border border-slate-200 px-3 py-2">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-black text-slate-800">{label}</p>
                            <span className="text-[9px] text-slate-400 font-bold">{top.length} shown</span>
                          </div>
                          <div className="space-y-1">
                            {top.map((p) => (
                              <div key={p.PLAYER_ID} className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-600 truncate pr-2">{p.PLAYER_NAME}</span>
                                <span className="font-black text-[#c9082a]">{fmtInt(p.PTS)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {detailTab === "teams" && (
            <div className="space-y-4 animate-fade-in-up">
              <div className="flex items-center gap-2">
                {TEAM_SIDES.map((side) => (
                  <button
                    key={side.key}
                    onClick={() => setTeamSide(side.key)}
                    className={`results-segment ${teamSide === side.key ? "results-segment-active" : ""}`}
                  >
                    {side.label}
                  </button>
                ))}
              </div>
              <TeamDetailCard
                team={teamSide === "home" ? homeBS : awayBS}
                opponent={teamSide === "home" ? awayBS : homeBS}
                side={teamSide}
                game={game}
              />
            </div>
          )}

          {detailTab === "players" && (
            <div className="space-y-4 animate-fade-in-up">
              <div className="flex items-center gap-2">
                {TEAM_SIDES.map((side) => (
                  <button
                    key={side.key}
                    onClick={() => setPlayerSide(side.key)}
                    className={`results-segment ${playerSide === side.key ? "results-segment-active" : ""}`}
                  >
                    {side.label}
                  </button>
                ))}
              </div>
              <PlayerTable
                players={playerSide === "home" ? homePlayers : awayPlayers}
                teamLabel={playerSide === "home" ? game.HOME_TEAM_ABBREVIATION : game.AWAY_TEAM_ABBREVIATION}
              />
            </div>
          )}

          {detailTab === "data" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in-up">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">What we have</p>
                <ul className="space-y-2 text-xs text-slate-600">
                  <li>Game-level: date, teams, scores, winner/loser, season type, playoff flags, series metadata.</li>
                  <li>Team-level: FGM/FGA, FG%, 3PM/3PA, FT%, REB, AST, STL, BLK, TOV, PF, plus/minus.</li>
                  <li>Player-level: minutes, points, rebounds, assists, steals, blocks, turnovers, shooting splits, plus/minus.</li>
                  <li>Export coverage: `game_results.json`, `team_boxscores.json`, `player_boxscores.json`, `highlights.json`.</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">What is missing / worth adding</p>
                <ul className="space-y-2 text-xs text-slate-600">
                  <li>Advanced team metrics: pace, offensive/defensive rating, true shooting, possessions, eFG%, points in paint.</li>
                  <li>Player context: starters/bench label, usage rate, minutes share, lineup context, on/off impact.</li>
                  <li>Game flow: quarter-by-quarter scoring, lead changes, biggest run, clutch possessions.</li>
                  <li>External context: injuries, rest disadvantage, travel, back-to-back flags, projected lineups.</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────
const PAGE_SIZE = 30;

const getWeekLabel = (w: number) => {
  const seasonStart = new Date("2025-10-21T12:00:00");
  const wStart = new Date(seasonStart.getTime() + (w - 1) * 7 * 24 * 60 * 60 * 1000);
  const wEnd = new Date(wStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  const startStr = wStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endStr = wEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `W${w} (${startStr} – ${endStr})`;
};

interface HighlightItem {
  highest_scoring_games: any[];
  lowest_scoring_games: any[];
  top_points: any[];
  top_assists: any[];
  top_rebounds: any[];
}

interface GameDetail {
  game_id: string;
  season?: string;
  season_type?: string;
  game_date?: string;
  game_status?: string;
  arena?: { name?: string | null; city?: string | null; state?: string | null };
  home_team?: any;
  away_team?: any;
  team_stats?: any[];
  player_stats?: any[];
  game_leaders?: any;
  officials?: any[];
}

function HighlightCard({
  title,
  icon,
  data,
  type,
  onGameClick,
  gradient,
}: {
  title: string;
  icon: ReactNode;
  data: any[];
  type: "team" | "player";
  onGameClick: (gameId: string) => void;
  gradient: string;
}) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between hover:border-slate-300 hover:scale-[1.01] transition-all duration-300 bg-gradient-to-br ${gradient}`}>
      <div>
        <div className="flex items-center gap-1.5 mb-2.5 border-b border-slate-100 pb-1.5">
          {icon}
          <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-wider">{title}</h3>
        </div>
        <div className="space-y-1.5">
          {data && data.length > 0 ? (
            data.map((item, idx) => {
              const isTeam = type === "team";
              return (
                <div
                  key={idx}
                  onClick={() => onGameClick(item.GAME_ID)}
                  className="flex items-center justify-between text-[10px] py-1 px-1.5 rounded hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-bold text-slate-800 truncate block max-w-[120px]">
                      {isTeam ? `${item.AWAY_TEAM} @ ${item.HOME_TEAM}` : item.PLAYER_NAME}
                    </span>
                    <span className="text-[8px] text-slate-400 font-semibold block truncate">
                      {isTeam ? item.GAME_DATE : `${item.TEAM} · ${item.GAME_DATE}`}
                    </span>
                  </div>
                  <div className="text-right ml-2 flex-shrink-0">
                    <span className="text-xs font-black text-[#c9082a] tabular-nums">
                      {isTeam ? item.TOTAL_PTS : item.VALUE}
                    </span>
                    {isTeam && (
                      <span className="block text-[8px] text-slate-400 font-bold">
                        {item.AWAY_SCORE}–{item.HOME_SCORE}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-[9px] text-slate-400 text-center py-4">No data available</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GameResults() {
  const [results, setResults]           = useState<GameResult[]>([]);
  const [teamBS, setTeamBS]             = useState<TeamBoxScore[]>([]);
  const [playerBS, setPlayerBS]         = useState<PlayerBoxScore[]>([]);
  const [highlights, setHighlights]     = useState<HighlightItem | null>(null);
  const [gameDetails, setGameDetails]    = useState<GameDetail[]>([]);
  const [showHighlights, setShowHighlights] = useState(true);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const [filter, setFilter]             = useState<SeasonFilter>("ALL");
  const [selectedWeek, setSelectedWeek] = useState<number | "ALL">("ALL");
  const [search, setSearch]             = useState("");
  const [sortDesc, setSortDesc]         = useState(true);
  const [page, setPage]                 = useState(1);
  const [focusedGameId, setFocusedGameId] = useState<string | null>(null);
  const [focusedGameTab, setFocusedGameTab] = useState<DetailTab>("summary");

  useEffect(() => {
    Promise.all([
      fetch("/data/game_results.json").then(r => r.json()),
      fetch("/data/team_boxscores.json").then(r => r.json()),
      fetch("/data/player_boxscores.json").then(r => r.json()),
      fetch("/data/game_details.json").then(r => r.json()).catch(() => []),
      fetch("/data/highlights.json").then(r => r.json()).catch(() => null),
    ])
      .then(([r, t, p, d, h]) => { 
        setResults(r); 
        setTeamBS(t); 
        setPlayerBS(p); 
        setGameDetails(d); 
        setHighlights(h); 
        setLoading(false); 
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    let g = results;
    if (filter !== "ALL") g = g.filter(x => x.SEASON_TYPE === filter);
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      g = g.filter(x => 
        x.HOME_TEAM_ABBREVIATION.includes(q) || 
        x.AWAY_TEAM_ABBREVIATION.includes(q) ||
        x.GAME_ID.includes(q)
      );
    }
    if (filter === "Regular Season" && selectedWeek !== "ALL") {
      g = g.filter(x => x.WEEK === selectedWeek);
    }
    return sortDesc
      ? [...g].sort((a, b) => b.GAME_DATE.localeCompare(a.GAME_DATE))
      : [...g].sort((a, b) => a.GAME_DATE.localeCompare(b.GAME_DATE));
  }, [results, filter, search, sortDesc, selectedWeek]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageGames  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(() => ({
    total:   results.length,
    regular: results.filter(g => g.SEASON_TYPE === "Regular Season").length,
    playin:  results.filter(g => g.SEASON_TYPE === "PlayIn").length,
    playoff: results.filter(g => g.SEASON_TYPE === "Playoffs").length,
    close:   results.filter(g => Math.abs(g.HOME_SCORE - g.AWAY_SCORE) <= 3).length,
  }), [results]);

  const handleFilterChange = (newFilter: SeasonFilter) => {
    setFilter(newFilter);
    setSelectedWeek("ALL");
    setPage(1);
  };

  const handleGameHighlightClick = (gameId: string, preferredTab: DetailTab = "summary") => {
    setFilter("ALL");
    setSelectedWeek("ALL");
    setSearch(gameId);
    setFocusedGameId(gameId);
    setFocusedGameTab(preferredTab);
    setShowHighlights(true);
    setPage(1);
    
    // Smooth scroll down to the games list section
    setTimeout(() => {
      const el = document.getElementById("games-list-section");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      const card = document.getElementById(`game-result-${gameId}`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1d428a] border-t-transparent" />
      <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Loading Results...</span>
    </div>
  );

  if (error) return (
    <div className="text-center py-16 bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
      <AlertTriangle size={32} className="mx-auto text-rose-500 mb-3" />
      <p className="text-sm font-bold text-rose-600">{error}</p>
      <p className="text-xs text-slate-400 mt-2 font-mono">
        Run: <code className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">python3 main.py --fetch-boxscores</code>
      </p>
    </div>
  );

  const FILTERS: { key: SeasonFilter; label: string; count: number }[] = [
    { key: "ALL",            label: "All Results",     count: stats.total },
    { key: "Playoffs",       label: "Playoffs",        count: stats.playoff },
    { key: "PlayIn",         label: "Play-In",         count: stats.playin },
    { key: "Regular Season", label: "Regular Season",  count: stats.regular },
  ];

  return (
    <div className="space-y-8 relative">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Trophy size={22} className="text-[#1d428a]" />
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Game Results & Box Scores
            </h1>
          </div>
          <p className="text-sm text-slate-500">2025-26 NBA Season · Final scores, team stats, player logs</p>
        </div>

        {highlights && (
          <button
            onClick={() => setShowHighlights(!showHighlights)}
            className="bg-white border border-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 shadow-sm transition-all flex items-center gap-1.5"
          >
            <Sparkles size={13} className={showHighlights ? "text-amber-500 animate-pulse" : "text-slate-400"} />
            {showHighlights ? "Hide Season Highlights" : "Show Season Highlights"}
          </button>
        )}
      </div>

      {/* ── Statistical Highlights Dashboard ────────────────── */}
      {showHighlights && highlights && (
        <div className="relative z-10 animate-fade-in grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <HighlightCard
            title="Highest Scoring"
            icon={<Flame size={14} className="text-rose-500" />}
            data={highlights.highest_scoring_games}
            type="team"
            onGameClick={(gameId) => handleGameHighlightClick(gameId, "summary")}
            gradient="from-rose-500/5 to-transparent"
          />
          <HighlightCard
            title="Lowest Scoring"
            icon={<Snowflake size={14} className="text-blue-500" />}
            data={highlights.lowest_scoring_games}
            type="team"
            onGameClick={(gameId) => handleGameHighlightClick(gameId, "summary")}
            gradient="from-blue-500/5 to-transparent"
          />
          <HighlightCard
            title="Most Points"
            icon={<Award size={14} className="text-amber-500" />}
            data={highlights.top_points}
            type="player"
            onGameClick={(gameId) => handleGameHighlightClick(gameId, "players")}
            gradient="from-amber-500/5 to-transparent"
          />
          <HighlightCard
            title="Most Assists"
            icon={<Sparkles size={14} className="text-emerald-500" />}
            data={highlights.top_assists}
            type="player"
            onGameClick={(gameId) => handleGameHighlightClick(gameId, "players")}
            gradient="from-emerald-500/5 to-transparent"
          />
          <HighlightCard
            title="Most Rebounds"
            icon={<Trophy size={14} className="text-[#1d428a]" />}
            data={highlights.top_rebounds}
            type="player"
            onGameClick={(gameId) => handleGameHighlightClick(gameId, "players")}
            gradient="from-sky-500/5 to-transparent"
          />
        </div>
      )}

      {/* ── Stat pills ───────────────────────────────────────── */}
      <div className="relative z-10 flex flex-wrap gap-2">
        {[
          { label: "Completed Games", value: stats.total.toLocaleString(), color: "text-slate-800" },
          { label: "Regular Season",  value: stats.regular,                color: "text-slate-800" },
          { label: "Play-In",         value: stats.playin,                 color: "text-violet-700" },
          { label: "Playoffs",        value: stats.playoff,                color: "text-[#1d428a]" },
          { label: "Close Games (≤3pt)",value: stats.close,               color: "text-amber-700" },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold shadow-sm">
            <span className="text-slate-400">{label}</span>
            <span className={color}>{value}</span>
          </div>
        ))}
      </div>

      {/* ── Controls ─────────────────────────────────────────── */}
      <div className="relative z-10 space-y-4">
        {/* Filter pills */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => handleFilterChange(key)}
              className={`filter-pill ${filter === key ? "filter-pill-active" : ""}`}
            >
              {label} <span className="opacity-50 ml-1">{count}</span>
            </button>
          ))}
        </div>

        {/* Regular Season Week Selector (Horizontal Scrollable Tabs) */}
        {filter === "Regular Season" && (
          <div className="flex flex-col gap-2 pt-2 animate-fade-in border-t border-slate-200/60 mt-2">
            <div className="flex items-center gap-2">
              <Calendar size={12} className="text-[#1d428a]" />
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Select Regular Season Week:</span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
              <button
                onClick={() => { setSelectedWeek("ALL"); setPage(1); }}
                className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${selectedWeek === "ALL" ? "bg-[#1d428a]/10 text-[#1d428a] border border-[#1d428a]/30" : "bg-white border border-slate-200 text-slate-500 hover:text-slate-800 shadow-sm"}`}
              >
                All Weeks
              </button>
              {Array.from({ length: 25 }, (_, i) => {
                const w = i + 1;
                const active = selectedWeek === w;
                return (
                  <button
                    key={w}
                    onClick={() => { setSelectedWeek(w); setPage(1); }}
                    className={`px-3.5 py-1.5 rounded-full text-[10px] font-bold transition-all whitespace-nowrap ${active ? "bg-[#1d428a]/10 text-[#1d428a] border border-[#1d428a]/30" : "bg-white border border-slate-200 text-slate-500 hover:text-slate-800 shadow-sm"}`}
                  >
                    {getWeekLabel(w)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search + sort */}
        <div id="games-list-section" className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-200/60">
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Team (e.g. BOS, GAME_ID)"
              value={search}
              onChange={e => { setSearch(e.target.value.toUpperCase()); setPage(1); }}
              className="pl-8 pr-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none w-48 text-xs shadow-sm"
            />
          </div>
          <button
            onClick={() => { setSortDesc(!sortDesc); setPage(1); }}
            className="bg-white border border-slate-200 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-500 hover:text-slate-800 transition-colors shadow-sm"
          >
            {sortDesc ? <SortDesc size={10} /> : <SortAsc size={10} />}
            {sortDesc ? "Newest First" : "Oldest First"}
          </button>
          {search && (
            <button
              onClick={() => { setSearch(""); setPage(1); }}
              className="bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-rose-600 hover:bg-rose-100/50 shadow-sm transition-colors"
            >
              Clear Search
            </button>
          )}
          <span className="text-[10px] text-slate-400 font-semibold ml-auto">
            {filtered.length.toLocaleString()} games · Click a row to expand stats
          </span>
        </div>
      </div>

      {/* ── Game list ────────────────────────────────────────── */}
      <div className="relative z-10 space-y-1.5">
        {pageGames.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200 shadow-sm">
            <Search size={32} className="mx-auto text-slate-300 mb-3 opacity-30" />
            <p className="text-sm font-bold text-slate-500">No results found</p>
          </div>
        ) : (
          pageGames.map((game, i) => (
            <GameCard
              key={game.GAME_ID}
              game={game}
              teamBoxScores={teamBS}
              playerBoxScores={playerBS}
              gameDetail={gameDetails.find((d) => d.game_id === game.GAME_ID) ?? null}
              index={i}
              initiallyExpanded={search === game.GAME_ID}
              autoExpandSignal={focusedGameId === game.GAME_ID ? focusedGameId : undefined}
              preferredTab={focusedGameId === game.GAME_ID ? focusedGameTab : undefined}
            />
          ))
        )}
      </div>

      {/* ── Pagination ───────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="relative z-10 flex items-center justify-between pt-2">
          <p className="text-[10px] text-slate-400 font-semibold">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-500 disabled:opacity-30 hover:text-slate-800 transition-colors shadow-sm"
            >← Prev</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
              if (p < 1 || p > totalPages) return null;
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${p === page ? "bg-[#1d428a]/10 text-[#1d428a] border border-[#1d428a]/30" : "bg-white border border-slate-200 text-slate-500 hover:text-slate-800 shadow-sm"}`}>
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-500 disabled:opacity-30 hover:text-slate-800 transition-colors shadow-sm"
            >Next →</button>
          </div>
        </div>
      )}

      {/* Data provenance note */}
      <div className="relative z-10 rounded-xl bg-slate-100 border border-slate-200 px-5 py-3 text-[9px] text-slate-500 font-mono space-y-0.5">
        <p className="text-slate-600 font-bold text-xs not-italic">Data Sources</p>
        <p>Results: <code>data/processed/game_results_2025_26.csv</code></p>
        <p>Team stats: <code>data/raw/boxscores/team/nba_team_boxscores_2025_26.csv</code> (last 2,000 rows exposed)</p>
        <p>Player stats: <code>data/raw/boxscores/player/nba_player_boxscores_2025_26.csv</code> (last 3,000 rows exposed)</p>
      </div>
    </div>
  );
}
