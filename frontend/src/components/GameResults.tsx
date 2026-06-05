import { useEffect, useState, useMemo } from "react";
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

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const fmtPct = (v: number | null) => (v != null ? `${(v * 100).toFixed(1)}%` : "—");
const fmtNum = (v: number | null) => (v != null ? v.toFixed(1) : "—");
const fmtInt = (v: number | null) => (v != null ? Math.round(v).toString() : "—");

const seasonMeta = (type: string) => {
  if (type === "Playoffs")       return { badge: "badge-playoff", card: "card-playoff" };
  if (type === "PlayIn")         return { badge: "badge-playin",  card: "glass" };
  return { badge: "badge-regular", card: "glass" };
};

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

/** Team stats comparison table inside expanded card */
function TeamStatsTable({ home, away }: { home: TeamBoxScore | null; away: TeamBoxScore | null }) {
  if (!home || !away) return (
    <p className="text-xs text-slate-600 text-center py-2">Team stats not loaded yet</p>
  );

  const rows: { label: string; hVal: string; aVal: string; hBetter?: boolean }[] = [
    { label: "FG%",    hVal: fmtPct(home.FG_PCT),  aVal: fmtPct(away.FG_PCT),  hBetter: (home.FG_PCT ?? 0) > (away.FG_PCT ?? 0) },
    { label: "3PT%",   hVal: fmtPct(home.FG3_PCT), aVal: fmtPct(away.FG3_PCT), hBetter: (home.FG3_PCT ?? 0) > (away.FG3_PCT ?? 0) },
    { label: "FT%",    hVal: fmtPct(home.FT_PCT),  aVal: fmtPct(away.FT_PCT),  hBetter: (home.FT_PCT ?? 0) > (away.FT_PCT ?? 0) },
    { label: "REB",    hVal: fmtInt(home.REB),     aVal: fmtInt(away.REB),     hBetter: (home.REB ?? 0) > (away.REB ?? 0) },
    { label: "AST",    hVal: fmtInt(home.AST),     aVal: fmtInt(away.AST),     hBetter: (home.AST ?? 0) > (away.AST ?? 0) },
    { label: "STL",    hVal: fmtInt(home.STL),     aVal: fmtInt(away.STL),     hBetter: (home.STL ?? 0) > (away.STL ?? 0) },
    { label: "BLK",    hVal: fmtInt(home.BLK),     aVal: fmtInt(away.BLK),     hBetter: (home.BLK ?? 0) > (away.BLK ?? 0) },
    { label: "TOV",    hVal: fmtInt(home.TOV),     aVal: fmtInt(away.TOV),     hBetter: (home.TOV ?? 0) < (away.TOV ?? 0) },
    { label: "+/-",    hVal: fmtNum(home.PLUS_MINUS), aVal: fmtNum(away.PLUS_MINUS) },
  ];

  return (
    <table className="w-full text-xs">
      <thead>
        <tr>
          <th className="text-right pb-2 pr-3 text-[9px] font-black text-sky-400 uppercase tracking-widest w-[38%]">
            {home.TEAM_ABBREVIATION}
          </th>
          <th className="pb-2 text-center text-[9px] font-semibold text-slate-700 w-[24%]" />
          <th className="text-left pb-2 pl-3 text-[9px] font-black text-amber-400 uppercase tracking-widest w-[38%]">
            {away.TEAM_ABBREVIATION}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ label, hVal, aVal, hBetter }) => (
          <tr key={label} className="border-b border-white/[0.04] last:border-0">
            <td className={`stat-cell text-right pr-3 ${hBetter === true ? "text-sky-300 font-black" : hBetter === false ? "text-slate-600" : "text-slate-300"}`}>
              {hVal}
            </td>
            <td className="stat-cell text-center text-[9px] text-slate-600 font-semibold uppercase tracking-wider">
              {label}
            </td>
            <td className={`stat-cell text-left pl-3 ${hBetter === false ? "text-amber-300 font-black" : hBetter === true ? "text-slate-600" : "text-slate-300"}`}>
              {aVal}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Scrollable player box score table */
function PlayerTable({ players }: { players: PlayerBoxScore[] }) {
  if (players.length === 0) return (
    <p className="text-xs text-slate-600 text-center py-3">No player data available for this game</p>
  );

  // Sort by team, then by PTS desc
  const sorted = [...players].sort((a, b) => {
    if (a.TEAM_ABBREVIATION !== b.TEAM_ABBREVIATION)
      return a.TEAM_ABBREVIATION.localeCompare(b.TEAM_ABBREVIATION);
    return (b.PTS ?? 0) - (a.PTS ?? 0);
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs whitespace-nowrap">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {["Team", "Player", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV", "FG%", "3P%", "FT%", "+/-"].map(h => (
              <th key={h} className="px-2 py-1.5 text-left text-[9px] font-black text-slate-600 uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr key={`${p.PLAYER_ID}-${i}`} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
              <td className="px-2 py-1.5 font-bold text-sky-400">{p.TEAM_ABBREVIATION}</td>
              <td className="px-2 py-1.5 text-slate-200 font-semibold max-w-[140px] truncate">{p.PLAYER_NAME}</td>
              <td className="px-2 py-1.5 text-slate-400">{p.MIN != null ? Math.round(p.MIN) : "—"}</td>
              <td className={`px-2 py-1.5 font-black ${(p.PTS ?? 0) >= 25 ? "text-amber-300" : (p.PTS ?? 0) >= 15 ? "text-white" : "text-slate-300"}`}>
                {fmtInt(p.PTS)}
              </td>
              <td className="px-2 py-1.5 text-slate-300">{fmtInt(p.REB)}</td>
              <td className="px-2 py-1.5 text-slate-300">{fmtInt(p.AST)}</td>
              <td className="px-2 py-1.5 text-slate-400">{fmtInt(p.STL)}</td>
              <td className="px-2 py-1.5 text-slate-400">{fmtInt(p.BLK)}</td>
              <td className="px-2 py-1.5 text-slate-400">{fmtInt(p.TOV)}</td>
              <td className="px-2 py-1.5 text-slate-400">{fmtPct(p.FG_PCT)}</td>
              <td className="px-2 py-1.5 text-slate-400">{fmtPct(p.FG3_PCT)}</td>
              <td className="px-2 py-1.5 text-slate-400">{fmtPct(p.FT_PCT)}</td>
              <td className={`px-2 py-1.5 font-bold ${(p.PLUS_MINUS ?? 0) > 0 ? "text-emerald-400" : (p.PLUS_MINUS ?? 0) < 0 ? "text-rose-400" : "text-slate-500"}`}>
                {p.PLUS_MINUS != null ? (p.PLUS_MINUS > 0 ? `+${p.PLUS_MINUS}` : p.PLUS_MINUS) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Single game result row/card */
function GameCard({
  game,
  teamBoxScores,
  playerBoxScores,
  index,
}: {
  game: GameResult;
  teamBoxScores: TeamBoxScore[];
  playerBoxScores: PlayerBoxScore[];
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);

  const meta = seasonMeta(game.SEASON_TYPE);
  const margin = Math.abs(game.HOME_SCORE - game.AWAY_SCORE);
  const homeWon = game.WINNER_TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION;

  // Find team box scores for this game
  const homeBS = teamBoxScores.find(t => t.GAME_ID === game.GAME_ID && t.TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION) ?? null;
  const awayBS = teamBoxScores.find(t => t.GAME_ID === game.GAME_ID && t.TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION) ?? null;
  const gamePlayers = playerBoxScores.filter(p => p.GAME_ID === game.GAME_ID);

  const staggerClass = `stagger-${Math.min((index % 6) + 1, 6)}`;

  return (
    <div className={`animate-fade-in-up ${staggerClass} ${meta.card} rounded-xl overflow-hidden transition-all duration-300`}>
      {/* Compact header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Date */}
        <div className="w-20 flex-shrink-0 text-center">
          <p className="text-[9px] font-bold text-slate-700 uppercase tracking-widest leading-none">
            {new Date(game.GAME_DATE + "T12:00:00").toLocaleDateString("en-US", { month: "short" })}
          </p>
          <p className="text-lg font-black text-slate-400 leading-tight" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            {new Date(game.GAME_DATE + "T12:00:00").getDate()}
          </p>
        </div>

        {/* Away team */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className={game.WINNER_TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION ? "team-ring-playoff" : "team-ring"
            } style={{ width: 36, height: 36, fontSize: 11 }}>
            {game.AWAY_TEAM_ABBREVIATION}
          </div>
          <span className="text-sm font-black text-slate-200 truncate" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            {game.AWAY_TEAM_ABBREVIATION}
          </span>
        </div>

        {/* Score */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-2xl font-black tabular-nums ${!homeWon ? "text-white" : "text-slate-500"}`}
            style={{ fontFamily: "'Barlow Condensed', sans-serif", minWidth: 32, textAlign: "right" }}>
            {game.AWAY_SCORE}
          </span>
          <span className="text-slate-700 font-black text-sm">–</span>
          <span className={`text-2xl font-black tabular-nums ${homeWon ? "text-white" : "text-slate-500"}`}
            style={{ fontFamily: "'Barlow Condensed', sans-serif", minWidth: 32 }}>
            {game.HOME_SCORE}
          </span>
        </div>

        {/* Home team */}
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-row-reverse">
          <div className={game.WINNER_TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION ? "team-ring-playoff" : "team-ring"
            } style={{ width: 36, height: 36, fontSize: 11 }}>
            {game.HOME_TEAM_ABBREVIATION}
          </div>
          <span className="text-sm font-black text-slate-200 truncate text-right" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            {game.HOME_TEAM_ABBREVIATION}
          </span>
        </div>

        {/* Right meta */}
        <div className="flex-shrink-0 flex flex-col items-end gap-1 w-28">
          <span className={meta.badge}>{game.SEASON_TYPE === "Regular Season" ? "Regular" : game.SEASON_TYPE}</span>
          {game.SERIES_GAME_NUMBER != null && (
            <span className="text-[8px] text-slate-600 font-semibold">Gm {game.SERIES_GAME_NUMBER}</span>
          )}
          {margin <= 3 && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
              ±{margin} CLOSE
            </span>
          )}
        </div>

        {/* Expand toggle */}
        <button className="text-slate-700 hover:text-slate-400 transition-colors flex-shrink-0">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-t border-white/[0.04] px-4 pb-4 pt-3 space-y-4">
          {/* Tab controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPlayers(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${!showPlayers ? "bg-sky-500/15 text-sky-400 border border-sky-500/25" : "text-slate-600 hover:text-slate-400"}`}
            >
              <BarChart2 size={11} /> Team Stats
            </button>
            <button
              onClick={() => setShowPlayers(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${showPlayers ? "bg-sky-500/15 text-sky-400 border border-sky-500/25" : "text-slate-600 hover:text-slate-400"}`}
            >
              <Users size={11} /> Players ({gamePlayers.length})
            </button>
            {game.IS_ELIMINATION_GAME && (
              <span className="ml-auto text-[9px] font-black px-2 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                ⚠️ ELIM GAME
              </span>
            )}
          </div>

          {!showPlayers ? (
            <TeamStatsTable home={homeBS} away={awayBS} />
          ) : (
            <PlayerTable players={gamePlayers} />
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

export default function GameResults() {
  const [results, setResults]           = useState<GameResult[]>([]);
  const [teamBS, setTeamBS]             = useState<TeamBoxScore[]>([]);
  const [playerBS, setPlayerBS]         = useState<PlayerBoxScore[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const [filter, setFilter]             = useState<SeasonFilter>("ALL");
  const [search, setSearch]             = useState("");
  const [sortDesc, setSortDesc]         = useState(true);
  const [page, setPage]                 = useState(1);

  useEffect(() => {
    Promise.all([
      fetch("/data/game_results.json").then(r => r.json()),
      fetch("/data/team_boxscores.json").then(r => r.json()),
      fetch("/data/player_boxscores.json").then(r => r.json()),
    ])
      .then(([r, t, p]) => { setResults(r); setTeamBS(t); setPlayerBS(p); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    let g = results;
    if (filter !== "ALL") g = g.filter(x => x.SEASON_TYPE === filter);
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      g = g.filter(x => x.HOME_TEAM_ABBREVIATION.includes(q) || x.AWAY_TEAM_ABBREVIATION.includes(q));
    }
    return sortDesc
      ? [...g].sort((a, b) => b.GAME_DATE.localeCompare(a.GAME_DATE))
      : [...g].sort((a, b) => a.GAME_DATE.localeCompare(b.GAME_DATE));
  }, [results, filter, search, sortDesc]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageGames  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(() => ({
    total:   results.length,
    regular: results.filter(g => g.SEASON_TYPE === "Regular Season").length,
    playin:  results.filter(g => g.SEASON_TYPE === "PlayIn").length,
    playoff: results.filter(g => g.SEASON_TYPE === "Playoffs").length,
    close:   results.filter(g => Math.abs(g.HOME_SCORE - g.AWAY_SCORE) <= 3).length,
  }), [results]);

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
      <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Loading Results...</span>
    </div>
  );

  if (error) return (
    <div className="text-center py-16">
      <AlertTriangle size={32} className="mx-auto text-rose-400 mb-3" />
      <p className="text-sm font-bold text-rose-300">{error}</p>
      <p className="text-xs text-slate-500 mt-2">
        Run: <code className="bg-slate-900 px-2 py-0.5 rounded font-mono">python3 main.py --fetch-boxscores</code>
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
      {/* Ambient glow */}
      <div className="glow-bg absolute -top-20 left-1/3 pointer-events-none" />

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-1">
          <Trophy size={22} className="text-amber-400" />
          <h1 className="text-3xl font-black text-white tracking-tight" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Game Results & Box Scores
          </h1>
        </div>
        <p className="text-sm text-slate-500">2025-26 NBA Season · Final scores, team stats, player logs</p>
      </div>

      {/* ── Stat pills ───────────────────────────────────────── */}
      <div className="relative z-10 flex flex-wrap gap-2">
        {[
          { label: "Completed Games", value: stats.total.toLocaleString(), color: "text-slate-300" },
          { label: "Regular Season",  value: stats.regular,                color: "text-slate-400" },
          { label: "Play-In",         value: stats.playin,                 color: "text-violet-400" },
          { label: "Playoffs",        value: stats.playoff,                color: "text-sky-400" },
          { label: "Close Games (≤3pt)",value: stats.close,               color: "text-amber-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold">
            <span className="text-slate-600">{label}</span>
            <span className={color}>{value}</span>
          </div>
        ))}
      </div>

      {/* ── Controls ─────────────────────────────────────────── */}
      <div className="relative z-10 space-y-3">
        {/* Filter pills */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => { setFilter(key); setPage(1); }}
              className={`filter-pill ${filter === key ? "filter-pill-active" : ""}`}
            >
              {label} <span className="opacity-50 ml-1">{count}</span>
            </button>
          ))}
        </div>

        {/* Search + sort */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              type="text"
              placeholder="Team (e.g. BOS)"
              value={search}
              onChange={e => { setSearch(e.target.value.toUpperCase()); setPage(1); }}
              className="pl-8 pr-3 py-1.5 rounded-lg glass text-xs text-slate-300 placeholder-slate-600 focus:outline-none w-36"
            />
          </div>
          <button
            onClick={() => { setSortDesc(!sortDesc); setPage(1); }}
            className="glass flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-500 hover:text-slate-300 transition-colors"
          >
            {sortDesc ? <SortDesc size={10} /> : <SortAsc size={10} />}
            {sortDesc ? "Newest First" : "Oldest First"}
          </button>
          <span className="text-[10px] text-slate-700 font-semibold ml-auto">
            {filtered.length.toLocaleString()} games · Click a row to expand stats
          </span>
        </div>
      </div>

      {/* ── Game list ────────────────────────────────────────── */}
      <div className="relative z-10 space-y-1.5">
        {pageGames.length === 0 ? (
          <div className="text-center py-16">
            <Search size={32} className="mx-auto text-slate-700 mb-3 opacity-30" />
            <p className="text-sm font-bold text-slate-600">No results found</p>
          </div>
        ) : (
          pageGames.map((game, i) => (
            <GameCard
              key={game.GAME_ID}
              game={game}
              teamBoxScores={teamBS}
              playerBoxScores={playerBS}
              index={i}
            />
          ))
        )}
      </div>

      {/* ── Pagination ───────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="relative z-10 flex items-center justify-between pt-2">
          <p className="text-[10px] text-slate-600 font-semibold">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg glass text-xs font-bold text-slate-500 disabled:opacity-30 hover:text-slate-300 transition-colors"
            >← Prev</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
              if (p < 1 || p > totalPages) return null;
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${p === page ? "bg-sky-500/20 text-sky-400 border border-sky-500/30" : "glass text-slate-600 hover:text-slate-300"}`}>
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg glass text-xs font-bold text-slate-500 disabled:opacity-30 hover:text-slate-300 transition-colors"
            >Next →</button>
          </div>
        </div>
      )}

      {/* Data provenance note */}
      <div className="relative z-10 rounded-xl glass px-5 py-3 text-[9px] text-slate-600 font-mono space-y-0.5">
        <p className="text-slate-500 font-bold text-xs not-italic">Data Sources</p>
        <p>Results: <code>data/processed/game_results_2025_26.csv</code></p>
        <p>Team stats: <code>data/raw/boxscores/team/nba_team_boxscores_2025_26.csv</code> (last 2,000 rows exposed)</p>
        <p>Player stats: <code>data/raw/boxscores/player/nba_player_boxscores_2025_26.csv</code> (last 3,000 rows exposed)</p>
      </div>
    </div>
  );
}
