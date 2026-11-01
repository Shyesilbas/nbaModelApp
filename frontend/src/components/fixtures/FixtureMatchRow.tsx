import React from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { GameFeedRow } from "../../types/gameFeed";
import { fmtTipoffTR } from "../game-results/utils";
import { TEAM_NAME_BY_ABBR, getTeamShortName, isKnownTeamAbbr } from "../../lib/nbaTeams";
import { useLanguage } from "../../context/LanguageContext";

interface FixtureMatchRowProps {
  game: GameFeedRow;
  onOpen: () => void;
  onSelectTeam?: (abbr: string) => void;
  onPredict?: () => void;
  homeRecord?: string;
  awayRecord?: string;
}

export const FixtureMatchRow: React.FC<FixtureMatchRowProps> = ({
  game,
  onOpen,
  onSelectTeam,
  onPredict,
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

  const awayAbbr = game.AWAY_TEAM_ABBREVIATION ?? "AWAY";
  const homeAbbr = game.HOME_TEAM_ABBREVIATION ?? "HOME";
  const awayFullName = (isKnownTeamAbbr(awayAbbr) ? TEAM_NAME_BY_ABBR[awayAbbr] : null) || game.AWAY_TEAM_NAME || awayAbbr;
  const homeFullName = (isKnownTeamAbbr(homeAbbr) ? TEAM_NAME_BY_ABBR[homeAbbr] : null) || game.HOME_TEAM_NAME || homeAbbr;

  const awayWon = isCompleted && game.WINNER_TEAM_ABBREVIATION === awayAbbr;
  const homeWon = isCompleted && game.WINNER_TEAM_ABBREVIATION === homeAbbr;
  const margin = isCompleted ? Math.abs((Number(game.HOME_SCORE) || 0) - (Number(game.AWAY_SCORE) || 0)) : 0;

  const side = (abbr: string, fullName: string, record: string | undefined, won: boolean, align: "right" | "left") => (
    <div className={`flex min-w-0 flex-1 items-center gap-2.5 ${align === "right" ? "justify-end text-right" : "justify-start text-left"}`}>
      {align === "left" && <TeamLogo abbr={abbr} name={fullName} size={28} className="shrink-0" />}
      <div className="min-w-0">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelectTeam?.(abbr);
          }}
          className={`block max-w-full truncate text-sm transition-colors hover:underline ${
            align === "right" ? "ml-auto" : ""
          } ${won ? "font-semibold text-text-primary" : "text-text-secondary hover:text-text-primary"}`}
          title={fullName}
        >
          <span className="hidden md:inline">{fullName}</span>
          <span className="md:hidden">{getTeamShortName(abbr, fullName)}</span>
        </button>
        {record && <p className="hidden text-xs tabular-nums text-text-muted sm:block">{record}</p>}
      </div>
      {align === "right" && <TeamLogo abbr={abbr} name={fullName} size={28} className="shrink-0" />}
    </div>
  );

  const extra = [
    game.SERIES_GAME_NUMBER != null ? `${tr ? "Maç" : "Game"} ${game.SERIES_GAME_NUMBER}` : null,
    game.IS_ELIMINATION_GAME ? (tr ? "Eleme" : "Elimination") : null,
  ].filter(Boolean);

  return (
    <div
      onClick={onOpen}
      className="group flex cursor-pointer items-center gap-3 px-3.5 py-3 transition-colors hover:bg-background-tertiary/70 sm:gap-4 sm:px-4"
    >
      <div className="w-14 shrink-0 text-xs text-text-muted sm:w-20">
        {isCompleted ? (tr ? "Bitti" : "Final") : (fmtTipoffTR(game.GAME_START_UTC, language) ?? (game.GAME_STATUS || "-"))}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-5">
        {side(awayAbbr, awayFullName, awayRecord, awayWon, "right")}

        <div className="w-16 shrink-0 text-center tabular-nums sm:w-20">
          {isCompleted ? (
            <p className="text-base">
              <span className={awayWon ? "font-semibold text-text-primary" : "text-text-secondary"}>{game.AWAY_SCORE}</span>
              <span className="mx-1.5 text-text-muted">-</span>
              <span className={homeWon ? "font-semibold text-text-primary" : "text-text-secondary"}>{game.HOME_SCORE}</span>
            </p>
          ) : (
            <span className="text-xs text-text-muted">{tr ? "karşı" : "vs"}</span>
          )}
        </div>

        {side(homeAbbr, homeFullName, homeRecord, homeWon, "left")}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 sm:w-36">
        {isCompleted ? (
          <p className="hidden text-right text-xs text-text-muted sm:block">
            {[margin > 0 ? `+${margin}` : null, ...extra].filter(Boolean).join(" · ")}
          </p>
        ) : onPredict ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onPredict();
            }}
            className="hidden items-center gap-1 text-xs font-medium text-primary hover:underline sm:inline-flex"
          >
            <Sparkles size={14} />
            {tr ? "Tahmin" : "Predict"}
          </button>
        ) : null}
        <ChevronRight size={16} className="text-text-muted transition-colors group-hover:text-text-primary" />
      </div>
    </div>
  );
};
