import { Sparkles, ChevronRight, Calendar, Trophy, Clock, RefreshCw, Shield } from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { GameFeedRow } from "../../types/gameFeed";
import { fmtDate, isGameEligibleForRefresh, parseOfficials } from "./utils";
import { getTeamTheme } from "../../lib/nbaTeams";

export function GameCard({
  game,
  onOpen,
  onPredict,
  onRefresh,
  isRefreshing,
}: {
  game: GameFeedRow;
  onOpen: () => void;
  onPredict?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  const isCompleted =
    game.GAME_STATUS === "Final" ||
    game.GAME_STATUS === "FINAL" ||
    Boolean(game.WINNER_TEAM_ABBREVIATION) ||
    ((Number(game.HOME_SCORE) || 0) > 0 && (Number(game.AWAY_SCORE) || 0) > 0);

  const canRefresh = !isCompleted && isGameEligibleForRefresh(game) && Boolean(onRefresh);
  const officials = parseOfficials(game.OFFICIALS);

  const margin = isCompleted ? Math.abs((game.HOME_SCORE ?? 0) - (game.AWAY_SCORE ?? 0)) : 0;
  const awayWon = isCompleted && game.WINNER_TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION;
  const homeWon = isCompleted && game.WINNER_TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION;
  const seasonLabel = game.SEASON_TYPE === "Regular Season" ? "Regular" : (game.SEASON_TYPE ?? "Regular");

  const awayTheme = getTeamTheme(game.AWAY_TEAM_ABBREVIATION);
  const homeTheme = getTeamTheme(game.HOME_TEAM_ABBREVIATION);
  const winnerTheme = awayWon ? awayTheme : homeWon ? homeTheme : null;

  const handleClick = () => {
    onOpen();
  };

  return (
    <div
      onClick={handleClick}
      className="group relative w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.045)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_12px_28px_rgba(15,23,42,0.09)] text-left cursor-pointer flex flex-col justify-between"
    >
      {/* Dual-Team Gradient Header Line */}
      <div
        className="h-1 w-full shrink-0 bg-gradient-to-r from-[#1d428a] via-slate-200 to-[#c8102e]"
      />

      {/* Top Meta Bar */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100/80 px-5 py-3 bg-white">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">{seasonLabel}</span>
          {game.SERIES_GAME_NUMBER != null && (
            <span className="rounded-full bg-slate-200/60 px-2 py-0.5 text-[9px] font-bold text-slate-600">
              Game {game.SERIES_GAME_NUMBER}
            </span>
          )}
          {game.IS_ELIMINATION_GAME && (
            <span className="rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-rose-600 animate-pulse">
              Elimination
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isCompleted ? (
            <span className="rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700">
              {game.GAME_STATUS || "FINAL"}
            </span>
          ) : (
            <span className="rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-indigo-700 flex items-center gap-1">
              <Clock size={10} />
              {game.GAME_STATUS || "SCHEDULED"}
            </span>
          )}
        </div>
      </div>

      {/* Main Scoreboard Matchup */}
      <div className="px-5 pb-5 pt-6">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          {/* Away Team */}
            <div className="flex items-center gap-3 min-w-0">
            <div 
              className="relative shrink-0 transition-transform group-hover:scale-105"
              style={{ 
                backgroundColor: `${awayTheme.primary}10`,
                boxShadow: awayWon ? `0 0 0 1.5px ${awayTheme.primary}40` : undefined
              }}
            >
              <TeamLogo abbr={game.AWAY_TEAM_ABBREVIATION} name={game.AWAY_TEAM_NAME} size={42} />
            </div>
            <div className="min-w-0">
                <p className={`text-sm font-black leading-snug truncate ${awayWon ? "text-slate-900" : "text-slate-700 font-bold"}`}>
                {game.AWAY_TEAM_ABBREVIATION}
              </p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Away</p>
            </div>
          </div>

          {/* Central Scores / VS */}
          <div className="min-w-[6.5rem] rounded-2xl bg-slate-50/80 px-4 py-3 text-center" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            {isCompleted ? (
              <>
                <div className="flex items-baseline justify-center gap-1.5">
                  <span 
                    className={`text-3xl font-black leading-none tracking-tight ${awayWon ? "text-slate-900 font-extrabold" : "text-slate-400 font-medium"}`}
                    style={{ color: awayWon ? awayTheme.primary : undefined }}
                  >
                    {game.AWAY_SCORE ?? "-"}
                  </span>
                  <span className="text-base font-semibold text-slate-300">:</span>
                  <span 
                    className={`text-3xl font-black leading-none tracking-tight ${homeWon ? "text-slate-900 font-extrabold" : "text-slate-400 font-medium"}`}
                    style={{ color: homeWon ? homeTheme.primary : undefined }}
                  >
                    {game.HOME_SCORE ?? "-"}
                  </span>
                </div>
                {game.WINNER_TEAM_ABBREVIATION && (
                  <div className="mt-1 flex justify-center">
                    <span 
                      className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1"
                      style={{ 
                        backgroundColor: `${winnerTheme?.primary}12`, 
                        color: winnerTheme?.primary 
                      }}
                    >
                      <Trophy size={8} /> +{margin}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center">
                <span className="text-xl font-black tracking-widest text-slate-400">
                  VS
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50/80 border border-indigo-100 px-2 py-0.5 rounded-full mt-0.5">
                  Upcoming
                </span>
              </div>
            )}
          </div>

          {/* Home Team */}
          <div className="flex items-center justify-end gap-2.5 min-w-0">
            <div className="min-w-0 text-right">
              <p className={`text-sm font-black leading-snug truncate ${homeWon ? "text-slate-900" : "text-slate-700 font-bold"}`}>
                {game.HOME_TEAM_ABBREVIATION}
              </p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Home</p>
            </div>
            <div 
              className="relative shrink-0 transition-transform group-hover:scale-105"
              style={{ 
                backgroundColor: `${homeTheme.primary}10`,
                boxShadow: homeWon ? `0 0 0 1.5px ${homeTheme.primary}40` : undefined
              }}
            >
              <TeamLogo abbr={game.HOME_TEAM_ABBREVIATION} name={game.HOME_TEAM_NAME} size={42} />
            </div>
          </div>
        </div>

        {/* Footer info bar */}
        <div className="mt-5 border-t border-slate-100 pt-4 flex flex-wrap items-center justify-between gap-3 text-[10px]">
          <div className="flex items-center gap-2 text-slate-400">
            <div className="flex items-center gap-1.5">
              <Calendar size={11} />
              <span>{fmtDate(game.GAME_DATE)}</span>
            </div>
            {game.ARENA && (
              <>
                <span>•</span>
                <span className="truncate max-w-[130px]" title={game.LOCATION ? `${game.ARENA} (${game.LOCATION})` : game.ARENA}>
                  {game.ARENA}
                </span>
              </>
            )}
            {officials.length > 0 && (
              <>
                <span>•</span>
                <span
                  className="inline-flex items-center gap-1 font-semibold text-slate-600 bg-slate-100/90 px-1.5 py-0.5 rounded text-[9px]"
                  title={`Hakemler: ${officials.map((o) => o.cleanName).join(", ")}`}
                >
                  <Shield size={10} className="text-slate-500" />
                  <span>{officials.map((o) => o.jerseyNum ? `#${o.jerseyNum}` : o.cleanName).slice(0, 3).join(" ")}</span>
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canRefresh && (
              <button
                type="button"
                disabled={isRefreshing}
                onClick={(e) => {
                  e.stopPropagation();
                  onRefresh?.();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-blue-700 font-bold transition-colors text-[10px] hover:border-blue-300 hover:bg-blue-100 disabled:opacity-60 cursor-pointer"
                title="Maç skorunu, kutu istatistiklerini ve pbp verisini çek"
              >
                <RefreshCw size={10} className={isRefreshing ? "animate-spin" : ""} />
                {isRefreshing ? "Çekiliyor…" : "Verileri Getir"}
              </button>
            )}
            {!isCompleted && onPredict && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPredict();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#c8102e] px-3 py-2 text-white font-bold hover:bg-[#a10d25] transition-colors text-[10px]"
              >
                <Sparkles size={10} />
                Predict
              </button>
            )}
            <span 
              className="inline-flex items-center gap-1 font-black uppercase tracking-[0.18em] transition-colors text-slate-600 hover:text-slate-900"
              style={{ color: isCompleted ? (winnerTheme?.primary || "#1d428a") : undefined }}
            >
              {isCompleted ? "Box Score" : "Match Details"}{" "}
              <ChevronRight size={12} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
