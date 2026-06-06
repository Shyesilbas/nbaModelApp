import { useEffect, useMemo, useState } from "react";
import {
  Trophy,
  Calendar,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Zap,
  Award,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface ScheduleGame {
  GAME_ID: string;
  GAME_DATE: string;
  HOME_TEAM_ABBREVIATION: string;
  AWAY_TEAM_ABBREVIATION: string;
  HOME_TEAM_NAME: string | null;
  AWAY_TEAM_NAME: string | null;
  SEASON_TYPE: string;
  IS_PLAYOFF: boolean | null;
  GAME_STATUS: string | null;
  PLAYOFF_ROUND: string | null;
  SERIES_GAME_NUMBER: number | null;
  HOME_SERIES_WINS: number | null;
  AWAY_SERIES_WINS: number | null;
  IS_ELIMINATION_GAME: boolean | null;
  CAN_CLINCH_SERIES: boolean | null;
  ARENA?: string | null;
  LOCATION?: string | null;
  HOME_SCORE?: number | null;
  AWAY_SCORE?: number | null;
  WINNER_TEAM_ABBREVIATION?: string | null;
  LOSER_TEAM_ABBREVIATION?: string | null;
  // Context fields (only for upcoming games)
  HOME_TEAM_WINRATE_LAST_5?: number | null;
  HOME_TEAM_WINRATE_LAST_10?: number | null;
  HOME_TEAM_PTS_LAST_5?: number | null;
  HOME_TEAM_PTS_LAST_10?: number | null;
  HOME_TEAM_DAYS_REST?: number | null;
  HOME_TEAM_IS_B2B?: boolean | null;
  AWAY_TEAM_WINRATE_LAST_5?: number | null;
  AWAY_TEAM_WINRATE_LAST_10?: number | null;
  AWAY_TEAM_PTS_LAST_5?: number | null;
  AWAY_TEAM_PTS_LAST_10?: number | null;
  AWAY_TEAM_DAYS_REST?: number | null;
  AWAY_TEAM_IS_B2B?: boolean | null;
  HOME_TOP3_CORE_PLAYERS?: string | null;
  HOME_TOP5_CORE_PLAYERS?: string | null;
  AWAY_TOP3_CORE_PLAYERS?: string | null;
  AWAY_TOP5_CORE_PLAYERS?: string | null;
  _isUpcoming?: boolean;
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
  FG_PCT: number | null;
  FG3_PCT: number | null;
  FT_PCT: number | null;
  PLUS_MINUS: number | null;
  WL: string | null;
}

type Lens = "series" | string;
type TeamSide = "away" | "home";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const fmtDate = (d: string) => {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
};

const fmtInt = (v: number | null | undefined) => (v != null ? Math.round(v).toString() : "—");
const fmtPct = (v: number | null | undefined) => (v != null ? `${(v * 100).toFixed(0)}%` : "—");
const fmtPts = (v: number | null | undefined) => (v != null ? v.toFixed(1) : "—");
const fmtScore = (v: number | null | undefined) => (v != null ? Math.round(v).toString() : "TBD");

const isFinalsGame = (gameId: string, seasonType?: string | null) =>
  gameId.startsWith("00425004") || seasonType === "NBA Finals";

const teamPalette = (abbr: string) => {
  if (abbr === "NYK") {
    return {
      accent: "#1d428a",
      accentSoft: "#f58426",
      bg: "rgba(29, 66, 138, 0.08)",
      border: "rgba(29, 66, 138, 0.22)",
      text: "#1d428a",
    };
  }

  if (abbr === "SAS") {
    return {
      accent: "#111827",
      accentSoft: "#cbd5e1",
      bg: "rgba(17, 24, 39, 0.06)",
      border: "rgba(17, 24, 39, 0.18)",
      text: "#111827",
    };
  }

  return {
    accent: "#334155",
    accentSoft: "#94a3b8",
    bg: "rgba(51, 65, 85, 0.06)",
    border: "rgba(51, 65, 85, 0.16)",
    text: "#334155",
  };
};

const teamName = (abbr: string, fallback?: string | null) => fallback ?? abbr;

const seasonBadge = (game: ScheduleGame) => {
  const completed = game.GAME_STATUS === "Final" || game.HOME_SCORE != null || game.AWAY_SCORE != null;
  if (completed) return <span className="badge-finals">🏆 FINAL</span>;
  if (game._isUpcoming) return <span className="badge-upcoming">🔴 SCHEDULED</span>;
  return <span className="badge-finals">🏆 NBA Finals</span>;
};

const lensLabel = (lens: Lens, teams: { abbr: string; name: string }[]) => {
  if (lens === "series") return "Series";
  return teams.find((t) => t.abbr === lens)?.name ?? lens;
};

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function TeamLensButton({
  label,
  sublabel,
  active,
  accent,
  onClick,
}: {
  label: string;
  sublabel?: string;
  active: boolean;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`min-w-[132px] rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${
        active ? "shadow-lg" : "hover:-translate-y-0.5 hover:shadow-sm"
      }`}
      style={{
        borderColor: active ? accent : "rgba(148, 163, 184, 0.25)",
        background: active ? `linear-gradient(135deg, ${accent}14 0%, #ffffff 100%)` : "#ffffff",
      }}
    >
      <p className="text-[9px] font-black uppercase tracking-[0.28em]" style={{ color: active ? accent : "#94a3b8" }}>
        {active ? "Active Lens" : "Lens"}
      </p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="text-sm font-black text-slate-800">{label}</span>
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: accent, boxShadow: active ? `0 0 0 4px ${accent}20` : "none" }}
        />
      </div>
      {sublabel && <p className="mt-1 text-[11px] leading-snug text-slate-500">{sublabel}</p>}
    </button>
  );
}

