import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, Trophy } from "lucide-react";
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
  PF: number | null;
  PLUS_MINUS: number | null;
}

const fmtPct = (v: number | null) => (v != null ? `${(v * 100).toFixed(1)}%` : "—");
const fmtInt = (v: number | null) => (v != null ? Math.round(v).toString() : "—");
const fmtPair = (made: number | null | undefined, att: number | null | undefined) =>
  made != null || att != null ? `${fmtInt(made ?? null)} / ${fmtInt(att ?? null)}` : "—";
const fmtShortDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const fmtDateChip = (d: string) =>
  new Date(`${d}T12:00:00`)
    .toLocaleDateString("en-US", {
      day: "numeric",
      weekday: "short",
    })
    .replace(",", "")
    .toUpperCase();

const playerTeamFilter = (players: PlayerBoxScore[], abbr: string) =>
  players.filter((p) => p.TEAM_ABBREVIATION === abbr);

const teamColor = (abbr: string) => (abbr === "BOS" ? "#1d428a" : abbr === "MIA" ? "#c9082a" : "#334155");

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[12px] font-black uppercase tracking-[0.3em] text-slate-400">{title}</p>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "home" | "away" | "winner" }) {
  const styles =
    tone === "home"
      ? "border-[#1d428a]/15 bg-[#1d428a]/8 text-[#1d428a]"
      : tone === "away"
        ? "border-[#c9082a]/15 bg-[#c9082a]/8 text-[#c9082a]"
        : tone === "winner"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-slate-500";

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] ${styles}`}>
      {children}
    </span>
  );
}

function StatCard({ label, value, sublabel, accent }: { label: string; value: ReactNode; sublabel?: ReactNode; accent?: string }) {
  return (
    <div className="rounded-[20px] bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(15,23,42,0.1)]">
      <p className="text-[12px] font-black uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className="mt-2 text-[42px] font-black leading-none text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: accent }}>
        {value}
      </p>
      {sublabel && <div className="mt-2 text-sm text-slate-500">{sublabel}</div>}
    </div>
  );
}

function ComparisonRow({
  label,
  homeValue,
  awayValue,
  homePct,
  awayPct,
  homeLabel,
  awayLabel,
  homeColor,
  awayColor,
  higherIsBetter = true,
}: {
  label: string;
  homeValue: number | null;
  awayValue: number | null;
  homePct: string;
  awayPct: string;
  homeLabel: string;
  awayLabel: string;
  homeColor: string;
  awayColor: string;
  higherIsBetter?: boolean;
}) {
  const h = homeValue ?? 0;
  const a = awayValue ?? 0;
  const max = Math.max(Math.abs(h), Math.abs(a), 1);
  const homeWinner = higherIsBetter ? h > a : h < a;
  const awayWinner = higherIsBetter ? a > h : a < h;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)] items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-slate-50">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className={`text-sm font-bold ${homeWinner ? "text-slate-900" : "text-slate-500"}`}>{homeLabel}</span>
          <span className="text-sm font-black tabular-nums text-slate-900">{homePct}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(Math.abs(h) / max) * 100}%`, backgroundColor: homeColor }} />
        </div>
      </div>
      <div className="text-center text-[12px] font-black uppercase tracking-[0.24em] text-slate-400">{label}</div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className={`text-sm font-bold ${awayWinner ? "text-slate-900" : "text-slate-500"}`}>{awayLabel}</span>
          <span className="text-sm font-black tabular-nums text-slate-900">{awayPct}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(Math.abs(a) / max) * 100}%`, backgroundColor: awayColor }} />
        </div>
      </div>
    </div>
  );
}

function TeamCompactHeader({
  team,
  score,
  abbr,
  side,
  winner,
}: {
  team: string | null | undefined;
  score: number | null | undefined;
  abbr: string;
  side: "home" | "away";
  winner: boolean;
}) {
  return (
    <div className={`flex items-center gap-4 rounded-[24px] p-5 ${winner ? "bg-slate-900 text-white" : "bg-white text-slate-900"} shadow-[0_12px_30px_rgba(15,23,42,0.08)]`}>
      {side === "away" && <TeamLogo abbr={abbr} name={team} size={64} />}
      <div className="min-w-0 flex-1">
        <p className={`text-[12px] font-black uppercase tracking-[0.28em] ${winner ? "text-white/60" : "text-slate-400"}`}>{side}</p>
        <p className="truncate text-xl font-black uppercase tracking-tight" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
          {team ?? abbr}
        </p>
      </div>
      <div className="text-right">
        <p className="text-[64px] font-black leading-none tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
          {score ?? "—"}
        </p>
      </div>
      {side === "home" && <TeamLogo abbr={abbr} name={team} size={64} />}
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onClick,
}: {
  label: string;
  sortKey: string;
  activeKey: string;
  direction: "asc" | "desc";
  onClick: () => void;
}) {
  const active = activeKey === sortKey;
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.22em] transition ${active ? "bg-slate-900 text-white" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
    >
      {label}
      {active && (direction === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
    </button>
  );
}

function PlayerRow({ p }: { p: PlayerBoxScore }) {
  return (
    <tr className="border-t border-slate-100 transition hover:bg-slate-50/80">
      <td className="sticky left-0 z-10 bg-inherit px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME} size={28} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{p.PLAYER_NAME}</p>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{p.TEAM_ABBREVIATION}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-right text-sm text-slate-500">{p.MIN != null ? Math.round(p.MIN) : "—"}</td>
      <td className="px-4 py-3 text-right text-sm font-black text-slate-900">{fmtInt(p.PTS)}</td>
      <td className="px-4 py-3 text-right text-sm text-slate-500">{fmtPair(p.FGM, p.FGA)}</td>
      <td className="px-4 py-3 text-right text-sm text-slate-500">{fmtPct(p.FG_PCT)}</td>
      <td className="px-4 py-3 text-right text-sm text-slate-500">{fmtPair(p.FG3M, p.FG3A)}</td>
      <td className="px-4 py-3 text-right text-sm text-slate-500">{fmtPct(p.FG3_PCT)}</td>
      <td className="px-4 py-3 text-right text-sm text-slate-500">{fmtPair(p.FTM, p.FTA)}</td>
      <td className="px-4 py-3 text-right text-sm text-slate-500">{fmtPct(p.FT_PCT)}</td>
      <td className="px-4 py-3 text-right text-sm text-slate-500">{fmtInt(p.REB)}</td>
      <td className="px-4 py-3 text-right text-sm text-slate-500">{fmtInt(p.AST)}</td>
      <td className="px-4 py-3 text-right text-sm text-slate-500">{fmtInt(p.TOV)}</td>
      <td className="px-4 py-3 text-right text-sm text-slate-500">{fmtInt(p.PLUS_MINUS)}</td>
    </tr>
  );
}

export default function GameResults() {
  const [results, setResults] = useState<GameFeedRow[]>([]);
  const [teamBS, setTeamBS] = useState<TeamBoxScore[]>([]);
  const [playerBS, setPlayerBS] = useState<PlayerBoxScore[]>([]);
  const [gameDetails, setGameDetails] = useState<GameDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [activeTeam, setActiveTeam] = useState<"home" | "away">("home");
  const [sortKey, setSortKey] = useState<"MIN" | "PTS" | "REB" | "AST" | "TOV" | "PLUS_MINUS">("PTS");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  const filteredResults = useMemo(() => {
    const q = search.trim().toUpperCase();
    const teamQ = teamFilter.trim().toUpperCase();
    return [...results]
      .filter(
        (x) =>
          (!q ||
            x.HOME_TEAM_ABBREVIATION.includes(q) ||
            x.AWAY_TEAM_ABBREVIATION.includes(q) ||
            (x.HOME_TEAM_NAME ?? "").toUpperCase().includes(q) ||
            (x.AWAY_TEAM_NAME ?? "").toUpperCase().includes(q) ||
            x.GAME_ID.includes(q)) &&
          (!teamQ ||
            x.HOME_TEAM_ABBREVIATION.includes(teamQ) ||
            x.AWAY_TEAM_ABBREVIATION.includes(teamQ) ||
            (x.HOME_TEAM_NAME ?? "").toUpperCase().includes(teamQ) ||
            (x.AWAY_TEAM_NAME ?? "").toUpperCase().includes(teamQ)),
      )
      .sort((a, b) => b.GAME_DATE.localeCompare(a.GAME_DATE));
  }, [results, search]);

  const uniqueDates = useMemo(() => Array.from(new Set(filteredResults.map((g) => g.GAME_DATE))).sort((a, b) => b.localeCompare(a)), [filteredResults]);

  useEffect(() => {
    if (!selectedDate && uniqueDates.length) setSelectedDate(uniqueDates[0]);
  }, [selectedDate, uniqueDates]);

  const selectedGame = useMemo(() => results.find((g) => g.GAME_ID === selectedGameId) ?? null, [results, selectedGameId]);
  const selectedGameDetail = useMemo(() => gameDetails.find((d) => d.game_id === selectedGameId) ?? null, [gameDetails, selectedGameId]);
  const selectedIndex = useMemo(() => filteredResults.findIndex((g) => g.GAME_ID === selectedGameId), [filteredResults, selectedGameId]);
  const prevGame = selectedIndex > 0 ? filteredResults[selectedIndex - 1] : null;
  const nextGame = selectedIndex >= 0 && selectedIndex < filteredResults.length - 1 ? filteredResults[selectedIndex + 1] : null;
  const selectedDateIndex = useMemo(() => uniqueDates.indexOf(selectedDate), [uniqueDates, selectedDate]);
  const visibleDates = useMemo(() => {
    if (!uniqueDates.length) return [];
    const count = Math.min(6, uniqueDates.length);
    const currentIndex = selectedDateIndex >= 0 ? selectedDateIndex : 0;
    let start = Math.max(0, currentIndex - 2);
    let end = start + count;
    if (end > uniqueDates.length) {
      end = uniqueDates.length;
      start = Math.max(0, end - count);
    }
    return uniqueDates.slice(start, end);
  }, [selectedDateIndex, uniqueDates]);

  const shiftDate = (delta: -1 | 1) => {
    if (!uniqueDates.length) return;
    const currentIndex = selectedDateIndex >= 0 ? selectedDateIndex : 0;
    const nextIndex = Math.max(0, Math.min(uniqueDates.length - 1, currentIndex + delta));
    setSelectedDate(uniqueDates[nextIndex]);
  };

  useEffect(() => {
    if (selectedGame && selectedGame.GAME_DATE !== selectedDate) {
      setSelectedDate(selectedGame.GAME_DATE);
    }
  }, [selectedGame, selectedDate]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-900 border-t-transparent" />
        <span className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Loading results...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[20px] bg-white p-8 text-center shadow-[0_14px_40px_rgba(15,23,42,0.08)]">
        <AlertTriangle size={30} className="mx-auto mb-3 text-rose-500" />
        <p className="text-sm font-bold text-rose-600">{error}</p>
      </div>
    );
  }

  if (selectedGame) {
    const homeBS = teamBS.find((t) => t.GAME_ID === selectedGame.GAME_ID && t.TEAM_ABBREVIATION === selectedGame.HOME_TEAM_ABBREVIATION) ?? null;
    const awayBS = teamBS.find((t) => t.GAME_ID === selectedGame.GAME_ID && t.TEAM_ABBREVIATION === selectedGame.AWAY_TEAM_ABBREVIATION) ?? null;
    const gamePlayers = playerBS.filter((p) => p.GAME_ID === selectedGame.GAME_ID);
    const homePlayers = playerTeamFilter(gamePlayers, selectedGame.HOME_TEAM_ABBREVIATION);
    const awayPlayers = playerTeamFilter(gamePlayers, selectedGame.AWAY_TEAM_ABBREVIATION);

    const margin = Math.abs((selectedGame.HOME_SCORE ?? 0) - (selectedGame.AWAY_SCORE ?? 0));
    const winnerIsHome = selectedGame.WINNER_TEAM_ABBREVIATION === selectedGame.HOME_TEAM_ABBREVIATION;
    const winnerIsAway = selectedGame.WINNER_TEAM_ABBREVIATION === selectedGame.AWAY_TEAM_ABBREVIATION;
    const seasonType = selectedGame.PLAYOFF_ROUND ? selectedGame.PLAYOFF_ROUND : selectedGame.SEASON_TYPE;
    const heroScoreAway = selectedGameDetail?.away_team?.score ?? selectedGame.AWAY_SCORE;
    const heroScoreHome = selectedGameDetail?.home_team?.score ?? selectedGame.HOME_SCORE;
    const allPlayers = [...homePlayers, ...awayPlayers].sort((a, b) => (b.PTS ?? 0) - (a.PTS ?? 0) || (b.MIN ?? 0) - (a.MIN ?? 0));
    const topPlayers = allPlayers.slice(0, 6);

    const teamStats = [
      { label: "FG", home: homeBS?.FGM ?? null, away: awayBS?.FGM ?? null, homeDisplay: fmtPair(homeBS?.FGM, homeBS?.FGA), awayDisplay: fmtPair(awayBS?.FGM, awayBS?.FGA), high: true },
      { label: "FG%", home: homeBS?.FG_PCT ?? null, away: awayBS?.FG_PCT ?? null, homeDisplay: fmtPct(homeBS?.FG_PCT ?? null), awayDisplay: fmtPct(awayBS?.FG_PCT ?? null), high: true },
      { label: "3PT%", home: homeBS?.FG3_PCT ?? null, away: awayBS?.FG3_PCT ?? null, homeDisplay: fmtPct(homeBS?.FG3_PCT ?? null), awayDisplay: fmtPct(awayBS?.FG3_PCT ?? null), high: true },
      { label: "FT%", home: homeBS?.FT_PCT ?? null, away: awayBS?.FT_PCT ?? null, homeDisplay: fmtPct(homeBS?.FT_PCT ?? null), awayDisplay: fmtPct(awayBS?.FT_PCT ?? null), high: true },
      { label: "REB", home: homeBS?.REB ?? null, away: awayBS?.REB ?? null, homeDisplay: fmtInt(homeBS?.REB ?? null), awayDisplay: fmtInt(awayBS?.REB ?? null), high: true },
      { label: "AST", home: homeBS?.AST ?? null, away: awayBS?.AST ?? null, homeDisplay: fmtInt(homeBS?.AST ?? null), awayDisplay: fmtInt(awayBS?.AST ?? null), high: true },
      { label: "TOV", home: homeBS?.TOV ?? null, away: awayBS?.TOV ?? null, homeDisplay: fmtInt(homeBS?.TOV ?? null), awayDisplay: fmtInt(awayBS?.TOV ?? null), high: false },
    ];

    const gameDate = selectedGameDetail?.game_date ?? selectedGame.GAME_DATE;
    const topScorer = allPlayers[0];
    const mostRebounds = [...allPlayers].sort((a, b) => (b.REB ?? 0) - (a.REB ?? 0))[0];
    const mostAssists = [...allPlayers].sort((a, b) => (b.AST ?? 0) - (a.AST ?? 0))[0];

    const activePlayers = activeTeam === "home" ? homePlayers : awayPlayers;
    const factor = sortDir === "asc" ? 1 : -1;
    const sortedPlayers = [...activePlayers].sort((a, b) => ((a[sortKey] ?? -Infinity) - (b[sortKey] ?? -Infinity)) * factor);

    return (
      <div className="mx-auto max-w-[1280px] space-y-8">
        <button
          onClick={() => setSelectedGameId(null)}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:text-slate-800"
        >
          <ArrowLeft size={12} />
          Back to games
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">Browse</p>
            <p className="truncate text-sm font-semibold text-slate-700">
              {selectedIndex >= 0 ? `Game ${selectedIndex + 1} of ${filteredResults.length}` : "Game navigation"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => prevGame && setSelectedGameId(prevGame.GAME_ID)}
              disabled={!prevGame}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft size={12} />
              Previous
            </button>
            <button
              onClick={() => nextGame && setSelectedGameId(nextGame.GAME_ID)}
              disabled={!nextGame}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ArrowLeft size={12} className="rotate-180" />
            </button>
          </div>
        </div>

        <section className="overflow-hidden rounded-[28px] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.1)]">
          <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:p-8">
            <TeamCompactHeader team={selectedGame.AWAY_TEAM_NAME} score={heroScoreAway} abbr={selectedGame.AWAY_TEAM_ABBREVIATION} side="away" winner={winnerIsAway} />
            <div className="text-center">
              <Badge tone={winnerIsHome || winnerIsAway ? "winner" : "neutral"}>VS</Badge>
              <p className="mt-4 text-[13px] font-black uppercase tracking-[0.28em] text-slate-400">
                {winnerIsHome ? `${selectedGame.HOME_TEAM_ABBREVIATION} won by ${margin}` : winnerIsAway ? `${selectedGame.AWAY_TEAM_ABBREVIATION} won by ${margin}` : "Result unavailable"}
              </p>
              <p className="mt-2 text-sm text-slate-500">{fmtShortDate(gameDate)}</p>
            </div>
            <TeamCompactHeader team={selectedGame.HOME_TEAM_NAME} score={heroScoreHome} abbr={selectedGame.HOME_TEAM_ABBREVIATION} side="home" winner={winnerIsHome} />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-6 py-4 lg:px-8">
            <Badge tone="winner">{selectedGame.WINNER_TEAM_ABBREVIATION ?? "Winner"}</Badge>
            <Badge>{seasonType}</Badge>
            {selectedGame.SEASON_TYPE?.toLowerCase().includes("final") || selectedGame.PLAYOFF_ROUND?.toLowerCase().includes("final") ? <Badge>Playoff / Finals</Badge> : null}
            <Badge>{selectedGame.GAME_STATUS ?? "Final"}</Badge>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Most Points" value={topScorer?.PLAYER_NAME ?? "—"} sublabel={`${fmtInt(topScorer?.PTS ?? null)} PTS`} accent="#0f172a" />
          <StatCard label="Most Rebounds" value={mostRebounds?.PLAYER_NAME ?? "—"} sublabel={`${fmtInt(mostRebounds?.REB ?? null)} REB`} accent="#0f172a" />
          <StatCard label="Most Assists" value={mostAssists?.PLAYER_NAME ?? "—"} sublabel={`${fmtInt(mostAssists?.AST ?? null)} AST`} accent="#0f172a" />
          <StatCard label="Team Efficiency" value={homeBS?.FG_PCT != null && awayBS?.FG_PCT != null ? fmtPct(homeBS.FG_PCT >= awayBS.FG_PCT ? homeBS.FG_PCT : awayBS.FG_PCT) : "—"} sublabel={homeBS?.FG_PCT != null && awayBS?.FG_PCT != null ? (homeBS.FG_PCT >= awayBS.FG_PCT ? selectedGame.HOME_TEAM_ABBREVIATION : selectedGame.AWAY_TEAM_ABBREVIATION) : "FG% leader"} accent="#0f172a" />
        </section>

        <section className="rounded-[28px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <SectionTitle title="Team Comparison" subtitle="Side-by-side efficiency view" />
          <div className="mt-5 space-y-2">
            {teamStats.map((row) => (
              <ComparisonRow
                key={row.label}
                label={row.label}
                homeValue={row.home}
                awayValue={row.away}
                homePct={row.homeDisplay}
                awayPct={row.awayDisplay}
                homeLabel={selectedGame.HOME_TEAM_ABBREVIATION}
                awayLabel={selectedGame.AWAY_TEAM_ABBREVIATION}
                homeColor={teamColor(selectedGame.HOME_TEAM_ABBREVIATION)}
                awayColor={teamColor(selectedGame.AWAY_TEAM_ABBREVIATION)}
                higherIsBetter={row.high}
              />
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <SectionTitle title="Top Performers" subtitle="Six players, maximum" />
          <div className="grid gap-4 xl:grid-cols-2">
            {topPlayers.map((p) => (
              <div key={`${p.PLAYER_ID}-${p.TEAM_ABBREVIATION}`} className="flex items-center gap-4 rounded-[24px] bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.08)] transition duration-200 hover:-translate-y-0.5">
                <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={p.TEAM_ABBREVIATION === selectedGame.HOME_TEAM_ABBREVIATION ? "home" : "away"}>{p.TEAM_ABBREVIATION}</Badge>
                    <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{Math.round(p.MIN ?? 0)} min</span>
                  </div>
                  <p className="mt-2 truncate text-xl font-black text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{p.PLAYER_NAME}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-500">
                    <span><strong className="text-slate-900">{fmtInt(p.PTS)}</strong> PTS</span>
                    <span><strong className="text-slate-900">{fmtInt(p.REB)}</strong> REB</span>
                    <span><strong className="text-slate-900">{fmtInt(p.AST)}</strong> AST</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <button onClick={() => setAdvancedOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left">
            <div>
              <SectionTitle title="View Full Team Statistics" subtitle="Advanced team stats for deeper analysis" />
            </div>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              {advancedOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </span>
          </button>
          {advancedOpen && (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                homeBS?.FGM != null || awayBS?.FGM != null ? ["FG", fmtPair(homeBS?.FGM, homeBS?.FGA), fmtPair(awayBS?.FGM, awayBS?.FGA)] : null,
                homeBS?.FG3M != null || awayBS?.FG3M != null ? ["3PT", fmtPair(homeBS?.FG3M, homeBS?.FG3A), fmtPair(awayBS?.FG3M, awayBS?.FG3A)] : null,
                homeBS?.FTA != null || awayBS?.FTA != null ? ["FTA", fmtInt(homeBS?.FTA ?? null), fmtInt(awayBS?.FTA ?? null)] : null,
                homeBS?.PLUS_MINUS != null || awayBS?.PLUS_MINUS != null ? ["Plus Minus", fmtInt(homeBS?.PLUS_MINUS ?? null), fmtInt(awayBS?.PLUS_MINUS ?? null)] : null,
              ].filter(Boolean).map((item) => {
                const [label, home, away] = item as [string, string, string];
                return (
                <div key={label} className="rounded-[20px] bg-slate-50 p-4">
                  <p className="text-[12px] font-black uppercase tracking-[0.24em] text-slate-400">{label}</p>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{selectedGame.HOME_TEAM_ABBREVIATION}</p>
                      <p className="mt-1 font-semibold text-slate-900">{home as string}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{selectedGame.AWAY_TEAM_ABBREVIATION}</p>
                      <p className="mt-1 font-semibold text-slate-900">{away as string}</p>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-[28px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <SectionTitle title="Box Score" subtitle="Secondary content with compact tables" />
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={() => setActiveTeam("home")} className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] ${activeTeam === "home" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}>{selectedGame.HOME_TEAM_ABBREVIATION} Home Team</button>
            <button onClick={() => setActiveTeam("away")} className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] ${activeTeam === "away" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}>{selectedGame.AWAY_TEAM_ABBREVIATION} Away Team</button>
          </div>
          <div className="mt-5 overflow-hidden rounded-[22px] border border-slate-100">
            <div className="max-h-[720px] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left">
                <thead className="sticky top-0 z-20 bg-white">
                  <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                    <th className="sticky left-0 z-30 bg-white px-4 py-3">Player</th>
                    {[
                      ["MIN", "MIN"],
                      ["PTS", "PTS"],
                      ["FG", "FG"],
                      ["FG%", "FG_PCT"],
                      ["3P", "FG3M"],
                      ["3P%", "FG3_PCT"],
                      ["FT", "FTM"],
                      ["FT%", "FT_PCT"],
                      ["REB", "REB"],
                      ["AST", "AST"],
                      ["TOV", "TOV"],
                      ["+/-", "PLUS_MINUS"],
                    ].map(([label, key]) => (
                      <th key={label} className="px-4 py-3 text-right">
                        <SortableHeader
                          label={label}
                          sortKey={key}
                          activeKey={sortKey}
                          direction={sortDir}
                          onClick={() => {
                            if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                            else {
                              setSortKey(key as typeof sortKey);
                              setSortDir("desc");
                            }
                          }}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((p) => <PlayerRow key={p.PLAYER_ID} p={p} />)}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-8">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
              <Trophy size={12} className="text-[#1d428a]" />
              Game Results
            </div>
            <h1 className="mt-4 text-4xl font-black uppercase tracking-tight text-slate-900 sm:text-5xl" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Premium game intelligence
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Select a game to view its analytics-first details page.
            </p>
          </div>
          <div className="w-full max-w-md">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by team, name, or game ID"
              className="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
            />
            <input
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              placeholder="Filter by team"
              className="mt-3 w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
            />
          </div>
        </div>
      </section>

      {uniqueDates.length > 0 && (
        <section className="rounded-[24px] bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => shiftDate(-1)}
              disabled={selectedDateIndex <= 0}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous dates"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden">
              {visibleDates.map((date) => {
                const active = date === selectedDate || (!selectedDate && date === uniqueDates[0]);
                const [day, dow] = fmtDateChip(date).split(" ");
                const dayGames = filteredResults.filter((g) => g.GAME_DATE === date);
                const logoTeams = dayGames.slice(0, 2).flatMap((g) => [g.AWAY_TEAM_ABBREVIATION, g.HOME_TEAM_ABBREVIATION]);
                return (
                  <button
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className={`min-w-[94px] rounded-2xl px-3 py-2 text-center transition ${active ? "bg-slate-900 text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)]" : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`}
                  >
                    <div className="mb-2 flex items-center justify-center gap-1">
                      {logoTeams.slice(0, 2).map((abbr) => (
                        <TeamLogo key={`${date}-${abbr}`} abbr={abbr} name={abbr} size={16} />
                      ))}
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.28em] opacity-70">{day}</p>
                    <p className="mt-1 text-sm font-black uppercase tracking-[0.22em]">{dow}</p>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => shiftDate(1)}
              disabled={selectedDateIndex >= uniqueDates.length - 1}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next dates"
            >
              <ArrowLeft size={16} className="rotate-180" />
            </button>
          </div>
        </section>
      )}

      <div className="grid gap-4">
        {filteredResults
          .filter((g) => !selectedDate || g.GAME_DATE === selectedDate)
          .map((game) => (
            <button
              key={game.GAME_ID}
              onClick={() => setSelectedGameId(game.GAME_ID)}
            className="rounded-[24px] bg-white p-5 text-left shadow-[0_12px_36px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_48px_rgba(15,23,42,0.1)]"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex items-center gap-2">
                    <TeamLogo abbr={game.AWAY_TEAM_ABBREVIATION} name={game.AWAY_TEAM_NAME} size={34} />
                    <TeamLogo abbr={game.HOME_TEAM_ABBREVIATION} name={game.HOME_TEAM_NAME} size={34} />
                  </div>
                  <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">{fmtShortDate(game.GAME_DATE)}</p>
                  <p className="mt-2 text-xl font-black text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {game.AWAY_TEAM_ABBREVIATION} {game.AWAY_SCORE ?? "—"} - {game.HOME_SCORE ?? "—"} {game.HOME_TEAM_ABBREVIATION}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {game.AWAY_TEAM_NAME ?? game.AWAY_TEAM_ABBREVIATION} at {game.HOME_TEAM_NAME ?? game.HOME_TEAM_ABBREVIATION}
                  </p>
                  </div>
                </div>
                <Badge tone="winner">{game.WINNER_TEAM_ABBREVIATION ?? "Final"}</Badge>
              </div>
            </button>
          ))}
      </div>
    </div>
  );
}
