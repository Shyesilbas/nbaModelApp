import React from "react";
import { ChevronRight, RefreshCw, Sparkles } from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { GameFeedRow } from "../../types/gameFeed";
import { fmtTipoffTR, isGameEligibleForRefresh } from "../game-results/utils";
import { TEAM_NAME_BY_ABBR, getTeamShortName, isKnownTeamAbbr } from "../../lib/nbaTeams";
import { useLanguage } from "../../context/LanguageContext";

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
  homeForm = [],
  awayForm = [],
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
  const margin = isCompleted ? Math.abs((Number(game.HOME_SCORE) || 0) - (Number(game.AWAY_SCORE) || 0)) : 0;

  const side = (
    abbr: string,
    fullName: string,
    record: string | undefined,
    form: ("W" | "L")[],
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
        className={`flex min-w-0 items-center gap-2.5 sm:gap-3 ${align === "right" ? "justify-end text-right" : "justify-start text-left"
          }`}
      >
        {align === "left" && <TeamLogo abbr={abbr} name={fullName} size={28} className="shrink-0" />}
        <div className="min-w-0">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelectTeam?.(abbr);
            }}
            className={`block max-w-full truncate text-sm transition-colors hover:underline ${align === "right" ? "ml-auto" : ""
              } ${teamTextClass}`}
            title={fullName}
          >
            <span className="hidden md:inline">{fullName}</span>
            <span className="md:hidden">{getTeamShortName(abbr, fullName)}</span>
          </button>
          {(record || form.length > 0) && (
            <div
              className={`mt-0.5 hidden items-center gap-1.5 text-xs tabular-nums sm:flex ${align === "right" ? "justify-end" : "justify-start"
                }`}
            >
              {record && <span className="font-medium text-text-secondary">{record}</span>}
              {form.length > 0 && (
                <span className="hidden items-center gap-0.5 font-medium lg:inline-flex" title={tr ? "Son 5 maç" : "Last 5 games"}>
                  {form.map((res, i) => (
                    <span key={i} className={res === "W" ? "text-status-success" : "text-status-error"}>
                      {res === "W" ? (tr ? "G" : "W") : tr ? "M" : "L"}
                    </span>
                  ))}
                </span>
              )}
            </div>
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
      className="group grid cursor-pointer grid-cols-[72px_1fr_auto] items-center gap-2.5 px-3.5 py-3 transition-colors hover:bg-background-tertiary sm:grid-cols-[96px_1fr_132px] sm:gap-4 sm:px-4 sm:py-3.5"
    >
      <div className="shrink-0">
        <span
          className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium tabular-nums ${isCompleted
            ? "bg-background-tertiary text-text-secondary"
            : "bg-background-tertiary text-text-primary"
            }`}
        >
          {statusText}
        </span>
      </div>

      <div className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
        {side(awayAbbr, awayFullName, awayRecord, awayForm, awayWon, "right")}

        <div className="flex min-w-[76px] shrink-0 items-center justify-center text-center tabular-nums sm:min-w-[96px]">
          {isCompleted && (
            <div className="inline-flex items-center justify-center gap-1.5 rounded bg-background-tertiary px-2.5 py-1 text-sm sm:text-base">
              <span className={awayWon ? "font-semibold text-text-primary" : "font-medium text-text-secondary"}>
                {game.AWAY_SCORE}
              </span>
              <span className="text-xs text-text-secondary">-</span>
              <span className={homeWon ? "font-semibold text-text-primary" : "font-medium text-text-secondary"}>
                {game.HOME_SCORE}
              </span>
            </div>
          )}
        </div>

        {side(homeAbbr, homeFullName, homeRecord, homeForm, homeWon, "left")}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2.5">
        {canRefresh ? (
          <button
            type="button"
            disabled={isRefreshing}
            onClick={(event) => {
              event.stopPropagation();
              onRefresh?.();
            }}
            className="hidden items-center gap-1 rounded-sm border border-border bg-background-primary px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-card-border-hover hover:text-text-primary disabled:opacity-50 sm:inline-flex"
          >
            <RefreshCw size={12} className={isRefreshing ? "animate-spin text-primary" : ""} />
            {isRefreshing ? "..." : tr ? "Yenile" : "Refresh"}
          </button>
        ) : isCompleted ? (
          <p className="hidden text-right text-xs font-medium tabular-nums text-text-secondary sm:block">
            {[margin > 0 ? `+${margin}` : null, ...extra].filter(Boolean).join(" · ")}
          </p>
        ) : onPredict ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onPredict();
            }}
            className="hidden items-center gap-1 rounded-sm bg-primary/10 px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 sm:inline-flex"
          >
            <Sparkles size={12} />
            {tr ? "Tahmin" : "Predict"}
          </button>
        ) : null}
        <ChevronRight size={16} className="text-text-secondary transition-colors group-hover:text-text-primary" />
      </div>
    </div>
  );
};
