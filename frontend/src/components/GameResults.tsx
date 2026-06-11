import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  ChevronDown,
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

const fmtPct = (v: number | null) => (v != null ? `${(v * 100).toFixed(1)}%` : "—");
const fmtInt = (v: number | null) => (v != null ? Math.round(v).toString() : "—");
const fmtPair = (made: number | null | undefined, att: number | null | undefined) =>
  made != null || att != null ? `${fmtInt(made ?? null)} / ${fmtInt(att ?? null)}` : "—";
const fmtShortDate = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const playerTeamFilter = (players: PlayerBoxScore[], abbr: string) => players.filter((p) => p.TEAM_ABBREVIATION === abbr);

function Badge({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.24em] transition",
        active ? "border-[#1d428a] bg-[#1d428a]/10 text-[#1d428a]" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800",
      ].join(" ")}
    >
      {children}
    </span>
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

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">{title}</p>
      {subtitle && <p className="text-sm font-semibold text-slate-600">{subtitle}</p>}
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

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] transition",
        active ? "bg-[#1d428a] text-white shadow-sm" : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function compareBetter(teamVal: number | null | undefined, oppVal: number | null | undefined, higherIsBetter = true) {
  const a = teamVal ?? 0;
  const b = oppVal ?? 0;
  if (a === b) return "text-slate-600";
  const wins = higherIsBetter ? a > b : a < b;
  return wins ? "text-slate-900 font-black" : "text-slate-300";
}

