import React from "react";
import type { DayGroup, DisplayMode } from "./types";
import { FixtureMatchRow } from "./FixtureMatchRow";
import { FixtureMatchCard } from "./FixtureMatchCard";
import type { GameFeedRow } from "../../types/gameFeed";
import { useLanguage } from "../../context/LanguageContext";

interface FixturesScheduleViewProps {
  loading: boolean;
  dayGroups: DayGroup[];
  displayMode: DisplayMode;
  teamForms: Map<string, ("W" | "L")[]>;
  teamRecords?: Map<string, string>;
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
  teamRecords,
  onOpenGame,
  onSelectTeam,
  onPredict,
  onRefresh,
  refreshingGameId,
}) => {
  const { language } = useLanguage();

  if (loading) {
    return (
      <div className="rounded border border-border bg-background-primary py-20 text-center ">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-xs font-semibold text-text-secondary">
          {language === "tr" ? "Fikstür ve maç verileri yükleniyor..." : "Loading fixtures and schedule..."}
        </p>
      </div>
    );
  }

  if (dayGroups.length === 0) {
    return (
      <div className="rounded border border-border bg-background-primary py-16 text-center ">
        <p className="text-sm font-semibold text-text-primary">
          {language === "tr" ? "Aramayla eşleşen maç bulunamadı." : "No games found matching your search."}
        </p>
        <p className="mt-1 text-xs text-text-secondary">
          {language === "tr" ? "Filtreleri veya arama kriterini değiştirip tekrar deneyin." : "Try adjusting filters or search criteria."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {dayGroups.map((dayGroup) => (
        <div key={dayGroup.date} className="space-y-2">
          <div className="flex items-baseline justify-between px-1">
            <h3 className="text-sm font-semibold text-text-primary">{dayGroup.formattedDate}</h3>
            <span className="text-xs text-text-muted">
              {dayGroup.games.length} {language === "tr" ? "maç" : dayGroup.games.length === 1 ? "game" : "games"}
            </span>
          </div>

          {/* Matches List or Grid for that Day */}
          {displayMode === "list" ? (
            <div className="overflow-hidden rounded border border-border bg-background-primary divide-y divide-border ">
              {dayGroup.games.map((game) => {
                const awayAbbr = game.AWAY_TEAM_ABBREVIATION ?? "";
                const homeAbbr = game.HOME_TEAM_ABBREVIATION ?? "";
                return (
                  <FixtureMatchRow
                    key={game.GAME_ID}
                    game={game}
                    onOpen={() => onOpenGame(game.GAME_ID)}
                    onSelectTeam={onSelectTeam}
                    onPredict={onPredict ? () => onPredict(game) : undefined}
                    awayRecord={teamRecords?.get(awayAbbr)}
                    homeRecord={teamRecords?.get(homeAbbr)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
                    awayRecord={teamRecords?.get(awayAbbr)}
                    homeRecord={teamRecords?.get(homeAbbr)}
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
