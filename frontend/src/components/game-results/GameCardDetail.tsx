import { useState, useEffect } from "react";
import {
  Sparkles,
  Trophy,
  Clock,
  RefreshCw,
  Shield,
  MapPin,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Users,
  ListOrdered,
} from "lucide-react";
import TeamLogo from "../TeamLogo";
import PlayerPhoto from "../PlayerPhoto";
import type { GameFeedRow } from "../../types/gameFeed";
import type { TeamBoxScore, PlayerBoxScore } from "./types";
import { fmtDate, fmtInt, teamFull, teamCity, parseOfficials } from "./utils";
import { loadArchivedPlayByPlay } from "../../lib/archiveData";
import { QuarterScores } from "./QuarterScores";
import { TeamComparisonBars } from "./TeamComparisonBars";
import { ShootingSummary } from "./ShootingSummary";
import { TopPerformers } from "./TopPerformers";
import { GameLeaders } from "./GameLeaders";
import { PlayerBoxTable } from "./PlayerBoxTable";

export function GameCardDetail({
  game,
  gameDetail,
  homeBS: initialHomeBS,
  awayBS: initialAwayBS,
  homePlayers: initialHomePlayers,
  awayPlayers: initialAwayPlayers,
  initialTab,
  onPredict,
  onRefresh,
  canRefresh,
  refreshState,
  refreshDone,
  refreshError,
  freshPlayByPlay,
  season,
}: {
  game: GameFeedRow;
  gameDetail: any;
  homeBS?: TeamBoxScore | null;
  awayBS?: TeamBoxScore | null;
  homePlayers?: PlayerBoxScore[];
  awayPlayers?: PlayerBoxScore[];
  initialTab?: "game" | "home" | "away" | "pbp" | string;
  onPredict?: () => void;
  onRefresh?: () => void;
  canRefresh?: boolean;
  refreshState?: string;
  refreshDone?: boolean;
  refreshError?: string | null;
  freshPlayByPlay?: PbpData | null;
  season?: string;
}) {
  const [activeTab, setActiveTab] = useState<"game" | "home" | "away" | "pbp">(
    initialTab === "home" || initialTab === "away" || initialTab === "pbp" ? initialTab : "game"
  );

  const isCompleted =
    game.GAME_STATUS === "Final" ||
    game.GAME_STATUS === "FINAL" ||
    Boolean(game.WINNER_TEAM_ABBREVIATION) ||
    ((Number(game.HOME_SCORE) || 0) > 0 && (Number(game.AWAY_SCORE) || 0) > 0);

  const homeScore = game.HOME_SCORE ?? gameDetail?.home_team?.score ?? null;
  const awayScore = game.AWAY_SCORE ?? gameDetail?.away_team?.score ?? null;
  const margin    = isCompleted && homeScore != null && awayScore != null ? Math.abs(Number(homeScore) - Number(awayScore)) : 0;

  const homeBS = initialHomeBS ?? (gameDetail?.team_stats ?? []).find((t: any) => t.TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION || t.team_abbreviation === game.HOME_TEAM_ABBREVIATION) ?? null;
  const awayBS = initialAwayBS ?? (gameDetail?.team_stats ?? []).find((t: any) => t.TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION || t.team_abbreviation === game.AWAY_TEAM_ABBREVIATION) ?? null;

  const topHome: PlayerBoxScore[] = initialHomePlayers && initialHomePlayers.length > 0 ? initialHomePlayers : (gameDetail?.home_team?.players ?? []);
  const topAway: PlayerBoxScore[] = initialAwayPlayers && initialAwayPlayers.length > 0 ? initialAwayPlayers : (gameDetail?.away_team?.players ?? []);
  const topGame = [...topHome, ...topAway].sort((a, b) => ((b.PTS ?? (b as any).pts) ?? 0) - ((a.PTS ?? (a as any).pts) ?? 0));

  const officials = parseOfficials(game.OFFICIALS);
  const arenaName  = gameDetail?.arena?.name || (game as { ARENA?: string })?.ARENA;
  const arenaCity  = [gameDetail?.arena?.city, gameDetail?.arena?.state].filter(Boolean).join(", ") || (game as { LOCATION?: string })?.LOCATION;
  const teamStatHome = (gameDetail?.team_stats ?? []).find((t: any) => t.TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION || t.team_abbreviation === game.HOME_TEAM_ABBREVIATION) ?? homeBS;
  const teamStatAway = (gameDetail?.team_stats ?? []).find((t: any) => t.TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION || t.team_abbreviation === game.AWAY_TEAM_ABBREVIATION) ?? awayBS;

  const winnerAbbr = game.WINNER_TEAM_ABBREVIATION ?? (isCompleted && Number(homeScore) !== Number(awayScore)
    ? Number(homeScore) > Number(awayScore) ? game.HOME_TEAM_ABBREVIATION : game.AWAY_TEAM_ABBREVIATION
    : null);
  const homeWon   = isCompleted && winnerAbbr === game.HOME_TEAM_ABBREVIATION;
  const awayWon   = isCompleted && winnerAbbr === game.AWAY_TEAM_ABBREVIATION;
  const seasonLabel = game.PLAYOFF_ROUND ?? game.SEASON_TYPE ?? "NBA";
  const homeQS = gameDetail?.home_team?.quarter_scores;
  const awayQS = gameDetail?.away_team?.quarter_scores;

  return (
    <div className="space-y-4">
      {/* ── Matchup Hero Card ── */}
      <section className="rounded border border-border bg-background-primary p-4 sm:p-5">
        {/* Top bar: competition + date */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-light pb-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
              {seasonLabel}
            </span>
            {game.SERIES_GAME_NUMBER != null && (
              <span className="rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-xs text-text-secondary">
                Game {game.SERIES_GAME_NUMBER}
              </span>
            )}
            {game.IS_ELIMINATION_GAME && (
              <span className="rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-xs font-medium text-status-error">
                Elimination Match
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-text-secondary">
            {isCompleted ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
                {game.GAME_STATUS || "Final"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                <Clock size={12} className="text-text-muted" />
                {game.GAME_STATUS || "Scheduled"}
              </span>
            )}
            <span>•</span>
            <span className="font-medium text-text-primary">{fmtDate(game.GAME_DATE)}</span>
          </div>
        </div>

        {/* Main score area */}
        <div className="py-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-6">
            {/* Away Team */}
            <div className={`flex flex-col items-center gap-1 text-center ${awayWon ? "" : isCompleted ? "opacity-75" : ""}`}>
              <TeamLogo abbr={game.AWAY_TEAM_ABBREVIATION} name={game.AWAY_TEAM_NAME} size={48} />
              <div>
                <p className="text-xs text-text-muted">{teamCity(game.AWAY_TEAM_ABBREVIATION)}</p>
                <p className="text-sm font-semibold text-text-primary sm:text-base">
                  {teamFull(game.AWAY_TEAM_ABBREVIATION, game.AWAY_TEAM_NAME)}
                </p>
                <span className="text-xs text-text-muted">Away</span>
              </div>
              {awayWon && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-status-success">
                  <Trophy size={11} /> Winner
                </span>
              )}
            </div>

            {/* Score / Status block */}
            <div className="flex min-w-[120px] flex-col items-center gap-1 rounded border border-border bg-background-tertiary px-4 py-3 text-center sm:min-w-[160px]">
              {isCompleted ? (
                <>
                  <div className="flex items-baseline justify-center gap-2">
                    <span className={`text-2xl font-semibold tabular-nums sm:text-3xl ${awayWon ? "text-text-primary" : "text-text-secondary"}`}>
                      {awayScore ?? "—"}
                    </span>
                    <span className="text-xs text-text-muted">:</span>
                    <span className={`text-2xl font-semibold tabular-nums sm:text-3xl ${homeWon ? "text-text-primary" : "text-text-secondary"}`}>
                      {homeScore ?? "—"}
                    </span>
                  </div>
                  {winnerAbbr && (
                    <p className="text-xs tabular-nums text-text-secondary">
                      <span className="font-semibold text-text-primary">{winnerAbbr}</span> by {margin} pts
                    </p>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center">
                  <span className="text-sm font-semibold text-text-secondary">vs</span>
                  <span className="mt-0.5 text-xs text-text-secondary">Upcoming</span>
                </div>
              )}
              {!isCompleted && onPredict && (
                <button
                  type="button"
                  onClick={onPredict}
                  className="mt-2 inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover"
                >
                  <Sparkles size={12} />
                  Predict
                </button>
              )}
            </div>

            {/* Home Team */}
            <div className={`flex flex-col items-center gap-1 text-center ${homeWon ? "" : isCompleted ? "opacity-75" : ""}`}>
              <TeamLogo abbr={game.HOME_TEAM_ABBREVIATION} name={game.HOME_TEAM_NAME} size={48} />
              <div>
                <p className="text-xs text-text-muted">{teamCity(game.HOME_TEAM_ABBREVIATION)}</p>
                <p className="text-sm font-semibold text-text-primary sm:text-base">
                  {teamFull(game.HOME_TEAM_ABBREVIATION, game.HOME_TEAM_NAME)}
                </p>
                <span className="text-xs text-text-muted">Home</span>
              </div>
              {homeWon && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-status-success">
                  <Trophy size={11} /> Winner
                </span>
              )}
            </div>
          </div>

          {/* Venue & officials footer */}
          {(arenaName || officials.length > 0) && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border-light pt-3 text-xs text-text-muted">
              {arenaName && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={12} />
                  <span>{[arenaName, arenaCity].filter(Boolean).join(" · ")}</span>
                </span>
              )}
              {officials.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Shield size={12} />
                  <span>Referees: {officials.map((o) => o.cleanName).join(", ")}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Action Banner for Fetching/Refreshing Game Data */}
      {canRefresh && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-background-primary p-4">
          <div className="flex items-center gap-3">
            <RefreshCw size={16} className={`text-text-secondary ${refreshState === "running" ? "animate-spin" : ""}`} />
            <div>
              <p className="text-xs font-semibold text-text-primary">
                Fetch Latest Game & Box Score Data
              </p>
              <p className="text-xs text-text-secondary">
                Downloads completed box score and play-by-play logs from the official NBA feed.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={refreshState === "running" || refreshDone}
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshState === "running" ? "animate-spin" : ""} />
            {refreshState === "running" ? "Fetching…" : refreshDone ? "Data Loaded" : refreshState === "failed" ? "Retry" : "Fetch Data"}
          </button>
          {refreshError && <p role="alert" className="w-full text-xs text-status-error">{refreshError}</p>}
        </div>
      )}

      {/* ── Tab Navigation ── */}
      <nav aria-label="Game detail sections" role="tablist" className="flex gap-1 border-b border-border bg-background-primary pb-px">
        {([
          { id: "game", label: isCompleted ? "Recap" : "Preview", icon: <LayoutGrid size={13} /> },
          { id: "away", label: `${game.AWAY_TEAM_ABBREVIATION} ${isCompleted ? "Box Score" : "Info"}`, icon: <Users size={13} /> },
          { id: "home", label: `${game.HOME_TEAM_ABBREVIATION} ${isCompleted ? "Box Score" : "Info"}`, icon: <Users size={13} /> },
          ...(isCompleted ? [{ id: "pbp", label: "Play-by-Play", icon: <ListOrdered size={13} /> }] : []),
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => setActiveTab(t.id as "game" | "home" | "away" | "pbp")}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === t.id
                ? "border-primary text-text-primary"
                : "border-transparent text-text-secondary hover:border-border hover:text-text-primary"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── Tab Panels ── */}
      {activeTab === "game" && (
        <div role="tabpanel" className="space-y-4">
          {isCompleted ? (
            <>
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-text-primary">Game summary</h3>
                    <p className="mt-0.5 text-xs text-text-secondary">Final recap and key metrics</p>
                  </div>
                  {winnerAbbr && (
                    <span className="rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
                      {winnerAbbr} won by {margin} pts
                    </span>
                  )}
                </div>
                <QuarterScores
                  homeAbbr={game.HOME_TEAM_ABBREVIATION}
                  awayAbbr={game.AWAY_TEAM_ABBREVIATION}
                  homeQS={homeQS}
                  awayQS={awayQS}
                />
              </section>

              <section className="space-y-3">
                <div className="grid items-start gap-4 xl:grid-cols-2">
                  <TeamComparisonBars home={homeBS} away={awayBS} />
                  <ShootingSummary home={teamStatHome as TeamBoxScore | null} away={teamStatAway as TeamBoxScore | null} />
                </div>
              </section>

              <section className="space-y-4">
                <TopPerformers topGame={topGame} />
                <GameLeaders leaders={gameDetail?.game_leaders} />
              </section>
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded border border-border bg-background-primary p-4 sm:p-5">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-text-primary">
                    {game.AWAY_TEAM_NAME} @ {game.HOME_TEAM_NAME}
                  </h3>
                  <p className="mt-0.5 text-xs text-text-secondary">Matchup schedule</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="rounded border border-border bg-background-tertiary p-3">
                    <p className="text-xs font-medium text-text-muted">Date & Schedule</p>
                    <p className="mt-1 text-xs font-semibold text-text-primary">{fmtDate(game.GAME_DATE)}</p>
                    <p className="text-xs text-text-secondary">{seasonLabel}</p>
                  </div>
                  <div className="rounded border border-border bg-background-tertiary p-3">
                    <p className="text-xs font-medium text-text-muted">Venue</p>
                    <p className="mt-1 text-xs font-semibold text-text-primary">{arenaName || "NBA Arena"}</p>
                    <p className="text-xs text-text-secondary">{arenaCity || teamCity(game.HOME_TEAM_ABBREVIATION)}</p>
                  </div>
                  <div className="rounded border border-border bg-background-tertiary p-3">
                    <p className="text-xs font-medium text-text-muted">Status</p>
                    <p className="mt-1 text-xs font-semibold text-text-primary">{game.GAME_STATUS || "Upcoming / Scheduled"}</p>
                    <p className="text-xs text-text-secondary">Box scores recorded post-game</p>
                  </div>
                </div>
              </div>

              {onPredict && (
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 rounded border border-border bg-background-primary p-4 sm:p-5">
                  <div className="max-w-xl">
                    <h4 className="text-sm font-semibold text-text-primary">
                      Simulate & Predict This Matchup
                    </h4>
                    <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                      View full multi-stage ML projections for this game including calibrated win probabilities, expected team scores, spread margins, and player performance projections.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onPredict}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded bg-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-hover"
                  >
                    <Sparkles size={13} />
                    Run Prediction
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "home" && (
        <div role="tabpanel" className="space-y-4">
          <div className="rounded border border-border bg-background-primary p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  {gameDetail?.home_team?.team_name || game.HOME_TEAM_NAME || game.HOME_TEAM_ABBREVIATION}
                </h3>
                <p className="mt-0.5 text-xs text-text-secondary">{game.HOME_TEAM_ABBREVIATION} · Home</p>
              </div>
              {isCompleted && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded border border-border bg-background-tertiary px-3 py-1.5 text-center">
                    <p className="text-base font-semibold tabular-nums text-text-primary">{homeScore ?? "—"}</p>
                    <p className="text-xs font-medium text-text-muted">PTS</p>
                  </div>
                  <div className="rounded border border-border bg-background-tertiary px-3 py-1.5 text-center">
                    <p className="text-base font-semibold tabular-nums text-text-primary">{fmtInt(homeBS?.REB ?? null)}</p>
                    <p className="text-xs font-medium text-text-muted">REB</p>
                  </div>
                  <div className="rounded border border-border bg-background-tertiary px-3 py-1.5 text-center">
                    <p className="text-base font-semibold tabular-nums text-text-primary">{fmtInt(homeBS?.AST ?? null)}</p>
                    <p className="text-xs font-medium text-text-muted">AST</p>
                  </div>
                  <div className="rounded border border-border bg-background-tertiary px-3 py-1.5 text-center">
                    <p className="text-base font-semibold tabular-nums text-text-primary">{fmtInt(homeBS?.TOV ?? null)}</p>
                    <p className="text-xs font-medium text-text-muted">TOV</p>
                  </div>
                </div>
              )}
            </div>
            {isCompleted ? (
              <PlayerBoxTable players={topHome} />
            ) : (
              <div className="rounded border border-border bg-background-tertiary p-6 text-center">
                <p className="text-xs font-medium text-text-primary">Player statistics are not available yet.</p>
                <p className="mt-1 text-xs text-text-secondary">Official box scores will be loaded once the game concludes.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "away" && (
        <div role="tabpanel" className="space-y-4">
          <div className="rounded border border-border bg-background-primary p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  {gameDetail?.away_team?.team_name || game.AWAY_TEAM_NAME || game.AWAY_TEAM_ABBREVIATION}
                </h3>
                <p className="mt-0.5 text-xs text-text-secondary">{game.AWAY_TEAM_ABBREVIATION} · Away</p>
              </div>
              {isCompleted && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded border border-border bg-background-tertiary px-3 py-1.5 text-center">
                    <p className="text-base font-semibold tabular-nums text-text-primary">{awayScore ?? "—"}</p>
                    <p className="text-xs font-medium text-text-muted">PTS</p>
                  </div>
                  <div className="rounded border border-border bg-background-tertiary px-3 py-1.5 text-center">
                    <p className="text-base font-semibold tabular-nums text-text-primary">{fmtInt(awayBS?.REB ?? null)}</p>
                    <p className="text-xs font-medium text-text-muted">REB</p>
                  </div>
                  <div className="rounded border border-border bg-background-tertiary px-3 py-1.5 text-center">
                    <p className="text-base font-semibold tabular-nums text-text-primary">{fmtInt(awayBS?.AST ?? null)}</p>
                    <p className="text-xs font-medium text-text-muted">AST</p>
                  </div>
                  <div className="rounded border border-border bg-background-tertiary px-3 py-1.5 text-center">
                    <p className="text-base font-semibold tabular-nums text-text-primary">{fmtInt(awayBS?.TOV ?? null)}</p>
                    <p className="text-xs font-medium text-text-muted">TOV</p>
                  </div>
                </div>
              )}
            </div>
            {isCompleted ? (
              <PlayerBoxTable players={topAway} />
            ) : (
              <div className="rounded border border-border bg-background-tertiary p-6 text-center">
                <p className="text-xs font-medium text-text-primary">Player statistics are not available yet.</p>
                <p className="mt-1 text-xs text-text-secondary">Official box scores will be loaded once the game concludes.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "pbp" && (
        <div role="tabpanel" aria-label="Play-by-play">
          <PlayByPlayTab gameId={game.GAME_ID} season={season ?? game.SEASON ?? gameDetail?.season ?? undefined} initialData={freshPlayByPlay} />
        </div>
      )}
    </div>
  );
}

interface PbpEvent {
  period: number;
  clock: string;
  action_type: string;
  sub_type: string;
  team: string | null;
  player_id?: number | null;
  player_name: string | null;
  description: string;
  score_home: number;
  score_away: number;
  points_scored: number;
  player_stats_before?: PbpPlayerStats | null;
  player_stats_after?: PbpPlayerStats | null;
  assist_player_name?: string | null;
  assist_total?: number | null;
  quarter_player_points?: number;
  quarter_team_points?: number;
  badges?: string[];
}

interface PbpPlayerStats {
  pts: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  pf: number;
  tov: number;
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

function normalizePbpGameId(gameId: string) {
  return String(gameId).replace(/\D/g, "").padStart(10, "0");
}

function periodFromLabel(label: string, index: number) {
  const value = label.trim().toUpperCase();
  const number = Number(value.match(/\d+/)?.[0]);
  if (value.startsWith("OT")) return 4 + (number > 0 ? number : Math.max(1, index - 3));
  return number > 0 ? number : index + 1;
}

function periodName(period: number) {
  return period <= 4 ? `Q${period}` : `OT${period - 4}`;
}

function PlayByPlayTab({ gameId, season, initialData }: { gameId: string; season?: string; initialData?: PbpData | null }) {
  const [data, setData] = useState<PbpData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "scoring" | number>("all");
  const [openQuarter, setOpenQuarter] = useState<number>(1);

  useEffect(() => {
    if (initialData) {
      return;
    }
    const normGameId = normalizePbpGameId(gameId);
    loadArchivedPlayByPlay(normGameId, season)
      .then((pbp: PbpData) => {
        setData(pbp);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load play-by-play.");
        setLoading(false);
      });
  }, [gameId, season, initialData]);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center gap-2 rounded border border-border bg-background-primary">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-xs text-text-secondary">Loading game events...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded border border-border bg-background-primary p-6 text-center">
        <Clock size={20} className="mx-auto mb-2 text-text-muted" />
        <p className="text-xs text-text-secondary">
          Play-by-play logs are not available for this game.
        </p>
      </div>
    );
  }

  const periods = Array.from(new Set([
    ...data.events.map((event) => event.period),
    ...data.quarter_scores.map((score, index) => periodFromLabel(score.quarter, index)),
  ])).sort((a, b) => a - b);
  const periodLabel = periodName;
  const filteredEvents = data.events.filter((e) => {
    if (filter === "scoring") return e.points_scored > 0;
    if (typeof filter === "number") return e.period === filter;
    return true;
  });
  const eventsByQuarter = periods.map((period) => ({
    period,
    events: filteredEvents.filter((e) => e.period === period),
    score: data.quarter_scores.find((qs, index) => periodFromLabel(qs.quarter, index) === period),
  }));
  const filterLabels = ["All plays", ...periods.map(periodLabel), "Scoring plays"];

  return (
    <div className="space-y-4 rounded border border-border bg-background-primary p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border-light pb-3">
        <div>
          <h3 className="text-base font-semibold text-text-primary">
            {data.away_team} at {data.home_team}
          </h3>
          <p className="mt-0.5 text-xs text-text-secondary">Game flow · Play-by-play</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-sm border border-border bg-background-tertiary px-2 py-0.5 text-xs font-medium tabular-nums text-text-secondary">
            {data.events.length} plays
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(["all", ...periods, "scoring"] as const).map((f, index) => (
          <button
            key={String(f)}
            onClick={() => setFilter(f as "all" | "scoring" | number)}
            aria-pressed={filter === f}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? "bg-primary text-white"
                : "border border-border bg-background-primary text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
            }`}
          >
            {filterLabels[index]}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {eventsByQuarter.map(({ period, events, score }) => (
          <div key={period} className="rounded border border-border bg-background-primary">
            <button
              onClick={() => setOpenQuarter((current) => current === period ? 0 : period)}
              aria-expanded={openQuarter === period}
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-xs font-semibold text-text-primary transition-colors hover:bg-background-tertiary"
            >
              <div className="flex items-center gap-2">
                <span className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 text-xs font-semibold text-text-primary">
                  {periodLabel(period)}
                </span>
                <span>
                  {data.away_team} {score?.away ?? "-"} – {score?.home ?? "-"} {data.home_team}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-normal text-text-secondary">
                <span className="tabular-nums">{events.length} plays</span>
                {openQuarter === period ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </button>

            {openQuarter === period && (
              <div className="max-h-[600px] space-y-1.5 overflow-y-auto border-t border-border-light p-3">
                {events.map((e, idx) => (
                  <PbpEventCard key={`${e.period}-${e.clock}-${idx}`} event={e} />
                ))}
                {events.length === 0 && (
                  <p className="py-6 text-center text-xs text-text-muted">No events match the selected filter.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PbpEventCard({ event: e }: { event: PbpEvent }) {
  const isScoring = e.points_scored > 0;
  const playerName = e.player_name || e.team || "Game event";

  return (
    <div className={`flex items-center justify-between gap-3 rounded border border-border-light bg-background-primary p-2.5 transition-colors hover:border-card-border-hover ${isScoring ? "border-l-2 border-l-status-success" : ""}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        {e.player_id ? (
          <PlayerPhoto playerId={e.player_id} name={playerName} size={28} />
        ) : (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-background-tertiary text-text-muted">
            <Clock size={12} />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-medium text-text-primary">{playerName}</span>
            <span className="text-xs tabular-nums text-text-muted">
              {periodName(e.period)} · {e.clock}
            </span>
          </div>
          <p className="truncate text-xs text-text-secondary">{e.description || e.action_type}</p>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-xs font-semibold tabular-nums text-text-primary">
          {e.score_away} – {e.score_home}
        </p>
        {isScoring && (
          <span className="text-xs font-medium tabular-nums text-status-success">
            +{e.points_scored} PTS
          </span>
        )}
      </div>
    </div>
  );
}
