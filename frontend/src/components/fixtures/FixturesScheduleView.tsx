import React from "react";
import { Calendar } from "lucide-react";
import type { DayGroup, DisplayMode } from "./types";
import { FixtureMatchRow } from "./FixtureMatchRow";
import { FixtureMatchCard } from "./FixtureMatchCard";
import type { GameFeedRow } from "../../types/gameFeed";
import { useLanguage } from "../../context/LanguageContext";
import { EmptyState, Skeleton } from "../common";

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
  hasActiveSearch?: boolean;
  onClearSearch?: () => void;
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
  hasActiveSearch,
  onClearSearch,
}) => {
  const { language } = useLanguage();

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="flex items-center justify-between px-1">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3.5 w-16" />
        </div>
        {displayMode === "list" ? (
          <div className="divide-y divide-border overflow-hidden rounded border border-border bg-background-primary">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[72px_1fr_auto] items-center gap-3 px-4 py-3.5 sm:grid-cols-[96px_1fr_132px]"
              >
                <Skeleton className="h-5 w-14 rounded-sm" />
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                  <div className="flex items-center justify-end gap-2.5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton variant="circular" className="h-7 w-7" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded" />
                  <div className="flex items-center gap-2.5">
                    <Skeleton variant="circular" className="h-7 w-7" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="space-y-3 rounded border border-border bg-background-primary p-4">
                <Skeleton className="h-4 w-24 rounded-sm" />
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Skeleton variant="circular" className="h-8 w-8" />
                      <Skeleton className="h-4 w-36" />
                    </div>
                    <Skeleton className="h-6 w-10" />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Skeleton variant="circular" className="h-8 w-8" />
                      <Skeleton className="h-4 w-36" />
                    </div>
                    <Skeleton className="h-6 w-10" />
                  </div>
                </div>
                <Skeleton className="h-3.5 w-full" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (dayGroups.length === 0) {
    return (
      <EmptyState
        icon={<Calendar size={32} strokeWidth={1.5} />}
        title={language === "tr" ? "Aramayla eşleşen maç bulunamadı" : "No games found matching your search"}
        description={
          language === "tr"
            ? "Filtreleri veya arama kriterini değiştirip tekrar deneyin."
            : "Try adjusting your date selection or search criteria."
        }
        actionLabel={hasActiveSearch ? (language === "tr" ? "Aramayı temizle" : "Clear search") : undefined}
        onAction={hasActiveSearch ? onClearSearch : undefined}
      />
    );
  }

  return (
    <div className="space-y-6">
      {dayGroups.map((dayGroup) => (
        <div key={dayGroup.date} className="space-y-2.5">
          <div className="flex items-baseline justify-between px-1">
            <h3 className="text-sm font-semibold text-text-primary">{dayGroup.formattedDate}</h3>
            <span className="text-xs font-medium tabular-nums text-text-secondary">
              {dayGroup.games.length} {language === "tr" ? "maç" : dayGroup.games.length === 1 ? "game" : "games"}
            </span>
          </div>

          {/* Matches List or Grid for that Day */}
          {displayMode === "list" ? (
            <div className="divide-y divide-border overflow-hidden rounded border border-border bg-background-primary">
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
