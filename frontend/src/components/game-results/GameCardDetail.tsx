import { useState, useEffect, useMemo } from "react";
import {
  Clock,
  RefreshCw,
  MapPin,
  LayoutGrid,
  Users,
  Flame,
  ArrowLeft,
  Calendar,
  Zap,
  ArrowRightLeft,
  TrendingUp,
  Award,
  Sparkles,
} from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { GameFeedRow, GameDetail } from "../../types/gameFeed";
import type { TeamBoxScore, PlayerBoxScore } from "./types";
import {
  fmtDate,
  fmtInt,
  fmtTipoffTR,
  teamFull,
  parseOfficials,
  sortPlayersByMinutes,
} from "./utils";
import { loadArchivedPlayByPlay } from "../../lib/archiveData";
import { QuarterScores } from "./QuarterScores";
import { TeamComparisonBars } from "./TeamComparisonBars";
import { ShootingSummary } from "./ShootingSummary";
import { TopPerformers } from "./TopPerformers";
import { PlayerBoxTable } from "./PlayerBoxTable";
import { Button, Badge, Card, Skeleton } from "../common";
import { loadPrivateApi, loadPrivateApiFresh } from "../../lib/dataCache";
import PlayerPhoto from "../PlayerPhoto";

export interface GameCardDetailProps {
  game: GameFeedRow;
  gameDetail?: GameDetail | null;
  homeBS?: TeamBoxScore | null;
  awayBS?: TeamBoxScore | null;
  homePlayers?: PlayerBoxScore[];
  awayPlayers?: PlayerBoxScore[];
  initialTab?: "game" | "home" | "away" | "highlights" | "pbp" | string;
  onPredict?: () => void;
  onRefresh?: () => void;
  canRefresh?: boolean;
  refreshState?: string;
  refreshDone?: boolean;
  refreshError?: string | null;
  freshPlayByPlay?: PbpData | null;
  season?: string;
  onBack?: () => void;
}

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
  onBack,
}: GameCardDetailProps) {
  const isCompleted =
    game.GAME_STATUS === "Final" ||
    game.GAME_STATUS === "FINAL" ||
    Boolean(game.WINNER_TEAM_ABBREVIATION) ||
    ((Number(game.HOME_SCORE) || 0) > 0 && (Number(game.AWAY_SCORE) || 0) > 0);

  const [activeTab, setActiveTab] = useState<"game" | "home" | "away" | "highlights">(() => {
    if (initialTab === "home" || initialTab === "away") return initialTab;
    if (initialTab === "highlights" || initialTab === "pbp") return "highlights";
    return isCompleted ? "game" : "away";
  });

  const homeScore = game.HOME_SCORE ?? gameDetail?.home_team?.score ?? null;
  const awayScore = game.AWAY_SCORE ?? gameDetail?.away_team?.score ?? null;
  const margin =
    isCompleted && homeScore != null && awayScore != null
      ? Math.abs(Number(homeScore) - Number(awayScore))
      : 0;

  type TeamStatRecord = {
    TEAM_ABBREVIATION?: string;
    team_abbreviation?: string;
  };
  const teamStatsList =
    (gameDetail?.team_stats as TeamStatRecord[] | undefined) ?? [];
  const homeBS =
    initialHomeBS ??
    ((teamStatsList.find(
      (t) =>
        t.TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION ||
        t.team_abbreviation === game.HOME_TEAM_ABBREVIATION
    ) as TeamBoxScore | null) ??
      null);
  const awayBS =
    initialAwayBS ??
    ((teamStatsList.find(
      (t) =>
        t.TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION ||
        t.team_abbreviation === game.AWAY_TEAM_ABBREVIATION
    ) as TeamBoxScore | null) ??
      null);

  const topHome: PlayerBoxScore[] = sortPlayersByMinutes(
    initialHomePlayers && initialHomePlayers.length > 0
      ? initialHomePlayers
      : ((gameDetail?.home_team?.players as unknown as
          | PlayerBoxScore[]
          | undefined) ?? [])
  );
  const topAway: PlayerBoxScore[] = sortPlayersByMinutes(
    initialAwayPlayers && initialAwayPlayers.length > 0
      ? initialAwayPlayers
      : ((gameDetail?.away_team?.players as unknown as
          | PlayerBoxScore[]
          | undefined) ?? [])
  );
  const topGame = [...topHome, ...topAway].sort(
    (a, b) =>
      ((b.PTS ?? (b as { pts?: number | null }).pts) ?? 0) -
      ((a.PTS ?? (a as { pts?: number | null }).pts) ?? 0)
  );

  // For unplayed games or games without player stats, fetch team rosters, player profiles & injury report
  const [teamRosters, setTeamRosters] = useState<any[]>([]);
  const [playerPositions, setPlayerPositions] = useState<Record<number, string>>({});
  const [loadingRosters, setLoadingRosters] = useState(false);
  const [injuries, setInjuries] = useState<Record<string, { status: string; reason?: string }>>({});
  // null when the report is known; otherwise why statuses cannot be shown (never display everyone as active)
  const [injuryUnavailable, setInjuryUnavailable] = useState<string | null>(null);
  const [notFiled, setNotFiled] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isCompleted || (topHome.length === 0 && topAway.length === 0)) {
      setLoadingRosters(true);
      const activeSeason = season ?? game.SEASON ?? "2026-27";
      const gameDate = game.GAME_DATE ?? "";

      Promise.all([
        loadPrivateApi<any[]>(`/frontend-data-api/team-rosters?season=${encodeURIComponent(activeSeason)}`),
        loadPrivateApi<Array<{ PLAYER_ID: number; POSITION_GROUP?: string; OFFICIAL_POSITION?: string }>>(
          "/frontend-data-api/player-profiles"
        ).catch(() => []),
        loadPrivateApiFresh<{
          entries: Array<{ player_name: string; team: string; status: string; reason?: string }>;
          not_submitted?: string[][];
          error?: string | null;
        }>(
          `/frontend-data-api/injury-report?season=${encodeURIComponent(activeSeason)}&date=${encodeURIComponent(gameDate)}`
        ).catch((e: Error) => ({ entries: [], not_submitted: [], error: e.message })),
      ])
        .then(([rosterData, profileData, injuryData]) => {
          setTeamRosters(rosterData || []);

          const posMap: Record<number, string> = {};
          (profileData || []).forEach((p) => {
            const raw = (p.POSITION_GROUP || p.OFFICIAL_POSITION || "").toUpperCase();
            if (raw.includes("GUARD") || raw === "G") {
              posMap[p.PLAYER_ID] = "guard";
            } else if (raw.includes("BIG") || raw === "C" || raw.includes("CENTER")) {
              posMap[p.PLAYER_ID] = "center";
            } else {
              posMap[p.PLAYER_ID] = "forward";
            }
          });
          setPlayerPositions(posMap);

          const map: Record<string, { status: string; reason?: string }> = {};
          (injuryData?.entries ?? []).forEach((e) => {
            const key = `${e.team}_${e.player_name.toLowerCase().trim()}`;
            map[key] = { status: e.status, reason: e.reason };
            // Also store by name only as fallback
            map[e.player_name.toLowerCase().trim()] = { status: e.status, reason: e.reason };
          });
          setInjuries(map);
          setInjuryUnavailable(injuryData?.error ?? null);
          setNotFiled(new Set((injuryData?.not_submitted ?? []).map((x) => x[1])));
        })
        .catch(() => {
          setTeamRosters([]);
          setInjuries({});
          setInjuryUnavailable("Roster data could not be loaded");
        })
        .finally(() => setLoadingRosters(false));
    }
  }, [isCompleted, topHome.length, topAway.length, season, game.SEASON, game.GAME_DATE]);

  const getPlayerInjury = (team: string, playerName: string) => {
    const key = `${team}_${playerName.toLowerCase().trim()}`;
    const item = injuries[key] || injuries[playerName.toLowerCase().trim()];
    if (injuryUnavailable) {
      return { status: "Unknown", label: "Unknown", variant: "neutral" as const, reason: injuryUnavailable };
    }
    if (!item) {
      if (notFiled.has(team)) {
        return { status: "Unknown", label: "Not filed", variant: "neutral" as const, reason: "Team has not filed its report yet" };
      }
      return { status: "Active", label: "Active", variant: "success" as const };
    }
    const s = item.status.toLowerCase();
    if (s.includes("out")) {
      return { status: "Out", label: "Out", variant: "error" as const, reason: item.reason };
    }
    if (s.includes("questionable") || s.includes("doubtful")) {
      return { status: "Questionable", label: "Questionable", variant: "warning" as const, reason: item.reason };
    }
    return { status: "Active", label: "Active", variant: "success" as const, reason: item.reason };
  };

  const homeRoster = teamRosters.filter(
    (p) => p.TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION
  );
  const awayRoster = teamRosters.filter(
    (p) => p.TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION
  );

  const groupRosterByPosition = (roster: any[]) => {
    const guards: any[] = [];
    const forwards: any[] = [];
    const centers: any[] = [];

    roster.forEach((p) => {
      const pos = playerPositions[p.PLAYER_ID] || "forward";
      if (pos === "guard") guards.push(p);
      else if (pos === "center") centers.push(p);
      else forwards.push(p);
    });

    return { guards, forwards, centers };
  };

  const renderPositionColumn = (title: string, players: any[], teamAbbr: string) => {
    return (
      <div className="flex-1 min-w-[200px]">
        <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            {title}
          </span>
          <span className="text-[11px] font-medium text-text-muted">
            {players.length} oyuncu
          </span>
        </div>
        {players.length === 0 ? (
          <p className="text-xs text-text-muted py-2 italic">Oyuncu bulunmuyor</p>
        ) : (
          <div className="space-y-2">
            {players.map((p) => {
              const injury = getPlayerInjury(teamAbbr, p.PLAYER_NAME);
              return (
                <div
                  key={p.PLAYER_ID}
                  className="flex items-center justify-between gap-3 py-1.5 transition-colors hover:bg-background-tertiary/40 px-2 rounded"
                  title={injury.reason ? `${p.PLAYER_NAME}: ${injury.label} (${injury.reason})` : `${p.PLAYER_NAME}: ${injury.label}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME} size={32} />
                    <span className="text-xs font-medium text-text-primary truncate">
                      {p.PLAYER_NAME}
                    </span>
                  </div>
                  <Badge variant={injury.variant} size="sm">
                    {injury.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderRosterByPositions = (roster: any[], teamAbbr: string) => {
    const { guards, forwards, centers } = groupRosterByPosition(roster);
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-1">
        {renderPositionColumn("Guards", guards, teamAbbr)}
        {renderPositionColumn("Forwards", forwards, teamAbbr)}
        {renderPositionColumn("Centers", centers, teamAbbr)}
      </div>
    );
  };

  const officials = parseOfficials(game.OFFICIALS);
  const arenaName =
    gameDetail?.arena?.name || (game as { ARENA?: string })?.ARENA;
  const arenaCity =
    [gameDetail?.arena?.city, gameDetail?.arena?.state]
      .filter(Boolean)
      .join(", ") || (game as { LOCATION?: string })?.LOCATION;

  const teamStatHome =
    (gameDetail?.team_stats ?? []).find(
      (t: { TEAM_ABBREVIATION?: string; team_abbreviation?: string }) =>
        t.TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION ||
        t.team_abbreviation === game.HOME_TEAM_ABBREVIATION
    ) ?? homeBS;
  const teamStatAway =
    (gameDetail?.team_stats ?? []).find(
      (t: { TEAM_ABBREVIATION?: string; team_abbreviation?: string }) =>
        t.TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION ||
        t.team_abbreviation === game.AWAY_TEAM_ABBREVIATION
    ) ?? awayBS;

  const winnerAbbr =
    game.WINNER_TEAM_ABBREVIATION ??
    (isCompleted && Number(homeScore) !== Number(awayScore)
      ? Number(homeScore) > Number(awayScore)
        ? game.HOME_TEAM_ABBREVIATION
        : game.AWAY_TEAM_ABBREVIATION
      : null);

  const homeWon = isCompleted && winnerAbbr === game.HOME_TEAM_ABBREVIATION;
  const awayWon = isCompleted && winnerAbbr === game.AWAY_TEAM_ABBREVIATION;
  const seasonLabel = game.PLAYOFF_ROUND ?? game.SEASON_TYPE ?? "NBA Regular Season";
  const homeQS = gameDetail?.home_team?.quarter_scores;
  const awayQS = gameDetail?.away_team?.quarter_scores;

  const tabs = [
    ...(isCompleted
      ? [
          {
            id: "game" as const,
            label: "Recap & Stats",
            icon: <LayoutGrid size={14} />,
          },
        ]
      : []),
    {
      id: "away" as const,
      label: `${game.AWAY_TEAM_ABBREVIATION} ${isCompleted ? "Box Score" : "Roster"}`,
      icon: <Users size={14} />,
    },
    {
      id: "home" as const,
      label: `${game.HOME_TEAM_ABBREVIATION} ${isCompleted ? "Box Score" : "Roster"}`,
      icon: <Users size={14} />,
    },
    ...(isCompleted
      ? [{ id: "highlights" as const, label: "Highlights", icon: <Flame size={14} /> }]
      : []),
  ];

  return (
    <div className="space-y-4">
      {refreshError && (
        <div
          role="alert"
          className="rounded border border-status-error/30 bg-status-error/5 p-3 text-xs text-status-error"
        >
          {refreshError}
        </div>
      )}

      {/* ── SCOREBOARD HERO CARD ── */}
      <Card padding="none" className="overflow-hidden">
        {/* Meta Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-light bg-background-tertiary px-4 py-2 text-xs text-text-secondary">
          <div className="flex items-center gap-2">
            {onBack && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onBack}
                leftIcon={<ArrowLeft size={13} />}
                className="mr-1 h-7 px-2 text-xs"
              >
                Geri
              </Button>
            )}
            <Calendar size={13} className="text-text-muted" />
            <span className="font-medium text-text-primary">
              {fmtDate(game.GAME_DATE)}
            </span>
            <span className="text-text-muted">•</span>
            <Badge variant="neutral">{seasonLabel}</Badge>
            {game.SERIES_GAME_NUMBER != null && (
              <Badge variant="neutral">Game {game.SERIES_GAME_NUMBER}</Badge>
            )}
            {game.IS_ELIMINATION_GAME && (
              <Badge variant="error">Elimination Match</Badge>
            )}
            <span className="text-text-muted">•</span>
            {isCompleted ? (
              <Badge variant="success" size="sm" dot>
                {game.GAME_STATUS || "Final"}
              </Badge>
            ) : (
              <span className="inline-flex items-center gap-1 text-text-secondary">
                <Clock size={12} className="text-text-muted" />
                {fmtTipoffTR(game.GAME_START_UTC) ?? (game.GAME_STATUS || "Upcoming")}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {arenaName && (
              <div className="hidden sm:flex items-center gap-1.5 text-text-muted mr-1">
                <MapPin size={12} />
                <span className="truncate max-w-sm">
                  {[arenaName, arenaCity].filter(Boolean).join(" · ")}
                </span>
              </div>
            )}
            {canRefresh && (
              <Button
                variant="secondary"
                size="sm"
                disabled={refreshState === "running" || refreshDone}
                onClick={onRefresh}
                isLoading={refreshState === "running"}
                leftIcon={!refreshState || refreshState !== "running" ? <RefreshCw size={13} /> : undefined}
                className="h-7 px-2.5 text-xs"
              >
                {refreshDone
                  ? "Veri Alındı"
                  : refreshState === "failed"
                  ? "Yeniden Dene"
                  : "Kutu Puanı Çek"}
              </Button>
            )}
            {!isCompleted && onPredict && (
              <Button
                variant="primary"
                size="sm"
                onClick={onPredict}
                className="h-7 px-2.5 text-xs"
              >
                Model Prediction
              </Button>
            )}
          </div>
        </div>

        {/* Primary Matchup Board */}
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
            {/* Away Team */}
            <div
              className={`flex items-center gap-3 sm:gap-4 ${
                awayWon ? "" : isCompleted ? "opacity-75" : ""
              }`}
            >
              <TeamLogo
                abbr={game.AWAY_TEAM_ABBREVIATION}
                name={game.AWAY_TEAM_NAME}
                size={44}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-base sm:text-lg font-semibold ${
                      awayWon ? "text-text-primary" : "text-text-secondary"
                    }`}
                  >
                    {game.AWAY_TEAM_ABBREVIATION}
                  </span>
                  <Badge variant="neutral" size="sm">
                    Away
                  </Badge>
                  {awayWon && (
                    <Badge variant="success" size="sm">
                      Win
                    </Badge>
                  )}
                </div>
                <p
                  className="truncate text-xs text-text-muted mt-0.5"
                  title={game.AWAY_TEAM_NAME ?? ""}
                >
                  {teamFull(game.AWAY_TEAM_ABBREVIATION, game.AWAY_TEAM_NAME)}
                </p>
              </div>
            </div>

            {/* Score / Center Display */}
            <div className="flex flex-col items-center justify-center min-w-[90px] sm:min-w-[130px] text-center">
              {isCompleted ? (
                <div>
                  <div className="flex items-baseline justify-center gap-2 text-2xl sm:text-3xl font-semibold tabular-nums">
                    <span
                      className={
                        awayWon ? "text-text-primary font-bold" : "text-text-secondary"
                      }
                    >
                      {awayScore ?? "—"}
                    </span>
                    <span className="text-text-muted font-normal text-lg sm:text-xl">
                      :
                    </span>
                    <span
                      className={
                        homeWon ? "text-text-primary font-bold" : "text-text-secondary"
                      }
                    >
                      {homeScore ?? "—"}
                    </span>
                  </div>
                  {margin > 0 && winnerAbbr && (
                    <p className="mt-1 text-[11px] font-medium text-text-muted">
                      {winnerAbbr} +{margin}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <span className="text-sm font-semibold text-text-secondary">
                    VS
                  </span>
                  {fmtTipoffTR(game.GAME_START_UTC) && (
                    <span className="mt-1 text-xs font-medium tabular-nums text-text-primary">
                      {fmtTipoffTR(game.GAME_START_UTC)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Home Team */}
            <div
              className={`flex items-center justify-end gap-3 sm:gap-4 text-right ${
                homeWon ? "" : isCompleted ? "opacity-75" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center justify-end gap-2">
                  {homeWon && (
                    <Badge variant="success" size="sm">
                      Win
                    </Badge>
                  )}
                  <Badge variant="neutral" size="sm">
                    Home
                  </Badge>
                  <span
                    className={`text-base sm:text-lg font-semibold ${
                      homeWon ? "text-text-primary" : "text-text-secondary"
                    }`}
                  >
                    {game.HOME_TEAM_ABBREVIATION}
                  </span>
                </div>
                <p
                  className="truncate text-xs text-text-muted mt-0.5"
                  title={game.HOME_TEAM_NAME ?? ""}
                >
                  {teamFull(game.HOME_TEAM_ABBREVIATION, game.HOME_TEAM_NAME)}
                </p>
              </div>
              <TeamLogo
                abbr={game.HOME_TEAM_ABBREVIATION}
                name={game.HOME_TEAM_NAME}
                size={44}
              />
            </div>
          </div>
        </div>

        {/* Referees Bar (if available) */}
        {officials.length > 0 && (
          <div className="border-t border-border-light bg-background-tertiary/50 px-4 py-2 text-center text-xs text-text-secondary">
            <span>
              Officials:{" "}
              <span className="text-text-primary font-medium">
                {officials.map((o) => o.cleanName).join(", ")}
              </span>
            </span>
          </div>
        )}

        {/* Tab Navigation attached seamlessly to the card */}
        <nav
          aria-label="Game detail sections"
          role="tablist"
          className="flex border-t border-border bg-background-primary px-3 sm:px-4"
        >
          {tabs.map((t) => {
            const isTabActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isTabActive}
                onClick={() =>
                  setActiveTab(t.id as "game" | "home" | "away" | "highlights")
                }
                className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-xs sm:text-sm font-medium transition-colors ${
                  isTabActive
                    ? "border-primary text-text-primary font-semibold"
                    : "border-transparent text-text-secondary hover:border-border hover:text-text-primary"
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
      </Card>

      {/* ── TAB PANELS ── */}
      {activeTab === "game" && (
        <div role="tabpanel" className="space-y-4">
          {isCompleted ? (
            <>
              {/* Quarter Line Scores */}
              <QuarterScores
                awayAbbr={game.AWAY_TEAM_ABBREVIATION}
                homeAbbr={game.HOME_TEAM_ABBREVIATION}
                awayName={game.AWAY_TEAM_NAME}
                homeName={game.HOME_TEAM_NAME}
                awayQS={awayQS}
                homeQS={homeQS}
                awayScore={Number(awayScore)}
                homeScore={Number(homeScore)}
                winnerAbbr={winnerAbbr}
                margin={margin}
              />

              {/* Game Leaders and Key Contributors */}
              <TopPerformers
                topGame={topGame}
                leaders={gameDetail?.game_leaders}
              />

              {/* Symmetrical Team Stats & Shooting Summary */}
              <div className="grid items-stretch gap-4 lg:grid-cols-2">
                <TeamComparisonBars
                  away={awayBS}
                  home={homeBS}
                  awayPlayers={topAway}
                  homePlayers={topHome}
                />
                <ShootingSummary
                  away={teamStatAway as TeamBoxScore | null}
                  home={teamStatHome as TeamBoxScore | null}
                />
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ── HOME TEAM TAB ── */}
      {activeTab === "home" && (
        <div role="tabpanel" className="space-y-4">
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  {gameDetail?.home_team?.team_name ||
                    game.HOME_TEAM_NAME ||
                    game.HOME_TEAM_ABBREVIATION}
                </h3>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {game.HOME_TEAM_ABBREVIATION} · Home Team
                </p>
              </div>
              {isCompleted && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded border border-border bg-background-tertiary px-3 py-1.5 text-center">
                    <p className="text-base font-semibold tabular-nums text-text-primary">
                      {homeScore ?? "—"}
                    </p>
                    <p className="text-[11px] font-medium text-text-muted">PTS</p>
                  </div>
                  <div className="rounded border border-border bg-background-tertiary px-3 py-1.5 text-center">
                    <p className="text-base font-semibold tabular-nums text-text-primary">
                      {fmtInt(homeBS?.REB ?? null)}
                    </p>
                    <p className="text-[11px] font-medium text-text-muted">REB</p>
                  </div>
                  <div className="rounded border border-border bg-background-tertiary px-3 py-1.5 text-center">
                    <p className="text-base font-semibold tabular-nums text-text-primary">
                      {fmtInt(homeBS?.AST ?? null)}
                    </p>
                    <p className="text-[11px] font-medium text-text-muted">AST</p>
                  </div>
                  <div className="rounded border border-border bg-background-tertiary px-3 py-1.5 text-center">
                    <p className="text-base font-semibold tabular-nums text-text-primary">
                      {fmtInt(homeBS?.TOV ?? null)}
                    </p>
                    <p className="text-[11px] font-medium text-text-muted">TOV</p>
                  </div>
                </div>
              )}
            </div>
            {isCompleted && topHome.length > 0 ? (
              <PlayerBoxTable players={topHome} />
            ) : loadingRosters ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 py-2">
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full rounded" />
                ))}
              </div>
            ) : homeRoster.length > 0 ? (
              renderRosterByPositions(homeRoster, game.HOME_TEAM_ABBREVIATION ?? "")
            ) : (
              <div className="rounded border border-border bg-background-tertiary p-6 text-center">
                <p className="text-xs font-medium text-text-secondary">
                  Kadro bilgisi bulunamadı.
                </p>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── AWAY TEAM TAB ── */}
      {activeTab === "away" && (
        <div role="tabpanel" className="space-y-4">
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  {gameDetail?.away_team?.team_name ||
                    game.AWAY_TEAM_NAME ||
                    game.AWAY_TEAM_ABBREVIATION}
                </h3>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {game.AWAY_TEAM_ABBREVIATION} · Away Team
                </p>
              </div>
              {isCompleted && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded border border-border bg-background-tertiary px-3 py-1.5 text-center">
                    <p className="text-base font-semibold tabular-nums text-text-primary">
                      {awayScore ?? "—"}
                    </p>
                    <p className="text-[11px] font-medium text-text-muted">PTS</p>
                  </div>
                  <div className="rounded border border-border bg-background-tertiary px-3 py-1.5 text-center">
                    <p className="text-base font-semibold tabular-nums text-text-primary">
                      {fmtInt(awayBS?.REB ?? null)}
                    </p>
                    <p className="text-[11px] font-medium text-text-muted">REB</p>
                  </div>
                  <div className="rounded border border-border bg-background-tertiary px-3 py-1.5 text-center">
                    <p className="text-base font-semibold tabular-nums text-text-primary">
                      {fmtInt(awayBS?.AST ?? null)}
                    </p>
                    <p className="text-[11px] font-medium text-text-muted">AST</p>
                  </div>
                  <div className="rounded border border-border bg-background-tertiary px-3 py-1.5 text-center">
                    <p className="text-base font-semibold tabular-nums text-text-primary">
                      {fmtInt(awayBS?.TOV ?? null)}
                    </p>
                    <p className="text-[11px] font-medium text-text-muted">TOV</p>
                  </div>
                </div>
              )}
            </div>
            {isCompleted && topAway.length > 0 ? (
              <PlayerBoxTable players={topAway} />
            ) : loadingRosters ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 py-2">
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full rounded" />
                ))}
              </div>
            ) : awayRoster.length > 0 ? (
              renderRosterByPositions(awayRoster, game.AWAY_TEAM_ABBREVIATION ?? "")
            ) : (
              <div className="rounded border border-border bg-background-tertiary p-6 text-center">
                <p className="text-xs font-medium text-text-secondary">
                  Kadro bilgisi bulunamadı.
                </p>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── HIGHLIGHTS TAB ── */}
      {activeTab === "highlights" && (
        <div role="tabpanel" aria-label="Highlights">
          <HighlightsTab
            gameId={game.GAME_ID}
            season={season ?? game.SEASON ?? gameDetail?.season ?? undefined}
            initialData={freshPlayByPlay}
          />
        </div>
      )}
    </div>
  );
}

/* ── HIGHLIGHTS SUB-COMPONENTS ── */

const KEY_MOMENT_REASONS = new Set([
  "badge",
  "clutch",
  "lead_change",
  "team_run",
  "back_to_back_3",
  "player_3_run",
  "30_pt_game",
  "20_pt_game",
  "double_double",
  "triple_double",
  "10_ast",
  "15_reb",
  "5_stl",
  "5_blk",
]);

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
  badges?: string[];
  moment_reasons?: string[];
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

function periodName(period: number) {
  return period <= 4 ? `Q${period}` : `OT${period - 4}`;
}

function getMomentReasonMeta(reason: string) {
  switch (reason) {
    case "back_to_back_3":
      return {
        label: "Back-to-Back 3PT",
        icon: Flame,
        badgeClass: "bg-status-warning/10 text-status-warning border-status-warning/30",
        highlightRow: true,
      };
    case "player_3_run":
      return {
        label: "3PT Heat Check",
        icon: Flame,
        badgeClass: "bg-status-warning/10 text-status-warning border-status-warning/30",
        highlightRow: true,
      };
    case "lead_change":
      return {
        label: "Lead Change",
        icon: ArrowRightLeft,
        badgeClass: "bg-status-success/10 text-status-success border-status-success/30",
        highlightRow: false,
      };
    case "clutch":
      return {
        label: "Clutch Moment",
        icon: Zap,
        badgeClass: "bg-status-error/10 text-status-error border-status-error/30",
        highlightRow: true,
      };
    case "team_run":
      return {
        label: "Scoring Run",
        icon: TrendingUp,
        badgeClass: "bg-primary/10 text-primary border-primary/25",
        highlightRow: false,
      };
    case "triple_double":
      return {
        label: "Triple-Double",
        icon: Award,
        badgeClass: "bg-status-info/10 text-status-info border-status-info/30",
        highlightRow: true,
      };
    case "double_double":
      return {
        label: "Double-Double",
        icon: Award,
        badgeClass: "bg-status-info/10 text-status-info border-status-info/30",
        highlightRow: false,
      };
    case "30_pt_game":
      return {
        label: "30+ PTS Game",
        icon: Sparkles,
        badgeClass: "bg-status-info/10 text-status-info border-status-info/30",
        highlightRow: true,
      };
    case "20_pt_game":
      return {
        label: "20+ PTS",
        icon: Sparkles,
        badgeClass: "bg-background-tertiary text-text-secondary border-border",
        highlightRow: false,
      };
    case "10_ast":
    case "15_reb":
    case "5_stl":
    case "5_blk":
      return {
        label: reason.replaceAll("_", " ").toUpperCase(),
        icon: Award,
        badgeClass: "bg-background-tertiary text-text-secondary border-border",
        highlightRow: false,
      };
    default:
      return {
        label: reason.replaceAll("_", " "),
        icon: Sparkles,
        badgeClass: "bg-background-tertiary text-text-secondary border-border",
        highlightRow: false,
      };
  }
}

function HighlightsTab({
  gameId,
  season,
  initialData,
}: {
  gameId: string;
  season?: string;
  initialData?: PbpData | null;
}) {
  const [data, setData] = useState<PbpData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "threes" | "leads" | "clutch" | "runs">("all");

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
      return;
    }
    const normGameId = normalizePbpGameId(gameId);
    loadArchivedPlayByPlay(normGameId, season)
      .then((pbp: PbpData) => {
        setData(pbp);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load highlights.");
        setLoading(false);
      });
  }, [gameId, season, initialData]);

  const rawEvents = data?.events ?? [];
  const highlights = useMemo(() => {
    return rawEvents.filter(
      (e) => (e.badges?.length ?? 0) > 0 || e.moment_reasons?.some((r) => KEY_MOMENT_REASONS.has(r))
    );
  }, [rawEvents]);

  const baseDisplayEvents = highlights.length > 0 ? highlights : rawEvents.filter((e) => e.points_scored > 0);

  const filteredEvents = useMemo(() => {
    if (filterType === "all") return baseDisplayEvents;
    return baseDisplayEvents.filter((e) => {
      const reasons = [...(e.moment_reasons ?? []), ...(e.badges ?? [])];
      if (filterType === "threes") {
        return reasons.some((r) => r === "back_to_back_3" || r === "player_3_run") || e.points_scored === 3;
      }
      if (filterType === "leads") {
        return reasons.some((r) => r === "lead_change");
      }
      if (filterType === "clutch") {
        return reasons.some((r) => r === "clutch");
      }
      if (filterType === "runs") {
        return reasons.some((r) => r === "team_run");
      }
      return true;
    });
  }, [baseDisplayEvents, filterType]);

  const filterCounts = useMemo(() => {
    const threes = baseDisplayEvents.filter((e) =>
      [...(e.moment_reasons ?? []), ...(e.badges ?? [])].some((r) => r === "back_to_back_3" || r === "player_3_run") || e.points_scored === 3
    ).length;
    const leads = baseDisplayEvents.filter((e) =>
      [...(e.moment_reasons ?? []), ...(e.badges ?? [])].some((r) => r === "lead_change")
    ).length;
    const clutch = baseDisplayEvents.filter((e) =>
      [...(e.moment_reasons ?? []), ...(e.badges ?? [])].some((r) => r === "clutch")
    ).length;
    const runs = baseDisplayEvents.filter((e) =>
      [...(e.moment_reasons ?? []), ...(e.badges ?? [])].some((r) => r === "team_run")
    ).length;
    return { all: baseDisplayEvents.length, threes, leads, clutch, runs };
  }, [baseDisplayEvents]);

  if (loading && !data) {
    return (
      <div className="flex h-40 items-center justify-center gap-2 rounded border border-border bg-background-primary">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-xs text-text-secondary">Loading highlights...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-8 text-center">
        <Clock size={20} className="mx-auto mb-2 text-text-muted" />
        <p className="text-xs text-text-secondary">
          Highlights are not available for this game.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border-light pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Flame size={16} className="text-status-warning" />
            <h3 className="text-sm font-semibold text-text-primary">
              Maçın Önemli Anları & Pozisyonlar
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-text-secondary">
            Liderlik değişimleri, seri üçlükler, kritik clutch dakikalar ve dönüm noktaları
          </p>
        </div>
        <Badge variant="neutral">{filteredEvents.length} Pozisyon</Badge>
      </div>

      {/* Quick Filter Chips */}
      <div className="flex flex-wrap items-center gap-1.5 pb-1">
        <button
          type="button"
          onClick={() => setFilterType("all")}
          className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
            filterType === "all"
              ? "border-primary bg-primary text-text-inverse"
              : "border-border bg-background-primary text-text-secondary hover:bg-background-tertiary"
          }`}
        >
          <span>Tümü</span>
          <span className="tabular-nums opacity-75">{filterCounts.all}</span>
        </button>
        {filterCounts.threes > 0 && (
          <button
            type="button"
            onClick={() => setFilterType("threes")}
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
              filterType === "threes"
                ? "border-status-warning bg-status-warning/15 text-status-warning font-semibold"
                : "border-border bg-background-primary text-text-secondary hover:bg-background-tertiary"
            }`}
          >
            <Flame size={13} className="text-status-warning" />
            <span>Arka Arkaya 3'lükler</span>
            <span className="tabular-nums opacity-75">{filterCounts.threes}</span>
          </button>
        )}
        {filterCounts.leads > 0 && (
          <button
            type="button"
            onClick={() => setFilterType("leads")}
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
              filterType === "leads"
                ? "border-status-success bg-status-success/15 text-status-success font-semibold"
                : "border-border bg-background-primary text-text-secondary hover:bg-background-tertiary"
            }`}
          >
            <ArrowRightLeft size={13} className="text-status-success" />
            <span>Liderlik Değişimi</span>
            <span className="tabular-nums opacity-75">{filterCounts.leads}</span>
          </button>
        )}
        {filterCounts.clutch > 0 && (
          <button
            type="button"
            onClick={() => setFilterType("clutch")}
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
              filterType === "clutch"
                ? "border-status-error bg-status-error/15 text-status-error font-semibold"
                : "border-border bg-background-primary text-text-secondary hover:bg-background-tertiary"
            }`}
          >
            <Zap size={13} className="text-status-error" />
            <span>Clutch</span>
            <span className="tabular-nums opacity-75">{filterCounts.clutch}</span>
          </button>
        )}
        {filterCounts.runs > 0 && (
          <button
            type="button"
            onClick={() => setFilterType("runs")}
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
              filterType === "runs"
                ? "border-primary bg-primary/10 text-primary font-semibold"
                : "border-border bg-background-primary text-text-secondary hover:bg-background-tertiary"
            }`}
          >
            <TrendingUp size={13} className="text-primary" />
            <span>Seriler</span>
            <span className="tabular-nums opacity-75">{filterCounts.runs}</span>
          </button>
        )}
      </div>

      {/* Events Timeline List */}
      <div className="max-h-[640px] overflow-y-auto divide-y divide-border-light pr-1">
        {filteredEvents.map((e, idx) => {
          const rawReasons = [
            ...(e.moment_reasons ?? []).filter((r) => KEY_MOMENT_REASONS.has(r) && r !== "badge"),
            ...(e.badges ?? []),
          ];
          const hasSpecialHighlight = rawReasons.some((r) => r === "back_to_back_3" || r === "player_3_run" || r === "clutch");

          return (
            <div
              key={`hl-${e.period}-${e.clock}-${idx}`}
              className={`flex items-start gap-3 py-3 px-2 transition-colors first:pt-1 last:pb-1 hover:bg-background-tertiary/40 ${
                hasSpecialHighlight ? "bg-status-warning/[0.03]" : ""
              }`}
            >
              {/* Player Photo or Team Logo */}
              <div className="shrink-0 pt-0.5">
                {e.player_id ? (
                  <PlayerPhoto
                    playerId={e.player_id}
                    name={e.player_name || "NBA Player"}
                    size={38}
                    className="ring-1 ring-border"
                  />
                ) : e.team ? (
                  <TeamLogo abbr={e.team} size={38} />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background-tertiary text-text-muted">
                    <Clock size={16} />
                  </div>
                )}
              </div>

              {/* Main Info */}
              <div className="min-w-0 flex-1">
                {/* Time & Period Row */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold tabular-nums text-text-secondary">
                    {periodName(e.period)} · {e.clock}
                  </span>
                  {e.player_name && (
                    <span className="text-xs font-semibold text-text-primary">
                      {e.player_name}
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className="mt-1 text-xs text-text-secondary leading-snug">
                  {e.description || e.action_type}
                </p>

                {/* Enhanced Reason Badges */}
                {rawReasons.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {rawReasons.map((r) => {
                      const meta = getMomentReasonMeta(r);
                      const IconComponent = meta.icon;
                      return (
                        <span
                          key={r}
                          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium tracking-tight ${meta.badgeClass}`}
                        >
                          <IconComponent size={12} className="shrink-0" />
                          <span>{meta.label}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Score Table / Points */}
              <div className="shrink-0 text-right pt-0.5">
                <div className="text-xs font-semibold tabular-nums text-text-primary">
                  {e.score_away} - {e.score_home}
                </div>
                {e.points_scored > 0 && (
                  <div className="mt-0.5 inline-block rounded-sm bg-status-success/10 px-1.5 py-0.2 text-xs font-semibold tabular-nums text-status-success">
                    +{e.points_scored} PTS
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filteredEvents.length === 0 && (
          <div className="py-12 text-center text-xs text-text-muted">
            Seçili filtreye uygun maç anı bulunamadı.
          </div>
        )}
      </div>
    </Card>
  );
}
