import React from "react";
import { ChevronRight, RefreshCw, Sparkles } from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { GameFeedRow } from "../../types/gameFeed";
import { fmtTipoffTR, isGameEligibleForRefresh } from "../game-results/utils";
import { TEAM_NAME_BY_ABBR, getTeamShortName, isKnownTeamAbbr } from "../../lib/nbaTeams";
import { useLanguage } from "../../context/useLanguage";

interface FixtureMatchRowProps {
  game: GameFeedRow;
  onOpen: () => void;
  onSelectTeam?: (abbr: string) => void;
  onPredict?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  homeForm?: ("W" | "L")[];
  awayForm?: ("W" | "L")[];
  homeRecord?: string;
  awayRecord?: string;
}

export const FixtureMatchRow: React.FC<FixtureMatchRowProps> = ({
  game,
  onOpen,
  onSelectTeam,
  onPredict,
  onRefresh,
  isRefreshing = false,
  homeRecord,
  awayRecord,
}) => {
  const { language } = useLanguage();
  const tr = language === "tr";
  const isCompleted =
    game.GAME_STATUS === "Final" ||
    game.GAME_STATUS === "FINAL" ||
    Boolean(game.WINNER_TEAM_ABBREVIATION) ||
    ((Number(game.HOME_SCORE) || 0) > 0 && (Number(game.AWAY_SCORE) || 0) > 0);

  const canRefresh = !isCompleted && isGameEligibleForRefresh(game) && Boolean(onRefresh);

  const awayAbbr = game.AWAY_TEAM_ABBREVIATION ?? "AWAY";
  const homeAbbr = game.HOME_TEAM_ABBREVIATION ?? "HOME";
  const awayFullName = (isKnownTeamAbbr(awayAbbr) ? TEAM_NAME_BY_ABBR[awayAbbr] : null) || game.AWAY_TEAM_NAME || awayAbbr;
  const homeFullName = (isKnownTeamAbbr(homeAbbr) ? TEAM_NAME_BY_ABBR[homeAbbr] : null) || game.HOME_TEAM_NAME || homeAbbr;

  const awayWon = isCompleted && game.WINNER_TEAM_ABBREVIATION === awayAbbr;
  const homeWon = isCompleted && game.WINNER_TEAM_ABBREVIATION === homeAbbr;

  const side = (
    abbr: string,
    fullName: string,
    record: string | undefined,
    won: boolean,
    align: "right" | "left"
  ) => {
    const teamTextClass = !isCompleted
      ? "font-medium text-text-primary"
      : won
        ? "font-semibold text-text-primary"
        : "font-normal text-text-secondary hover:text-text-primary";

    return (
      <div
        className={`flex min-w-0 flex-1 items-center gap-2 sm:gap-3 ${
          align === "right" ? "justify-end text-right" : "justify-start text-left"
        }`}
      >
        {align === "left" && <TeamLogo abbr={abbr} name={fullName} size={28} className="shrink-0" />}
        <div className="min-w-0 leading-tight">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelectTeam?.(abbr);
            }}
            className={`block max-w-full truncate text-sm transition-colors hover:underline ${
              align === "right" ? "ml-auto" : ""
            } ${teamTextClass}`}
            title={fullName}
          >
            {getTeamShortName(abbr, fullName)}
          </button>
          {record && (
            <span className="mt-0.5 hidden text-xs tabular-nums text-text-muted sm:block">
              {record}
            </span>
          )}
        </div>
        {align === "right" && <TeamLogo abbr={abbr} name={fullName} size={28} className="shrink-0" />}
      </div>
    );
  };

  const extra = [
    game.SERIES_GAME_NUMBER != null ? `${tr ? "Maç" : "Game"} ${game.SERIES_GAME_NUMBER}` : null,
    game.IS_ELIMINATION_GAME ? (tr ? "Eleme" : "Elimination") : null,
  ].filter(Boolean);

  const statusText = isCompleted
    ? tr
      ? "Bitti"
      : "Final"
    : fmtTipoffTR(game.GAME_START_UTC, language) ?? (game.GAME_STATUS || "-");

  return (
    <div
      onClick={onOpen}
      className="group flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-background-tertiary sm:gap-4"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
        {side(awayAbbr, awayFullName, awayRecord, awayWon, "right")}

        <div className="flex w-20 shrink-0 items-center justify-center text-center tabular-nums sm:w-24">
          {!isCompleted ? (
            <span className="inline-flex items-center whitespace-nowrap rounded-sm bg-background-tertiary px-2 py-1 text-xs font-medium tabular-nums text-text-secondary">
              {statusText}
            </span>
          ) : (
            <div className="inline-flex items-center justify-center gap-1.5 rounded bg-background-tertiary px-2.5 py-1 text-sm sm:text-base">
              <span className={awayWon ? "font-semibold text-text-primary" : "font-medium text-text-secondary"}>
                {game.AWAY_SCORE}
              </span>
              <span className="text-xs text-text-muted">-</span>
              <span className={homeWon ? "font-semibold text-text-primary" : "font-medium text-text-secondary"}>
                {game.HOME_SCORE}
              </span>
            </div>
          )}
        </div>

        {side(homeAbbr, homeFullName, homeRecord, homeWon, "left")}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 sm:w-24">
        {canRefresh ? (
          <button
            type="button"
            disabled={isRefreshing}
            aria-label={tr ? "Yenile" : "Refresh"}
            onClick={(event) => {
              event.stopPropagation();
              onRefresh?.();
            }}
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-background-primary px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-card-border-hover hover:text-text-primary disabled:opacity-50"
          >
            <RefreshCw size={12} strokeWidth={1.5} className={isRefreshing ? "animate-spin text-primary" : ""} />
            <span className="hidden sm:inline">{isRefreshing ? "..." : tr ? "Yenile" : "Refresh"}</span>
          </button>
        ) : isCompleted ? (
          extra.length > 0 && (
            <p className="hidden text-right text-xs font-medium tabular-nums text-text-muted sm:block">
              {extra.join(" · ")}
            </p>
          )
        ) : onPredict ? (
          <button
            type="button"
            aria-label={tr ? "Tahmin" : "Predict"}
            onClick={(event) => {
              event.stopPropagation();
              onPredict();
            }}
            className="inline-flex items-center gap-1 rounded-sm px-1.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-background-primary hover:text-primary"
          >
            <Sparkles size={13} strokeWidth={1.5} />
            <span className="hidden sm:inline">{tr ? "Tahmin" : "Predict"}</span>
          </button>
        ) : null}
        <ChevronRight
          size={16}
          strokeWidth={1.5}
          className="hidden text-text-muted transition-colors group-hover:text-text-primary sm:block"
        />
      </div>
    </div>
  );
};
