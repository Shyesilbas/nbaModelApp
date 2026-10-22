import { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft,
  Star,
  Search,
  ChevronUp,
  ChevronDown,
  MapPin,
  Calendar,
  Sparkles,
  ListOrdered,
  Users,
  BarChart3,
  Flame,
} from "lucide-react";
import TeamLogo from "./TeamLogo";
import PlayerPhoto from "./PlayerPhoto";
import { loadArchivedPlayByPlay, loadArchivedGameBoxscores } from "../lib/archiveData";
import { parseMinutes, sortPlayersByMinutes, fmtPair, fmtPct, fmtInt, teamFull } from "./game-results/utils";
import { getTeamShortName } from "../lib/nbaTeams";
import type { GameDetail } from "../types/gameFeed";

/* ── Data Interfaces ── */
export interface TBS {
  GAME_ID: string;
  TEAM_ABBREVIATION: string;
  TEAM_NAME?: string | null;
  PTS?: number | null;
  REB?: number | null;
  AST?: number | null;
  STL?: number | null;
  BLK?: number | null;
  TOV?: number | null;
  FG_PCT?: number | null;
  FG3_PCT?: number | null;
  FT_PCT?: number | null;
  FGM?: number | null;
  FGA?: number | null;
  FG3M?: number | null;
  FG3A?: number | null;
  FTM?: number | null;
  FTA?: number | null;
  PLUS_MINUS?: number | null;
}

export interface PBS {
  GAME_ID: string;
  PLAYER_ID: number;
  PLAYER_NAME: string;
  TEAM_ABBREVIATION: string;
  MIN?: number | string | null;
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
  START_POSITION?: string | null;
  IS_STARTER?: number | null;
}

export interface GameRow {
  GAME_ID: string;
  GAME_DATE: string;
  HOME_TEAM_ABBREVIATION: string;
  AWAY_TEAM_ABBREVIATION: string;
  HOME_TEAM_NAME?: string | null;
  AWAY_TEAM_NAME?: string | null;
  HOME_SCORE?: number | null;
  AWAY_SCORE?: number | null;
  WINNER_TEAM_ABBREVIATION?: string | null;
  SEASON?: string;
  SEASON_TYPE?: string | null;
  IS_PLAYOFF?: boolean | number | null;
  MATCHUP?: string;
  WL?: string | null;
  ARENA?: string | null;
  LOCATION?: string | null;
}

export interface PbpEvent {
  period: number;
  clock: string;
  action_type: string;
  sub_type: string;
  team: string | null;
  player_name: string | null;
  description: string;
  score_home: number;
  score_away: number;
  points_scored: number;
  badges?: string[];
  moment_reasons?: string[];
}

export interface PbpData {
  game_id: string;
  home_team: string;
  away_team: string;
  quarter_scores: {
    quarter: string;
    home: number;
    away: number;
    home_total: number;
    away_total: number;
  }[];
  events: PbpEvent[];
}

interface GameDetailPanelProps {
  game: GameRow;
  season: string;
  highlightPlayerId?: number;
  onBack: () => void;
}

/* ── Helpers ── */
const normId = (id: string | number): string =>
  String(parseInt(String(id), 10)).padStart(10, "0");

const fmtDateLong = (d: string | null | undefined): string => {
  if (!d) return "";
  const dateObj = new Date(d + "T12:00:00");
  if (isNaN(dateObj.getTime())) return d;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(dateObj);
};

const pmColor = (pm: number | null | undefined): string => {
  if (pm == null) return "text-text-muted";
  if (pm > 0) return "text-status-success font-medium";
  if (pm < 0) return "text-status-error font-medium";
  return "text-text-secondary";
};

const KEY_MOMENT_REASONS = new Set([
  "badge", "clutch", "lead_change", "team_run", "back_to_back_3", "player_3_run",
  "30_pt_game", "20_pt_game", "double_double", "triple_double", "10_ast", "15_reb", "5_stl", "5_blk",
]);

/* ── Interactive Player Box Table ── */
type SortKey = "MIN" | "PTS" | "REB" | "AST" | "STL" | "BLK" | "TOV" | "FG_PCT" | "FG3_PCT" | "FT_PCT" | "PLUS_MINUS" | "PLAYER_NAME";