function FinalsGameCard({
  game,
  index,
  focusTeam,
  players,
}: {
  game: ScheduleGame;
  index: number;
  focusTeam: string | null;
  players: PlayerBoxScore[];
}) {
  const [expanded, setExpanded] = useState(index < 2);
  const [playerView, setPlayerView] = useState<TeamSide>("home");
  const isCompleted = game.GAME_STATUS === "Final" || game.HOME_SCORE != null || game.AWAY_SCORE != null;
  const gameNumber = game.SERIES_GAME_NUMBER ?? Number(game.GAME_ID.slice(-2));
  const homeName = teamName(game.HOME_TEAM_ABBREVIATION, game.HOME_TEAM_NAME);
  const awayName = teamName(game.AWAY_TEAM_ABBREVIATION, game.AWAY_TEAM_NAME);
  const homePal = teamPalette(game.HOME_TEAM_ABBREVIATION);
  const awayPal = teamPalette(game.AWAY_TEAM_ABBREVIATION);
  const homeFocused = focusTeam === game.HOME_TEAM_ABBREVIATION;
  const awayFocused = focusTeam === game.AWAY_TEAM_ABBREVIATION;
  const winner = game.WINNER_TEAM_ABBREVIATION ?? (isCompleted && game.HOME_SCORE != null && game.AWAY_SCORE != null
    ? (Number(game.HOME_SCORE) > Number(game.AWAY_SCORE) ? game.HOME_TEAM_ABBREVIATION : game.AWAY_TEAM_ABBREVIATION)
    : null);
  const gamePlayers = useMemo(
    () => players.filter((p) => p.GAME_ID === game.GAME_ID),
    [players, game.GAME_ID],
  );
  const homePlayers = useMemo(
    () => gamePlayers.filter((p) => p.TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION),
    [gamePlayers, game.HOME_TEAM_ABBREVIATION],
  );
  const awayPlayers = useMemo(
    () => gamePlayers.filter((p) => p.TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION),
    [gamePlayers, game.AWAY_TEAM_ABBREVIATION],
  );
  const activePlayers = playerView === "home" ? homePlayers : awayPlayers;
  const activeTeam = playerView === "home" ? homeName : awayName;
  const activeTeamAbbr = playerView === "home" ? game.HOME_TEAM_ABBREVIATION : game.AWAY_TEAM_ABBREVIATION;

  const topPlayers = [...activePlayers]
    .sort((a, b) => (b.PTS ?? 0) - (a.PTS ?? 0) || (b.MIN ?? 0) - (a.MIN ?? 0))
    .slice(0, 5);
  const scoreGap = isCompleted && game.HOME_SCORE != null && game.AWAY_SCORE != null ? Math.abs(Number(game.HOME_SCORE) - Number(game.AWAY_SCORE)) : null;

  return (
    <div
      className={`animate-fade-in-up ${index < 6 ? `stagger-${Math.min(index + 1, 6)}` : ""} overflow-hidden rounded-[1.5rem] border shadow-sm transition-all duration-300 ${
        isCompleted ? "card-finals" : "glass"
      }`}
      style={{
        borderColor: isCompleted ? "rgba(234, 179, 8, 0.22)" : "rgba(226, 232, 240, 1)",
        background: isCompleted
          ? "linear-gradient(135deg, #fffdf5 0%, #ffffff 72%)"
          : "linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)",
      }}
    >
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              {seasonBadge(game)}
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                Game {gameNumber}
              </span>
              {game.IS_ELIMINATION_GAME && (
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-rose-700">
                  Elimination
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
              <Calendar size={11} />
              {fmtDate(game.GAME_DATE)}
              <span className="text-slate-300">·</span>
              <span>{game.ARENA ?? game.LOCATION ?? "Venue TBD"}</span>
            </div>
          </div>

          <button
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.26em] text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? "Hide details" : "View details"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 px-5 py-5 lg:grid-cols-[1fr_auto_1fr]">
        <div
          className="rounded-[1.25rem] border p-4 transition-all duration-200"
          style={{
            borderColor: homeFocused ? homePal.border : "rgba(226, 232, 240, 1)",
            background: homeFocused ? homePal.bg : "#ffffff",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Home</p>
              <p className="truncate text-lg font-black text-slate-900" style={{ color: homeFocused ? homePal.text : "#0f172a" }}>
                {homeName}
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                {game.HOME_TEAM_ABBREVIATION}
              </p>
            </div>
            <div className="team-ring" style={{ borderColor: homeFocused ? homePal.border : undefined }}>
              {game.HOME_TEAM_ABBREVIATION}
            </div>
          </div>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div className="flex items-end gap-3">
              <p className="text-5xl font-black leading-none text-slate-900 tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {fmtScore(game.HOME_SCORE)}
              </p>
              <span className="pb-1 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">
                {game.HOME_SERIES_WINS != null ? `${game.HOME_SERIES_WINS} series wins` : "Home"}
              </span>
            </div>
            <div className="h-2 w-14 rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full"
                style={{
                  width: isCompleted && winner === game.HOME_TEAM_ABBREVIATION ? "100%" : "36%",
                  background: homeFocused ? homePal.accent : "#cbd5e1",
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-3 px-2 text-center">
          <div className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] ${isCompleted ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-amber-200 bg-amber-50 text-amber-700"}`}>
            {isCompleted ? "Final" : "Scheduled"}
          </div>
          <div className="text-center">
            <div className="text-3xl font-black tracking-tight text-slate-900 tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              {fmtScore(game.HOME_SCORE)}
              <span className="mx-2 text-slate-300">-</span>
              {fmtScore(game.AWAY_SCORE)}
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              {game.PLAYOFF_ROUND ?? "NBA Finals"}
            </div>
          </div>
          {isCompleted && winner ? (
            <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700">
              <Award size={10} />
              {winner} by {scoreGap}
            </div>
          ) : (
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
              Awaiting tip-off
            </div>
          )}
        </div>

        <div
          className="rounded-[1.25rem] border p-4 transition-all duration-200"
          style={{
            borderColor: awayFocused ? awayPal.border : "rgba(226, 232, 240, 1)",
            background: awayFocused ? awayPal.bg : "#ffffff",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Away</p>
              <p className="truncate text-lg font-black text-slate-900" style={{ color: awayFocused ? awayPal.text : "#0f172a" }}>
                {awayName}
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                {game.AWAY_TEAM_ABBREVIATION}
              </p>
            </div>
            <div className="team-ring" style={{ borderColor: awayFocused ? awayPal.border : undefined }}>
              {game.AWAY_TEAM_ABBREVIATION}
            </div>
          </div>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div className="flex items-end gap-3">
              <p className="text-5xl font-black leading-none text-slate-900 tabular-nums" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {fmtScore(game.AWAY_SCORE)}
              </p>
              <span className="pb-1 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">
                {game.AWAY_SERIES_WINS != null ? `${game.AWAY_SERIES_WINS} series wins` : "Away"}
              </span>
            </div>
            <div className="h-2 w-14 rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full"
                style={{
                  width: isCompleted && winner === game.AWAY_TEAM_ABBREVIATION ? "100%" : "36%",
                  background: awayFocused ? awayPal.accent : "#cbd5e1",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-5">
          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Series context</p>
                  <p className="text-sm font-bold text-slate-700">What matters most before / after the game</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Summary
                </span>
              </div>

              {game.HOME_TEAM_WINRATE_LAST_5 != null || game.AWAY_TEAM_WINRATE_LAST_5 != null ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { label: "Win% L5", home: fmtPct(game.HOME_TEAM_WINRATE_LAST_5), away: fmtPct(game.AWAY_TEAM_WINRATE_LAST_5) },
                    { label: "Win% L10", home: fmtPct(game.HOME_TEAM_WINRATE_LAST_10), away: fmtPct(game.AWAY_TEAM_WINRATE_LAST_10) },
                    { label: "PPG L5", home: fmtPts(game.HOME_TEAM_PTS_LAST_5), away: fmtPts(game.AWAY_TEAM_PTS_LAST_5) },
                    { label: "PPG L10", home: fmtPts(game.HOME_TEAM_PTS_LAST_10), away: fmtPts(game.AWAY_TEAM_PTS_LAST_10) },
                    { label: "Rest", home: game.HOME_TEAM_DAYS_REST?.toString() ?? "—", away: game.AWAY_TEAM_DAYS_REST?.toString() ?? "—" },
                    { label: "B2B", home: game.HOME_TEAM_IS_B2B ? "Yes" : "No", away: game.AWAY_TEAM_IS_B2B ? "Yes" : "No" },
                  ].map((row) => (
                    <div key={row.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">{row.label}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-white px-2 py-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-[#1d428a]">{game.HOME_TEAM_ABBREVIATION}</p>
                          <p className="mt-1 font-bold text-slate-800">{row.home}</p>
                        </div>
                        <div className="rounded-xl bg-white px-2 py-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-[#c9082a]">{game.AWAY_TEAM_ABBREVIATION}</p>
                          <p className="mt-1 font-bold text-slate-800">{row.away}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
                  <p className="text-sm font-bold text-slate-700">No pre-game context is attached to this row.</p>
                  <p className="mt-1 text-xs text-slate-500">Completed Finals can still show player data on the right.</p>
                </div>
              )}
            </div>

            <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Players</p>
                  <p className="text-sm font-bold text-slate-700">Top contributors at a glance</p>
                </div>
                {isCompleted && gamePlayers.length > 0 && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPlayerView("home")}
                      className={`results-segment ${playerView === "home" ? "results-segment-active" : ""}`}
                      style={playerView === "home" ? { borderColor: homePal.border, color: homePal.text, background: homePal.bg } : undefined}
                    >
                      {game.HOME_TEAM_ABBREVIATION}
                    </button>
                    <button
                      onClick={() => setPlayerView("away")}
                      className={`results-segment ${playerView === "away" ? "results-segment-active" : ""}`}
                      style={playerView === "away" ? { borderColor: awayPal.border, color: awayPal.text, background: awayPal.bg } : undefined}
                    >
                      {game.AWAY_TEAM_ABBREVIATION}
                    </button>
                  </div>
                )}
              </div>

              {isCompleted && gamePlayers.length > 0 ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">Leading five</p>
                    <div className="mt-3 space-y-2">
                      {topPlayers.slice(0, 5).map((player, idx) => (
                        <div key={player.PLAYER_ID} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-[10px] font-black text-slate-500">
                            {idx + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-800">{player.PLAYER_NAME}</p>
                            <p className="text-[10px] uppercase tracking-widest text-slate-400">
                              {activeTeamAbbr} · {player.MIN != null ? `${Math.round(player.MIN)} min` : "—"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-base font-black leading-none text-slate-900">{fmtInt(player.PTS)}</p>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">PTS</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">Matchup table</p>
                        <p className="text-sm font-bold text-slate-700">{activeTeam} box score</p>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {activePlayers.length} players
                      </span>
                    </div>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-400">
                            <th className="pb-2 pr-2 text-left text-[9px] font-black uppercase tracking-widest">Player</th>
                            <th className="pb-2 px-2 text-left text-[9px] font-black uppercase tracking-widest">MIN</th>
                            <th className="pb-2 px-2 text-left text-[9px] font-black uppercase tracking-widest">PTS</th>
                            <th className="pb-2 px-2 text-left text-[9px] font-black uppercase tracking-widest">REB</th>
                            <th className="pb-2 px-2 text-left text-[9px] font-black uppercase tracking-widest">AST</th>
                            <th className="pb-2 pl-2 text-left text-[9px] font-black uppercase tracking-widest">+/-</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...activePlayers]
                            .sort((a, b) => (b.PTS ?? 0) - (a.PTS ?? 0) || (b.MIN ?? 0) - (a.MIN ?? 0))
                            .slice(0, 8)
                            .map((player) => (
                              <tr key={player.PLAYER_ID} className="border-t border-slate-100">
                                <td className="py-2 pr-2 font-semibold text-slate-700">{player.PLAYER_NAME}</td>
                                <td className="px-2 py-2 text-slate-500">{player.MIN != null ? Math.round(player.MIN) : "—"}</td>
                                <td className="px-2 py-2 font-bold text-slate-900">{fmtInt(player.PTS)}</td>
                                <td className="px-2 py-2 text-slate-600">{fmtInt(player.REB)}</td>
                                <td className="px-2 py-2 text-slate-600">{fmtInt(player.AST)}</td>
                                <td className="pl-2 py-2 text-slate-500">
                                  {player.PLUS_MINUS != null ? (player.PLUS_MINUS > 0 ? `+${player.PLUS_MINUS}` : player.PLUS_MINUS) : "—"}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
                  <p className="text-sm font-bold text-slate-700">
                    {isCompleted ? "Player box scores are missing for this game." : "Player data is not available before tip-off."}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {isCompleted
                      ? "This usually means the page did not load `player_boxscores.json` or the export is incomplete."
                      : "Upcoming rows intentionally only show core-player context."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────

export default function Schedule() {
  const [games, setGames] = useState<ScheduleGame[]>([]);
  const [playerBS, setPlayerBS] = useState<PlayerBoxScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLens, setActiveLens] = useState<Lens>("series");

  useEffect(() => {
    Promise.all([
      fetch("/data/schedule.json").then((r) => {
        if (!r.ok) throw new Error("schedule.json");
        return r.json();
      }),
      fetch("/data/upcoming_games_context.json").then((r) => {
        if (!r.ok) throw new Error("upcoming_games_context.json");
        return r.json();
      }),
      fetch("/data/game_results.json").then((r) => {
        if (!r.ok) throw new Error("game_results.json");
        return r.json();
      }),
      fetch("/data/player_boxscores.json").then((r) => {
        if (!r.ok) throw new Error("player_boxscores.json");
        return r.json();
      }),
    ])
      .then(([schedule, upcoming, results, playerBoxscores]) => {
        const scheduleRows = schedule as ScheduleGame[];
        const upcomingRows = upcoming as ScheduleGame[];
        const resultRows = results as ScheduleGame[];
        const playerRows = playerBoxscores as PlayerBoxScore[];

        const upcomingMap = new Map(upcomingRows.map((row) => [row.GAME_ID, row]));
        const resultMap = new Map(resultRows.map((row) => [row.GAME_ID, row]));
        const resultTeamNameMap = new Map<string, string>();
        resultRows.forEach((row) => {
          if (row.HOME_TEAM_ABBREVIATION && row.HOME_TEAM_NAME) {
            resultTeamNameMap.set(row.HOME_TEAM_ABBREVIATION, row.HOME_TEAM_NAME);
          }
          if (row.AWAY_TEAM_ABBREVIATION && row.AWAY_TEAM_NAME) {
            resultTeamNameMap.set(row.AWAY_TEAM_ABBREVIATION, row.AWAY_TEAM_NAME);
          }
        });

        const upcomingIds = new Set(upcomingRows.map((row) => row.GAME_ID));
        const merged = scheduleRows
          .filter((row) => isFinalsGame(row.GAME_ID, row.SEASON_TYPE))
          .map((row) => {
            const result = resultMap.get(row.GAME_ID);
            const context = upcomingMap.get(row.GAME_ID);
            return {
              ...row,
              ...result,
              ...context,
              HOME_TEAM_NAME: row.HOME_TEAM_NAME ?? resultTeamNameMap.get(row.HOME_TEAM_ABBREVIATION) ?? context?.HOME_TEAM_NAME ?? null,
              AWAY_TEAM_NAME: row.AWAY_TEAM_NAME ?? resultTeamNameMap.get(row.AWAY_TEAM_ABBREVIATION) ?? context?.AWAY_TEAM_NAME ?? null,
              _isUpcoming: upcomingIds.has(row.GAME_ID),
            };
          });

        const extraUpcoming = upcomingRows
          .filter((row) => isFinalsGame(row.GAME_ID, row.SEASON_TYPE) && !merged.some((game) => game.GAME_ID === row.GAME_ID))
          .map((row) => ({
            ...row,
            HOME_TEAM_NAME: row.HOME_TEAM_NAME ?? resultTeamNameMap.get(row.HOME_TEAM_ABBREVIATION) ?? null,
            AWAY_TEAM_NAME: row.AWAY_TEAM_NAME ?? resultTeamNameMap.get(row.AWAY_TEAM_ABBREVIATION) ?? null,
            _isUpcoming: true,
          }));

        const finals = [...merged, ...extraUpcoming].sort((a, b) => a.GAME_DATE.localeCompare(b.GAME_DATE) || a.GAME_ID.localeCompare(b.GAME_ID));
        setGames(finals);
        setPlayerBS(playerRows);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const teamOptions = useMemo(() => {
    const seen = new Set<string>();
    const ordered: { abbr: string; name: string }[] = [];
    games.forEach((game) => {
      [
        { abbr: game.AWAY_TEAM_ABBREVIATION, name: teamName(game.AWAY_TEAM_ABBREVIATION, game.AWAY_TEAM_NAME) },
        { abbr: game.HOME_TEAM_ABBREVIATION, name: teamName(game.HOME_TEAM_ABBREVIATION, game.HOME_TEAM_NAME) },
      ].forEach((team) => {
        if (!seen.has(team.abbr)) {
          seen.add(team.abbr);
          ordered.push(team);
        }
      });
    });
    return ordered;
  }, [games]);

  const seriesStats = useMemo(() => {
    const completed = games.filter((game) => game.GAME_STATUS === "Final" || game.HOME_SCORE != null || game.AWAY_SCORE != null);
    const upcoming = games.filter((game) => game._isUpcoming || !(game.GAME_STATUS === "Final" || game.HOME_SCORE != null || game.AWAY_SCORE != null));
    const wins = new Map<string, number>();
    completed.forEach((game) => {
      const winner = game.WINNER_TEAM_ABBREVIATION ?? (game.HOME_SCORE != null && game.AWAY_SCORE != null
        ? (Number(game.HOME_SCORE) > Number(game.AWAY_SCORE) ? game.HOME_TEAM_ABBREVIATION : game.AWAY_TEAM_ABBREVIATION)
        : null);
      if (winner) wins.set(winner, (wins.get(winner) ?? 0) + 1);
    });

    const leader = teamOptions.reduce<{ abbr: string; wins: number } | null>((acc, team) => {
      const count = wins.get(team.abbr) ?? 0;
      if (!acc || count > acc.wins) return { abbr: team.abbr, wins: count };
      return acc;
    }, null);

    const nextGame = upcoming[0] ?? null;
    return {
      completedCount: completed.length,
      upcomingCount: upcoming.length,
      leader,
      nextGame,
      scoreMap: wins,
    };
  }, [games, teamOptions]);

  const activeTeamLabel = useMemo(() => lensLabel(activeLens, teamOptions), [activeLens, teamOptions]);
  const focusedGames = useMemo(() => {
    if (activeLens === "series") return games;
    return games.filter((game) => game.HOME_TEAM_ABBREVIATION === activeLens || game.AWAY_TEAM_ABBREVIATION === activeLens);
  }, [activeLens, games]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Loading NBA Finals...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-16 text-center">
        <AlertTriangle size={32} className="mx-auto mb-3 text-rose-400" />
        <p className="text-sm font-bold text-rose-300">{error}</p>
        <p className="mt-2 text-xs text-slate-500">
          Run: <code className="rounded bg-slate-900 px-2 py-0.5 font-mono">python3 main.py --build-schedule-context</code>
        </p>
      </div>
    );
  }

  return (
    <div className="relative space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-amber-200/60 bg-gradient-to-br from-slate-950 via-slate-900 to-amber-900 text-white shadow-2xl">
        <div
          className="absolute inset-0 opacity-35"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 18%, rgba(251,191,36,0.28) 0, transparent 34%), radial-gradient(circle at 82% 2%, rgba(255,255,255,0.12) 0, transparent 30%), radial-gradient(circle at 50% 100%, rgba(29,66,138,0.18) 0, transparent 34%)",
          }}
        />
        <div className="relative grid gap-6 p-6 lg:grid-cols-[1.25fr_.75fr] lg:p-10">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.28em] text-amber-200 backdrop-blur">
              <Trophy size={11} />
              NBA Finals
            </div>
            <div>
              <h1 className="text-4xl font-black uppercase leading-none tracking-tight sm:text-5xl" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                Championship Series
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-200/90 sm:text-base">
                A focused Finals hub with a premium series ledger, team-specific tabs, and a timeline that treats completed games and future matchups with the same visual language.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/90">
                {seriesStats.completedCount} completed
              </div>
              <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/90">
                {seriesStats.upcomingCount} upcoming
              </div>
              <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/90">
                Team lens: {activeTeamLabel}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-200/80">Series ledger</p>
              <p className="mt-2 text-3xl font-black leading-none tabular-nums">
                {teamOptions[0]?.abbr ?? "TBD"} {seriesStats.scoreMap.get(teamOptions[0]?.abbr ?? "") ?? 0}
                <span className="mx-1 text-white/60">-</span>
                {seriesStats.scoreMap.get(teamOptions[1]?.abbr ?? "") ?? 0} {teamOptions[1]?.abbr ?? "TBD"}
              </p>
              <p className="mt-1 text-xs text-slate-200/75">Current series score from completed finals games</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-200/80">Next game</p>
              <p className="mt-2 text-lg font-black leading-tight">
                {seriesStats.nextGame ? `Game ${seriesStats.nextGame.SERIES_GAME_NUMBER ?? Number(seriesStats.nextGame.GAME_ID.slice(-2))}` : "No scheduled game"}
              </p>
              <p className="mt-1 text-xs text-slate-200/75">
                {seriesStats.nextGame ? fmtDate(seriesStats.nextGame.GAME_DATE) : "All current rows are completed"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-200/80">Data quality</p>
              <p className="mt-2 text-3xl font-black leading-none">Synced</p>
              <p className="mt-1 text-xs text-slate-200/75">Schedule, results, and upcoming context are aligned</p>
            </div>
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-5 py-3.5 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <p className="text-xs font-medium leading-relaxed text-slate-600">
            <span className="font-bold text-amber-700">Series-only view. </span>
            This page is intentionally scoped to the NBA Finals games in the season schedule. Completed rows are pulled from the game results export; upcoming rows use the pre-game context layer.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <TeamLensButton
          label="Series"
          sublabel="All games in the Finals timeline"
          active={activeLens === "series"}
          accent="#b45309"
          onClick={() => setActiveLens("series")}
        />
        {teamOptions.map((team) => {
          const palette = teamPalette(team.abbr);
          return (
            <TeamLensButton
              key={team.abbr}
              label={team.abbr}
              sublabel={team.name}
              active={activeLens === team.abbr}
              accent={palette.accent}
              onClick={() => setActiveLens(team.abbr)}
            />
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="glass flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold shadow-sm">
          <span className="text-slate-500">Completed</span>
          <span className="text-emerald-600">{seriesStats.completedCount}</span>
        </div>
        <div className="glass flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold shadow-sm">
          <span className="text-slate-500">Upcoming</span>
          <span className="text-amber-700">{seriesStats.upcomingCount}</span>
        </div>
        <div className="glass flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold shadow-sm">
          <span className="text-slate-500">Lens</span>
          <span className="text-slate-900">{activeTeamLabel}</span>
        </div>
      </div>

      {focusedGames.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Zap size={16} className="text-emerald-600" />
            <h2 className="text-lg font-black uppercase tracking-wide text-slate-800" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Finals Timeline
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {focusedGames.map((game, index) => (
              <FinalsGameCard
                key={game.GAME_ID}
                game={game}
                index={index}
                focusTeam={activeLens === "series" ? null : activeLens}
                players={playerBS}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-400 shadow-sm">
          <Calendar size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-bold text-slate-600">No NBA Finals games available</p>
        </div>
      )}
    </div>
  );
}
