import React from "react";
import { ChevronRight, Clock, Sparkles } from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { GameFeedRow } from "../../types/gameFeed";
import { TEAM_NAME_BY_ABBR, isKnownTeamAbbr } from "../../lib/nbaTeams";

interface FixtureMatchRowProps {
  game: GameFeedRow;
  onOpen: () => void;
  onSelectTeam?: (abbr: string) => void;
  onPredict?: () => void;
}

export const FixtureMatchRow: React.FC<FixtureMatchRowProps> = ({
  game,
  onOpen,
  onSelectTeam,
  onPredict,
}) => {
  const isCompleted =
    game.GAME_STATUS === "Final" ||
    game.GAME_STATUS === "FINAL" ||
    Boolean(game.WINNER_TEAM_ABBREVIATION) ||
    ((Number(game.HOME_SCORE) || 0) > 0 && (Number(game.AWAY_SCORE) || 0) > 0);

  const awayAbbr = game.AWAY_TEAM_ABBREVIATION ?? "AWAY";
  const homeAbbr = game.HOME_TEAM_ABBREVIATION ?? "HOME";
  const awayName = (isKnownTeamAbbr(awayAbbr) ? TEAM_NAME_BY_ABBR[awayAbbr] : null) || game.AWAY_TEAM_NAME || awayAbbr;
  const homeName = (isKnownTeamAbbr(homeAbbr) ? TEAM_NAME_BY_ABBR[homeAbbr] : null) || game.HOME_TEAM_NAME || homeAbbr;

  const awayWon = isCompleted && game.WINNER_TEAM_ABBREVIATION === awayAbbr;
  const homeWon = isCompleted && game.WINNER_TEAM_ABBREVIATION === homeAbbr;
  const margin = isCompleted ? Math.abs((Number(game.HOME_SCORE) || 0) - (Number(game.AWAY_SCORE) || 0)) : 0;

  return (
    <div
      onClick={onOpen}
      className="group flex cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-xs transition-colors hover:bg-background-tertiary/70 sm:gap-4 sm:px-4 sm:py-3"
    >
      {/* 1. Status / Time */}
      <div className="w-16 shrink-0 text-left sm:w-20">
        {isCompleted ? (
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
            <span>MS</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[11px] font-semibold text-text-secondary sm:text-xs">
            <Clock className="hidden h-3 w-3 shrink-0 text-text-muted sm:inline" />
            <span className="truncate">{game.GAME_STATUS || "vs"}</span>
          </div>
        )}
      </div>

      {/* 2. Teams & Score Center */}
      <div className="flex flex-1 min-w-0 items-center justify-center gap-2 sm:gap-4">
        {/* Away Team */}
        <div className="flex flex-1 min-w-0 items-center justify-end gap-2 text-right">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelectTeam?.(awayAbbr);
            }}
            className={`truncate text-xs font-bold transition-colors hover:underline sm:text-sm ${
              awayWon ? "text-text-primary font-black" : "text-text-secondary hover:text-text-primary"
            }`}
            title={awayName}
          >
            <span className="hidden md:inline">{awayName}</span>
            <span className="inline md:hidden">{awayAbbr}</span>
          </button>
          <TeamLogo abbr={awayAbbr} name={awayName} size={24} className="shrink-0" />
        </div>

        {/* Score / VS Badge */}
        <div className="flex shrink-0 min-w-[58px] items-center justify-center sm:min-w-[70px]">
          {isCompleted ? (
            <div className="rounded-lg bg-primary px-2.5 py-1 text-center font-mono text-xs font-bold text-white shadow-xs sm:text-sm">
              <span>{game.AWAY_SCORE}</span>
              <span className="mx-1 text-white/70">-</span>
              <span>{game.HOME_SCORE}</span>
            </div>
          ) : (
            <span className="rounded-lg border border-border bg-background-tertiary px-2.5 py-1 font-mono text-xs font-bold text-text-secondary">
              VS
            </span>
          )}
        </div>

        {/* Home Team */}
        <div className="flex flex-1 min-w-0 items-center justify-start gap-2 text-left">
          <TeamLogo abbr={homeAbbr} name={homeName} size={24} className="shrink-0" />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelectTeam?.(homeAbbr);
            }}
            className={`truncate text-xs font-bold transition-colors hover:underline sm:text-sm ${
              homeWon ? "text-text-primary font-black" : "text-text-secondary hover:text-text-primary"
            }`}
            title={homeName}
          >
            <span className="hidden md:inline">{homeName}</span>
            <span className="inline md:hidden">{homeAbbr}</span>
          </button>
        </div>
      </div>

      {/* 3. Prediction / Margin Badge & Chevron */}
      <div className="flex shrink-0 min-w-[75px] items-center justify-end gap-2 sm:min-w-[130px]">
        {isCompleted ? (
          <div className="hidden items-center gap-1 text-[11px] text-text-muted sm:flex">
            {margin > 0 && (
              <span className="rounded border border-border bg-background-tertiary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-text-secondary">
                +{margin}
              </span>
            )}
            {game.SERIES_GAME_NUMBER != null && (
              <span className="rounded border border-border bg-background-tertiary px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                G{game.SERIES_GAME_NUMBER}
              </span>
            )}
            {game.IS_ELIMINATION_GAME && (
              <span className="rounded border border-border bg-background-tertiary px-1.5 py-0.5 text-[10px] font-bold text-status-error">
                Elim
              </span>
            )}
          </div>
        ) : onPredict ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onPredict();
            }}
            className="hidden items-center gap-1 rounded-full border border-border bg-background-tertiary px-2 py-0.5 text-[10px] font-bold text-text-primary transition-colors hover:border-primary sm:inline-flex"
          >
            <Sparkles size={11} className="text-primary" />
            <span>Model</span>
          </button>
        ) : null}

        <span className="flex items-center rounded-lg border border-border/80 bg-background-primary p-1 text-text-secondary transition-all group-hover:bg-background-tertiary group-hover:text-text-primary group-hover:translate-x-0.5">
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
};
