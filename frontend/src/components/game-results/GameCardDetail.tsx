import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Calendar, Clock, Cpu, Trophy, Zap } from "lucide-react";
import TeamLogo from "../TeamLogo";
import PlayerPhoto from "../PlayerPhoto";
import { getModelStatus, normalizeGameFullPrediction, predictGameFull } from "../../api/predictions";
import { loadPrivateApi } from "../../lib/dataCache";
import { NBA_TEAMS } from "../../lib/nbaTeams";
import { exportPredictionAsPDF } from "../../lib/predictionReport";
import type { GameDetail, GameFeedRow } from "../../types/gameFeed";
import { GameLeaders } from "./GameLeaders";
import { GameSummaryBlock } from "./GameSummaryBlock";
import { QuarterScores } from "./QuarterScores";
import { ShootingSummary } from "./ShootingSummary";
import { TabButton } from "./TabButton";
import { TeamComparisonBars } from "./TeamComparisonBars";
import { TopPerformers } from "./TopPerformers";
import type { PlayerBoxScore, TeamBoxScore } from "./types";
import { fmtDate, fmtInt, fmtPair, fmtPct, teamCity, teamFull } from "./utils";
import {
  ModelDiagnostics,
  ModelExplanationSection,
  NarrativeBlock,
  PlayerSpotlight,
  SignalCards,
  WinProbabilityArc,
} from "../prediction";

