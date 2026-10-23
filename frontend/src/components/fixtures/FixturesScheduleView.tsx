import React from "react";
import { Calendar } from "lucide-react";
import type { DayGroup, DisplayMode } from "./types";
import { FixtureMatchRow } from "./FixtureMatchRow";
import { FixtureMatchCard } from "./FixtureMatchCard";
import type { GameFeedRow } from "../../types/gameFeed";

interface FixturesScheduleViewProps {
  loading: boolean;
  dayGroups: DayGroup[];
  displayMode: DisplayMode;
  teamForms: Map<string, ("W" | "L")[]>;
  onOpenGame: (gameId: string) => void;
  onSelectTeam?: (abbr: string) => void;
  onPredict?: (game: GameFeedRow) => void;
  onRefresh?: (game: GameFeedRow) => void;
  refreshingGameId?: string | null;
}

export const FixturesScheduleView: React.FC<FixturesScheduleViewProps> = ({
  loading,
  dayGroups,
  displayMode,
  teamForms,
  onOpenGame,
  onSelectTeam,
  onPredict,
  onRefresh,
  refreshingGameId,
}) => {
  if (loading) {
    return (
      <div className="rounded border border-border bg-background-primary py-20 text-center ">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-xs font-semibold text-text-secondary">Fikstur ve mac verileri yukleniyor...</p>
      </div>
    );
  }

  if (dayGroups.length === 0) {
    return (
      <div className="rounded border border-border bg-background-primary py-16 text-center ">
        <p className="text-sm font-semibold text-text-primary">Aramayla eslesen mac bulunamadi.</p>
        <p className="mt-1 text-xs text-text-secondary">Filtreleri veya arama kriterini degistirip tekrar deneyin.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {dayGroups.map((dayGroup) => (
        <div key={dayGroup.date} className="space-y-2.5">
          {/* Day Subheader */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <span>{dayGroup.formattedDate}</span>
            </div>
            <span className="rounded-full bg-background-tertiary px-2 py-0.5 text-xs font-semibold text-text-muted">
              {dayGroup.games.length} mac
            </span>
          </div>

          {/* Matches List or Grid for that Day */}
          {displayMode === "list" ? (
            <div className="overflow-hidden rounded border border-border bg-background-primary divide-y divide-border ">
              {dayGroup.games.map((game) => (
                <FixtureMatchRow
                  key={game.GAME_ID}
                  game={game}
                  onOpen={() => onOpenGame(game.GAME_ID)}
                  onSelectTeam={onSelectTeam}
                  onPredict={onPredict ? () => onPredict(game) : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {dayGroup.games.map((game) => {
                const awayAbbr = game.AWAY_TEAM_ABBREVIATION ?? "";
                const homeAbbr = game.HOME_TEAM_ABBREVIATION ?? "";
                return (
                  <FixtureMatchCard
                    key={game.GAME_ID}
                    game={game}
                    onOpen={() => onOpenGame(game.GAME_ID)}
                    onSelectTeam={onSelectTeam}
                    onPredict={onPredict ? () => onPredict(game) : undefined}
                    onRefresh={onRefresh ? () => onRefresh(game) : undefined}
                    isRefreshing={refreshingGameId === game.GAME_ID}
                    awayForm={teamForms.get(awayAbbr) || []}
                    homeForm={teamForms.get(homeAbbr) || []}
                  />
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