function TeamCompareStrip({ home, away }: { home: TeamBoxScore | null; away: TeamBoxScore | null }) {
  if (!home || !away) {
    return <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 text-sm text-slate-500">Team stats are not available for this game.</div>;
  }

  const rows = [
    { label: "PTS", h: home.PTS, a: away.PTS, high: true, fmt: fmtInt },
    { label: "FG", h: home.FGM ?? null, a: away.FGM ?? null, high: true, fmt: (v: number | null) => fmtPair(v, null) },
    { label: "FG%", h: home.FG_PCT, a: away.FG_PCT, high: true, fmt: fmtPct },
    { label: "3P", h: home.FG3M ?? null, a: away.FG3M ?? null, high: true, fmt: (v: number | null) => fmtPair(v, null) },
    { label: "3P%", h: home.FG3_PCT, a: away.FG3_PCT, high: true, fmt: fmtPct },
    { label: "FT", h: home.FTM ?? null, a: away.FTM ?? null, high: true, fmt: (v: number | null) => fmtPair(v, null) },
    { label: "FT%", h: home.FT_PCT, a: away.FT_PCT, high: true, fmt: fmtPct },
    { label: "REB", h: home.REB, a: away.REB, high: true, fmt: fmtInt },
    { label: "AST", h: home.AST, a: away.AST, high: true, fmt: fmtInt },
    { label: "TOV", h: home.TOV, a: away.TOV, high: false, fmt: fmtInt },
  ];

  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
      <div className="mb-4 flex items-center justify-between">
        <SectionTitle title="Team snapshot" subtitle="Side-by-side box score edge" />
        <div className="text-[10px] font-semibold text-slate-400">Better side is highlighted</div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="w-[38%] px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-[#1d428a]">{home.TEAM_ABBREVIATION}</th>
              <th className="w-[24%] px-3 py-3 text-center text-[9px] font-semibold text-slate-400">Metric</th>
              <th className="w-[38%] px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.24em] text-[#c9082a]">{away.TEAM_ABBREVIATION}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-slate-100">
                <td className={`px-3 py-2.5 text-right ${compareBetter(row.h, row.a, row.high)}`}>{row.fmt(row.h)}</td>
                <td className="px-3 py-2.5 text-center text-[9px] font-semibold uppercase tracking-[0.24em] text-slate-400">{row.label}</td>
                <td className={`px-3 py-2.5 text-left ${compareBetter(row.a, row.h, row.high)}`}>{row.fmt(row.a)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GameCard({
  game,
  onOpen,
}: {
  game: GameFeedRow;
  onOpen: () => void;
}) {
  const margin = Math.abs((game.HOME_SCORE ?? 0) - (game.AWAY_SCORE ?? 0));

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_16px_50px_rgba(15,23,42,0.07)]">
      <button className="w-full text-left" onClick={onOpen}>
        <div className="grid grid-cols-1 gap-3 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{game.SEASON_TYPE === "Regular Season" ? "Regular" : game.SEASON_TYPE}</Badge>
                {game.SERIES_GAME_NUMBER != null && <Badge>Game {game.SERIES_GAME_NUMBER}</Badge>}
                {game.IS_ELIMINATION_GAME && <Badge>Elimination</Badge>}
              </div>
              <p className="mt-3 text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">{fmtShortDate(game.GAME_DATE)}</p>
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
              {game.GAME_STATUS}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <TeamLogo abbr={game.AWAY_TEAM_ABBREVIATION} name={game.AWAY_TEAM_NAME} size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-900">{game.AWAY_TEAM_ABBREVIATION}</p>
                <p className="truncate text-[10px] text-slate-400">Away</p>
              </div>
            </div>
            <div className="text-center">
              <p className="text-xl font-black leading-none text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {game.AWAY_SCORE} - {game.HOME_SCORE}
              </p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.24em] text-slate-400">{game.WINNER_TEAM_ABBREVIATION} won by {margin}</p>
            </div>
            <div className="flex min-w-0 items-center justify-end gap-3">
              <div className="min-w-0 text-right">
                <p className="truncate text-sm font-black text-slate-900">{game.HOME_TEAM_ABBREVIATION}</p>
                <p className="truncate text-[10px] text-slate-400">Home</p>
              </div>
              <TeamLogo abbr={game.HOME_TEAM_ABBREVIATION} name={game.HOME_TEAM_NAME} size={40} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">Logo</p>
              <div className="mt-2 flex items-center gap-2">
                <TeamLogo abbr={game.AWAY_TEAM_ABBREVIATION} name={game.AWAY_TEAM_NAME} size={20} />
                <TeamLogo abbr={game.HOME_TEAM_ABBREVIATION} name={game.HOME_TEAM_NAME} size={20} />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">Score</p>
              <p className="mt-1 text-sm font-black text-slate-900">{game.AWAY_SCORE} - {game.HOME_SCORE}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">Date</p>
              <p className="mt-1 truncate text-sm font-bold text-slate-800">{fmtShortDate(game.GAME_DATE)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">Arena</p>
              <p className="mt-1 truncate text-sm font-bold text-slate-800">Open</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">Refs</p>
                <p className="mt-1 truncate text-xs text-slate-500">Open match details for arena, officials, box score and player logs.</p>
              </div>
              <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                <Users2 size={11} />
                Details
              </div>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

function GameCardDetail({
  game,
  gameDetail,
  homeBS,
  awayBS,
  homePlayers,
  awayPlayers,
}: {
  game: GameFeedRow;
  gameDetail: GameDetail | null;
  homeBS: TeamBoxScore | null;
  awayBS: TeamBoxScore | null;
  homePlayers: PlayerBoxScore[];
  awayPlayers: PlayerBoxScore[];
}) {
  const [activeTab, setActiveTab] = useState<"game" | "home" | "away">("game");
  const margin = Math.abs((game.HOME_SCORE ?? 0) - (game.AWAY_SCORE ?? 0));
  const topHome = [...homePlayers].sort((a, b) => (b.PTS ?? 0) - (a.PTS ?? 0) || (b.MIN ?? 0) - (a.MIN ?? 0));
  const topAway = [...awayPlayers].sort((a, b) => (b.PTS ?? 0) - (a.PTS ?? 0) || (b.MIN ?? 0) - (a.MIN ?? 0));
  const topGame = [...(gameDetail?.player_stats ?? [...homePlayers, ...awayPlayers])]
    .sort((a: any, b: any) => (b.PTS ?? b.pts ?? 0) - (a.PTS ?? a.pts ?? 0) || (b.MIN ?? b.min ?? 0) - (a.MIN ?? a.min ?? 0));

  const renderPlayerList = (players: PlayerBoxScore[]) => (
    <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-slate-200 bg-slate-50/80">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">Player</th>
            <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">MIN</th>
            <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">PTS</th>
            <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">FG</th>
            <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">FG%</th>
            <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">3P</th>
            <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">3P%</th>
            <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">FT</th>
            <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">FT%</th>
            <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">REB</th>
            <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">AST</th>
            <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">STL</th>
            <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">BLK</th>
            <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">TOV</th>
            <th className="px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">+/-</th>
          </tr>
        </thead>
        <tbody>
          {players.length ? players.map((p) => (
            <tr key={p.PLAYER_ID} className="border-t border-slate-100 bg-white">
              <td className="px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME} size={24} />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-bold text-slate-800">{p.PLAYER_NAME}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">
                      {p.TEAM_ABBREVIATION}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-2 py-2.5 text-right font-medium text-slate-600">{p.MIN != null ? Math.round(p.MIN) : "—"}</td>
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
              <td colSpan={17} className="px-3 py-4 text-center text-sm text-slate-500 border-t border-slate-100">No player rows for this side.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const officials = (gameDetail?.officials ?? []).filter((o: any) => o?.name || o?.n);
  const arenaName = gameDetail?.arena?.name?.trim();
  const arenaCity = [gameDetail?.arena?.city, gameDetail?.arena?.state].filter(Boolean).join(", ");
  const teamStatHome = (gameDetail?.team_stats ?? []).find((t: any) => t.TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION || t.team_abbreviation === game.HOME_TEAM_ABBREVIATION) ?? homeBS;
  const teamStatAway = (gameDetail?.team_stats ?? []).find((t: any) => t.TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION || t.team_abbreviation === game.AWAY_TEAM_ABBREVIATION) ?? awayBS;

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_16px_50px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
              <Trophy size={12} className="text-[#1d428a]" />
              Game Details
            </div>
            <h1 className="text-4xl font-black uppercase tracking-tight text-slate-900 sm:text-5xl" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              {game.AWAY_TEAM_ABBREVIATION} at {game.HOME_TEAM_ABBREVIATION}
            </h1>
            <p className="max-w-3xl text-sm leading-relaxed text-slate-500">
              {fmtShortDate(game.GAME_DATE)} · {game.PLAYOFF_ROUND ?? game.SEASON_TYPE} · {game.GAME_STATUS}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[520px]">
            <MetricCard label="Away" value={gameDetail?.away_team?.score ?? game.AWAY_SCORE} />
            <MetricCard label="Home" value={gameDetail?.home_team?.score ?? game.HOME_SCORE} />
            <MetricCard label="Margin" value={margin} />
            <MetricCard label="Winner" value={game.WINNER_TEAM_ABBREVIATION} />
          </div>
        </div>
      </section>

      <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <TabButton label="Game" active={activeTab === "game"} onClick={() => setActiveTab("game")} />
          <TabButton label={`${game.HOME_TEAM_ABBREVIATION} Home Team`} active={activeTab === "home"} onClick={() => setActiveTab("home")} />
          <TabButton label={`${game.AWAY_TEAM_ABBREVIATION} Away Team`} active={activeTab === "away"} onClick={() => setActiveTab("away")} />
        </div>
        <div className="mt-5">
          {activeTab === "game" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TeamCompareStrip home={homeBS} away={awayBS} />
                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                  <SectionTitle title="Game metadata" subtitle={gameDetail?.arena?.name || gameDetail?.game_status || "Venue details"} />
                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <MetricCard label="Arena" value={arenaName || "Venue unavailable in source"} />
                    <MetricCard label="City" value={arenaCity || "Venue unavailable in source"} />
                    <MetricCard label="Date" value={gameDetail?.game_date ? fmtShortDate(gameDetail.game_date) : fmtShortDate(game.GAME_DATE)} />
                    <MetricCard label="Time" value={gameDetail?.game_time || "Time unavailable in source"} />
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <StatPill label="Home team" value={gameDetail?.home_team?.team_name || game.HOME_TEAM_NAME || game.HOME_TEAM_ABBREVIATION} />
                    <StatPill label="Away team" value={gameDetail?.away_team?.team_name || game.AWAY_TEAM_NAME || game.AWAY_TEAM_ABBREVIATION} />
                    <StatPill label="Home quarter scores" value={Array.isArray(gameDetail?.home_team?.quarter_scores) ? (gameDetail?.home_team?.quarter_scores || []).join(" - ") : "Quarter data unavailable"} />
                    <StatPill label="Away quarter scores" value={Array.isArray(gameDetail?.away_team?.quarter_scores) ? (gameDetail?.away_team?.quarter_scores || []).join(" - ") : "Quarter data unavailable"} />
                  </div>
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">Officials</p>
                    <p className="mt-1 text-[10px] text-slate-700">{officials.slice(0, 3).map((o: any) => o.name || o.n).filter(Boolean).join(" · ") || "Officials unavailable in source"}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                  <SectionTitle title="Top players" subtitle="Best performers from this game" />
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {topGame.slice(0, 6).map((p: any, idx: number) => (
                      <div key={`${p.PLAYER_ID ?? idx}-${p.TEAM_ABBREVIATION ?? "NA"}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 shadow-sm">
                        <div className="flex min-w-0 items-center gap-2">
                          <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME} size={26} />
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-bold text-slate-800">{p.PLAYER_NAME}</p>
                            <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">{p.TEAM_ABBREVIATION ?? "NA"} · {p.MIN != null || p.min != null ? `${Math.round(p.MIN ?? p.min)} min` : "—"}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-slate-900">{p.PTS ?? p.pts ?? "—"}</p>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">PTS</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                  <SectionTitle title="Game leaders" subtitle="Official leaders from the detailed payload" />
                  <div className="mt-4 grid gap-3">
                    {[
                      { label: "Points", item: gameDetail?.game_leaders?.points },
                      { label: "Rebounds", item: gameDetail?.game_leaders?.rebounds },
                      { label: "Assists", item: gameDetail?.game_leaders?.assists },
                    ].map((entry) => (
                      <div key={entry.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">{entry.label}</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">
                          {entry.item?.player_name || entry.item?.n || "—"}{" "}
                          <span className="text-slate-400">
                            {entry.item?.team_id ? `· ${entry.item.team_id}` : ""}
                            {entry.item?.value != null ? ` · ${entry.item.value}` : ""}
                          </span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <MetricCard label="Home FG" value={fmtPair((teamStatHome as any)?.FGM ?? (teamStatHome as any)?.fgm, (teamStatHome as any)?.FGA ?? (teamStatHome as any)?.fga)} />
                <MetricCard label="Away FG" value={fmtPair((teamStatAway as any)?.FGM ?? (teamStatAway as any)?.fgm, (teamStatAway as any)?.FGA ?? (teamStatAway as any)?.fga)} />
                <MetricCard label="Officials" value={officials.length ? officials.length : "Not available"} />
              </div>
            </div>
          )}

          {activeTab === "home" && (
            <div>
              <SectionTitle title={`${game.HOME_TEAM_ABBREVIATION} box score`} subtitle={gameDetail?.home_team?.team_name || game.HOME_TEAM_NAME || "Home team"} />
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MetricCard label="Score" value={gameDetail?.home_team?.score ?? game.HOME_SCORE} />
                <MetricCard label="REB" value={homeBS?.REB ?? "—"} />
                <MetricCard label="AST" value={homeBS?.AST ?? "—"} />
                <MetricCard label="TOV" value={homeBS?.TOV ?? "—"} />
              </div>
              <div className="mt-4">{renderPlayerList(topHome)}</div>
            </div>
          )}

          {activeTab === "away" && (
            <div>
              <SectionTitle title={`${game.AWAY_TEAM_ABBREVIATION} box score`} subtitle={gameDetail?.away_team?.team_name || game.AWAY_TEAM_NAME || "Away team"} />
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MetricCard label="Score" value={gameDetail?.away_team?.score ?? game.AWAY_SCORE} />
                <MetricCard label="REB" value={awayBS?.REB ?? "—"} />
                <MetricCard label="AST" value={awayBS?.AST ?? "—"} />
                <MetricCard label="TOV" value={awayBS?.TOV ?? "—"} />
              </div>
              <div className="mt-4">{renderPlayerList(topAway)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GameResults() {
  const [results, setResults] = useState<GameFeedRow[]>([]);
  const [teamBS, setTeamBS] = useState<TeamBoxScore[]>([]);
  const [playerBS, setPlayerBS] = useState<PlayerBoxScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [gameDetails, setGameDetails] = useState<GameDetail[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/data/games.json").then((r) => r.json()),
      fetch("/data/team_boxscores.json").then((r) => r.json()),
      fetch("/data/player_boxscores.json").then((r) => r.json()),
      fetch("/data/game_details.json").then((r) => r.json()).catch(() => []),
    ])
      .then(([r, t, p, d]) => {
        setResults(r);
        setTeamBS(t);
        setPlayerBS(p);
        setGameDetails(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const sortedResults = useMemo(() => {
    const q = search.trim().toUpperCase();
    return [...results]
      .filter((x) => !q || x.HOME_TEAM_ABBREVIATION.includes(q) || x.AWAY_TEAM_ABBREVIATION.includes(q) || x.GAME_ID.includes(q))
      .sort((a, b) => b.GAME_DATE.localeCompare(a.GAME_DATE));
  }, [results, search]);

  const uniqueDates = useMemo(
    () => Array.from(new Set(sortedResults.map((g) => g.GAME_DATE))).sort((a, b) => b.localeCompare(a)),
    [sortedResults],
  );

  useEffect(() => {
    if (!selectedDate && uniqueDates.length) setSelectedDate(uniqueDates[0]);
  }, [selectedDate, uniqueDates]);

  const selectedDateIndex = uniqueDates.indexOf(selectedDate);
  const selectedDateGames = useMemo(
    () => sortedResults.filter((g) => g.GAME_DATE === selectedDate),
    [sortedResults, selectedDate],
  );
  const selectedGame = useMemo(() => results.find((g) => g.GAME_ID === selectedGameId) ?? null, [results, selectedGameId]);
  const selectedGameDetail = useMemo(
    () => gameDetails.find((d) => d.game_id === selectedGameId) ?? null,
    [gameDetails, selectedGameId],
  );

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
        <p className="mt-2 text-xs text-slate-400 font-mono">
          Run: <code className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5">python3 main.py --fetch-boxscores</code>
        </p>
      </div>
    );
  }

  if (selectedGame) {
    const homeBS = teamBS.find((t) => t.GAME_ID === selectedGame.GAME_ID && t.TEAM_ABBREVIATION === selectedGame.HOME_TEAM_ABBREVIATION) ?? null;
    const awayBS = teamBS.find((t) => t.GAME_ID === selectedGame.GAME_ID && t.TEAM_ABBREVIATION === selectedGame.AWAY_TEAM_ABBREVIATION) ?? null;
    const gamePlayers = playerBS.filter((p) => p.GAME_ID === selectedGame.GAME_ID);
    const homePlayers = playerTeamFilter(gamePlayers, selectedGame.HOME_TEAM_ABBREVIATION);
    const awayPlayers = playerTeamFilter(gamePlayers, selectedGame.AWAY_TEAM_ABBREVIATION);

    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedGameId(null)}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
        >
          <ArrowLeftRight size={11} />
          Back to games
        </button>
        <GameCardDetail
          game={selectedGame}
          gameDetail={selectedGameDetail}
          homeBS={homeBS}
          awayBS={awayBS}
          homePlayers={homePlayers}
          awayPlayers={awayPlayers}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_16px_50px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
              <Trophy size={12} className="text-[#1d428a]" />
              Game Results
            </div>
            <h1 className="text-4xl font-black uppercase tracking-tight text-slate-900 sm:text-5xl" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Scores, box scores, and game context
            </h1>
            <p className="max-w-3xl text-sm leading-relaxed text-slate-500">
              Final scores, team-level edges, and player logs rendered in a clean hierarchy.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedDate(uniqueDates[selectedDateIndex + 1] ?? selectedDate)}
              disabled={selectedDateIndex >= uniqueDates.length - 1}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronDown size={11} className="rotate-90" />
              Prev day
            </button>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
              {selectedDate ? fmtShortDate(selectedDate) : "No date selected"}
            </div>
            <button
              onClick={() => setSelectedDate(uniqueDates[selectedDateIndex - 1] ?? selectedDate)}
              disabled={selectedDateIndex <= 0}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Next day
              <ChevronDown size={11} className="-rotate-90" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
              {selectedDateGames.length} games
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
              {uniqueDates.length} days
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">List</p>
            <p className="text-sm font-semibold text-slate-700">{selectedDate ? fmtShortDate(selectedDate) : "Select a day"} · {selectedDateGames.length} games</p>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search team or game id"
            className="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#1d428a] focus:ring-2 focus:ring-[#1d428a]/10 sm:w-72"
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {selectedDateGames.map((game) => (
          <GameCard key={game.GAME_ID} game={game} onOpen={() => setSelectedGameId(game.GAME_ID)} />
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <p>{selectedDate ? `${selectedDateGames.length} games on ${fmtShortDate(selectedDate)}` : "No games selected"}</p>
        <p>{uniqueDates.length} total days</p>
      </div>
    </div>
  );
}