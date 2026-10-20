import React from "react";
import { Sparkles, ChevronRight, Clock, RefreshCw, Shield, MapPin } from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { GameFeedRow } from "../../types/gameFeed";
import { TEAM_NAME_BY_ABBR, isKnownTeamAbbr } from "../../lib/nbaTeams";
import { isGameEligibleForRefresh, parseOfficials } from "../game-results/utils";

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
  const awayName = (isKnownTeamAbbr(awayAbbr) ? TEAM_NAME_BY_ABBR[awayAbbr] : null) || game.AWAY_TEAM_NAME || awayAbbr;
  const homeName = (isKnownTeamAbbr(homeAbbr) ? TEAM_NAME_BY_ABBR[homeAbbr] : null) || game.HOME_TEAM_NAME || homeAbbr;

  const awayWon = isCompleted && game.WINNER_TEAM_ABBREVIATION === awayAbbr;
  const homeWon = isCompleted && game.WINNER_TEAM_ABBREVIATION === homeAbbr;
  const margin = isCompleted ? Math.abs((Number(game.HOME_SCORE) || 0) - (Number(game.AWAY_SCORE) || 0)) : 0;
  const seasonLabel = game.SEASON_TYPE === "Regular Season" ? "Regular" : (game.SEASON_TYPE ?? "Regular");

  return (
    <div
      onClick={onOpen}
      className="group relative flex w-full cursor-pointer flex-col justify-between rounded-2xl border border-border bg-background-primary p-4 sm:p-5 shadow-xs transition-all hover:border-card-border-hover hover:shadow-md"
    >
      {/* Top Meta Bar */}
      <div className="flex items-center justify-between border-b border-border pb-3 text-xs text-text-secondary">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="rounded-md bg-background-tertiary border border-border px-2 py-0.5 text-[11px] font-bold text-text-secondary">
            {seasonLabel}
          </span>
          {isCompleted ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-status-success">
              <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
              {game.GAME_STATUS || "Final"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-semibold text-text-muted text-[11px]">
              <Clock className="h-3 w-3" />
              <span>{game.GAME_STATUS || "Programda"}</span>
            </span>
          )}
          {game.SERIES_GAME_NUMBER != null && (
            <span className="rounded-md border border-border bg-background-tertiary px-1.5 py-0.5 text-[10px] font-bold text-text-secondary">
              Game {game.SERIES_GAME_NUMBER}
            </span>
          )}
          {game.IS_ELIMINATION_GAME && (
            <span className="rounded-md border border-border bg-background-tertiary px-1.5 py-0.5 text-[10px] font-bold text-status-error">
              Elimination
            </span>
          )}
        </div>

        <span className="flex items-center gap-1 rounded-lg border border-border bg-background-tertiary px-2.5 py-1 text-[11px] font-bold text-text-primary transition-all group-hover:bg-primary group-hover:text-white shrink-0 ml-2">
          <span>{isCompleted ? "Kutu Puani" : "Mac Detayi"}</span>
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>

      {/* Main Scoreboard & Matchup */}
      <div className="py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          {/* Away Team (Left) */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <TeamLogo abbr={awayAbbr} name={awayName} size={40} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectTeam?.(awayAbbr);
                }}
                className={`block truncate text-xs sm:text-sm font-bold text-left transition-colors hover:underline ${
                  awayWon ? "text-text-primary font-black" : "text-text-secondary hover:text-text-primary"
                }`}
                title={awayName}
              >
                {awayName}
              </button>
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">
                Deplasman
              </span>
            </div>
          </div>

          {/* Central Score / VS Badge */}
          <div className="shrink-0 flex flex-col items-center justify-center min-w-[76px] sm:min-w-[88px] px-3 py-1.5 rounded-xl bg-background-tertiary border border-border shadow-2xs">
            {isCompleted ? (
              <>
                <div className="flex items-baseline justify-center gap-1 font-mono font-black text-sm sm:text-base tracking-wider text-text-primary">
                  <span className={awayWon ? "text-text-primary" : "text-text-secondary"}>
                    {game.AWAY_SCORE ?? "-"}
                  </span>
                  <span className="text-text-muted text-xs">:</span>
                  <span className={homeWon ? "text-text-primary" : "text-text-secondary"}>
                    {game.HOME_SCORE ?? "-"}
                  </span>
                </div>
                {margin > 0 && (
                  <span className="font-mono text-[9px] font-bold text-text-muted tabular-nums">
                    +{margin} sayi
                  </span>
                )}
              </>
            ) : (
              <span className="font-mono text-xs font-bold text-text-muted tracking-wider">
                VS
              </span>
            )}
          </div>

          {/* Home Team (Right) */}
          <div className="flex items-center gap-3 flex-1 min-w-0 justify-end text-right">
            <div className="min-w-0 flex-1 text-right">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectTeam?.(homeAbbr);
                }}
                className={`block truncate text-xs sm:text-sm font-bold text-right transition-colors hover:underline ml-auto ${
                  homeWon ? "text-text-primary font-black" : "text-text-secondary hover:text-text-primary"
                }`}
                title={homeName}
              >
                {homeName}
              </button>
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block text-right">
                Ev Sahibi
              </span>
            </div>
            <TeamLogo abbr={homeAbbr} name={homeName} size={40} className="shrink-0" />
          </div>
        </div>
      </div>

      {/* Recent Form (Son 5 Maç) */}
      {(awayForm.length > 0 || homeForm.length > 0) && (
        <div className="flex items-center justify-between gap-2 border-t border-border/60 py-2.5 px-1 text-xs">
          <div className="flex items-center gap-1" title={`${awayName} son 5 mac formu`}>
            {awayForm.map((res, i) => (
              <span
                key={i}
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black text-white ${
                  res === "W" ? "bg-status-success" : "bg-status-error"
                }`}
                title={res === "W" ? "Galibiyet" : "Maglubiyet"}
              >
                {res === "W" ? "G" : "M"}
              </span>
            ))}
          </div>
          <span className="shrink-0 font-bold tracking-wider text-[10px] text-text-muted">
            SON 5
          </span>
          <div className="flex items-center gap-1" title={`${homeName} son 5 mac formu`}>
            {homeForm.map((res, i) => (
              <span
                key={i}
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black text-white ${
                  res === "W" ? "bg-status-success" : "bg-status-error"
                }`}
                title={res === "W" ? "Galibiyet" : "Maglubiyet"}
              >
                {res === "W" ? "G" : "M"}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Bar: Arena, Officials, Actions */}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-text-secondary">
        {/* Left: Arena & Officials */}
        <div className="flex items-center gap-2.5 min-w-0 text-text-muted text-[11px] truncate">
          {game.ARENA && (
            <span className="flex items-center gap-1 truncate" title={game.ARENA}>
              <MapPin size={12} className="shrink-0 text-text-muted" />
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
                <Shield size={11} className="text-text-muted" />
                <span>{officials.map((o) => o.jerseyNum ? `#${o.jerseyNum}` : o.cleanName).slice(0, 2).join(" ")}</span>
              </span>
            </>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {canRefresh && (
            <button
              type="button"
              disabled={isRefreshing}
              onClick={(event) => {
                event.stopPropagation();
                onRefresh?.();
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background-primary px-2.5 py-1 text-[11px] font-medium text-text-primary transition-colors hover:bg-background-tertiary disabled:opacity-50"
            >
              <RefreshCw size={11} className={isRefreshing ? "animate-spin" : ""} />
              <span>{isRefreshing ? "Yenileniyor..." : "Yenile"}</span>
            </button>
          )}

          {!isCompleted && onPredict && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPredict();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-primary-hover shadow-xs"
            >
              <Sparkles size={12} />
              <span>Model Analizi</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