/* ── Game Detail View ── */
export function GameCardDetail({
  game, gameDetail, homeBS, awayBS, homePlayers, awayPlayers, initialTab = "game", season,
}: {
  game: GameFeedRow;
  gameDetail: GameDetail | null;
  homeBS: TeamBoxScore | null;
  awayBS: TeamBoxScore | null;
  homePlayers: PlayerBoxScore[];
  awayPlayers: PlayerBoxScore[];
  initialTab?: "game" | "home" | "away" | "prediction" | "pbp";
  season?: string;
}) {
  const [activeTab, setActiveTab] = useState<"game" | "home" | "away" | "prediction" | "pbp">(initialTab);
  const [predResult, setPredResult] = useState<any>(null);
  const [predLoading, setPredLoading] = useState<boolean>(false);
  const [predError, setPredError] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<any>(null);

  const getTeamInfo = (abbr: string) =>
    NBA_TEAMS.find((t) => t.abbr === abbr) || { abbr, name: abbr, color: "#475569" };



  useEffect(() => {
    if (activeTab !== "prediction" || predResult !== null || predLoading) return;

    const runPredict = async () => {
      setPredLoading(true);
      setPredError(null);
      try {
        const [data, status] = await Promise.all([
          predictGameFull({
            game_id: game.GAME_ID,
            home_team_id: game.HOME_TEAM_ABBREVIATION,
            away_team_id: game.AWAY_TEAM_ABBREVIATION,
            prediction_date: game.GAME_DATE,
          }),
          getModelStatus().catch(() => null)
        ]);
        if (status) {
          setModelStatus(status);
        }
        const normalized = normalizeGameFullPrediction(
          data,
          game.HOME_TEAM_ABBREVIATION,
          game.AWAY_TEAM_ABBREVIATION,
          game.GAME_DATE
        );
        setPredResult(normalized);
      } catch (err: any) {
        setPredError(err.message || "Could not run model prediction.");
      } finally {
        setPredLoading(false);
      }
    };
    runPredict();
  }, [activeTab, game.GAME_ID, game.HOME_TEAM_ABBREVIATION, game.AWAY_TEAM_ABBREVIATION, game.GAME_DATE, predResult, predLoading]);
  const margin   = Math.abs((game.HOME_SCORE ?? 0) - (game.AWAY_SCORE ?? 0));
  const topHome  = [...homePlayers].sort((a, b) => (b.PTS ?? 0) - (a.PTS ?? 0) || (b.MIN ?? 0) - (a.MIN ?? 0));
  const topAway  = [...awayPlayers].sort((a, b) => (b.PTS ?? 0) - (a.PTS ?? 0) || (b.MIN ?? 0) - (a.MIN ?? 0));
  const topGame  = [...(gameDetail?.player_stats ?? [...homePlayers, ...awayPlayers])]
    .sort((a: any, b: any) => (b.PTS ?? b.pts ?? 0) - (a.PTS ?? a.pts ?? 0) || (b.MIN ?? b.min ?? 0) - (a.MIN ?? a.min ?? 0));

  const officials  = (gameDetail?.officials ?? []).filter((o: any) => o?.name || o?.n);
  const arenaName  = gameDetail?.arena?.name?.trim();
  const arenaCity  = [gameDetail?.arena?.city, gameDetail?.arena?.state].filter(Boolean).join(", ");
  const teamStatHome = (gameDetail?.team_stats ?? []).find((t: any) => t.TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION || t.team_abbreviation === game.HOME_TEAM_ABBREVIATION) ?? homeBS;
  const teamStatAway = (gameDetail?.team_stats ?? []).find((t: any) => t.TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION || t.team_abbreviation === game.AWAY_TEAM_ABBREVIATION) ?? awayBS;

  const homeWon   = game.WINNER_TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION;
  const awayWon   = game.WINNER_TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION;
  const homeScore = gameDetail?.home_team?.score ?? game.HOME_SCORE;
  const awayScore = gameDetail?.away_team?.score ?? game.AWAY_SCORE;
  const seasonLabel = game.PLAYOFF_ROUND ?? game.SEASON_TYPE ?? "NBA";
  const homeQS = gameDetail?.home_team?.quarter_scores;
  const awayQS = gameDetail?.away_team?.quarter_scores;

  const renderPlayerList = (players: PlayerBoxScore[]) => (
    <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-slate-200 bg-slate-50/80">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-slate-50 px-3 py-2.5 text-left  text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">Player</th>
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
      <section className="relative overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        {/* Subtle gradient backdrop */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 20% 50%, rgba(29,66,138,0.04) 0%, transparent 60%), " +
              "radial-gradient(ellipse at 80% 50%, rgba(201,8,42,0.03) 0%, transparent 60%)",
          }}
        />

        {/* Top bar: competition + date */}
        <div className="relative flex items-center justify-between border-b border-slate-100 px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#1d428a]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#1d428a]">
              {seasonLabel}
            </span>
            {game.SERIES_GAME_NUMBER != null && (
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
                Game {game.SERIES_GAME_NUMBER}
              </span>
            )}
            {game.IS_ELIMINATION_GAME && (
              <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-red-500">Elimination</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">
              {game.GAME_STATUS}
            </span>
            <span className="font-medium">{fmtDate(game.GAME_DATE)}</span>
          </div>
        </div>

        {/* Main score area */}
        <div className="relative px-6 py-8">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">

            {/* Away Team */}
            <div className={`flex flex-col items-center gap-3 ${awayWon ? "" : "opacity-50"}`}>
              <TeamLogo abbr={game.AWAY_TEAM_ABBREVIATION} name={game.AWAY_TEAM_NAME} size={56} />
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">
                  {teamCity(game.AWAY_TEAM_ABBREVIATION)}
                </p>
                <p className="text-lg font-black leading-tight text-slate-900">
                  {teamFull(game.AWAY_TEAM_ABBREVIATION, game.AWAY_TEAM_NAME)}
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-slate-400">Away</p>
              </div>
              {awayWon && (
                <span className="rounded-full bg-[#c9082a]/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-[#c9082a]">
                  Winner
                </span>
              )}
            </div>

            {/* Score block */}
            <div className="flex flex-col items-center gap-2 min-w-[160px]">
              {/* Scores */}
              <div className="flex items-center gap-3">
                <span
                  className={`text-6xl font-black leading-none tabular-nums ${awayWon ? "text-slate-900" : "text-slate-300"}`}
                  style={{ fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: "-0.04em" }}
                >
                  {awayScore ?? "—"}
                </span>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="h-px w-5 bg-slate-200" />
                  <span className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">Final</span>
                  <div className="h-px w-5 bg-slate-200" />
                </div>
                <span
                  className={`text-6xl font-black leading-none tabular-nums ${homeWon ? "text-slate-900" : "text-slate-300"}`}
                  style={{ fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: "-0.04em" }}
                >
                  {homeScore ?? "—"}
                </span>
              </div>

              {/* Margin tag */}
              {game.WINNER_TEAM_ABBREVIATION && (
                <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-center">
                  <p className="text-[10px] font-bold text-slate-500">
                    {teamFull(game.WINNER_TEAM_ABBREVIATION)} won by{" "}
                    <span className="font-black text-slate-800">{margin} {margin === 1 ? "point" : "points"}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Home Team */}
            <div className={`flex flex-col items-center gap-3 ${homeWon ? "" : "opacity-50"}`}>
              <TeamLogo abbr={game.HOME_TEAM_ABBREVIATION} name={game.HOME_TEAM_NAME} size={56} />
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">
                  {teamCity(game.HOME_TEAM_ABBREVIATION)}
                </p>
                <p className="text-lg font-black leading-tight text-slate-900">
                  {teamFull(game.HOME_TEAM_ABBREVIATION, game.HOME_TEAM_NAME)}
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-slate-400">Home</p>
              </div>
              {homeWon && (
                <span className="rounded-full bg-[#1d428a]/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-[#1d428a]">
                  Winner
                </span>
              )}
            </div>
          </div>

          {/* Arena info row — only if data exists */}
          {(arenaName || arenaCity) && (
            <div className="mt-4 flex justify-center">
              <p className="text-[10px] text-slate-400 font-medium">
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
          <TabButton label="Game Overview"                             active={activeTab === "game"} onClick={() => setActiveTab("game")} />
          <TabButton label={`${game.HOME_TEAM_ABBREVIATION} Box Score`} active={activeTab === "home"} onClick={() => setActiveTab("home")} />
          <TabButton label={`${game.AWAY_TEAM_ABBREVIATION} Box Score`} active={activeTab === "away"} onClick={() => setActiveTab("away")} />
          <TabButton label="Model Prediction"                          active={activeTab === "prediction"} onClick={() => setActiveTab("prediction")} />
          <TabButton label="Play-by-Play"                               active={activeTab === "pbp"} onClick={() => setActiveTab("pbp")} />
        </div>
      </div>

      {/* ══════════════════════════════════════
          GAME OVERVIEW TAB
          ══════════════════════════════════════ */}
      {activeTab === "game" && (
        <div className="space-y-4 animate-fade-in">

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
            </div>
            {renderPlayerList(topHome)}
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
            </div>
            {renderPlayerList(topAway)}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          PLAY-BY-PLAY TAB
          ══════════════════════════════════════ */}
      {activeTab === "pbp" && (
        <PlayByPlayTab gameId={game.GAME_ID} season={season ?? game.SEASON ?? gameDetail?.season ?? undefined} />
      )}

      {/* ══════════════════════════════════════
          MODEL PREDICTION TAB
          ══════════════════════════════════════ */}
      {activeTab === "prediction" && (
        <div className="animate-fade-in space-y-5">
          {predLoading && (
            <div className="rounded-[1.5rem] border border-slate-100 bg-white p-12 flex flex-col items-center justify-center gap-4 shadow-sm">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-4 border-indigo-100" />
                <div className="w-12 h-12 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin absolute inset-0" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Running prediction engine for this matchup...</p>
            </div>
          )}

          {predError && (
            <div className="p-4 bg-rose-50 text-rose-700 rounded-xl border border-rose-200 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle size={14} />
              {predError}
            </div>
          )}

          {predResult && !predLoading && (
            <div className="space-y-5">
              {/* Prediction Hero card */}
              {(() => {
                const homeInfo = getTeamInfo(game.HOME_TEAM_ABBREVIATION);
                const awayInfo = getTeamInfo(game.AWAY_TEAM_ABBREVIATION);
                const winnerAbbr = predResult.win_probability?.predicted_winner || predResult.predicted_winner;
                const winnerInfo = getTeamInfo(winnerAbbr);
                
                const hasActualResult = game.HOME_SCORE !== null && game.AWAY_SCORE !== null;
                const isPredictionCorrect = winnerAbbr === game.WINNER_TEAM_ABBREVIATION;
                const confidence = predResult.win_probability?.confidence_bucket || "MEDIUM";
                const winProb = Math.max(predResult.win_probability?.home_win_probability ?? 0, predResult.win_probability?.away_win_probability ?? 0);

                return (
                  <div className="space-y-5">
                    
                    <div className="prediction-hero rounded-[2rem] overflow-hidden relative">
                      <div
                        className="absolute inset-y-0 left-0 w-1/3 opacity-20 pointer-events-none"
                        style={{ background: `radial-gradient(ellipse at left center, ${awayInfo.color}, transparent 70%)` }}
                      />
                      <div
                        className="absolute inset-y-0 right-0 w-1/3 opacity-20 pointer-events-none"
                        style={{ background: `radial-gradient(ellipse at right center, ${homeInfo.color}, transparent 70%)` }}
                      />
                      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                      <div className="relative p-6 lg:p-8">
                        <div className="flex items-center justify-between mb-8">
                          <div className="flex items-center gap-2">
                            <Cpu size={12} className="text-white/30" />
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">
                              NBA Prediction Engine
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => exportPredictionAsPDF({ result: predResult, date: game.GAME_DATE, fallbackHome: game.HOME_TEAM_ABBREVIATION, fallbackAway: game.AWAY_TEAM_ABBREVIATION })}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-wider transition-all duration-200 border border-white/10 shadow-xs"
                            >
                              Export PDF
                            </button>
                            <div className="flex items-center gap-2">
                              <Calendar size={11} className="text-white/30" />
                              <span className="text-[9px] font-mono font-bold text-white/30">{game.GAME_DATE}</span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 lg:gap-8">
                          {/* Away */}
                          <div className="text-center space-y-3">
                            <div className="flex justify-center">
                              <div
                                className="w-20 h-20 rounded-2xl flex items-center justify-center ring-2 ring-white/10 shadow-xl"
                                style={{ backgroundColor: `${awayInfo.color}22`, borderColor: `${awayInfo.color}44` }}
                              >
                                <TeamLogo abbr={awayInfo.abbr} name={awayInfo.name} size={56} />
                              </div>
                            </div>
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Away</p>
                              <h2 className="text-xl font-black uppercase tracking-tight text-white leading-tight mt-1" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                                {awayInfo.name}
                              </h2>
                              <p className="text-3xl font-black font-mono mt-2" style={{ color: awayInfo.color }}>
                                {(predResult.win_probability.away_win_probability * 100).toFixed(1)}%
                              </p>
                              <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider mt-1">Win Probability</p>
                            </div>
                            {winnerAbbr === awayInfo.abbr && (
                              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 winner-pulse">
                                <Trophy size={11} className="text-emerald-400" />
                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">Predicted Winner</span>
                              </div>
                            )}
                          </div>

                          {/* Arc */}
                          <div className="flex flex-col items-center gap-2">
                            <WinProbabilityArc
                              homeProb={predResult.win_probability.home_win_probability}
                              awayProb={predResult.win_probability.away_win_probability}
                              homeColor={homeInfo.color}
                              awayColor={awayInfo.color}
                              homeAbbr={homeInfo.abbr}
                              awayAbbr={awayInfo.abbr}
                              confidence={predResult.win_probability.confidence_bucket || ""}
                              margin={predResult.score_prediction?.predicted_margin ?? 0}
                              winnerAbbr={winnerInfo.abbr}
                            />
                            <div
                              className="px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest"
                              style={{
                                backgroundColor: confidence.toUpperCase().includes("STRONG") ? "rgba(16,185,129,0.15)" : "rgba(59,130,246,0.15)",
                                borderColor: confidence.toUpperCase().includes("STRONG") ? "rgba(16,185,129,0.3)" : "rgba(59,130,246,0.3)",
                                color: confidence.toUpperCase().includes("STRONG") ? "#10b981" : "#60a5fa",
                              }}
                            >
                              {confidence}
                            </div>
                          </div>

                          {/* Home */}
                          <div className="text-center space-y-3">
                            <div className="flex justify-center">
                              <div
                                className="w-20 h-20 rounded-2xl flex items-center justify-center ring-2 ring-white/10 shadow-xl"
                                style={{ backgroundColor: `${homeInfo.color}22`, borderColor: `${homeInfo.color}44` }}
                              >
                                <TeamLogo abbr={homeInfo.abbr} name={homeInfo.name} size={56} />
                              </div>
                            </div>
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Home</p>
                              <h2 className="text-xl font-black uppercase tracking-tight text-white leading-tight mt-1" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                                {homeInfo.name}
                              </h2>
                              <p className="text-3xl font-black font-mono mt-2" style={{ color: homeInfo.color }}>
                                {(predResult.win_probability.home_win_probability * 100).toFixed(1)}%
                              </p>
                              <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider mt-1">Win Probability</p>
                            </div>
                            {winnerAbbr === homeInfo.abbr && (
                              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 winner-pulse">
                                <Trophy size={11} className="text-emerald-400" />
                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">Predicted Winner</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {predResult.score_prediction && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 pt-6 border-t border-white/08">
                            {[
                              {
                                label: "Predicted Score",
                                value: `${predResult.score_prediction.predicted_home_score?.toFixed(0)} – ${predResult.score_prediction.predicted_away_score?.toFixed(0)}`,
                                sub: `${homeInfo.abbr} – ${awayInfo.abbr}`,
                              },
                              {
                                label: "Expected Margin",
                                value: `${Math.abs(predResult.score_prediction.predicted_margin).toFixed(1)} pts`,
                                sub: `${winnerInfo.abbr} lead`,
                              },
                              {
                                label: "Total Points",
                                value: `${predResult.score_prediction.predicted_total_points?.toFixed(0)} pts`,
                                sub: `${predResult.score_prediction.total_points_range?.[0]}–${predResult.score_prediction.total_points_range?.[1]} range`,
                              },
                              {
                                label: "Confidence",
                                value: confidence,
                                sub: "Model signal strength",
                              },
                            ].map((kpi, i) => (
                              <div key={i} className="text-center p-3 rounded-xl bg-white/04 border border-white/06">
                                <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{kpi.label}</p>
                                <p className="text-sm font-black text-white mt-1.5 font-mono" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                                  {kpi.value}
                                </p>
                                <p className="text-[9px] text-white/25 font-bold mt-1">{kpi.sub}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Zap size={13} className="text-indigo-500" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Why the Model Favors {winnerInfo.name}
                        </p>
                      </div>
                      <SignalCards result={predResult} homeInfo={homeInfo} awayInfo={awayInfo} winnerInfo={winnerInfo} />
                    </div>

                    <NarrativeBlock result={predResult} homeInfo={homeInfo} awayInfo={awayInfo} winnerInfo={winnerInfo} />

                    {predResult.explanation && (
                      <ModelExplanationSection
                        result={predResult}
                        homeInfo={homeInfo}
                        awayInfo={awayInfo}
                      />
                    )}

                    {predResult.player_predictions && (
                      <div className="surface rounded-[1.5rem] p-5 lg:p-6">
                        <PlayerSpotlight players={predResult.player_predictions} homeInfo={homeInfo} awayInfo={awayInfo} />
                      </div>
                    )}

                    {hasActualResult && (
                      <div className={isPredictionCorrect ? "verdict-card-correct" : "verdict-card-wrong"}>
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <Activity size={14} className={isPredictionCorrect ? "text-emerald-600" : "text-rose-500"} />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Model vs Actual Outcome</p>
                          </div>
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase border ${isPredictionCorrect ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "bg-rose-100 text-rose-700 border-rose-300"}`}>
                            {isPredictionCorrect ? "Correct Prediction" : "Incorrect Prediction"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-4 bg-white/60 rounded-xl border border-white/80">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Model Predicted</p>
                            <div className="flex items-center gap-2.5">
                              <TeamLogo abbr={winnerAbbr} name={winnerInfo.name} size={28} />
                              <div>
                                <p className="text-xs font-black text-slate-800">{winnerInfo.abbr} to Win</p>
                                <p className="text-[10px] font-bold text-slate-400 mt-0.5 font-mono">
                                  {(winProb * 100).toFixed(1)}% prob
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="p-4 bg-white/60 rounded-xl border border-white/80">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Actual Outcome</p>
                            <div className="flex items-center gap-2.5">
                              <TeamLogo abbr={game.WINNER_TEAM_ABBREVIATION || ""} name={getTeamInfo(game.WINNER_TEAM_ABBREVIATION || "").name} size={28} />
                              <div>
                                <p className="text-xs font-black text-slate-800">
                                  {game.WINNER_TEAM_ABBREVIATION} Won {game.HOME_SCORE} – {game.AWAY_SCORE}
                                </p>
                                <p className="text-[10px] font-bold text-slate-400 mt-0.5 font-mono uppercase">
                                  {game.GAME_STATUS || "Final"}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Model diagnostics (collapsible) */}
                    <ModelDiagnostics modelStatus={modelStatus} result={predResult} />

                  </div>
                );
              })()}
            </div>
          )}
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
    const query = season ? `?season=${encodeURIComponent(season)}` : "";
    loadPrivateApi<PbpData>(`/frontend-data-api/play-by-play/${encodeURIComponent(normGameId)}${query}`)
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
