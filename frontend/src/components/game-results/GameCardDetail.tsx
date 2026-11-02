import { useState, useEffect } from "react";
import {
  Clock,
  RefreshCw,
  MapPin,
  ArrowLeft,
  Calendar,
} from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { GameFeedRow, GameDetail } from "../../types/gameFeed";
import type { TeamBoxScore, PlayerBoxScore } from "./types";
import {
  fmtInt,
  fmtTipoffTR,
  teamFull,
  parseOfficials,
  sortPlayersByMinutes,
} from "./utils";
import { QuarterScores } from "./QuarterScores";
import { PeriodTabs, QuarterPlayerTable, useGameQuarters } from "./QuarterBreakdown";
import { TeamComparisonBars } from "./TeamComparisonBars";
import { ShootingSummary } from "./ShootingSummary";
import { TopPerformers } from "./TopPerformers";
import { PlayerBoxTable } from "./PlayerBoxTable";
import { HighlightsTab, type PbpData } from "./HighlightsTab";
import { Button, Badge, Card, Skeleton } from "../common";
import { loadPrivateApi, loadPrivateApiFresh } from "../../lib/dataCache";
import PlayerPhoto from "../PlayerPhoto";
import { useLanguage } from "../../context/LanguageContext";

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
  homeRecord?: string;
  awayRecord?: string;
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
  homeRecord,
  awayRecord,
}: GameCardDetailProps) {
  const { language, formatDate } = useLanguage();
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
          <span className="text-xs font-semibold text-text-secondary">
            {title}
          </span>
          <span className="text-xs font-medium text-text-muted">
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
  const quarterSeason = season ?? game.SEASON ?? gameDetail?.season ?? undefined;
  const { data: quarterData } = useGameQuarters(isCompleted ? game.GAME_ID : null, quarterSeason);
  const fromPbp = (key: "home" | "away") =>
    quarterData?.quarter_scores?.length ? quarterData.quarter_scores.map((q) => q[key]) : undefined;
  const homeQS = gameDetail?.home_team?.quarter_scores?.length ? gameDetail.home_team.quarter_scores : fromPbp("home");
  const awayQS = gameDetail?.away_team?.quarter_scores?.length ? gameDetail.away_team.quarter_scores : fromPbp("away");
  const firstHalfScore =
    awayQS && homeQS && awayQS.length >= 2 && homeQS.length >= 2
      ? `${awayQS[0] + awayQS[1]} - ${homeQS[0] + homeQS[1]}`
      : null;
  const [period, setPeriod] = useState<number | "total">("total");
  const nameById: Record<number, string> = {};
  [...topHome, ...topAway].forEach((p) => {
    nameById[p.PLAYER_ID] = p.PLAYER_NAME;
  });

  const nick = (abbr: string, name?: string | null) => {
    const full = teamFull(abbr, name);
    return full.endsWith("Trail Blazers") ? "Trail Blazers" : full.split(" ").slice(-1)[0];
  };

  const tabs: { id: "game" | "home" | "away" | "highlights"; label: string }[] = [
    ...(isCompleted
      ? [{ id: "game" as const, label: language === "tr" ? "Özet" : "Recap" }]
      : []),
    { id: "away" as const, label: nick(game.AWAY_TEAM_ABBREVIATION, game.AWAY_TEAM_NAME) },
    { id: "home" as const, label: nick(game.HOME_TEAM_ABBREVIATION, game.HOME_TEAM_NAME) },
    ...(isCompleted
      ? [{ id: "highlights" as const, label: language === "tr" ? "Önemli Anlar" : "Highlights" }]
      : []),
  ];

  const renderTeamPanel = (side: "home" | "away") => {
    const abbr = (side === "home" ? game.HOME_TEAM_ABBREVIATION : game.AWAY_TEAM_ABBREVIATION) ?? "";
    const name = side === "home" ? game.HOME_TEAM_NAME : game.AWAY_TEAM_NAME;
    const detailName = side === "home" ? gameDetail?.home_team?.team_name : gameDetail?.away_team?.team_name;
    const bs = side === "home" ? homeBS : awayBS;
    const score = side === "home" ? homeScore : awayScore;
    const players = side === "home" ? topHome : topAway;
    const roster = side === "home" ? homeRoster : awayRoster;
    const stats = [
      { k: "PTS", v: score ?? "—" },
      { k: "REB", v: fmtInt(bs?.REB ?? null) },
      { k: "AST", v: fmtInt(bs?.AST ?? null) },
      { k: "TOV", v: fmtInt(bs?.TOV ?? null) },
    ];
    return (
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <TeamLogo abbr={abbr} name={name} size={32} />
            <h3 className="text-sm font-semibold text-text-primary">
              {detailName || teamFull(abbr, name)}
            </h3>
          </div>
          {isCompleted && (
            <p className="flex items-center gap-4 text-xs text-text-muted">
              {stats.map((s) => (
                <span key={s.k}>
                  <span className="text-sm font-semibold tabular-nums text-text-primary">{s.v}</span> {s.k}
                </span>
              ))}
            </p>
          )}
        </div>
        {isCompleted && players.length > 0 && quarterData && quarterData.periods.length > 0 && (
          <div className="mb-3">
            <PeriodTabs
              periods={quarterData.periods}
              value={period}
              onChange={setPeriod}
              totalLabel={language === "tr" ? "Toplam" : "Total"}
            />
          </div>
        )}
        {isCompleted && players.length > 0 ? (
          period !== "total" && quarterData ? (
            <QuarterPlayerTable data={quarterData} team={abbr} period={period} nameById={nameById} />
          ) : (
            <PlayerBoxTable players={players} />
          )
        ) : loadingRosters ? (
          <div className="grid grid-cols-2 gap-2 py-2 sm:grid-cols-3 md:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded" />
            ))}
          </div>
        ) : roster.length > 0 ? (
          renderRosterByPositions(roster, abbr)
        ) : (
          <div className="rounded border border-border bg-background-tertiary p-6 text-center">
            <p className="text-xs font-medium text-text-secondary">
              {language === "tr" ? "Kadro bilgisi bulunamadı." : "Roster not available."}
            </p>
          </div>
        )}
      </Card>
    );
  };

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
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <div className="min-w-0">
            {onBack && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onBack}
                leftIcon={<ArrowLeft size={16} />}
                className="h-7 px-2 text-xs"
              >
                {language === "tr" ? "Geri" : "Back"}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canRefresh && (
              <Button
                variant="secondary"
                size="sm"
                disabled={refreshState === "running" || refreshDone}
                onClick={onRefresh}
                isLoading={refreshState === "running"}
                leftIcon={!refreshState || refreshState !== "running" ? <RefreshCw size={16} /> : undefined}
                className="h-7 px-2.5 text-xs"
              >
                {refreshDone
                  ? (language === "tr" ? "Veri Alındı" : "Cached")
                  : refreshState === "failed"
                  ? (language === "tr" ? "Yeniden Dene" : "Retry")
                  : (language === "tr" ? "Kutu Puanı Çek" : "Fetch Box Score")}
              </Button>
            )}
            {!isCompleted && onPredict && (
              <Button variant="primary" size="sm" onClick={onPredict} className="h-7 px-2.5 text-xs">
                {language === "tr" ? "Model Tahmini" : "Model Prediction"}
              </Button>
            )}
          </div>
        </div>

        <div className="px-4 pb-5 pt-3 sm:px-8 sm:pb-7">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-10">
            {(["away", "home"] as const).map((side) => {
              const abbr = side === "away" ? game.AWAY_TEAM_ABBREVIATION : game.HOME_TEAM_ABBREVIATION;
              const name = side === "away" ? game.AWAY_TEAM_NAME : game.HOME_TEAM_NAME;
              const record = side === "away" ? awayRecord : homeRecord;
              const won = side === "away" ? awayWon : homeWon;
              const sideLabel = side === "away"
                ? (language === "tr" ? "Deplasman" : "Away")
                : (language === "tr" ? "Ev Sahibi" : "Home");
              return (
                <div
                  key={side}
                  className={`flex flex-col items-center gap-2 text-center ${
                    side === "home" ? "order-3" : "order-1"
                  } ${isCompleted && !won ? "opacity-70" : ""}`}
                >
                  <TeamLogo abbr={abbr} name={name} size={56} />
                  <div className="min-w-0 max-w-full">
                    <p className="truncate text-sm font-semibold text-text-primary sm:text-base" title={name ?? ""}>
                      {teamFull(abbr, name)}
                    </p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {[record, sideLabel].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
              );
            })}

            <div className="order-2 flex flex-col items-center text-center">
              {isCompleted ? (
                <>
                  <div className="flex items-baseline justify-center gap-2 text-4xl font-semibold tabular-nums sm:gap-3 sm:text-5xl">
                    <span className={awayWon ? "text-text-primary" : "text-text-muted"}>{awayScore ?? "—"}</span>
                    <span className="text-2xl font-normal text-text-muted sm:text-3xl">–</span>
                    <span className={homeWon ? "text-text-primary" : "text-text-muted"}>{homeScore ?? "—"}</span>
                  </div>
                  <p className="mt-2 text-xs font-medium tabular-nums text-text-muted">
                    {firstHalfScore ?? game.GAME_STATUS ?? "Final"}
                  </p>
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold text-text-secondary">VS</span>
                  <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium tabular-nums text-text-primary">
                    <Clock size={14} className="text-text-muted" />
                    {fmtTipoffTR(game.GAME_START_UTC, language) ??
                      (game.GAME_STATUS || (language === "tr" ? "Gelecek" : "Upcoming"))}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-border-light px-4 py-2.5 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Calendar size={14} />
            {formatDate(game.GAME_DATE)}
          </span>
          <span>{seasonLabel}</span>
          {game.SERIES_GAME_NUMBER != null && <span>Game {game.SERIES_GAME_NUMBER}</span>}
          {game.IS_ELIMINATION_GAME && (
            <Badge variant="error" size="sm">{language === "tr" ? "Eleme Maçı" : "Elimination Match"}</Badge>
          )}
          {arenaName && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={14} />
              {[arenaName, arenaCity].filter(Boolean).join(" · ")}
            </span>
          )}
          {officials.length > 0 && (
            <span>
              {language === "tr" ? "Hakemler: " : "Officials: "}
              {officials.map((o) => o.cleanName).join(", ")}
            </span>
          )}
        </div>

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
                onClick={() => setActiveTab(t.id)}
                className={`border-b-2 px-3 py-3 text-xs font-medium transition-colors sm:text-sm ${
                  isTabActive
                    ? "border-primary text-text-primary font-semibold"
                    : "border-transparent text-text-secondary hover:border-border hover:text-text-primary"
                }`}
              >
                {t.label}
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

              {/* Game Leaders and Key Contributors */}
              <TopPerformers
                topGame={topGame}
                leaders={gameDetail?.game_leaders}
              />
            </>
          ) : null}
        </div>
      )}

      {/* ── TEAM TABS ── */}
      {(activeTab === "home" || activeTab === "away") && (
        <div role="tabpanel">{renderTeamPanel(activeTab)}</div>
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
