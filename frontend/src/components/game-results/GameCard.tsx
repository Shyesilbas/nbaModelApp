import { Sparkles, ChevronRight, Calendar, Clock, RefreshCw, Shield } from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { GameFeedRow } from "../../types/gameFeed";
import { fmtDate, isGameEligibleForRefresh, parseOfficials } from "./utils";

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

  return (
    <div
      onClick={onOpen}
      className="group relative flex w-full cursor-pointer flex-col justify-between rounded border border-border bg-background-primary text-left transition-colors hover:border-card-border-hover"
    >
      {/* Top Meta Bar */}
      <div className="flex items-center justify-between gap-3 border-b border-border-light px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-text-secondary">{seasonLabel}</span>
          {game.SERIES_GAME_NUMBER != null && (
            <span className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 text-xs text-text-secondary">
              Game {game.SERIES_GAME_NUMBER}
            </span>
          )}
          {game.IS_ELIMINATION_GAME && (
            <span className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 text-xs font-medium text-status-error">
              Elimination
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isCompleted ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary">
              <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
              {game.GAME_STATUS || "Final"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary">
              <Clock size={12} className="text-text-muted" />
              {game.GAME_STATUS || "Scheduled"}
            </span>
          )}
        </div>
      </div>

      {/* Main Scoreboard Matchup */}
      <div className="px-4 py-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {/* Away Team */}
          <div className="flex min-w-0 items-center gap-2.5">
            <TeamLogo abbr={game.AWAY_TEAM_ABBREVIATION} name={game.AWAY_TEAM_NAME} size={36} />
            <div className="min-w-0">
              <p className={`truncate text-xs font-semibold ${awayWon ? "text-text-primary" : "text-text-secondary"}`}>
                {game.AWAY_TEAM_ABBREVIATION}
              </p>
              <p className="text-xs text-text-muted">Away</p>
            </div>
          </div>

          {/* Central Scores / VS */}
          <div className="min-w-[5.5rem] rounded border border-border bg-background-tertiary px-3 py-1.5 text-center">
            {isCompleted ? (
              <div>
                <div className="flex items-baseline justify-center gap-1">
                  <span className={`text-base tabular-nums ${awayWon ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
                    {game.AWAY_SCORE ?? "-"}
                  </span>
                  <span className="text-xs text-text-muted">:</span>
                  <span className={`text-base tabular-nums ${homeWon ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
                    {game.HOME_SCORE ?? "-"}
                  </span>
                </div>
                {game.WINNER_TEAM_ABBREVIATION && (
                  <p className="text-xs tabular-nums text-text-muted">+{margin} pts</p>
                )}
              </div>
            ) : (
              <span className="text-xs font-medium text-text-muted">VS</span>
            )}
          </div>

          {/* Home Team */}
          <div className="flex min-w-0 items-center justify-end gap-2.5 text-right">
            <div className="min-w-0">
              <p className={`truncate text-xs font-semibold ${homeWon ? "text-text-primary" : "text-text-secondary"}`}>
                {game.HOME_TEAM_ABBREVIATION}
              </p>
              <p className="text-xs text-text-muted">Home</p>
            </div>
            <TeamLogo abbr={game.HOME_TEAM_ABBREVIATION} name={game.HOME_TEAM_NAME} size={36} />
          </div>
        </div>

        {/* Footer info bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border-light pt-3 text-xs text-text-secondary">
          <div className="flex items-center gap-2 text-text-muted">
            <div className="flex items-center gap-1">
              <Calendar size={12} />
              <span>{fmtDate(game.GAME_DATE)}</span>
            </div>
            {game.ARENA && (
              <>
                <span>•</span>
                <span className="max-w-[130px] truncate" title={game.LOCATION ? `${game.ARENA} (${game.LOCATION})` : game.ARENA}>
                  {game.ARENA}
                </span>
              </>
            )}
            {officials.length > 0 && (
              <>
                <span>•</span>
                <span className="inline-flex items-center gap-1 text-text-secondary" title={`Officials: ${officials.map((o) => o.cleanName).join(", ")}`}>
                  <Shield size={11} className="text-text-muted" />
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
                className="inline-flex items-center gap-1 rounded border border-border bg-background-primary px-2.5 py-1 text-xs font-medium text-text-primary transition-colors hover:bg-background-tertiary disabled:opacity-50"
              >
                <RefreshCw size={11} className={isRefreshing ? "animate-spin" : ""} />
                {isRefreshing ? "Refreshing…" : "Refresh"}
              </button>
            )}
            {!isCompleted && onPredict && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPredict();
                }}
                className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-primary-hover"
              >
                <Sparkles size={11} />
                Predict
              </button>
            )}
            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-text-secondary transition-colors group-hover:text-text-primary">
              {isCompleted ? "Box Score" : "Match Details"}
              <ChevronRight size={13} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
