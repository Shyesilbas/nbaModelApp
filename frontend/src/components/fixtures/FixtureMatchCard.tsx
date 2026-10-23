import React from "react";
import { Sparkles, ChevronRight, Clock, RefreshCw, Shield, MapPin } from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { GameFeedRow } from "../../types/gameFeed";
import { TEAM_NAME_BY_ABBR, getTeamShortName, isKnownTeamAbbr } from "../../lib/nbaTeams";
import { fmtTipoffTR, isGameEligibleForRefresh, parseOfficials } from "../game-results/utils";

interface FixtureMatchCardProps {
  game: GameFeedRow;
  onOpen: () => void;
  onSelectTeam?: (abbr: string) => void;
  onPredict?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  homeForm?: ("W" | "L")[];
  awayForm?: ("W" | "L")[];
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
}) => {
  const isCompleted =
    game.GAME_STATUS === "Final" ||
    game.GAME_STATUS === "FINAL" ||
    Boolean(game.WINNER_TEAM_ABBREVIATION) ||
    ((Number(game.HOME_SCORE) || 0) > 0 && (Number(game.AWAY_SCORE) || 0) > 0);

  const canRefresh = !isCompleted && isGameEligibleForRefresh(game) && Boolean(onRefresh);
  const officials = parseOfficials(game.OFFICIALS);

  const awayAbbr = game.AWAY_TEAM_ABBREVIATION ?? "AWAY";
  const homeAbbr = game.HOME_TEAM_ABBREVIATION ?? "HOME";
  const awayFullName = (isKnownTeamAbbr(awayAbbr) ? TEAM_NAME_BY_ABBR[awayAbbr] : null) || game.AWAY_TEAM_NAME || awayAbbr;
  const homeFullName = (isKnownTeamAbbr(homeAbbr) ? TEAM_NAME_BY_ABBR[homeAbbr] : null) || game.HOME_TEAM_NAME || homeAbbr;
  const awayName = getTeamShortName(awayAbbr, awayFullName);
  const homeName = getTeamShortName(homeAbbr, homeFullName);

  const awayWon = isCompleted && game.WINNER_TEAM_ABBREVIATION === awayAbbr;
  const homeWon = isCompleted && game.WINNER_TEAM_ABBREVIATION === homeAbbr;
  const margin = isCompleted ? Math.abs((Number(game.HOME_SCORE) || 0) - (Number(game.AWAY_SCORE) || 0)) : 0;
  const seasonLabel = game.SEASON_TYPE === "Regular Season" ? "Regular" : (game.SEASON_TYPE ?? "Regular");

  return (
    <div
      onClick={onOpen}
      className="group relative flex w-full cursor-pointer flex-col justify-between rounded border border-border bg-background-primary p-3 sm:p-3.5 transition-colors hover:border-card-border-hover"
    >
      {/* Top Meta Bar */}
      <div className="flex items-center justify-between border-b border-border-light pb-2 text-xs text-text-secondary">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="rounded-sm bg-background-tertiary border border-border px-1.5 py-0.5 text-xs font-medium text-text-secondary">
            {seasonLabel}
          </span>
          {isCompleted ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-status-success">
              <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
              {game.GAME_STATUS || "Final"}
              {fmtTipoffTR(game.GAME_START_UTC) && <span className="font-normal text-text-muted">· {fmtTipoffTR(game.GAME_START_UTC)}</span>}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-text-muted">
              <Clock className="h-3 w-3" />
              <span>{fmtTipoffTR(game.GAME_START_UTC) ?? (game.GAME_STATUS || "Programda")}</span>
            </span>
          )}
          {game.SERIES_GAME_NUMBER != null && (
            <span className="rounded-sm border border-border bg-background-tertiary px-1 py-0.5 text-xs text-text-secondary">
              Game {game.SERIES_GAME_NUMBER}
            </span>
          )}
          {game.IS_ELIMINATION_GAME && (
            <span className="rounded-sm border border-status-error/30 bg-status-error/10 px-1 py-0.5 text-xs font-medium text-status-error">
              Elimination
            </span>
          )}
        </div>

        <span className="flex items-center gap-0.5 text-xs font-medium text-text-secondary transition-colors group-hover:text-text-primary shrink-0 ml-2">
          <span>{isCompleted ? "Kutu Puanı" : "Detay"}</span>
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>

      {/* Main Scoreboard & Matchup */}
      <div className="py-2.5">
        <div className="flex items-center justify-between gap-2.5">
          {/* Away Team (Left) */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <TeamLogo abbr={awayAbbr} name={awayName} size={34} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectTeam?.(awayAbbr);
                }}
                className={`block truncate text-xs sm:text-sm font-semibold text-left transition-colors hover:underline ${
                  awayWon ? "text-text-primary font-semibold" : "text-text-secondary hover:text-text-primary"
                }`}
                title={awayFullName}
              >
                {awayName}
              </button>
              <span className="text-xs text-text-muted block">
                Deplasman
              </span>
            </div>
          </div>

          {/* Central Score / VS Display (Clean text, no box) */}
          <div className="shrink-0 flex flex-col items-center justify-center min-w-[64px] px-1 text-center">
            {isCompleted ? (
              <>
                <div className="flex items-baseline justify-center gap-1.5 text-base sm:text-lg font-semibold tabular-nums text-text-primary">
                  <span className={awayWon ? "text-text-primary font-semibold" : "text-text-secondary"}>
                    {game.AWAY_SCORE ?? "-"}
                  </span>
                  <span className="text-text-muted text-xs font-normal">:</span>
                  <span className={homeWon ? "text-text-primary font-semibold" : "text-text-secondary"}>
                    {game.HOME_SCORE ?? "-"}
                  </span>
                </div>
                {margin > 0 && (
                  <span className="text-xs font-medium text-text-muted tabular-nums">
                    +{margin} sayı
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs font-medium text-text-muted">
                VS
              </span>
            )}
          </div>

          {/* Home Team (Right) */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-end text-right">
            <div className="min-w-0 flex-1 text-right">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectTeam?.(homeAbbr);
                }}
                className={`block truncate text-xs sm:text-sm font-semibold text-right transition-colors hover:underline ml-auto ${
                  homeWon ? "text-text-primary font-semibold" : "text-text-secondary hover:text-text-primary"
                }`}
                title={homeFullName}
              >
                {homeName}
              </button>
              <span className="text-xs text-text-muted block text-right">
                Ev Sahibi
              </span>
            </div>
            <TeamLogo abbr={homeAbbr} name={homeName} size={34} className="shrink-0" />
          </div>
        </div>
      </div>

      {/* Recent Form (Son 5 Maç) */}
      {(awayForm.length > 0 || homeForm.length > 0) && (
        <div className="flex items-center justify-between gap-2 border-t border-border-light py-1.5 px-0.5 text-xs">
          <div className="flex items-center gap-1" title={`${awayName} son 5 maç formu`}>
            {awayForm.map((res, i) => (
              <span
                key={i}
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold text-white ${
                  res === "W" ? "bg-status-success" : "bg-status-error"
                }`}
                title={res === "W" ? "Galibiyet" : "Mağlubiyet"}
              >
                {res === "W" ? "G" : "M"}
              </span>
            ))}
          </div>
          <span className="shrink-0 font-medium text-xs text-text-muted">
            SON 5
          </span>
          <div className="flex items-center gap-1" title={`${homeName} son 5 maç formu`}>
            {homeForm.map((res, i) => (
              <span
                key={i}
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold text-white ${
                  res === "W" ? "bg-status-success" : "bg-status-error"
                }`}
                title={res === "W" ? "Galibiyet" : "Mağlubiyet"}
              >
                {res === "W" ? "G" : "M"}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Bar: Arena, Officials, Actions */}
      <div className="flex items-center justify-between gap-2 border-t border-border-light pt-2 text-xs text-text-secondary">
        {/* Left: Arena & Officials */}
        <div className="flex items-center gap-2 min-w-0 text-text-muted text-xs truncate">
          {game.ARENA && (
            <span className="flex items-center gap-1 truncate" title={game.ARENA}>
              <MapPin size={16} className="shrink-0 text-text-muted" />
              <span className="truncate">{game.ARENA}</span>
            </span>
          )}

          {officials.length > 0 && (
            <>
              {game.ARENA && <span>•</span>}
              <span
                className="inline-flex items-center gap-1 text-text-secondary shrink-0"
                title={`Hakemler: ${officials.map((o) => o.cleanName).join(", ")}`}
              >
                <Shield size={16} className="text-text-muted" />
                <span>{officials.map((o) => o.jerseyNum ? `#${o.jerseyNum}` : o.cleanName).slice(0, 2).join(" ")}</span>
              </span>
            </>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {canRefresh && (
            <button
              type="button"
              disabled={isRefreshing}
              onClick={(event) => {
                event.stopPropagation();
                onRefresh?.();
              }}
              className="inline-flex items-center gap-1 rounded border border-border bg-background-primary px-2 py-0.5 text-xs font-medium text-text-primary transition-colors hover:bg-background-tertiary disabled:opacity-50"
            >
              <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
              <span>{isRefreshing ? "..." : "Yenile"}</span>
            </button>
          )}

          {!isCompleted && onPredict && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPredict();
              }}
              className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-primary-hover"
            >
              <Sparkles size={16} />
              <span>Tahmin</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