function PlayerTable({
  players,
  highlightId,
  teamAbbr,
}: {
  players: PBS[];
  highlightId?: number;
  teamAbbr: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("MIN");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [searchQuery, setSearchQuery] = useState("");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "PLAYER_NAME" ? "asc" : "desc");
    }
  };

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return players;
    const q = searchQuery.toLowerCase();
    return players.filter((p) => p.PLAYER_NAME.toLowerCase().includes(q));
  }, [players, searchQuery]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortKey === "MIN") {
        const minA = parseMinutes(a.MIN);
        const minB = parseMinutes(b.MIN);
        if (minB !== minA) return sortDir === "desc" ? minB - minA : minA - minB;
        return (Number(b.PTS) || 0) - (Number(a.PTS) || 0);
      }
      if (sortKey === "PLAYER_NAME") {
        const nameA = a.PLAYER_NAME || "";
        const nameB = b.PLAYER_NAME || "";
        return sortDir === "asc" ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      }
      const valA = Number(a[sortKey]) || 0;
      const valB = Number(b[sortKey]) || 0;
      if (valB !== valA) return sortDir === "desc" ? valB - valA : valA - valB;
      return parseMinutes(b.MIN) - parseMinutes(a.MIN);
    });
  }, [filtered, sortKey, sortDir]);

  // Team summary totals
  const totals = useMemo(() => {
    let pts = 0;
    let reb = 0;
    let ast = 0;
    let stl = 0;
    let blk = 0;
    let tov = 0;
    let fgm = 0;
    let fga = 0;
    let fg3m = 0;
    let fg3a = 0;
    let ftm = 0;
    let fta = 0;

    for (const p of players) {
      pts += Number(p.PTS) || 0;
      reb += Number(p.REB) || 0;
      ast += Number(p.AST) || 0;
      stl += Number(p.STL) || 0;
      blk += Number(p.BLK) || 0;
      tov += Number(p.TOV) || 0;
      fgm += Number(p.FGM) || 0;
      fga += Number(p.FGA) || 0;
      fg3m += Number(p.FG3M) || 0;
      fg3a += Number(p.FG3A) || 0;
      ftm += Number(p.FTM) || 0;
      fta += Number(p.FTA) || 0;
    }

    const fgPct = fga > 0 ? fgm / fga : null;
    const fg3Pct = fg3a > 0 ? fg3m / fg3a : null;
    const ftPct = fta > 0 ? ftm / fta : null;

    return { pts, reb, ast, stl, blk, tov, fgm, fga, fgPct, fg3m, fg3a, fg3Pct, ftm, fta, ftPct };
  }, [players]);

  const renderSortHeader = (label: string, key: SortKey, align = "right") => {
    const isActive = sortKey === key;
    return (
      <th
        onClick={() => handleSort(key)}
        className={`cursor-pointer px-2 py-2 text-${align} text-xs font-medium transition-colors hover:text-text-primary ${
          isActive ? "font-semibold text-text-primary" : "text-text-secondary"
        }`}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {isActive ? (
            sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
          ) : (
            <span className="w-3" />
          )}
        </span>
      </th>
    );
  };

  return (
    <div className="space-y-3">
      {/* Search / Filter toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search player in roster..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded border border-border bg-background-primary py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          {sortKey !== "MIN" && (
            <button
              onClick={() => {
                setSortKey("MIN");
                setSortDir("desc");
              }}
              className="rounded border border-border bg-background-tertiary px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              Reset to minutes
            </button>
          )}
          <span className="text-xs tabular-nums text-text-muted">{sorted.length} players</span>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto rounded border border-border bg-background-primary">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-background-tertiary">
              <th
                onClick={() => handleSort("PLAYER_NAME")}
                className="sticky left-0 cursor-pointer bg-background-tertiary px-3 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:text-text-primary min-w-[170px]"
              >
                <span className="inline-flex items-center gap-1">
                  Player
                  {sortKey === "PLAYER_NAME" && (
                    sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                  )}
                </span>
              </th>
              {renderSortHeader("MIN", "MIN")}
              {renderSortHeader("PTS", "PTS")}
              {renderSortHeader("REB", "REB")}
              {renderSortHeader("AST", "AST")}
              {renderSortHeader("STL", "STL")}
              {renderSortHeader("BLK", "BLK")}
              {renderSortHeader("TOV", "TOV")}
              <th className="px-2 py-2 text-right text-xs font-medium text-text-secondary">FGM-A</th>
              {renderSortHeader("FG%", "FG_PCT")}
              <th className="px-2 py-2 text-right text-xs font-medium text-text-secondary">3PM-A</th>
              {renderSortHeader("3P%", "FG3_PCT")}
              <th className="px-2 py-2 text-right text-xs font-medium text-text-secondary">FTM-A</th>
              {renderSortHeader("FT%", "FT_PCT")}
              {renderSortHeader("+/-", "PLUS_MINUS")}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {sorted.map((p) => {
              const pid = p.PLAYER_ID != null ? Number(p.PLAYER_ID) : null;
              const isHighlight = highlightId != null && pid === highlightId;
              const parsedMin = parseMinutes(p.MIN);
              const isDnp = parsedMin < 0;
              const isStarter = Boolean(p.START_POSITION || p.IS_STARTER === 1);

              return (
                <tr
                  key={p.PLAYER_ID}
                  className={`transition-colors hover:bg-background-tertiary ${
                    isHighlight ? "bg-background-tertiary/70 font-semibold" : ""
                  }`}
                >
                  <td className={`sticky left-0 px-3 py-2 transition-colors ${
                    isHighlight ? "bg-background-tertiary" : "bg-background-primary"
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME} size={30} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className={`truncate text-xs ${isHighlight ? "font-semibold text-text-primary" : "font-medium text-text-primary"}`}>
                            {p.PLAYER_NAME}
                          </p>
                          {isHighlight && (
                            <Star size={12} className="shrink-0 text-text-primary fill-text-primary" />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-text-muted">
                            {p.START_POSITION || (isStarter ? "Starter" : "Bench")}
                          </span>
                          {isHighlight && (
                            <span className="rounded-sm border border-border bg-background-primary px-1.5 py-0.5 text-xs font-medium text-text-secondary">
                              Selected
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-text-muted">
                    {isDnp ? "DNP" : Math.round(parsedMin)}
                  </td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums text-xs text-text-primary">
                    {isDnp ? "—" : fmtInt(p.PTS ?? null)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">
                    {isDnp ? "—" : fmtInt(p.REB ?? null)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">
                    {isDnp ? "—" : fmtInt(p.AST ?? null)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">
                    {isDnp ? "—" : fmtInt(p.STL ?? null)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">
                    {isDnp ? "—" : fmtInt(p.BLK ?? null)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">
                    {isDnp ? "—" : fmtInt(p.TOV ?? null)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-text-muted">
                    {isDnp ? "—" : fmtPair(p.FGM, p.FGA)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">
                    {isDnp ? "—" : fmtPct(p.FG_PCT ?? null)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-text-muted">
                    {isDnp ? "—" : fmtPair(p.FG3M, p.FG3A)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">
                    {isDnp ? "—" : fmtPct(p.FG3_PCT ?? null)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-text-muted">
                    {isDnp ? "—" : fmtPair(p.FTM, p.FTA)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">
                    {isDnp ? "—" : fmtPct(p.FT_PCT ?? null)}
                  </td>
                  <td className={`px-2 py-2 text-right tabular-nums text-xs ${pmColor(p.PLUS_MINUS)}`}>
                    {isDnp || p.PLUS_MINUS == null ? "—" : (p.PLUS_MINUS > 0 ? `+${p.PLUS_MINUS}` : p.PLUS_MINUS)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* Team totals row */}
          <tfoot>
            <tr className="border-t-2 border-border bg-background-tertiary font-semibold text-text-primary">
              <td className="sticky left-0 bg-background-tertiary px-3 py-2 text-xs">
                {teamAbbr} Totals
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-xs text-text-muted">240</td>
              <td className="px-2 py-2 text-right tabular-nums text-xs">{totals.pts}</td>
              <td className="px-2 py-2 text-right tabular-nums text-xs">{totals.reb}</td>
              <td className="px-2 py-2 text-right tabular-nums text-xs">{totals.ast}</td>
              <td className="px-2 py-2 text-right tabular-nums text-xs">{totals.stl}</td>
              <td className="px-2 py-2 text-right tabular-nums text-xs">{totals.blk}</td>
              <td className="px-2 py-2 text-right tabular-nums text-xs">{totals.tov}</td>
              <td className="px-2 py-2 text-right tabular-nums text-xs text-text-muted">{fmtPair(totals.fgm, totals.fga)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-xs">{fmtPct(totals.fgPct)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-xs text-text-muted">{fmtPair(totals.fg3m, totals.fg3a)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-xs">{fmtPct(totals.fg3Pct)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-xs text-text-muted">{fmtPair(totals.ftm, totals.fta)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-xs">{fmtPct(totals.ftPct)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-xs text-text-muted">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ── Comparative Bar Row ── */
function StatBarRow({
  label,
  hVal,
  aVal,
  higherIsBetter = true,
  fmt = fmtInt,
}: {
  label: string;
  hVal: number | null | undefined;
  aVal: number | null | undefined;
  higherIsBetter?: boolean;
  fmt?: (v: number | null) => string;
}) {
  const hv = hVal ?? 0;
  const av = aVal ?? 0;
  const total = hv + av;
  const awayPct = total > 0 ? (av / total) * 100 : 50;

  const awayWins = higherIsBetter ? av > hv : av < hv;
  const homeWins = higherIsBetter ? hv > av : hv < av;
  const isTied = hv === av;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className={`tabular-nums ${awayWins && !isTied ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
          {fmt(aVal ?? null)}
        </span>
        <span className="font-medium text-text-muted">{label}</span>
        <span className={`tabular-nums ${homeWins && !isTied ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
          {fmt(hVal ?? null)}
        </span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-background-tertiary">
        <div
          className={`h-full transition-all duration-300 ${awayWins && !isTied ? "bg-primary" : "bg-border-focus/40"}`}
          style={{ width: `${awayPct}%` }}
        />
        <div
          className={`h-full transition-all duration-300 ${homeWins && !isTied ? "bg-primary" : "bg-border-focus/40"}`}
          style={{ width: `${100 - awayPct}%` }}
        />
      </div>
    </div>
  );
}

/* ── Main Component ── */
export default function GameDetailPanel({
  game,
  season,
  highlightPlayerId,
  onBack,
}: GameDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "players" | "teams" | "highlights" | "pbp">("overview");
  const [playerTeam, setPlayerTeam] = useState<"away" | "home">("away");
  const [gameDetail, setGameDetail] = useState<GameDetail | null>(null);
  const [homeBS, setHomeBS] = useState<TBS | null>(null);
  const [awayBS, setAwayBS] = useState<TBS | null>(null);
  const [homePlayers, setHomePlayers] = useState<PBS[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<PBS[]>([]);
  const [pbpData, setPbpData] = useState<PbpData | null>(null);
  const [loading, setLoading] = useState(true);

  // Play-by-play tab filter state
  const [pbpPeriodFilter, setPbpPeriodFilter] = useState<string>("all");
  const [pbpScoringOnly, setPbpScoringOnly] = useState(false);
  const [pbpSearch, setPbpSearch] = useState("");

  const normGameId = normId(game.GAME_ID);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    Promise.all([
      loadArchivedGameBoxscores(season, game.GAME_ID).catch(() => null),
      loadArchivedPlayByPlay(normGameId, season).catch(() => null),
    ]).then(([boxRes, pbpRes]) => {
      if (!isMounted) return;

      if (boxRes) {
        setGameDetail(boxRes.game_detail ?? null);
        const teams = (boxRes.team_boxscores as TBS[]) || [];
        const filteredTeams = teams.filter((t) => normId(t.GAME_ID) === normGameId);
        setHomeBS(filteredTeams.find((t) => t.TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION) ?? null);
        setAwayBS(filteredTeams.find((t) => t.TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION) ?? null);

        const players = (boxRes.player_boxscores as PBS[]) || [];
        const filteredPlayers = players.filter((p) => normId(p.GAME_ID) === normGameId);
        setHomePlayers(filteredPlayers.filter((p) => p.TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION));
        setAwayPlayers(filteredPlayers.filter((p) => p.TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION));
      }

      if (pbpRes) {
        setPbpData(pbpRes as PbpData);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [normGameId, season, game.GAME_ID, game.HOME_TEAM_ABBREVIATION, game.AWAY_TEAM_ABBREVIATION]);

  // When navigated with highlightPlayerId, switch immediately to player box score and correct team
  useEffect(() => {
    if (!highlightPlayerId || loading) return;
    const inHome = homePlayers.some((p) => Number(p.PLAYER_ID) === highlightPlayerId);
    const inAway = awayPlayers.some((p) => Number(p.PLAYER_ID) === highlightPlayerId);
    if (inHome) {
      setPlayerTeam("home");
      setActiveTab("players");
    } else if (inAway) {
      setPlayerTeam("away");
      setActiveTab("players");
    }
  }, [loading, homePlayers, awayPlayers, highlightPlayerId]);

  const homeScore = game.HOME_SCORE ?? homeBS?.PTS ?? null;
  const awayScore = game.AWAY_SCORE ?? awayBS?.PTS ?? null;
  const margin = homeScore != null && awayScore != null ? Math.abs(homeScore - awayScore) : null;
  const homeWon = game.WINNER_TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION || (homeScore != null && awayScore != null && homeScore > awayScore);
  const awayWon = game.WINNER_TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION || (homeScore != null && awayScore != null && awayScore > homeScore);
  const winnerAbbr = game.WINNER_TEAM_ABBREVIATION ?? (homeWon ? game.HOME_TEAM_ABBREVIATION : awayWon ? game.AWAY_TEAM_ABBREVIATION : null);

  const arenaText = gameDetail?.arena?.name || game.ARENA || null;
  const arenaLocation = [gameDetail?.arena?.city, gameDetail?.arena?.state].filter(Boolean).join(", ") || game.LOCATION || null;

  // Quarter scores list (from PBP or gameDetail)
  const quarterScores = useMemo(() => {
    if (pbpData?.quarter_scores && pbpData.quarter_scores.length > 0) {
      return pbpData.quarter_scores;
    }
    const homeQS = gameDetail?.home_team?.quarter_scores;
    const awayQS = gameDetail?.away_team?.quarter_scores;
    if (Array.isArray(homeQS) && Array.isArray(awayQS) && homeQS.length > 0) {
      return homeQS.map((hScore, idx) => ({
        quarter: idx < 4 ? `Q${idx + 1}` : `OT${idx - 3}`,
        home: hScore,
        away: awayQS[idx] ?? 0,
        home_total: 0,
        away_total: 0,
      }));
    }
    return null;
  }, [pbpData, gameDetail]);

  // Combined top performers
  const topPerformers = useMemo(() => {
    const all = [...homePlayers, ...awayPlayers];
    return sortPlayersByMinutes(all as any[]).sort((a, b) => (Number(b.PTS) || 0) - (Number(a.PTS) || 0)).slice(0, 4);
  }, [homePlayers, awayPlayers]);

  // Category leaders
  const gameLeaders = useMemo(() => {
    const all = [...homePlayers, ...awayPlayers];
    if (all.length === 0) return null;
    const ptsLeader = [...all].sort((a, b) => (Number(b.PTS) || 0) - (Number(a.PTS) || 0))[0];
    const rebLeader = [...all].sort((a, b) => (Number(b.REB) || 0) - (Number(a.REB) || 0))[0];
    const astLeader = [...all].sort((a, b) => (Number(b.AST) || 0) - (Number(a.AST) || 0))[0];
    return { ptsLeader, rebLeader, astLeader };
  }, [homePlayers, awayPlayers]);

  // Curated highlights
  const highlights = useMemo(() => {
    if (!pbpData?.events) return [];
    const curated = pbpData.events.filter((e) =>
      (e.badges?.length ?? 0) > 0 || e.moment_reasons?.some((r) => KEY_MOMENT_REASONS.has(r))
    );
    return curated.length > 0 ? curated : pbpData.events.filter((e) => e.points_scored > 0);
  }, [pbpData]);

  // Play by play filtered list
  const filteredPbpEvents = useMemo(() => {
    if (!pbpData?.events) return [];
    return pbpData.events.filter((e) => {
      if (pbpScoringOnly && e.points_scored <= 0) return false;
      if (pbpPeriodFilter !== "all") {
        if (pbpPeriodFilter === "q1" && e.period !== 1) return false;
        if (pbpPeriodFilter === "q2" && e.period !== 2) return false;
        if (pbpPeriodFilter === "q3" && e.period !== 3) return false;
        if (pbpPeriodFilter === "q4" && e.period !== 4) return false;
        if (pbpPeriodFilter === "ot" && e.period <= 4) return false;
      }
      if (pbpSearch.trim()) {
        const q = pbpSearch.toLowerCase();
        const descMatch = (e.description || "").toLowerCase().includes(q);
        const playerMatch = (e.player_name || "").toLowerCase().includes(q);
        if (!descMatch && !playerMatch) return false;
      }
      return true;
    });
  }, [pbpData, pbpPeriodFilter, pbpScoringOnly, pbpSearch]);

  const highlightedPlayer = useMemo(() => {
    if (!highlightPlayerId) return null;
    return [...homePlayers, ...awayPlayers].find((p) => Number(p.PLAYER_ID) === highlightPlayerId);
  }, [homePlayers, awayPlayers, highlightPlayerId]);

  type TabId = "overview" | "players" | "teams" | "highlights" | "pbp";
  interface TabItem {
    id: TabId;
    label: string;
    icon: typeof BarChart3;
    count?: number;
  }

  const tabs: TabItem[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "players", label: "Box score", icon: Users },
    { id: "teams", label: "Team stats", icon: ListOrdered },
    { id: "highlights", label: "Highlights", icon: Flame, count: highlights.length > 0 ? highlights.length : undefined },
    { id: "pbp", label: "Play-by-play", icon: Sparkles, count: pbpData?.events?.length },
  ];

  return (
    <div className="space-y-4">
      {/* ── Top Action & Context Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded border border-border bg-background-primary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-background-tertiary hover:text-text-primary"
        >
          <ArrowLeft size={13} />
          Back to game log
        </button>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 text-text-secondary">
            <Calendar size={12} className="text-text-muted" />
            {fmtDateLong(game.GAME_DATE)}
          </span>
          {game.IS_PLAYOFF ? (
            <span className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 font-medium text-text-secondary">
              Playoffs
            </span>
          ) : game.SEASON_TYPE ? (
            <span className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 text-text-secondary">
              {game.SEASON_TYPE}
            </span>
          ) : null}
          {arenaText && (
            <span className="inline-flex items-center gap-1 text-text-muted">
              <MapPin size={12} />
              {arenaText}
              {arenaLocation && ` (${arenaLocation})`}
            </span>
          )}
        </div>
      </div>

      {/* ── Scoreboard Banner ── */}
      <div className="rounded border border-border bg-background-primary p-4 sm:p-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
          {/* Away Team */}
          <div className="flex items-center gap-3">
            <TeamLogo
              abbr={game.AWAY_TEAM_ABBREVIATION ?? ""}
              name={game.AWAY_TEAM_NAME ?? ""}
              size={44}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`text-base font-semibold ${awayWon ? "text-text-primary" : "text-text-secondary"}`}>
                  {game.AWAY_TEAM_ABBREVIATION}
                </span>
                <span className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 text-xs font-medium text-text-muted">
                  Away
                </span>
              </div>
              <p className="hidden sm:block truncate text-xs text-text-muted" title={game.AWAY_TEAM_NAME ?? ""}>
                {getTeamShortName(game.AWAY_TEAM_ABBREVIATION, game.AWAY_TEAM_NAME)}
              </p>
            </div>
          </div>

          {/* Match Score & Status */}
          <div className="rounded border border-border bg-background-tertiary px-4 py-2.5 text-center min-w-[130px] sm:min-w-[160px]">
            <span className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-0.5">
              Final
            </span>
            <div className="flex items-baseline justify-center gap-2">
              <span className={`text-2xl sm:text-3xl font-semibold tabular-nums ${awayWon ? "text-text-primary" : "text-text-secondary"}`}>
                {awayScore ?? "—"}
              </span>
              <span className="text-xs text-text-muted">–</span>
              <span className={`text-2xl sm:text-3xl font-semibold tabular-nums ${homeWon ? "text-text-primary" : "text-text-secondary"}`}>
                {homeScore ?? "—"}
              </span>
            </div>
            {winnerAbbr && margin != null && (
              <p className="mt-1 text-xs tabular-nums text-text-secondary">
                {winnerAbbr} +{margin}
              </p>
            )}
          </div>

          {/* Home Team */}
          <div className="flex items-center justify-end gap-3 text-right">
            <div className="min-w-0">
              <div className="flex items-center justify-end gap-1.5">
                <span className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 text-xs font-medium text-text-muted">
                  Home
                </span>
                <span className={`text-base font-semibold ${homeWon ? "text-text-primary" : "text-text-secondary"}`}>
                  {game.HOME_TEAM_ABBREVIATION}
                </span>
              </div>
              <p className="hidden sm:block truncate text-xs text-text-muted" title={game.HOME_TEAM_NAME ?? ""}>
                {getTeamShortName(game.HOME_TEAM_ABBREVIATION, game.HOME_TEAM_NAME)}
              </p>
            </div>
            <TeamLogo
              abbr={game.HOME_TEAM_ABBREVIATION ?? ""}
              name={game.HOME_TEAM_NAME ?? ""}
              size={44}
            />
          </div>
        </div>

        {/* Quarter Line Score Breakdown */}
        {quarterScores && quarterScores.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border-light overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-muted">
                  <th className="pb-1.5 text-left font-medium w-24">Team</th>
                  {quarterScores.map((qs) => (
                    <th key={qs.quarter} className="pb-1.5 text-center font-medium px-2">
                      {qs.quarter}
                    </th>
                  ))}
                  <th className="pb-1.5 text-center font-semibold text-text-primary px-3">T</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light text-text-secondary">
                <tr className={awayWon ? "font-semibold text-text-primary" : ""}>
                  <td className="py-1.5 text-left font-medium">{game.AWAY_TEAM_ABBREVIATION}</td>
                  {quarterScores.map((qs) => (
                    <td key={qs.quarter} className="py-1.5 text-center tabular-nums px-2">
                      {qs.away}
                    </td>
                  ))}
                  <td className="py-1.5 text-center tabular-nums font-semibold px-3 text-text-primary">
                    {awayScore ?? "—"}
                  </td>
                </tr>
                <tr className={homeWon ? "font-semibold text-text-primary" : ""}>
                  <td className="py-1.5 text-left font-medium">{game.HOME_TEAM_ABBREVIATION}</td>
                  {quarterScores.map((qs) => (
                    <td key={qs.quarter} className="py-1.5 text-center tabular-nums px-2">
                      {qs.home}
                    </td>
                  ))}
                  <td className="py-1.5 text-center tabular-nums font-semibold px-3 text-text-primary">
                    {homeScore ?? "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Navigation Tabs ── */}
      <nav aria-label="Game details navigation" className="flex gap-1 border-b border-border bg-background-primary px-2 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? "border-primary text-text-primary font-semibold"
                  : "border-transparent text-text-secondary hover:border-border hover:text-text-primary"
              }`}
            >
              <Icon size={13} className={isActive ? "text-primary" : "text-text-muted"} />
              {tab.label}
              {tab.count != null && (
                <span className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 text-xs tabular-nums text-text-muted">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Skeleton Loading State ── */}
      {loading && (
        <div className="space-y-4">
          <div className="h-28 rounded border border-border bg-background-tertiary animate-pulse" />
          <div className="h-64 rounded border border-border bg-background-tertiary animate-pulse" />
        </div>
      )}

      {/* ── TAB 1: Game Overview ── */}
      {!loading && activeTab === "overview" && (
        <div className="space-y-4">
          {/* Game summary & key takeaways */}
          <div className="rounded border border-border bg-background-primary p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Game summary</h3>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {winnerAbbr ? (
                    <>
                      <span className="font-semibold text-text-primary">{teamFull(winnerAbbr)}</span>
                      <span> {margin != null && margin <= 5 ? "secured a close victory" : "earned the win"} with a final margin of </span>
                      <span className="font-semibold tabular-nums text-text-primary">{margin ?? 0} points</span>.
                    </>
                  ) : "Final game results and match context"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded border border-border bg-background-tertiary px-2.5 py-1 text-xs tabular-nums text-text-secondary">
                  ID: {game.GAME_ID}
                </span>
                <span className="rounded border border-border bg-background-tertiary px-2.5 py-1 text-xs tabular-nums text-text-secondary">
                  Season: {season || game.SEASON}
                </span>
              </div>
            </div>

            {/* Match Leaders */}
            {gameLeaders && (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 pt-3 border-t border-border-light">
                {gameLeaders.ptsLeader && (
                  <div className="rounded border border-border bg-background-primary p-3">
                    <p className="text-xs font-medium text-text-muted">Top scorer</p>
                    <div className="mt-2 flex items-center gap-2.5">
                      <PlayerPhoto
                        playerId={gameLeaders.ptsLeader.PLAYER_ID}
                        name={gameLeaders.ptsLeader.PLAYER_NAME}
                        size={36}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-text-primary">
                          {gameLeaders.ptsLeader.PLAYER_NAME}
                        </p>
                        <p className="text-xs text-text-muted">{gameLeaders.ptsLeader.TEAM_ABBREVIATION}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xl font-semibold tabular-nums text-text-primary">
                      {fmtInt(gameLeaders.ptsLeader.PTS ?? null)}{" "}
                      <span className="text-xs font-normal text-text-secondary">PTS</span>
                    </p>
                  </div>
                )}

                {gameLeaders.rebLeader && (
                  <div className="rounded border border-border bg-background-primary p-3">
                    <p className="text-xs font-medium text-text-muted">Top rebounder</p>
                    <div className="mt-2 flex items-center gap-2.5">
                      <PlayerPhoto
                        playerId={gameLeaders.rebLeader.PLAYER_ID}
                        name={gameLeaders.rebLeader.PLAYER_NAME}
                        size={36}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-text-primary">
                          {gameLeaders.rebLeader.PLAYER_NAME}
                        </p>
                        <p className="text-xs text-text-muted">{gameLeaders.rebLeader.TEAM_ABBREVIATION}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xl font-semibold tabular-nums text-text-primary">
                      {fmtInt(gameLeaders.rebLeader.REB ?? null)}{" "}
                      <span className="text-xs font-normal text-text-secondary">REB</span>
                    </p>
                  </div>
                )}

                {gameLeaders.astLeader && (
                  <div className="rounded border border-border bg-background-primary p-3">
                    <p className="text-xs font-medium text-text-muted">Top assists</p>
                    <div className="mt-2 flex items-center gap-2.5">
                      <PlayerPhoto
                        playerId={gameLeaders.astLeader.PLAYER_ID}
                        name={gameLeaders.astLeader.PLAYER_NAME}
                        size={36}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-text-primary">
                          {gameLeaders.astLeader.PLAYER_NAME}
                        </p>
                        <p className="text-xs text-text-muted">{gameLeaders.astLeader.TEAM_ABBREVIATION}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xl font-semibold tabular-nums text-text-primary">
                      {fmtInt(gameLeaders.astLeader.AST ?? null)}{" "}
                      <span className="text-xs font-normal text-text-secondary">AST</span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Team Comparison Snapshot */}
          {(homeBS || awayBS) && (
            <div className="rounded border border-border bg-background-primary p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between border-b border-border-light pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Key factors</h3>
                  <p className="mt-0.5 text-xs text-text-secondary">Core statistical comparison</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span className="rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-text-secondary">
                    {game.AWAY_TEAM_ABBREVIATION}
                  </span>
                  <span className="text-text-muted">vs</span>
                  <span className="rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-text-secondary">
                    {game.HOME_TEAM_ABBREVIATION}
                  </span>
                </div>
              </div>

              <div className="space-y-3.5">
                <StatBarRow
                  label="Field Goal %"
                  aVal={awayBS?.FG_PCT}
                  hVal={homeBS?.FG_PCT}
                  fmt={fmtPct}
                />
                <StatBarRow
                  label="3-Point %"
                  aVal={awayBS?.FG3_PCT}
                  hVal={homeBS?.FG3_PCT}
                  fmt={fmtPct}
                />
                <StatBarRow
                  label="Free Throw %"
                  aVal={awayBS?.FT_PCT}
                  hVal={homeBS?.FT_PCT}
                  fmt={fmtPct}
                />
                <StatBarRow
                  label="Rebounds"
                  aVal={awayBS?.REB}
                  hVal={homeBS?.REB}
                  fmt={fmtInt}
                />
                <StatBarRow
                  label="Assists"
                  aVal={awayBS?.AST}
                  hVal={homeBS?.AST}
                  fmt={fmtInt}
                />
                <StatBarRow
                  label="Turnovers"
                  aVal={awayBS?.TOV}
                  hVal={homeBS?.TOV}
                  higherIsBetter={false}
                  fmt={fmtInt}
                />
              </div>
            </div>
          )}

          {/* Top Performers Grid */}
          {topPerformers.length > 0 && (
            <div className="rounded border border-border bg-background-primary p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between border-b border-border-light pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Top game performers</h3>
                  <p className="mt-0.5 text-xs text-text-secondary">Highest individual scoring contributors</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {topPerformers.map((p, idx) => (
                  <div
                    key={`${p.PLAYER_ID}-${idx}`}
                    className="flex items-center gap-3 rounded border border-border bg-background-primary p-3 transition-colors hover:border-border-focus"
                  >
                    <span className="w-4 shrink-0 font-mono text-xs tabular-nums text-text-muted">
                      {idx + 1}
                    </span>
                    <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-text-primary">{p.PLAYER_NAME}</p>
                      <p className="text-xs text-text-muted">{p.TEAM_ABBREVIATION}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs tabular-nums">
                        <span className="font-semibold text-text-primary">{fmtInt(p.PTS ?? null)} pts</span>
                        <span className="text-text-secondary">{fmtInt(p.REB ?? null)} reb</span>
                        <span className="text-text-secondary">{fmtInt(p.AST ?? null)} ast</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: Player Box Score ── */}
      {!loading && activeTab === "players" && (
        <div className="space-y-4 rounded border border-border bg-background-primary p-4 sm:p-5">
          {/* Header & Team Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light pb-3">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Player box score</h2>
              <p className="mt-0.5 text-xs text-text-secondary">Sortable individual game statistics</p>
            </div>

            {/* Team Toggle */}
            <div className="flex items-center gap-1 rounded border border-border bg-background-primary p-0.5">
              <button
                type="button"
                onClick={() => setPlayerTeam("away")}
                className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  playerTeam === "away"
                    ? "bg-primary text-white shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <TeamLogo abbr={game.AWAY_TEAM_ABBREVIATION} size={18} />
                <span>{game.AWAY_TEAM_ABBREVIATION}</span>
                {awayScore != null && (
                  <span className="tabular-nums font-semibold">({awayScore})</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setPlayerTeam("home")}
                className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  playerTeam === "home"
                    ? "bg-primary text-white shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <TeamLogo abbr={game.HOME_TEAM_ABBREVIATION} size={18} />
                <span>{game.HOME_TEAM_ABBREVIATION}</span>
                {homeScore != null && (
                  <span className="tabular-nums font-semibold">({homeScore})</span>
                )}
              </button>
            </div>
          </div>

          {/* Highlight notice if navigated for specific player */}
          {highlightedPlayer && (
            <div className="flex items-center gap-2 rounded border border-border bg-background-tertiary px-3 py-2 text-xs text-text-secondary">
              <Star size={13} className="text-primary fill-primary shrink-0" />
              <span>
                Highlighting <strong>{highlightedPlayer.PLAYER_NAME}</strong> ({highlightedPlayer.TEAM_ABBREVIATION})
              </span>
            </div>
          )}

          {/* Player Table for selected team */}
          {(playerTeam === "home" ? homePlayers : awayPlayers).length > 0 ? (
            <PlayerTable
              players={playerTeam === "home" ? homePlayers : awayPlayers}
              highlightId={highlightPlayerId}
              teamAbbr={playerTeam === "home" ? game.HOME_TEAM_ABBREVIATION : game.AWAY_TEAM_ABBREVIATION}
            />
          ) : (
            <div className="rounded border border-border bg-background-tertiary py-8 text-center text-xs text-text-muted">
              Individual box score data is not available for this team.
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: Team Stats ── */}
      {!loading && activeTab === "teams" && (
        <div className="space-y-4">
          {/* Side-by-side comparison bars */}
          <div className="rounded border border-border bg-background-primary p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between border-b border-border-light pb-3">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Team comparison</h3>
                <p className="mt-0.5 text-xs text-text-secondary">Full head-to-head performance metrics</p>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium">
                <span className="rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-text-secondary">
                  {game.AWAY_TEAM_ABBREVIATION}
                </span>
                <span className="text-text-muted">vs</span>
                <span className="rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-text-secondary">
                  {game.HOME_TEAM_ABBREVIATION}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <StatBarRow label="Points (PTS)" aVal={awayBS?.PTS ?? awayScore} hVal={homeBS?.PTS ?? homeScore} fmt={fmtInt} />
              <StatBarRow label="Field Goal % (FG%)" aVal={awayBS?.FG_PCT} hVal={homeBS?.FG_PCT} fmt={fmtPct} />
              <StatBarRow label="3-Point % (3P%)" aVal={awayBS?.FG3_PCT} hVal={homeBS?.FG3_PCT} fmt={fmtPct} />
              <StatBarRow label="Free Throw % (FT%)" aVal={awayBS?.FT_PCT} hVal={homeBS?.FT_PCT} fmt={fmtPct} />
              <StatBarRow label="Total Rebounds (REB)" aVal={awayBS?.REB} hVal={homeBS?.REB} fmt={fmtInt} />
              <StatBarRow label="Assists (AST)" aVal={awayBS?.AST} hVal={homeBS?.AST} fmt={fmtInt} />
              <StatBarRow label="Steals (STL)" aVal={awayBS?.STL} hVal={homeBS?.STL} fmt={fmtInt} />
              <StatBarRow label="Blocks (BLK)" aVal={awayBS?.BLK} hVal={homeBS?.BLK} fmt={fmtInt} />
              <StatBarRow label="Turnovers (TOV)" aVal={awayBS?.TOV} hVal={homeBS?.TOV} higherIsBetter={false} fmt={fmtInt} />
            </div>
          </div>

          {/* Shooting breakdown cards */}
          <div className="rounded border border-border bg-background-primary p-4 sm:p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-text-primary">Shooting efficiency</h3>
              <p className="mt-0.5 text-xs text-text-secondary">Made / attempted and converted percentages</p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded border border-border bg-background-primary p-3">
                <p className="text-xs font-medium text-text-muted">Field Goals</p>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary">{game.AWAY_TEAM_ABBREVIATION}</span>
                    <span className="tabular-nums font-semibold text-text-primary">
                      {fmtPair(awayBS?.FGM, awayBS?.FGA)} ({fmtPct(awayBS?.FG_PCT ?? null)})
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary">{game.HOME_TEAM_ABBREVIATION}</span>
                    <span className="tabular-nums font-semibold text-text-primary">
                      {fmtPair(homeBS?.FGM, homeBS?.FGA)} ({fmtPct(homeBS?.FG_PCT ?? null)})
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded border border-border bg-background-primary p-3">
                <p className="text-xs font-medium text-text-muted">3-Point Field Goals</p>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary">{game.AWAY_TEAM_ABBREVIATION}</span>
                    <span className="tabular-nums font-semibold text-text-primary">
                      {fmtPair(awayBS?.FG3M, awayBS?.FG3A)} ({fmtPct(awayBS?.FG3_PCT ?? null)})
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary">{game.HOME_TEAM_ABBREVIATION}</span>
                    <span className="tabular-nums font-semibold text-text-primary">
                      {fmtPair(homeBS?.FG3M, homeBS?.FG3A)} ({fmtPct(homeBS?.FG3_PCT ?? null)})
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded border border-border bg-background-primary p-3">
                <p className="text-xs font-medium text-text-muted">Free Throws</p>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary">{game.AWAY_TEAM_ABBREVIATION}</span>
                    <span className="tabular-nums font-semibold text-text-primary">
                      {fmtPair(awayBS?.FTM, awayBS?.FTA)} ({fmtPct(awayBS?.FT_PCT ?? null)})
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary">{game.HOME_TEAM_ABBREVIATION}</span>
                    <span className="tabular-nums font-semibold text-text-primary">
                      {fmtPair(homeBS?.FTM, homeBS?.FTA)} ({fmtPct(homeBS?.FT_PCT ?? null)})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: Highlights ── */}
      {!loading && activeTab === "highlights" && (
        <div className="rounded border border-border bg-background-primary p-4 sm:p-5">
          <div className="flex items-end justify-between gap-3 border-b border-border-light pb-3 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Key game highlights</h2>
              <p className="mt-0.5 text-xs text-text-secondary">Lead changes, scoring runs, and critical moments</p>
            </div>
            <span className="text-xs tabular-nums text-text-muted">{highlights.length} moments</span>
          </div>

          <div className="max-h-[600px] overflow-y-auto divide-y divide-border-light">
            {highlights.map((e, idx) => {
              const reasons = [
                ...(e.badges ?? []),
                ...(e.moment_reasons ?? []).filter((r) => KEY_MOMENT_REASONS.has(r) && r !== "badge"),
              ];

              return (
                <div
                  key={`hl-${e.period}-${e.clock}-${idx}`}
                  className="grid grid-cols-[68px_1fr_auto] items-center gap-3 px-2 py-2.5 text-xs first:pt-1 last:pb-1"
                >
                  <div className="text-xs font-medium tabular-nums text-text-muted">
                    Q{e.period} {e.clock}
                  </div>

                  <div className="min-w-0">
                    <p className="m-0 text-xs text-text-primary">
                      {e.player_name && <span className="font-semibold">{e.player_name} · </span>}
                      {e.team && <span className="text-text-muted">{e.team} · </span>}
                      {e.description || e.action_type}
                    </p>
                    {reasons.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {reasons.slice(0, 3).map((r) => (
                          <span
                            key={r}
                            className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 text-xs text-text-secondary capitalize"
                          >
                            {r.replaceAll("_", " ")}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="whitespace-nowrap text-right text-xs font-semibold tabular-nums text-text-primary">
                    {e.score_away} - {e.score_home}
                    {e.points_scored > 0 && (
                      <span className="ml-1 text-xs font-medium text-status-success">
                        +{e.points_scored}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {highlights.length === 0 && (
              <div className="py-8 text-center text-xs text-text-muted">
                No curated highlight moments are available for this game.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 5: Play-by-play ── */}
      {!loading && activeTab === "pbp" && (
        <div className="space-y-4 rounded border border-border bg-background-primary p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border-light pb-3">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Play-by-play timeline</h2>
              <p className="mt-0.5 text-xs text-text-secondary">Chronological play log with quarter filters</p>
            </div>
            <span className="text-xs tabular-nums text-text-muted">{filteredPbpEvents.length} events</span>
          </div>

          {/* Filters Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1">
              {[
                { id: "all", label: "ALL" },
                { id: "q1", label: "Q1" },
                { id: "q2", label: "Q2" },
                { id: "q3", label: "Q3" },
                { id: "q4", label: "Q4" },
                { id: "ot", label: "OT" },
              ].map((q) => (
                <button
                  key={q.id}
                  onClick={() => setPbpPeriodFilter(q.id)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    pbpPeriodFilter === q.id
                      ? "bg-primary text-white"
                      : "border border-border bg-background-primary text-text-secondary hover:bg-background-tertiary"
                  }`}
                >
                  {q.label}
                </button>
              ))}

              <button
                onClick={() => setPbpScoringOnly((prev) => !prev)}
                className={`ml-2 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  pbpScoringOnly
                    ? "bg-primary text-white"
                    : "border border-border bg-background-primary text-text-secondary hover:bg-background-tertiary"
                }`}
              >
                Scoring only
              </button>
            </div>

            <div className="relative w-full sm:w-56">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Filter plays..."
                value={pbpSearch}
                onChange={(e) => setPbpSearch(e.target.value)}
                className="w-full rounded border border-border bg-background-primary py-1 pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none"
              />
            </div>
          </div>

          {/* Event Stream */}
          <div className="max-h-[600px] overflow-y-auto divide-y divide-border-light">
            {filteredPbpEvents.map((e, idx) => (
              <div
                key={`pbp-${e.period}-${e.clock}-${idx}`}
                className="grid grid-cols-[68px_1fr_auto] items-center gap-3 px-2 py-2 text-xs first:pt-1 last:pb-1 transition-colors hover:bg-background-tertiary/40"
              >
                <div className="text-xs font-medium tabular-nums text-text-muted">
                  Q{e.period} {e.clock}
                </div>

                <div className="min-w-0">
                  <p className="m-0 text-xs text-text-primary">
                    {e.player_name && <span className="font-semibold">{e.player_name} · </span>}
                    {e.team && <span className="text-text-muted">{e.team} · </span>}
                    {e.description || e.action_type}
                  </p>
                </div>

                <div className="whitespace-nowrap text-right text-xs font-semibold tabular-nums text-text-primary">
                  {e.score_away} - {e.score_home}
                  {e.points_scored > 0 && (
                    <span className="ml-1 text-xs font-medium text-status-success">
                      +{e.points_scored}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {filteredPbpEvents.length === 0 && (
              <div className="py-8 text-center text-xs text-text-muted">
                {pbpData?.events?.length === 0
                  ? "Play-by-play logs are not available for this game."
                  : "No events match the selected filters."}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
