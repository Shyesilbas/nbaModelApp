import { useEffect, useState } from "react";
import { Clock, Trophy, Sparkles, LayoutGrid, Users, ListOrdered, RefreshCw, MapPin, Shield } from "lucide-react";
import TeamLogo from "../TeamLogo";
import PlayerPhoto from "../PlayerPhoto";
import { PlayerBoxTable } from "./PlayerBoxTable";
import { getTeamTheme } from "../../lib/nbaTeams";
import type { GameDetail, GameFeedRow } from "../../types/gameFeed";
import { loadArchivedPlayByPlay } from "../../lib/archiveData";
import { GameLeaders } from "./GameLeaders";
import { GameSummaryBlock } from "./GameSummaryBlock";
import { QuarterScores } from "./QuarterScores";
import { ShootingSummary } from "./ShootingSummary";
import { TeamComparisonBars } from "./TeamComparisonBars";
import { TopPerformers } from "./TopPerformers";
import type { PlayerBoxScore, TeamBoxScore } from "./types";
import { fmtDate, fmtInt, teamCity, teamFull, isGameEligibleForRefresh, parseOfficials } from "./utils";

/* ── Game Detail View ── */
export function GameCardDetail({
  game,
  gameDetail,
  homeBS,
  awayBS,
  homePlayers,
  awayPlayers,
  initialTab = "game",
  season,
  onPredict,
  refreshState = "idle",
  refreshError,
  refreshDone = false,
  freshPlayByPlay,
  onRefresh,
}: {
  game: GameFeedRow;
  gameDetail: GameDetail | null;
  homeBS: TeamBoxScore | null;
  awayBS: TeamBoxScore | null;
  homePlayers: PlayerBoxScore[];
  awayPlayers: PlayerBoxScore[];
  initialTab?: "game" | "home" | "away" | "pbp";
  season?: string;
  onPredict?: () => void;
  refreshState?: "idle" | "running" | "failed";
  refreshError?: string | null;
  refreshDone?: boolean;
  freshPlayByPlay?: PbpData | null;
  onRefresh?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"game" | "home" | "away" | "pbp">(
    initialTab || "game"
  );

  const normalizedStatus = (game.GAME_STATUS ?? "").trim().toLowerCase();
  const hasFinalStatus = /^(final|finished|complete|completed)\b/.test(normalizedStatus);
  const isLiveStatus = /live|progress|halftime|quarter|period/.test(normalizedStatus);
  const isCompleted = hasFinalStatus || (
    !isLiveStatus && (
      (game.HOME_SCORE != null && game.AWAY_SCORE != null &&
      Number.isFinite(Number(game.HOME_SCORE)) && Number.isFinite(Number(game.AWAY_SCORE))) ||
      (homeBS?.PTS != null && awayBS?.PTS != null) ||
      (gameDetail?.home_team?.score != null && gameDetail?.away_team?.score != null)
    )
  );

  const hasGameData =
    isCompleted ||
    Boolean(game.WINNER_TEAM_ABBREVIATION) ||
    Boolean(gameDetail?.home_team?.score != null && gameDetail?.away_team?.score != null) ||
    Boolean(homeBS != null || awayBS != null) ||
    ((gameDetail?.player_stats?.length ?? 0) > 0) ||
    (homePlayers.length > 0 || awayPlayers.length > 0);

  const canRefresh = !hasGameData && isGameEligibleForRefresh(game) && Boolean(onRefresh);

  const awayTheme = getTeamTheme(game.AWAY_TEAM_ABBREVIATION);
  const homeTheme = getTeamTheme(game.HOME_TEAM_ABBREVIATION);

  const homeScore = isCompleted ? (gameDetail?.home_team?.score ?? homeBS?.PTS ?? game.HOME_SCORE) : null;
  const awayScore = isCompleted ? (gameDetail?.away_team?.score ?? awayBS?.PTS ?? game.AWAY_SCORE) : null;
  const margin   = isCompleted ? Math.abs((homeScore ?? 0) - (awayScore ?? 0)) : 0;
  const topHome  = [...homePlayers].sort((a, b) => (b.PTS ?? 0) - (a.PTS ?? 0) || (b.MIN ?? 0) - (a.MIN ?? 0));
  const topAway  = [...awayPlayers].sort((a, b) => (b.PTS ?? 0) - (a.PTS ?? 0) || (b.MIN ?? 0) - (a.MIN ?? 0));
  const topGame  = [...(gameDetail?.player_stats ?? [...homePlayers, ...awayPlayers])]
    .sort((a: any, b: any) => (b.PTS ?? b.pts ?? 0) - (a.PTS ?? a.pts ?? 0) || (b.MIN ?? b.min ?? 0) - (a.MIN ?? a.min ?? 0));

  const officials  = parseOfficials([...(game.OFFICIALS ?? []), ...(gameDetail?.officials ?? [])])
    .filter((official, index, rows) => rows.findIndex((row) => row.cleanName.toLowerCase() === official.cleanName.toLowerCase()) === index);
  const arenaName  = gameDetail?.arena?.name?.trim() || (game as { ARENA?: string })?.ARENA;
  const arenaCity  = [gameDetail?.arena?.city, gameDetail?.arena?.state].filter(Boolean).join(", ") || (game as { LOCATION?: string })?.LOCATION;
  const teamStatHome = (gameDetail?.team_stats ?? []).find((t: any) => t.TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION || t.team_abbreviation === game.HOME_TEAM_ABBREVIATION) ?? homeBS;
  const teamStatAway = (gameDetail?.team_stats ?? []).find((t: any) => t.TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION || t.team_abbreviation === game.AWAY_TEAM_ABBREVIATION) ?? awayBS;

  const winnerAbbr = game.WINNER_TEAM_ABBREVIATION ?? (isCompleted && Number(homeScore) !== Number(awayScore)
    ? Number(homeScore) > Number(awayScore) ? game.HOME_TEAM_ABBREVIATION : game.AWAY_TEAM_ABBREVIATION
    : null);
  const homeWon   = isCompleted && winnerAbbr === game.HOME_TEAM_ABBREVIATION;
  const awayWon   = isCompleted && winnerAbbr === game.AWAY_TEAM_ABBREVIATION;
  const winnerTheme = awayWon ? awayTheme : homeWon ? homeTheme : null;
  const seasonLabel = game.PLAYOFF_ROUND ?? game.SEASON_TYPE ?? "NBA";
  const homeQS = gameDetail?.home_team?.quarter_scores;
  const awayQS = gameDetail?.away_team?.quarter_scores;


  return (
    <div className="space-y-5 rounded-[2rem] bg-[#eef2f7] p-2 animate-fade-in-up sm:space-y-6 sm:p-4">

      {/* ══════════════════════════════════════
          PREMIUM HERO — Score-centric layout
          ══════════════════════════════════════ */}
      <section className="relative isolate overflow-hidden rounded-[1.75rem] border border-slate-800 bg-[#0b1220] text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)] sm:rounded-[2rem]">
        {/* Top Dual Gradient Accent Line */}
        <div 
          className="absolute inset-x-0 top-0 h-1.5"
          style={{
            background: `linear-gradient(90deg, ${awayTheme.primary} 0%, ${awayTheme.primary} 49.5%, #e2e8f0 49.5%, #e2e8f0 50.5%, ${homeTheme.primary} 50.5%, ${homeTheme.primary} 100%)`
          }}
        />

        {/* Calibrated team glow backdrop */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              `radial-gradient(ellipse at 12% 55%, ${awayTheme.glow} 0%, transparent 54%), ` +
              `radial-gradient(ellipse at 88% 55%, ${homeTheme.glow} 0%, transparent 54%), ` +
              `linear-gradient(135deg, #111b2c, #080d17 55%, #111b2c)`,
          }}
        />

        {/* Top bar: competition + date */}
        <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.035] px-5 py-4 sm:px-7">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-2xs">
              {seasonLabel}
            </span>
            {game.SERIES_GAME_NUMBER != null && (
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-slate-200">
                Game {game.SERIES_GAME_NUMBER}
              </span>
            )}
            {game.IS_ELIMINATION_GAME && (
              <span className="rounded-full border border-rose-300/30 bg-rose-400/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-200">
                Elimination Match
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            {isCompleted ? (
              <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">
                {game.GAME_STATUS || "FINAL"}
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-sky-200">
                <Clock size={11} />
                {game.GAME_STATUS || "SCHEDULED"}
              </span>
            )}
            <span className="font-bold">{fmtDate(game.GAME_DATE)}</span>
          </div>
        </div>

        {/* Main score area */}
        <div className="relative px-4 py-7 sm:px-8 sm:py-10">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-6 lg:gap-10">

            {/* Away Team */}
            <div className={`flex flex-col items-center gap-1.5 ${awayWon ? "" : isCompleted ? "opacity-60" : ""}`}>
              <div 
                className="relative rounded-2xl p-2 transition-transform hover:scale-105 shadow-lg shadow-black/20"
                style={{ 
                  backgroundColor: `${awayTheme.primary}12`,
                  boxShadow: awayWon ? `0 0 0 2px ${awayTheme.primary}40, 0 8px 24px ${awayTheme.glow}` : undefined 
                }}
              >
                <TeamLogo abbr={game.AWAY_TEAM_ABBREVIATION} name={game.AWAY_TEAM_NAME} size={52} />
              </div>
              <div className="text-center">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                  {teamCity(game.AWAY_TEAM_ABBREVIATION)}
                </p>
                <p className="mt-0.5 text-base font-black leading-tight text-white sm:text-lg" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {teamFull(game.AWAY_TEAM_ABBREVIATION, game.AWAY_TEAM_NAME)}
                </p>
                <span className="mt-0.5 inline-block rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-slate-300">
                  Away
                </span>
              </div>
              {awayWon && (
                <span 
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest shadow-xs"
                  style={{ backgroundColor: `${awayTheme.primary}15`, color: awayTheme.primary }}
                >
                  <Trophy size={11} /> Winner
                </span>
              )}
            </div>

            {/* Score / Status block */}
            <div className="flex min-w-[112px] flex-col items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:min-w-[190px] sm:px-6 sm:py-6">
              {isCompleted ? (
                <>
                  {/* Scores */}
                  <div className="flex items-center gap-2 sm:gap-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                    <span
                      className={`text-4xl font-black leading-none tabular-nums sm:text-5xl lg:text-7xl ${awayWon ? "text-white" : "text-slate-500"}`}
                      style={{ color: awayWon ? awayTheme.primary : undefined }}
                    >
                      {awayScore ?? "—"}
                    </span>
                    <div className="flex flex-col items-center gap-1 px-1 sm:px-2">
                      <div className="h-px w-4 bg-white/20 sm:w-6" />
                      <span className="whitespace-nowrap text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">{game.GAME_STATUS || "FINAL"}</span>
                      <div className="h-px w-4 bg-white/20 sm:w-6" />
                    </div>
                    <span
                      className={`text-4xl font-black leading-none tabular-nums sm:text-5xl lg:text-7xl ${homeWon ? "text-white" : "text-slate-500"}`}
                      style={{ color: homeWon ? homeTheme.primary : undefined }}
                    >
                      {homeScore ?? "—"}
                    </span>
                  </div>

                  {/* Margin tag */}
                  {winnerAbbr && winnerTheme && (
                    <div 
                      className="mt-1 rounded-full border px-3 py-0.5 text-center"
                      style={{ 
                      borderColor: `${winnerTheme.primary}45`,
                      backgroundColor: `${winnerTheme.primary}18`
                      }}
                    >
                      <p className="text-[10px] font-bold text-slate-300">
                        <span className="font-black text-white" style={{ color: winnerTheme.primary }}>{teamFull(winnerAbbr)}</span> won by{" "}
                        <span className="font-black text-white">{margin} pts</span>
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-4xl font-black tracking-widest text-white/15 lg:text-6xl" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                    VS
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">
                    Scheduled Matchup
                  </span>
                  {onPredict && (
                    <button
                      type="button"
                      onClick={onPredict}
                      className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-black uppercase tracking-[0.18em] shadow-md hover:shadow-lg transition-all text-[11px]"
                    >
                      <Sparkles size={13} />
                      Predict Matchup
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Home Team */}
            <div className={`flex flex-col items-center gap-1.5 ${homeWon ? "" : isCompleted ? "opacity-60" : ""}`}>
              <div 
                className="relative rounded-2xl p-2 transition-transform hover:scale-105 shadow-lg shadow-black/20"
                style={{ 
                  backgroundColor: `${homeTheme.primary}12`,
                  boxShadow: homeWon ? `0 0 0 2px ${homeTheme.primary}40, 0 8px 24px ${homeTheme.glow}` : undefined 
                }}
              >
                <TeamLogo abbr={game.HOME_TEAM_ABBREVIATION} name={game.HOME_TEAM_NAME} size={52} />
              </div>
              <div className="text-center">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                  {teamCity(game.HOME_TEAM_ABBREVIATION)}
                </p>
                <p className="mt-0.5 text-base font-black leading-tight text-white sm:text-lg" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {teamFull(game.HOME_TEAM_ABBREVIATION, game.HOME_TEAM_NAME)}
                </p>
                <span className="mt-0.5 inline-block rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-slate-300">
                  Home
                </span>
              </div>
              {homeWon && (
                <span 
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest shadow-xs"
                  style={{ backgroundColor: `${homeTheme.primary}15`, color: homeTheme.primary }}
                >
                  <Trophy size={11} /> Winner
                </span>
              )}
            </div>
          </div>

          {/* Arena & Officials info row */}
          {(arenaName || arenaCity || officials.length > 0) && (
            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-xs font-medium text-slate-400">
              {(arenaName || arenaCity) && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={13} className="text-slate-400 shrink-0" />
                  <span className="font-semibold text-slate-200">{[arenaName, arenaCity].filter(Boolean).join(" · ")}</span>
                </span>
              )}
              {officials.length > 0 && (
                <>
                  {(arenaName || arenaCity) && <span className="hidden text-white/20 sm:inline">•</span>}
                  <div className="inline-flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <Shield size={13} className="text-slate-400 shrink-0" />
                      <span className="font-bold text-slate-400">Hakemler:</span>
                    </span>
                    {officials.map((o, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[11px] font-bold text-slate-200"
                      >
                        <span className="font-mono text-[9px] font-black text-white">
                          {o.jerseyNum ? `#${o.jerseyNum}` : `#${idx + 1}`}
                        </span>
                        <span>{o.cleanName}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

          )}
        </div>
      </section>

      {/* Prominent Action Banner for Fetching/Refreshing Game Data: ONLY when eligible (!isCompleted and 4+ hours passed) */}
      {canRefresh && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[1.5rem] border border-slate-800 bg-gradient-to-r from-[#101b2c] via-[#17243a] to-[#101827] p-5 text-white shadow-lg sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1d428a] text-white shadow-xs">
              <RefreshCw size={18} className={refreshState === "running" ? "animate-spin" : ""} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-white">
                Bu maç oynandı mı? Skor & Kutu Skor Verilerini Getir
              </p>
              <p className="mt-0.5 text-[11px] text-slate-300">
                NBA resmi API üzerinden maç skorunu, takım/oyuncu kutu skorunu ve Play-by-Play akışını otomatik indirir.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={refreshState === "running" || refreshDone}
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-sm transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw size={14} className={refreshState === "running" ? "animate-spin" : ""} />
            {refreshState === "running" ? "Veriler alınıyor…" : refreshDone ? "Veriler Yüklendi" : refreshState === "failed" ? "Tekrar dene" : "Maç Verilerini Getir"}
          </button>
          {refreshError && <p role="alert" className="w-full text-xs font-bold text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">{refreshError}</p>}
        </div>
      )}

      {/* ══════════════════════════════════════
          TAB BAR
          ══════════════════════════════════════ */}
      <nav aria-label="Game detail sections" role="tablist" className="sticky top-2 z-20 flex gap-1.5 overflow-x-auto rounded-2xl border border-slate-800 bg-[#101827]/95 p-2 shadow-xl shadow-slate-900/10 backdrop-blur">
        {([
          { id: "game", label: isCompleted ? "Recap" : "Preview", icon: <LayoutGrid size={13} />, color: "#0f172a" },
          { id: "away", label: `${game.AWAY_TEAM_ABBREVIATION} ${isCompleted ? "Box Score" : "Info"}`, icon: <Users size={13} />, color: awayTheme.primary },
          { id: "home", label: `${game.HOME_TEAM_ABBREVIATION} ${isCompleted ? "Box Score" : "Info"}`, icon: <Users size={13} />, color: homeTheme.primary },
          ...(isCompleted ? [{ id: "pbp", label: "Play-by-Play", icon: <ListOrdered size={13} />, color: "#0f172a" }] : []),
        ] as { id: "game" | "home" | "away" | "pbp"; label: string; icon: React.ReactNode; color: string }[]).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            tabIndex={activeTab === t.id ? 0 : -1}
            onClick={() => setActiveTab(t.id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-[11px] font-bold transition-all ${activeTab === t.id ? "text-white shadow-lg" : "text-slate-400 hover:bg-white/[0.08] hover:text-white"}`}
            style={activeTab === t.id ? { backgroundColor: t.color } : undefined}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
      {/* ══════════════════════════════════════
          GAME OVERVIEW / MATCHUP PREVIEW TAB
          ══════════════════════════════════════ */}
      {activeTab === "game" && (
        <div role="tabpanel" aria-label={isCompleted ? "Game overview" : "Matchup preview"} className="space-y-5 animate-fade-in">
          {isCompleted ? (
            <>
              <section aria-labelledby="recap-heading" className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3 px-1">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">Final recap</p>
                    <h3 id="recap-heading" className="mt-1 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">How the game unfolded</h3>
                  </div>
                  {winnerAbbr && (
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm">
                      <span className="font-black text-slate-950">{teamFull(winnerAbbr)}</span> · won by {margin}
                    </span>
                  )}
                </div>
                <div className="grid items-stretch gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                  <GameSummaryBlock game={game} home={homeBS} away={awayBS} topPlayers={topGame} />
                  <QuarterScores
                    homeAbbr={game.HOME_TEAM_ABBREVIATION}
                    awayAbbr={game.AWAY_TEAM_ABBREVIATION}
                    homeQS={homeQS}
                    awayQS={awayQS}
                  />
                </div>
              </section>

              <section aria-labelledby="team-breakdown-heading" className="space-y-3">
                <div className="px-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">The numbers</p>
                  <h3 id="team-breakdown-heading" className="mt-1 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">Team breakdown</h3>
                </div>
                <div className="grid items-start gap-4 xl:grid-cols-2">
                  <TeamComparisonBars home={homeBS} away={awayBS} />
                  <ShootingSummary home={teamStatHome as TeamBoxScore | null} away={teamStatAway as TeamBoxScore | null} />
                </div>
              </section>

              <section aria-label="Player performances" className="space-y-4">
                <TopPerformers topGame={topGame} />
                <GameLeaders leaders={gameDetail?.game_leaders} />
              </section>
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded-[1.5rem] border border-slate-200/80 bg-white p-6 shadow-xs">
                <div className="mb-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Matchup Schedule</p>
                  <p className="mt-0.5 text-base font-bold text-slate-800">
                    {game.AWAY_TEAM_NAME} @ {game.HOME_TEAM_NAME}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Date & Schedule</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">{fmtDate(game.GAME_DATE)}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{seasonLabel}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Venue</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">{arenaName || "NBA Arena"}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{arenaCity || teamCity(game.HOME_TEAM_ABBREVIATION)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Status</p>
                    <p className="mt-1 text-sm font-bold text-indigo-700">{game.GAME_STATUS || "Upcoming / Scheduled"}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Box scores recorded post-game</p>
                  </div>
                </div>
              </div>

              {/* Prediction simulation callout card */}
              <div className="rounded-[1.5rem] border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-slate-50 p-6 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-indigo-600/10 text-indigo-700 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest">
                      AI Prediction Pipeline
                    </span>
                  </div>
                  <h4 className="mt-2 text-base font-black text-slate-900">
                    Simulate & Predict This Matchup
                  </h4>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    View full multi-stage ML projections for this game including calibrated win probabilities, expected team scores, spread margins, over/under totals, and individual player projections.
                  </p>
                </div>
                {onPredict && (
                  <button
                    type="button"
                    onClick={onPredict}
                    className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-black uppercase tracking-[0.18em] shadow-md hover:shadow-lg transition-all text-xs"
                  >
                    <Sparkles size={14} />
                    Run Prediction
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════
          HOME BOX SCORE TAB
          ══════════════════════════════════════ */}
      {activeTab === "home" && (
        <div role="tabpanel" aria-label={`${game.HOME_TEAM_ABBREVIATION} team box score`} className="animate-fade-in space-y-5">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_5px_22px_rgba(15,23,42,0.045)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">{game.HOME_TEAM_ABBREVIATION} · Home</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-700">
                  {gameDetail?.home_team?.team_name || game.HOME_TEAM_NAME || game.HOME_TEAM_ABBREVIATION}
                </p>
              </div>
              {isCompleted && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                    <p className="text-xl font-black text-slate-900">{homeScore ?? "—"}</p>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">PTS</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                    <p className="text-xl font-black text-slate-900">{fmtInt(homeBS?.REB ?? null)}</p>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">REB</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                    <p className="text-xl font-black text-slate-900">{fmtInt(homeBS?.AST ?? null)}</p>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">AST</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                    <p className="text-xl font-black text-slate-900">{fmtInt(homeBS?.TOV ?? null)}</p>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">TOV</p>
                  </div>
                </div>
              )}
            </div>
            {isCompleted ? (
              <PlayerBoxTable players={topHome} accent={homeTheme.primary} />
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                <p className="text-xs font-bold text-slate-600">Player box score statistics are not available yet.</p>
                <p className="text-[11px] text-slate-400 mt-1">Live and final box scores will be loaded here once the matchup is completed.</p>
                {onPredict && (
                  <button
                    type="button"
                    onClick={onPredict}
                    className="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-[10px] font-bold uppercase tracking-wider transition"
                  >
                    <Sparkles size={11} /> Predict with Roster
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          AWAY BOX SCORE TAB
          ══════════════════════════════════════ */}
      {activeTab === "away" && (
        <div role="tabpanel" aria-label={`${game.AWAY_TEAM_ABBREVIATION} team box score`} className="animate-fade-in space-y-5">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_5px_22px_rgba(15,23,42,0.045)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">{game.AWAY_TEAM_ABBREVIATION} · Away</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-700">
                  {gameDetail?.away_team?.team_name || game.AWAY_TEAM_NAME || game.AWAY_TEAM_ABBREVIATION}
                </p>
              </div>
              {isCompleted && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                    <p className="text-xl font-black text-slate-900">{awayScore ?? "—"}</p>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">PTS</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                    <p className="text-xl font-black text-slate-900">{fmtInt(awayBS?.REB ?? null)}</p>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">REB</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                    <p className="text-xl font-black text-slate-900">{fmtInt(awayBS?.AST ?? null)}</p>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">AST</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                    <p className="text-xl font-black text-slate-900">{fmtInt(awayBS?.TOV ?? null)}</p>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">TOV</p>
                  </div>
                </div>
              )}
            </div>
            {isCompleted ? (
              <PlayerBoxTable players={topAway} accent={awayTheme.primary} />
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                <p className="text-xs font-bold text-slate-600">Player box score statistics are not available yet.</p>
                <p className="text-[11px] text-slate-400 mt-1">Live and final box scores will be loaded here once the matchup is completed.</p>
                {onPredict && (
                  <button
                    type="button"
                    onClick={onPredict}
                    className="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-[10px] font-bold uppercase tracking-wider transition"
                  >
                    <Sparkles size={11} /> Predict with Roster
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          PLAY-BY-PLAY TAB
          ══════════════════════════════════════ */}
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "scoring" | number>("all");
  const [openQuarter, setOpenQuarter] = useState<number>(1);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
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
      <div className="flex h-32 items-center justify-center gap-2 rounded-[1.5rem] border border-slate-100 bg-white shadow-sm">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1d428a] border-t-transparent" />
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Loading game events...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center">
        <Clock size={24} className="mx-auto mb-3 text-slate-300" />
        <p className="text-xs font-semibold text-slate-400">
          Play-by-play logs are not available for this game. Run the play-by-play ingestion command to cache detailed events.
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
  const scoringEvents = data.events.filter((e) => e.points_scored > 0).length;
  const highlightEvents = data.events.filter((e) => (e.badges?.length ?? 0) > 0).length;
  const filterLabels = ["All plays", ...periods.map(periodLabel), "Scoring plays"];

  return (
    <div className="animate-fade-in overflow-hidden rounded-[2rem] border border-slate-900/10 bg-[#08111f] shadow-[0_28px_80px_rgba(2,6,23,0.24)]">
      <div className="relative p-4 sm:p-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-95"
          style={{
            background:
              "radial-gradient(circle at 8% 12%, rgba(29,66,138,0.55), transparent 32%), " +
              "radial-gradient(circle at 88% 6%, rgba(201,8,42,0.30), transparent 30%), " +
              "linear-gradient(135deg, rgba(15,23,42,0.92), rgba(8,17,31,0.98))",
          }}
        />
        <div className="relative">
          <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.36em] text-sky-200/70">Game flow · Play-by-play</p>
              <h3 className="mt-2 text-3xl font-black uppercase leading-none tracking-tight text-white sm:text-4xl" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {data.away_team} at {data.home_team}
              </h3>
              <p className="mt-2 max-w-xl text-xs leading-relaxed text-slate-300/80">
                Follow every possession, scoring play, and running score by quarter.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:min-w-[25rem]">
              <div className="rounded-2xl border border-white/10 bg-slate-950/30 px-3.5 py-3 backdrop-blur">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/45">Total plays</p>
                <p className="mt-1 text-2xl font-black leading-none text-white">{data.events.length}</p>
              </div>
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-3.5 py-3 backdrop-blur">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-emerald-100/60">Scoring plays</p>
                <p className="mt-1 text-2xl font-black leading-none text-emerald-100">{scoringEvents}</p>
              </div>
              <div className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-3.5 py-3 backdrop-blur">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-rose-100/60">Highlights</p>
                <p className="mt-1 text-2xl font-black leading-none text-rose-100">{highlightEvents}</p>
              </div>
            </div>
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-2">
            {(["all", ...periods, "scoring"] as const).map((f, index) => (
              <button
                key={String(f)}
                onClick={() => setFilter(f as "all" | "scoring" | number)}
                aria-pressed={filter === f}
                className={[
                  "rounded-lg px-3.5 py-2 text-[10px] font-bold transition-all",
                  filter === f
                    ? "bg-white text-slate-950 shadow-lg shadow-black/20"
                    : "border border-white/10 bg-slate-950/20 text-slate-300 hover:bg-white/10 hover:text-white",
                ].join(" ")}
              >
                {filterLabels[index]}
              </button>
            ))}
          </div>

          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {data.quarter_scores.map((qs) => (
            <div key={qs.quarter} className="rounded-2xl border border-white/10 bg-slate-950/25 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">{qs.quarter}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">{Math.abs(qs.away - qs.home) === 0 ? "Even" : `${Math.abs(qs.away - qs.home)} pt diff`}</p>
              </div>
              <div className="flex items-end justify-between gap-2">
                <p className="text-xl font-black text-white">{qs.away}</p>
                <div className="mb-2 h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#c9082a] to-[#1d428a]"
                    style={{ width: `${Math.max(12, Math.min(88, (qs.away / Math.max(1, qs.away + qs.home)) * 100))}%` }}
                  />
                </div>
                <p className="text-xl font-black text-white">{qs.home}</p>
              </div>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-white/35">{data.away_team} - {data.home_team}</p>
            </div>
          ))}
          </div>

          <div className="space-y-3">
          {eventsByQuarter.map(({ period, events, score }) => (
            <div key={period} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.055] backdrop-blur">
              <button
                onClick={() => setOpenQuarter((current) => current === period ? 0 : period)}
                aria-expanded={openQuarter === period}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-white/[0.07]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-xl font-black text-slate-950" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {periodLabel(period)}
                  </div>
                  <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/40">{periodLabel(period)}</p>
                  <p className="mt-0.5 text-sm font-black text-white">
                    {data.away_team} {score?.away ?? "-"} - {score?.home ?? "-"} {data.home_team}
                  </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-white/65">{events.length} {events.length === 1 ? "play" : "plays"}</p>
                  <p className="mt-0.5 text-[9px] font-semibold text-sky-200/80">{openQuarter === period ? "Hide plays" : "Show plays"}</p>
                </div>
              </button>

              {openQuarter === period && (
                <div className="max-h-[680px] space-y-2 overflow-y-auto border-t border-white/10 bg-slate-950/35 p-3 sm:p-4">
                  {events.map((e, idx) => (
                    <PbpEventCard key={`${e.period}-${e.clock}-${idx}`} event={e} />
                  ))}
                  {events.length === 0 && (
                    <p className="py-8 text-center text-[11px] text-slate-400">No events match the selected filter.</p>
                  )}
                </div>
              )}
            </div>
          ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function statLineForEvent(e: PbpEvent) {
  const s = e.player_stats_after;
  if (!s) return null;
  if (e.action_type === "Made Shot" || e.action_type === "Missed Shot") {
    const shotLabel = e.sub_type.toUpperCase().includes("3") || e.description.toUpperCase().includes("3PT")
      ? `${s.fg3m}/${s.fg3a} 3PT`
      : `${s.fgm}/${s.fga} FG`;
    return e.action_type === "Missed Shot" ? `Missed shot · ${shotLabel}` : `Made shot · ${shotLabel} · ${s.pts} PTS`;
  }
  if (e.action_type === "Free Throw") return `Free throw · ${s.ftm}/${s.fta} FT · ${s.pts} PTS`;
  if (e.action_type === "Rebound") return `${s.reb} REB after this board`;
  if (e.action_type === "Foul") return `${s.pf} PF after this foul`;
  if (e.action_type === "Turnover") return `${s.tov} TOV after this play`;
  if (e.description.toUpperCase().includes("AST")) return `${s.ast} AST created`;
  if (e.description.toUpperCase().includes("STEAL")) return `${s.stl} STL`;
  if (e.description.toUpperCase().includes("BLOCK") || e.description.toUpperCase().includes("BLK")) return `${s.blk} BLK`;
  return `${s.pts} PTS · ${s.reb} REB · ${s.ast} AST`;
}

function actionTone(actionType: string, points: number) {
  if (points > 0) return "border-emerald-300/30 bg-gradient-to-br from-emerald-300/18 via-white/[0.08] to-white/[0.04]";
  if (actionType === "Missed Shot" || actionType === "Turnover" || actionType === "Foul") return "border-amber-300/25 bg-gradient-to-br from-amber-300/14 via-white/[0.07] to-white/[0.03]";
  if (actionType === "Rebound") return "border-sky-300/25 bg-gradient-to-br from-sky-300/14 via-white/[0.07] to-white/[0.03]";
  return "border-white/10 bg-white/[0.06]";
}

function actionPill(e: PbpEvent) {
  if (e.points_scored > 0) return "Bucket";
  if (e.action_type === "Missed Shot") return "Miss";
  if (e.action_type === "Rebound") return "Board";
  if (e.action_type === "Foul") return "Whistle";
  if (e.action_type === "Turnover") return "Turnover";
  return e.action_type || "Event";
}

function PbpEventCard({ event: e }: { event: PbpEvent }) {
  const statLine = statLineForEvent(e);
  const playerName = e.player_name || e.team || "Game event";
  const hasPlayer = Boolean(e.player_name);
  const isScoring = e.points_scored > 0;

  return (
    <div className={`group relative overflow-hidden rounded-xl border p-3 transition-colors hover:border-white/25 ${actionTone(e.action_type, e.points_scored)}`}>
      {isScoring && <div className="absolute inset-y-0 left-0 w-1 bg-emerald-300" />}
      <div className="grid gap-3 sm:grid-cols-[minmax(130px,0.32fr)_1fr_112px] sm:items-center">
        <div className="flex min-w-0 items-center gap-2.5">
          {hasPlayer ? (
            <div className="relative h-9 w-9 shrink-0">
              <PlayerPhoto playerId={e.player_id ?? 0} name={playerName} size={36} className="relative shrink-0 ring-1 ring-white/25" />
            </div>
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07]">
              <Clock size={15} className="text-white/60" />
            </div>
          )}
          <div className="min-w-0 sm:hidden">
            <p className="truncate text-xs font-bold text-white">{playerName}</p>
                    <p className="text-[10px] font-semibold tabular-nums text-white/45">{periodName(e.period)} · {e.clock}</p>
          </div>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-xs font-bold text-white">{playerName}</p>
            <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-white/45">{periodName(e.period)} · {e.clock}</p>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {e.team && <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[9px] font-black text-white/85">{e.team}</span>}
            <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${isScoring ? "bg-emerald-300/15 text-emerald-100" : "bg-white/[0.07] text-white/60"}`}>{actionPill(e)}</span>
          </div>
          <p className="text-[13px] font-medium leading-snug text-slate-100">{e.description || e.action_type}</p>
          {statLine && <p className="mt-1 text-[10px] font-bold text-cyan-200/90">{statLine}</p>}
          {(e.assist_player_name || (e.badges && e.badges.length > 0)) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {e.assist_player_name && (
                <span className="rounded-md border border-cyan-200/20 bg-cyan-200/10 px-2 py-0.5 text-[9px] font-bold text-cyan-100">
                  Assist: {e.assist_player_name}{e.assist_total != null ? ` · ${e.assist_total} AST` : ""}
                </span>
              )}
              {e.badges?.map((badge) => (
                <span key={badge} className="rounded-md border border-rose-200/20 bg-rose-300/15 px-2 py-0.5 text-[9px] font-bold text-rose-100">
                  {badge}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/30 px-3 py-2 sm:block sm:text-right">
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 sm:mb-0.5">Score · {e.team || "Game"}</p>
          <p className="text-lg font-black tabular-nums leading-none text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{e.score_away} <span className="text-white/35">–</span> {e.score_home}</p>
          {e.points_scored > 0 && (
            <p className="text-[9px] font-bold text-emerald-200">+{e.points_scored} PTS</p>
          )}
        </div>
      </div>
    </div>
  );
}
