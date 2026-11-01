import React from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { GameFeedRow } from "../../types/gameFeed";
import { TEAM_NAME_BY_ABBR, isKnownTeamAbbr } from "../../lib/nbaTeams";
import { fmtTipoffTR, isGameEligibleForRefresh } from "../game-results/utils";
import { useLanguage } from "../../context/LanguageContext";

interface FixtureMatchCardProps {
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

export const FixtureMatchCard: React.FC<FixtureMatchCardProps> = ({
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

  const tipoff = fmtTipoffTR(game.GAME_START_UTC, language);
  const meta = [
    isCompleted ? (tr ? "Bitti" : "Final") : (tipoff ?? (game.GAME_STATUS || (tr ? "Programda" : "Scheduled"))),
    game.SEASON_TYPE && game.SEASON_TYPE !== "Regular Season" ? game.SEASON_TYPE : null,
    game.SERIES_GAME_NUMBER != null ? `${tr ? "Maç" : "Game"} ${game.SERIES_GAME_NUMBER}` : null,
    game.IS_ELIMINATION_GAME ? (tr ? "Eleme maçı" : "Elimination") : null,
  ].filter(Boolean);

  const team = (abbr: string, fullName: string, record: string | undefined, won: boolean, score: number | null | undefined, form: ("W" | "L")[]) => (
    <div className="flex items-center gap-3">
      <TeamLogo abbr={abbr} name={fullName} size={32} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelectTeam?.(abbr);
          }}
          className={`block max-w-full truncate text-left text-sm transition-colors hover:underline ${
            won ? "font-semibold text-text-primary" : "text-text-secondary hover:text-text-primary"
          }`}
          title={fullName}
        >
          {fullName}
        </button>
        <p className="flex items-center gap-2 text-xs tabular-nums text-text-muted">
          {record && <span>{record}</span>}
          {form.length > 0 && (
            <span className="flex gap-0.5 font-medium" title={tr ? "Son 5 maç" : "Last 5 games"}>
              {form.map((res, i) => (
                <span key={i} className={res === "W" ? "text-status-success" : "text-status-error"}>
                  {res === "W" ? (tr ? "G" : "W") : tr ? "M" : "L"}
                </span>
              ))}
            </span>
          )}
        </p>
      </div>
      {isCompleted && (
        <span className={`text-xl tabular-nums ${won ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
          {score ?? "-"}
        </span>
      )}
    </div>
  );

  return (
    <div
      onClick={onOpen}
      className="group flex w-full cursor-pointer flex-col gap-3 rounded border border-border bg-background-primary p-4 transition-colors hover:border-card-border-hover"
    >
      <p className="text-xs text-text-muted">{meta.join(" · ")}</p>

      <div className="space-y-2.5">
        {team(awayAbbr, awayFullName, awayRecord, awayWon, game.AWAY_SCORE, awayForm)}
        {team(homeAbbr, homeFullName, homeRecord, homeWon, game.HOME_SCORE, homeForm)}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border-light pt-3 text-xs text-text-muted">
        <span className="min-w-0 truncate" title={game.ARENA ?? undefined}>
          {[game.ARENA, margin > 0 ? `+${margin}` : null].filter(Boolean).join(" · ")}
        </span>
        <div className="flex shrink-0 items-center gap-3">
          {canRefresh && (
            <button
              type="button"
              disabled={isRefreshing}
              onClick={(event) => {
                event.stopPropagation();
                onRefresh?.();
              }}
              className="inline-flex items-center gap-1 font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
            >
              <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
              {isRefreshing ? "..." : tr ? "Yenile" : "Refresh"}
            </button>
          )}
          {!isCompleted && onPredict && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPredict();
              }}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <Sparkles size={14} />
              {tr ? "Tahmin" : "Predict"}
            </button>
          )}
          <span className="font-medium text-text-secondary transition-colors group-hover:text-text-primary">
            {isCompleted ? (tr ? "Kutu puanı" : "Box score") : tr ? "Detay" : "Details"}
          </span>
        </div>
      </div>
    </div>
  );
};
