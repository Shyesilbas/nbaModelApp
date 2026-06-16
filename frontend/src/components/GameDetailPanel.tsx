/**
 * GameDetailPanel
 *
 * Self-contained game box-score detail panel.
 * Loads its own data (team + player boxscores) based on season.
 * Designed to be embedded in PlayerPage when a game row is clicked.
 *
 * GAME_ID normalization: player_season_games uses 8-digit IDs (e.g. "22200002"),
 * boxscore files use 10-digit zero-padded IDs (e.g. "0022200002").
 * We normalize both to 10-digit for matching.
 */

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Users2,
  BarChart3,
  Star,
  Clock,
} from "lucide-react";
import PlayerPhoto from "./PlayerPhoto";
import { loadArchivedGameBoxscores, loadArchivedPlayByPlay } from "../lib/archiveData";
import TeamLogo from "./TeamLogo";

/* ── Types ── */
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
}

interface TBS {
  GAME_ID: string;
  TEAM_ABBREVIATION: string;
  TEAM_NAME?: string | null;
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
  OREB?: number | null;
  DREB?: number | null;
  PLUS_MINUS?: number | null;
}

interface PBS {
  GAME_ID: string;
  PLAYER_ID?: number | string;
  PLAYER_NAME?: string | null;
  TEAM_ABBREVIATION?: string | null;
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
  OREB?: number | null;
  DREB?: number | null;
  PLUS_MINUS?: number | null;
  WL?: string | null;
}

interface GameDetailPanelProps {
  game: GameRow;
  season: string;
  highlightPlayerId?: number;
  onBack: () => void;
}

/* ── Helpers ── */
/** Normalize any GAME_ID to 10-digit zero-padded string for comparison */
const normId = (id: string | number): string =>
  String(parseInt(String(id), 10)).padStart(10, "0");

const fmtN = (v: number | null | undefined, dec = 0) =>
  v != null ? v.toFixed(dec) : "—";

const fmtPct = (v: number | null | undefined) =>
  v != null ? `${(v * 100).toFixed(1)}%` : "—";

