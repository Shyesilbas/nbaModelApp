import { useEffect, useState } from "react";
import { Clock, Trophy, Sparkles } from "lucide-react";
import TeamLogo from "../TeamLogo";
import PlayerPhoto from "../PlayerPhoto";
import { getTeamTheme } from "../../lib/nbaTeams";
import type { GameDetail, GameFeedRow } from "../../types/gameFeed";
import { loadArchivedPlayByPlay } from "../../lib/archiveData";
import { GameLeaders } from "./GameLeaders";
import { GameSummaryBlock } from "./GameSummaryBlock";
import { QuarterScores } from "./QuarterScores";
import { ShootingSummary } from "./ShootingSummary";
import { TabButton } from "./TabButton";
import { TeamComparisonBars } from "./TeamComparisonBars";
import { TopPerformers } from "./TopPerformers";
import type { PlayerBoxScore, TeamBoxScore } from "./types";
import { fmtDate, fmtInt, fmtPair, fmtPct, teamCity, teamFull } from "./utils";

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
}) {
  const [activeTab, setActiveTab] = useState<"game" | "home" | "away" | "pbp">(
    initialTab || "game"
  );

  const isCompleted =
    game.GAME_STATUS === "Final" ||
    game.GAME_STATUS === "FINAL" ||
    ((Number(game.HOME_SCORE) || 0) > 0 && (Number(game.AWAY_SCORE) || 0) > 0);

  const awayTheme = getTeamTheme(game.AWAY_TEAM_ABBREVIATION);
  const homeTheme = getTeamTheme(game.HOME_TEAM_ABBREVIATION);

  const margin   = isCompleted ? Math.abs((game.HOME_SCORE ?? 0) - (game.AWAY_SCORE ?? 0)) : 0;
  const topHome  = [...homePlayers].sort((a, b) => (b.PTS ?? 0) - (a.PTS ?? 0) || (b.MIN ?? 0) - (a.MIN ?? 0));
  const topAway  = [...awayPlayers].sort((a, b) => (b.PTS ?? 0) - (a.PTS ?? 0) || (b.MIN ?? 0) - (a.MIN ?? 0));
  const topGame  = [...(gameDetail?.player_stats ?? [...homePlayers, ...awayPlayers])]
    .sort((a: any, b: any) => (b.PTS ?? b.pts ?? 0) - (a.PTS ?? a.pts ?? 0) || (b.MIN ?? b.min ?? 0) - (a.MIN ?? a.min ?? 0));

  const officials  = (gameDetail?.officials ?? []).filter((o: any) => o?.name || o?.n);
  const arenaName  = gameDetail?.arena?.name?.trim();
  const arenaCity  = [gameDetail?.arena?.city, gameDetail?.arena?.state].filter(Boolean).join(", ");
  const teamStatHome = (gameDetail?.team_stats ?? []).find((t: any) => t.TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION || t.team_abbreviation === game.HOME_TEAM_ABBREVIATION) ?? homeBS;
  const teamStatAway = (gameDetail?.team_stats ?? []).find((t: any) => t.TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION || t.team_abbreviation === game.AWAY_TEAM_ABBREVIATION) ?? awayBS;

  const homeWon   = isCompleted && game.WINNER_TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION;
  const awayWon   = isCompleted && game.WINNER_TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION;
  const winnerTheme = awayWon ? awayTheme : homeWon ? homeTheme : null;
  const homeScore = isCompleted ? (gameDetail?.home_team?.score ?? game.HOME_SCORE) : null;
  const awayScore = isCompleted ? (gameDetail?.away_team?.score ?? game.AWAY_SCORE) : null;
  const seasonLabel = game.PLAYOFF_ROUND ?? game.SEASON_TYPE ?? "NBA";
  const homeQS = gameDetail?.home_team?.quarter_scores;
  const awayQS = gameDetail?.away_team?.quarter_scores;

  const renderPlayerList = (players: PlayerBoxScore[]) => (
    <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-slate-200 bg-slate-50/80">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-slate-50 px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">Player</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">MIN</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">PTS</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">FG</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">FG%</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">3P</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">3P%</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">FT</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">FT%</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">REB</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">AST</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">STL</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">BLK</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">TOV</th>
            <th className="px-2 py-2.5 text-right text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">+/-</th>
          </tr>
        </thead>
        <tbody>
          {players.length ? players.map((p) => (
            <tr key={p.PLAYER_ID} className="border-t border-slate-100 bg-white hover:bg-slate-50 transition-colors">
              <td className="sticky left-0 bg-white px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME} size={24} />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-bold text-slate-800">{p.PLAYER_NAME}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">{p.TEAM_ABBREVIATION}</p>
                  </div>
                </div>
              </td>
              <td className="px-2 py-2.5 text-right font-medium text-slate-500">{p.MIN != null ? Math.round(p.MIN) : "—"}</td>
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
              <td colSpan={15} className="px-3 py-6 text-center text-sm text-slate-400 border-t border-slate-100">No player rows for this side.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in-up">

      {/* ══════════════════════════════════════
          PREMIUM HERO — Score-centric layout
          ══════════════════════════════════════ */}
      <section className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-md">
        {/* Top Dual Gradient Accent Line */}
        <div 
          className="absolute inset-x-0 top-0 h-1.5"
          style={{
            background: `linear-gradient(90deg, ${awayTheme.primary} 0%, ${awayTheme.primary} 48%, #ffffff 48%, #ffffff 52%, ${homeTheme.primary} 52%, ${homeTheme.primary} 100%)`
          }}
        />

        {/* Calibrated team glow backdrop */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              `radial-gradient(ellipse at 15% 50%, ${awayTheme.glow} 0%, transparent 65%), ` +
              `radial-gradient(ellipse at 85% 50%, ${homeTheme.glow} 0%, transparent 65%)`,
          }}
        />

        {/* Top bar: competition + date */}
        <div className="relative flex items-center justify-between border-b border-slate-100 px-6 py-3 bg-slate-50/40">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-900 text-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] shadow-2xs">
              {seasonLabel}
            </span>
            {game.SERIES_GAME_NUMBER != null && (
              <span className="rounded-full bg-slate-200/70 px-2.5 py-1 text-[10px] font-bold text-slate-700">
                Game {game.SERIES_GAME_NUMBER}
              </span>
            )}
            {game.IS_ELIMINATION_GAME && (
              <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-600 animate-pulse">
                Elimination Match
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {isCompleted ? (
              <span className="rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                {game.GAME_STATUS || "FINAL"}
              </span>
            ) : (
              <span className="rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-700 flex items-center gap-1">
                <Clock size={11} />
                {game.GAME_STATUS || "SCHEDULED"}
              </span>
            )}
            <span className="font-bold">{fmtDate(game.GAME_DATE)}</span>
          </div>
        </div>

        {/* Main score area */}
        <div className="relative px-6 py-8">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 lg:gap-8">

            {/* Away Team */}
            <div className={`flex flex-col items-center gap-3 ${awayWon ? "" : isCompleted ? "opacity-60" : ""}`}>
              <div 
                className="relative p-2 rounded-2xl transition-transform hover:scale-105 shadow-xs"
                style={{ 
                  backgroundColor: `${awayTheme.primary}12`,
                  boxShadow: awayWon ? `0 0 0 2px ${awayTheme.primary}40, 0 8px 24px ${awayTheme.glow}` : undefined 
                }}
              >
                <TeamLogo abbr={game.AWAY_TEAM_ABBREVIATION} name={game.AWAY_TEAM_NAME} size={64} />
              </div>
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">
                  {teamCity(game.AWAY_TEAM_ABBREVIATION)}
                </p>
                <p className="text-xl font-black leading-tight text-slate-900 mt-0.5" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {teamFull(game.AWAY_TEAM_ABBREVIATION, game.AWAY_TEAM_NAME)}
                </p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-slate-100 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Away
                </span>
              </div>
              {awayWon && (
                <span 
                  className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1 shadow-xs"
                  style={{ backgroundColor: `${awayTheme.primary}15`, color: awayTheme.primary }}
                >
                  <Trophy size={11} /> Winner
                </span>
              )}
            </div>

            {/* Score / Status block */}
            <div className="flex flex-col items-center gap-2 min-w-[180px]">
              {isCompleted ? (
                <>
                  {/* Scores */}
                  <div className="flex items-center gap-4" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                    <span
                      className={`text-6xl lg:text-7xl font-black leading-none tabular-nums ${awayWon ? "text-slate-900" : "text-slate-300"}`}
                      style={{ color: awayWon ? awayTheme.primary : undefined }}
                    >
                      {awayScore ?? "—"}
                    </span>
                    <div className="flex flex-col items-center gap-1.5 px-2">
                      <div className="h-px w-6 bg-slate-200" />
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">FINAL</span>
                      <div className="h-px w-6 bg-slate-200" />
                    </div>
                    <span
                      className={`text-6xl lg:text-7xl font-black leading-none tabular-nums ${homeWon ? "text-slate-900" : "text-slate-300"}`}
                      style={{ color: homeWon ? homeTheme.primary : undefined }}
                    >
                      {homeScore ?? "—"}
                    </span>
                  </div>

                  {/* Margin tag */}
                  {game.WINNER_TEAM_ABBREVIATION && winnerTheme && (
                    <div 
                      className="rounded-full border px-4 py-1 text-center mt-1"
                      style={{ 
                        borderColor: `${winnerTheme.primary}25`,
                        backgroundColor: `${winnerTheme.primary}08`
                      }}
                    >
                      <p className="text-xs font-bold text-slate-600">
                        <span className="font-black" style={{ color: winnerTheme.primary }}>{teamFull(game.WINNER_TEAM_ABBREVIATION)}</span> won by{" "}
                        <span className="font-black text-slate-900">{margin} pts</span>
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-4xl lg:text-5xl font-black tracking-widest text-slate-300" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                    VS
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
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
            <div className={`flex flex-col items-center gap-3 ${homeWon ? "" : isCompleted ? "opacity-60" : ""}`}>
              <div 
                className="relative p-2 rounded-2xl transition-transform hover:scale-105 shadow-xs"
                style={{ 
                  backgroundColor: `${homeTheme.primary}12`,
                  boxShadow: homeWon ? `0 0 0 2px ${homeTheme.primary}40, 0 8px 24px ${homeTheme.glow}` : undefined 
                }}
              >
                <TeamLogo abbr={game.HOME_TEAM_ABBREVIATION} name={game.HOME_TEAM_NAME} size={64} />
              </div>
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">
                  {teamCity(game.HOME_TEAM_ABBREVIATION)}
                </p>
                <p className="text-xl font-black leading-tight text-slate-900 mt-0.5" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {teamFull(game.HOME_TEAM_ABBREVIATION, game.HOME_TEAM_NAME)}
                </p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-slate-100 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Home
                </span>
              </div>
              {homeWon && (
                <span 
                  className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1 shadow-xs"
                  style={{ backgroundColor: `${homeTheme.primary}15`, color: homeTheme.primary }}
                >
                  <Trophy size={11} /> Winner
                </span>
              )}
            </div>
          </div>

          {/* Arena info row */}
          {(arenaName || arenaCity) && (
            <div className="mt-6 pt-4 border-t border-slate-100 flex justify-center">
              <p className="text-xs text-slate-400 font-semibold">
                {[arenaName, arenaCity].filter(Boolean).join(" · ")}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════
          TAB BAR
          ══════════════════════════════════════ */}
      <div className="rounded-[1.5rem] border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <TabButton label={isCompleted ? "Game Overview" : "Matchup Preview"} active={activeTab === "game"} onClick={() => setActiveTab("game")} />
          <TabButton label={`${game.HOME_TEAM_ABBREVIATION} ${isCompleted ? "Box Score" : "Team Info"}`} active={activeTab === "home"} onClick={() => setActiveTab("home")} />
          <TabButton label={`${game.AWAY_TEAM_ABBREVIATION} ${isCompleted ? "Box Score" : "Team Info"}`} active={activeTab === "away"} onClick={() => setActiveTab("away")} />
          {isCompleted && (
            <TabButton label="Play-by-Play" active={activeTab === "pbp"} onClick={() => setActiveTab("pbp")} />
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════
          GAME OVERVIEW / MATCHUP PREVIEW TAB
          ══════════════════════════════════════ */}
      {activeTab === "game" && (
        <div className="space-y-4 animate-fade-in">
          {isCompleted ? (
            <>
              {/* 1. Game Summary */}
              <GameSummaryBlock
                game={game}
                home={homeBS}
                away={awayBS}
                topPlayers={topGame}
              />

              {/* 2. Team Comparison Bars */}
              <TeamComparisonBars home={homeBS} away={awayBS} />

              {/* 3. Shooting Summary */}
              <ShootingSummary home={teamStatHome as TeamBoxScore | null} away={teamStatAway as TeamBoxScore | null} />

              {/* 4. Top Performers */}
              <TopPerformers topGame={topGame} />

              {/* 5. Game Leaders (only if data exists) */}
              <GameLeaders leaders={gameDetail?.game_leaders} />

              {/* 6. Quarter Scores (only if data exists) */}
              <QuarterScores
                homeAbbr={game.HOME_TEAM_ABBREVIATION}
                awayAbbr={game.AWAY_TEAM_ABBREVIATION}
                homeQS={homeQS}
                awayQS={awayQS}
              />

              {/* 7. Officials (only if data exists) */}
              {officials.length > 0 && (
                <div className="rounded-[1.5rem] border border-slate-100 bg-white px-5 py-4 shadow-sm">
                  <p className="mb-2 text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Officials</p>
                  <p className="text-[11px] font-medium text-slate-600">
                    {officials.slice(0, 3).map((o: any) => o.name || o.n).filter(Boolean).join(" · ")}
                  </p>
                </div>
              )}
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
        <div className="animate-fade-in space-y-4">
          <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">{game.HOME_TEAM_ABBREVIATION} · Home</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-700">
                  {gameDetail?.home_team?.team_name || game.HOME_TEAM_NAME || game.HOME_TEAM_ABBREVIATION}
                </p>
              </div>
              {isCompleted && (
                <div className="grid grid-cols-4 gap-2">
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
              renderPlayerList(topHome)
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
        <div className="animate-fade-in space-y-4">
          <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">{game.AWAY_TEAM_ABBREVIATION} · Away</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-700">
                  {gameDetail?.away_team?.team_name || game.AWAY_TEAM_NAME || game.AWAY_TEAM_ABBREVIATION}
                </p>
              </div>
              {isCompleted && (
                <div className="grid grid-cols-4 gap-2">
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
              renderPlayerList(topAway)
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
        <PlayByPlayTab gameId={game.GAME_ID} season={season ?? game.SEASON ?? gameDetail?.season ?? undefined} />
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

function PlayByPlayTab({ gameId, season }: { gameId: string; season?: string }) {
  const [data, setData] = useState<PbpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "q1" | "q2" | "q3" | "q4" | "scoring">("all");
  const [openQuarter, setOpenQuarter] = useState<number>(1);

  useEffect(() => {
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
  }, [gameId, season]);

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

  const filteredEvents = data.events.filter((e) => {
    if (filter === "scoring") return e.points_scored > 0;
    if (filter === "q1") return e.period === 1;
    if (filter === "q2") return e.period === 2;
    if (filter === "q3") return e.period === 3;
    if (filter === "q4") return e.period === 4;
    return true;
  });
  const eventsByQuarter = [1, 2, 3, 4].map((period) => ({
    period,
    events: filteredEvents.filter((e) => e.period === period),
    score: data.quarter_scores.find((qs) => qs.quarter === `Q${period}`),
  }));
  const scoringEvents = data.events.filter((e) => e.points_scored > 0).length;
  const highlightEvents = data.events.filter((e) => (e.badges?.length ?? 0) > 0).length;

  return (
    <div className="animate-fade-in overflow-hidden rounded-[2rem] border border-slate-900/10 bg-[#08111f] shadow-[0_28px_80px_rgba(2,6,23,0.24)]">
      <div className="relative p-5 sm:p-6">
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
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.42em] text-white/45">Possession Log</p>
              <h3 className="mt-1 text-3xl font-black uppercase leading-none tracking-tight text-white sm:text-4xl" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {data.away_team} at {data.home_team}
              </h3>
              <p className="mt-2 max-w-xl text-xs font-medium text-slate-300">
                Quarter-by-quarter game flow with live running totals, shot context, assists, and milestone badges.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:min-w-[25rem]">
              <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2 backdrop-blur">
                <p className="text-[8px] font-black uppercase tracking-widest text-white/40">Events</p>
                <p className="text-2xl font-black text-white">{data.events.length}</p>
              </div>
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 backdrop-blur">
                <p className="text-[8px] font-black uppercase tracking-widest text-emerald-100/60">Scoring</p>
                <p className="text-2xl font-black text-emerald-100">{scoringEvents}</p>
              </div>
              <div className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 backdrop-blur">
                <p className="text-[8px] font-black uppercase tracking-widest text-rose-100/60">Crowned</p>
                <p className="text-2xl font-black text-rose-100">{highlightEvents}</p>
              </div>
            </div>
          </div>

          <div className="mb-5 flex flex-wrap gap-1.5">
            {(["all", "q1", "q2", "q3", "q4", "scoring"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={[
                  "rounded-full px-3.5 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] transition-all",
                  filter === f
                    ? "bg-white text-slate-950 shadow-[0_10px_28px_rgba(255,255,255,0.18)]"
                    : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
                ].join(" ")}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {data.quarter_scores.map((qs) => (
            <div key={qs.quarter} className="rounded-2xl border border-white/10 bg-white/[0.07] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/45">{qs.quarter}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/35">{Math.abs(qs.away - qs.home) || "Even"}</p>
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
            <div key={period} className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.06] backdrop-blur">
              <button
                onClick={() => setOpenQuarter((current) => current === period ? 0 : period)}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-white/[0.06]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-xl font-black text-slate-950" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                    Q{period}
                  </div>
                  <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/40">Quarter {period}</p>
                  <p className="mt-0.5 text-sm font-black text-white">
                    {data.away_team} {score?.away ?? "-"} - {score?.home ?? "-"} {data.home_team}
                  </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/45">{events.length} events</p>
                  <p className="text-[9px] font-semibold text-white">{openQuarter === period ? "Collapse" : "Open feed"}</p>
                </div>
              </button>

              {openQuarter === period && (
                <div className="max-h-[680px] space-y-3 overflow-y-auto border-t border-white/10 bg-slate-950/45 p-3 pr-2">
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
    <div className={`group relative overflow-hidden rounded-[1.35rem] border p-3 shadow-[0_14px_34px_rgba(2,6,23,0.18)] transition duration-200 hover:-translate-y-0.5 hover:border-white/25 ${actionTone(e.action_type, e.points_scored)}`}>
      {isScoring && <div className="absolute left-0 top-0 h-full w-1 bg-emerald-300" />}
      <div className="grid gap-3 sm:grid-cols-[64px_1fr_128px] sm:items-center">
        <div className="flex items-center gap-3 sm:block">
          {hasPlayer ? (
            <div className="relative h-[58px] w-[58px]">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/50 to-white/5 blur-sm" />
              <PlayerPhoto playerId={e.player_id ?? 0} name={playerName} size={58} className="relative shrink-0 ring-2 ring-white/25" />
            </div>
          ) : (
            <div className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10">
              <Clock size={18} className="text-white/60" />
            </div>
          )}
          <div className="sm:hidden">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/45">Q{e.period} {e.clock}</p>
            <p className="text-sm font-black text-white">{playerName}</p>
          </div>
        </div>

        <div className="min-w-0">
          <div className="hidden items-center gap-2 sm:flex">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/45">Q{e.period} {e.clock}</p>
            {e.team && <span className="rounded-full bg-white px-2 py-0.5 text-[8px] font-black text-slate-950">{e.team}</span>}
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white/55">{actionPill(e)}</span>
            <p className="truncate text-sm font-black text-white">{playerName}</p>
          </div>
          <p className="mt-1 text-sm font-semibold leading-snug text-slate-100">{e.description || e.action_type}</p>
          {statLine && <p className="mt-1 text-[11px] font-black uppercase tracking-widest text-cyan-200">{statLine}</p>}
          {(e.assist_player_name || (e.badges && e.badges.length > 0)) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {e.assist_player_name && (
                <span className="rounded-full border border-cyan-200/20 bg-cyan-200/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-cyan-100">
                  Assist: {e.assist_player_name}{e.assist_total != null ? ` · ${e.assist_total} AST` : ""}
                </span>
              )}
              {e.badges?.map((badge) => (
                <span key={badge} className="rounded-full border border-rose-200/20 bg-rose-300/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-rose-100">
                  {badge}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Score</p>
          <p className="text-xl font-black tabular-nums text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{e.score_away} - {e.score_home}</p>
          {e.points_scored > 0 && (
            <p className="text-[10px] font-black text-emerald-200">+{e.points_scored} PTS</p>
          )}
        </div>
      </div>
    </div>
  );
}
