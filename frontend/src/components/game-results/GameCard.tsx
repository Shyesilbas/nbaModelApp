import { Sparkles, ChevronRight, Calendar, Trophy, Clock } from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { GameFeedRow } from "../../types/gameFeed";
import { fmtDate } from "./utils";
import { getTeamTheme } from "../../lib/nbaTeams";

export function GameCard({
  game,
  onOpen,
  onPredict,
}: {
  game: GameFeedRow;
  onOpen: () => void;
  onPredict?: () => void;
}) {
  const isCompleted =
    game.GAME_STATUS === "Final" ||
    game.GAME_STATUS === "FINAL" ||
    ((Number(game.HOME_SCORE) || 0) > 0 && (Number(game.AWAY_SCORE) || 0) > 0);

  const margin = isCompleted ? Math.abs((game.HOME_SCORE ?? 0) - (game.AWAY_SCORE ?? 0)) : 0;
  const awayWon = isCompleted && game.WINNER_TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION;
  const homeWon = isCompleted && game.WINNER_TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION;
  const seasonLabel = game.SEASON_TYPE === "Regular Season" ? "Regular" : (game.SEASON_TYPE ?? "Regular");

  const awayTheme = getTeamTheme(game.AWAY_TEAM_ABBREVIATION);
  const homeTheme = getTeamTheme(game.HOME_TEAM_ABBREVIATION);
  const winnerTheme = awayWon ? awayTheme : homeWon ? homeTheme : null;

  const handleClick = () => {
    if (isCompleted) {
      onOpen();
    } else if (onPredict) {
      onPredict();
    }
  };

  return (
    <div
      onClick={handleClick}
      className="group relative w-full overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white shadow-xs transition-all duration-300 hover:shadow-xl hover:-translate-y-1 text-left cursor-pointer flex flex-col justify-between"
      style={{
        background: `linear-gradient(180deg, #ffffff 60%, ${winnerTheme ? winnerTheme.primary + '06' : '#f8fafc'} 100%)`,
      }}
    >
      {/* Dual-Team Gradient Header Line */}
      <div
        className="h-1.5 w-full shrink-0"
        style={{
          background: `linear-gradient(90deg, ${awayTheme.primary} 0%, ${awayTheme.primary} 48%, #ffffff 48%, #ffffff 52%, ${homeTheme.primary} 52%, ${homeTheme.primary} 100%)`,
        }}
      />

      {/* Top Meta Bar */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 bg-slate-50/40">
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
      <div className="p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {/* Away Team */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div 
              className="relative p-1 rounded-xl shrink-0 transition-transform group-hover:scale-105"
              style={{ 
                backgroundColor: `${awayTheme.primary}10`,
                boxShadow: awayWon ? `0 0 0 1.5px ${awayTheme.primary}40` : undefined
              }}
            >
              <TeamLogo abbr={game.AWAY_TEAM_ABBREVIATION} name={game.AWAY_TEAM_NAME} size={36} />
            </div>
            <div className="min-w-0">
              <p className={`text-sm font-black leading-snug truncate ${awayWon ? "text-slate-900" : "text-slate-700 font-bold"}`}>
                {game.AWAY_TEAM_ABBREVIATION}
              </p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Away</p>
            </div>
          </div>

          {/* Central Scores / VS */}
          <div className="min-w-[6.5rem] text-center" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
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
              className="relative p-1 rounded-xl shrink-0 transition-transform group-hover:scale-105"
              style={{ 
                backgroundColor: `${homeTheme.primary}10`,
                boxShadow: homeWon ? `0 0 0 1.5px ${homeTheme.primary}40` : undefined
              }}
            >
              <TeamLogo abbr={game.HOME_TEAM_ABBREVIATION} name={game.HOME_TEAM_NAME} size={36} />
            </div>
          </div>
        </div>

        {/* Footer info bar */}
        <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Calendar size={11} />
            <span>{fmtDate(game.GAME_DATE)}</span>
          </div>
          {isCompleted ? (
            <span 
              className="inline-flex items-center gap-1 font-black uppercase tracking-[0.2em] transition-colors"
              style={{ color: winnerTheme?.primary || "#1d428a" }}
            >
              Box Score <ChevronRight size={12} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onPredict) onPredict();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-black uppercase tracking-[0.18em] shadow-xs hover:shadow-md hover:from-indigo-700 hover:to-indigo-800 transition-all text-[9px]"
            >
              <Sparkles size={10} />
              Predict Matchup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