const fmtDate = (d: string | null) => {
  if (!d) return "";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const pmClass = (pm: number | null | undefined) => {
  if (pm == null) return "text-slate-400";
  if (pm > 0) return "text-emerald-600 font-bold";
  if (pm < 0) return "text-rose-500 font-bold";
  return "text-slate-500";
};

/* ── Player list for a team ── */
function PlayerTable({
  players,
  highlightId,
}: {
  players: PBS[];
  highlightId?: number;
}) {
  const sorted = [...players].sort((a, b) => (b.MIN ?? 0) - (a.MIN ?? 0));

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50/80">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="sticky left-0 bg-slate-50 px-3 py-2.5 text-left text-[8px] font-black uppercase tracking-[0.24em] text-slate-400 min-w-[160px]">Player</th>
            <th className="px-2 py-2.5 text-right text-[8px] font-black uppercase tracking-[0.24em] text-slate-400">MIN</th>
            <th className="px-2 py-2.5 text-right text-[8px] font-black uppercase tracking-[0.24em] text-slate-400">PTS</th>
            <th className="px-2 py-2.5 text-right text-[8px] font-black uppercase tracking-[0.24em] text-slate-400">REB</th>
            <th className="px-2 py-2.5 text-right text-[8px] font-black uppercase tracking-[0.24em] text-slate-400">AST</th>
            <th className="px-2 py-2.5 text-right text-[8px] font-black uppercase tracking-[0.24em] text-slate-400">STL</th>
            <th className="px-2 py-2.5 text-right text-[8px] font-black uppercase tracking-[0.24em] text-slate-400">BLK</th>
            <th className="px-2 py-2.5 text-right text-[8px] font-black uppercase tracking-[0.24em] text-slate-400">TOV</th>
            <th className="px-2 py-2.5 text-right text-[8px] font-black uppercase tracking-[0.24em] text-slate-400">FG%</th>
            <th className="px-2 py-2.5 text-right text-[8px] font-black uppercase tracking-[0.24em] text-slate-400">3P%</th>
            <th className="px-2 py-2.5 text-right text-[8px] font-black uppercase tracking-[0.24em] text-slate-400">FT%</th>
            <th className="px-2 py-2.5 text-right text-[8px] font-black uppercase tracking-[0.24em] text-slate-400">+/-</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const pid = p.PLAYER_ID != null ? Number(p.PLAYER_ID) : null;
            const isHighlight = highlightId != null && pid === highlightId;
            return (
              <tr
                key={i}
                className={[
                  "border-t border-slate-100 transition-colors",
                  isHighlight
                    ? "bg-[#1d428a]/5 ring-inset ring-1 ring-[#1d428a]/20"
                    : "bg-white hover:bg-slate-50",
                ].join(" ")}
              >
                <td className="sticky left-0 bg-inherit px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <PlayerPhoto playerId={pid ?? 0} name={p.PLAYER_NAME ?? ""} size={24} />
                    <div className="min-w-0">
                      <p className={`truncate text-[11px] font-bold leading-tight ${isHighlight ? "text-[#1d428a]" : "text-slate-800"}`}>
                        {p.PLAYER_NAME ?? "—"}
                        {isHighlight && <Star size={9} className="inline ml-1 mb-0.5 text-[#1d428a]" />}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right font-medium text-slate-500 tabular-nums">{p.MIN != null ? Math.round(p.MIN) : "—"}</td>
                <td className="px-2 py-2.5 text-right font-black text-slate-900 tabular-nums">{fmtN(p.PTS)}</td>
                <td className="px-2 py-2.5 text-right font-medium text-slate-700 tabular-nums">{fmtN(p.REB)}</td>
                <td className="px-2 py-2.5 text-right font-medium text-slate-700 tabular-nums">{fmtN(p.AST)}</td>
                <td className="px-2 py-2.5 text-right font-medium text-slate-600 tabular-nums">{fmtN(p.STL)}</td>
                <td className="px-2 py-2.5 text-right font-medium text-slate-600 tabular-nums">{fmtN(p.BLK)}</td>
                <td className="px-2 py-2.5 text-right font-medium text-slate-600 tabular-nums">{fmtN(p.TOV)}</td>
                <td className="px-2 py-2.5 text-right font-medium text-slate-500 tabular-nums">{fmtPct(p.FG_PCT)}</td>
                <td className="px-2 py-2.5 text-right font-medium text-slate-500 tabular-nums">{fmtPct(p.FG3_PCT)}</td>
                <td className="px-2 py-2.5 text-right font-medium text-slate-500 tabular-nums">{fmtPct(p.FT_PCT)}</td>
                <td className={`px-2 py-2.5 text-right tabular-nums ${pmClass(p.PLUS_MINUS)}`}>
                  {p.PLUS_MINUS != null ? `${p.PLUS_MINUS > 0 ? "+" : ""}${p.PLUS_MINUS}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Team stat chips ── */
function TeamTotals({ tbs, abbr, name, score, won }: {
  tbs: TBS | null;
  abbr: string | null;
  name: string | null;
  score: number | null;
  won: boolean;
}) {
  const stats = [
    { label: "PTS", value: score != null ? String(score) : (tbs?.PTS != null ? fmtN(tbs.PTS) : "—") },
    { label: "REB", value: fmtN(tbs?.REB) },
    { label: "AST", value: fmtN(tbs?.AST) },
    { label: "STL", value: fmtN(tbs?.STL) },
    { label: "BLK", value: fmtN(tbs?.BLK) },
    { label: "TOV", value: fmtN(tbs?.TOV) },
    { label: "FG%", value: fmtPct(tbs?.FG_PCT) },
    { label: "3P%", value: fmtPct(tbs?.FG3_PCT) },
    { label: "FT%", value: fmtPct(tbs?.FT_PCT) },
  ];
  return (
    <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TeamLogo abbr={abbr ?? ""} name={name ?? ""} size={36} />
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">
              {abbr} · {won ? "WIN" : "LOSS"}
            </p>
            <p className="mt-0.5 text-sm font-bold text-slate-800">{name ?? abbr}</p>
          </div>
        </div>
        <p
          className={`text-4xl font-black leading-none ${won ? "text-slate-900" : "text-slate-400"}`}
          style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
        >
          {score ?? "—"}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {stats.map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-2 text-center">
            <p className="text-sm font-black leading-none text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{value}</p>
            <p className="mt-0.5 text-[7px] font-black uppercase tracking-widest text-slate-400">{label}</p>
          </div>
        ))}
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
  const [activeTab, setActiveTab] = useState<"overview" | "home" | "away" | "pbp">("overview");
  const [homeBS, setHomeBS] = useState<TBS | null>(null);
  const [awayBS, setAwayBS] = useState<TBS | null>(null);
  const [homePlayers, setHomePlayers] = useState<PBS[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<PBS[]>([]);
  const [loading, setLoading] = useState(true);

  const normGameId = normId(game.GAME_ID);

  useEffect(() => {
    loadArchivedGameBoxscores(season, game.GAME_ID).then(({ team_boxscores: teamData, player_boxscores: playerData }) => {
      const gameTeams: TBS[] = (teamData as TBS[]).filter(
        (t) => normId(t.GAME_ID) === normGameId
      );
      setHomeBS(
        gameTeams.find((t) => t.TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION) ?? null
      );
      setAwayBS(
        gameTeams.find((t) => t.TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION) ?? null
      );

      const gamePlayers: PBS[] = (playerData as PBS[]).filter(
        (p) => normId(p.GAME_ID) === normGameId
      );
      setHomePlayers(
        gamePlayers.filter((p) => p.TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION)
      );
      setAwayPlayers(
        gamePlayers.filter((p) => p.TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION)
      );
      setLoading(false);
    });
  }, [normGameId, season]);

  // Auto-switch to the highlighted player's team tab
  useEffect(() => {
    if (!highlightPlayerId || loading) return;
    const inHome = homePlayers.some((p) => Number(p.PLAYER_ID) === highlightPlayerId);
    const inAway = awayPlayers.some((p) => Number(p.PLAYER_ID) === highlightPlayerId);
    if (inHome) setActiveTab("home");
    else if (inAway) setActiveTab("away");
  }, [loading, homePlayers, awayPlayers, highlightPlayerId]);

  const homeWon = game.WINNER_TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION;
  const awayWon = game.WINNER_TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION;

  const tabBase =
    "rounded-full px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] transition-all duration-200";
  const tabActive = "bg-[#1d428a] text-white shadow-md shadow-[#1d428a]/25";
  const tabInactive = "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50";

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Back button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
      >
        <ArrowLeft size={11} />
        Back to game log
      </button>

      {/* Header card */}
      <div className="rounded-[1.75rem] border border-slate-100 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)] overflow-hidden">
        <div className="h-2 w-full" style={{ background: "linear-gradient(90deg, #1d428a, #c9082a)" }} />
        <div className="p-5">
          {/* Date + type */}
          <div className="mb-4 flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">
              {fmtDate(game.GAME_DATE)}
            </span>
            {game.IS_PLAYOFF && (
              <span className="rounded-full bg-[#1d428a]/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-[#1d428a]">
                Playoff
              </span>
            )}
            {game.SEASON_TYPE && !game.IS_PLAYOFF && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-slate-500">
                {game.SEASON_TYPE}
              </span>
            )}
          </div>

          {/* Teams + Score */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            {/* Away */}
            <div className="flex items-center gap-3">
              <TeamLogo abbr={game.AWAY_TEAM_ABBREVIATION ?? ""} name={game.AWAY_TEAM_NAME ?? ""} size={48} />
              <div>
                <p className={`text-lg font-black leading-tight ${awayWon ? "text-slate-900" : "text-slate-400"}`}
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {game.AWAY_TEAM_NAME ?? game.AWAY_TEAM_ABBREVIATION}
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Away</p>
              </div>
            </div>

            {/* Score */}
            <div className="text-center">
              <div className="flex items-baseline justify-center gap-2">
                <span className={`text-5xl font-black leading-none ${awayWon ? "text-slate-900" : "text-slate-300"}`}
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {game.AWAY_SCORE ?? "—"}
                </span>
                <span className="text-2xl font-light text-slate-200">–</span>
                <span className={`text-5xl font-black leading-none ${homeWon ? "text-slate-900" : "text-slate-300"}`}
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {game.HOME_SCORE ?? "—"}
                </span>
              </div>
              {game.WINNER_TEAM_ABBREVIATION && (
                <p className="mt-1 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                  {game.WINNER_TEAM_ABBREVIATION} WIN
                  {game.HOME_SCORE != null && game.AWAY_SCORE != null && (
                    <span> · +{Math.abs(game.HOME_SCORE - game.AWAY_SCORE)}</span>
                  )}
                </p>
              )}
            </div>

            {/* Home */}
            <div className="flex items-center justify-end gap-3">
              <div className="text-right">
                <p className={`text-lg font-black leading-tight ${homeWon ? "text-slate-900" : "text-slate-400"}`}
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {game.HOME_TEAM_NAME ?? game.HOME_TEAM_ABBREVIATION}
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Home</p>
              </div>
              <TeamLogo abbr={game.HOME_TEAM_ABBREVIATION ?? ""} name={game.HOME_TEAM_NAME ?? ""} size={48} />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-t border-slate-100 px-5 py-3">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("overview")}
              className={`${tabBase} ${activeTab === "overview" ? tabActive : tabInactive}`}
            >
              <BarChart3 size={9} className="inline mr-1 mb-0.5" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab("home")}
              className={`${tabBase} ${activeTab === "home" ? tabActive : tabInactive}`}
            >
              <Users2 size={9} className="inline mr-1 mb-0.5" />
              {game.HOME_TEAM_ABBREVIATION} · Home
            </button>
            <button
              onClick={() => setActiveTab("away")}
              className={`${tabBase} ${activeTab === "away" ? tabActive : tabInactive}`}
            >
              <Users2 size={9} className="inline mr-1 mb-0.5" />
              {game.AWAY_TEAM_ABBREVIATION} · Away
            </button>
            <button
              onClick={() => setActiveTab("pbp")}
              className={`${tabBase} ${activeTab === "pbp" ? tabActive : tabInactive}`}
            >
              <Clock size={9} className="inline mr-1 mb-0.5" />
              Play-by-Play
            </button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex h-32 items-center justify-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1d428a] border-t-transparent" />
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Loading box scores...
          </span>
        </div>
      )}

      {/* Overview tab */}
      {!loading && activeTab === "overview" && (
        <div className="space-y-3 animate-fade-in">
          <TeamTotals
            tbs={awayBS}
            abbr={game.AWAY_TEAM_ABBREVIATION}
            name={game.AWAY_TEAM_NAME}
            score={game.AWAY_SCORE}
            won={awayWon}
          />
          <TeamTotals
            tbs={homeBS}
            abbr={game.HOME_TEAM_ABBREVIATION}
            name={game.HOME_TEAM_NAME}
            score={game.HOME_SCORE}
            won={homeWon}
          />
        </div>
      )}

      {/* Home box score tab */}
      {!loading && activeTab === "home" && (
        <div className="space-y-3 animate-fade-in">
          <TeamTotals
            tbs={homeBS}
            abbr={game.HOME_TEAM_ABBREVIATION}
            name={game.HOME_TEAM_NAME}
            score={game.HOME_SCORE}
            won={homeWon}
          />
          {homePlayers.length > 0 ? (
            <PlayerTable players={homePlayers} highlightId={highlightPlayerId} />
          ) : (
            <p className="py-8 text-center text-[11px] text-slate-400">No player data available.</p>
          )}
        </div>
      )}

      {/* Away box score tab */}
      {!loading && activeTab === "away" && (
        <div className="space-y-3 animate-fade-in">
          <TeamTotals
            tbs={awayBS}
            abbr={game.AWAY_TEAM_ABBREVIATION}
            name={game.AWAY_TEAM_NAME}
            score={game.AWAY_SCORE}
            won={awayWon}
          />
          {awayPlayers.length > 0 ? (
            <PlayerTable players={awayPlayers} highlightId={highlightPlayerId} />
          ) : (
            <p className="py-8 text-center text-[11px] text-slate-400">No player data available.</p>
          )}
        </div>
      )}
      {/* Play by Play tab */}
      {!loading && activeTab === "pbp" && (
        <PlayByPlayTab
          gameId={game.GAME_ID}
          season={season}
        />
      )}
    </div>
  );
}

/* ── Play By Play Tab Component ── */
interface PbpEvent {
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
}

interface PbpData {
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

function PlayByPlayTab({
  gameId,
  season,
}: {
  gameId: string;
  season: string;
}) {
  const [data, setData] = useState<PbpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "q1" | "q2" | "q3" | "q4" | "scoring">("all");

  useEffect(() => {
    setLoading(true);
    setError(null);
    const normGameId = String(gameId).replace(/\D/g, "").padStart(10, "0");
    loadArchivedPlayByPlay(normGameId, season)
      .then((pbp: PbpData) => {
        setData(pbp);
        setLoading(false);
      })
      .catch((err: any) => {
        setError(err.message || "Failed to load play-by-play.");
        setLoading(false);
      });
  }, [gameId, season]);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center gap-2">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1d428a] border-t-transparent" />
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
          Loading game events...
        </span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center bg-slate-50/50">
        <p className="text-xs font-semibold text-slate-400">
          Play-by-play logs are not available for this game. Run the play-by-play ingestion command to cache detailed events.
        </p>
      </div>
    );
  }

  const filteredEvents = data.events.filter((e) => {
    if (filter === "scoring") return e.points_scored > 0;
    if (filter === "q1") return e.period === 1;
    if (filter === "q2") return e.period === 2;
    if (filter === "q3") return e.period === 3;
    if (filter === "q4") return e.period === 4;
    return true;
  });

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Quarter scores table */}
      <div className="rounded-[1.25rem] border border-slate-100 bg-white p-4 shadow-sm">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">
          Quarter Breakdown
        </p>
        <div className="grid grid-cols-5 gap-2 text-center text-xs font-bold">
          <div className="text-left text-[9px] font-black uppercase tracking-widest text-slate-400 self-center">
            Team
          </div>
          {data.quarter_scores.map((qs) => (
            <div
              key={qs.quarter}
              className="bg-slate-50 rounded-xl py-2 border border-slate-100/50"
            >
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                {qs.quarter}
              </p>
              <p className="text-slate-800 tabular-nums">
                {qs.away} - {qs.home}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Control panel / Filters */}
      <div className="flex flex-wrap gap-1.5">
        {(["all", "q1", "q2", "q3", "q4", "scoring"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={[
              "rounded-full px-3.5 py-1 text-[9px] font-black uppercase tracking-widest transition-all",
              filter === f
                ? "bg-slate-800 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
            ].join(" ")}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Events Log */}
      <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm space-y-3">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
          Game Events Feed
        </p>
        <div className="max-h-[500px] overflow-y-auto space-y-2 pr-2 scrollbar-thin">
          {filteredEvents.map((e, idx) => {
            return (
              <div
                key={idx}
                className={[
                  "grid grid-cols-[75px_1fr_120px] items-center gap-3 py-2 px-3 rounded-xl border transition-colors text-xs",
                  e.points_scored > 0
                    ? "bg-emerald-50/30 border-emerald-100/60"
                    : "bg-slate-50/20 border-slate-100/50 hover:bg-slate-50/40",
                ].join(" ")}
              >
                {/* Time */}
                <div className="font-bold text-slate-400 tabular-nums">
                  Q{e.period} {e.clock}
                </div>

                {/* Description */}
                <div
                  className={[
                    "text-slate-700 leading-snug",
                    e.points_scored > 0 ? "font-bold text-slate-900" : "",
                  ].join(" ")}
                >
                  {e.team && (
                    <span className="font-black text-slate-900 mr-2 uppercase">
                      {e.team}:
                    </span>
                  )}
                  {e.description}
                </div>

                {/* Score */}
                <div className="text-right font-black text-slate-900 tabular-nums">
                  {e.score_away} - {e.score_home}
                  {e.points_scored > 0 && (
                    <span className="ml-1 text-[9px] text-emerald-600 font-black">
                      (+{e.points_scored})
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {filteredEvents.length === 0 && (
            <p className="py-8 text-center text-[11px] text-slate-400">
              No events match the selected filter.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
