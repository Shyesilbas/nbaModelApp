import type { GameFeedRow } from "../../types/gameFeed";
import type { TeamBoxScore } from "./types";
import { teamFull } from "./utils";

export interface SummaryPlayerItem {
  PLAYER_NAME?: string;
  player_name?: string;
  PTS?: number | null;
  pts?: number | null;
  REB?: number | null;
  reb?: number | null;
  AST?: number | null;
  ast?: number | null;
}

export function GameSummaryBlock({
  game,
  topPlayers,
}: {
  game: GameFeedRow;
  home?: TeamBoxScore | null;
  away?: TeamBoxScore | null;
  topPlayers: SummaryPlayerItem[];
}) {
  const margin = Math.abs((game.HOME_SCORE ?? 0) - (game.AWAY_SCORE ?? 0));
  const winnerAbbr = game.WINNER_TEAM_ABBREVIATION ?? "";
  const winnerFull = teamFull(winnerAbbr);
  const isClose = margin <= 5;

  const topScorer = topPlayers[0];
  const topRebounder = [...topPlayers].sort((a, b) => (b.REB ?? b.reb ?? 0) - (a.REB ?? a.reb ?? 0))[0];
  const topAssist = [...topPlayers].sort((a, b) => (b.AST ?? b.ast ?? 0) - (a.AST ?? a.ast ?? 0))[0];

  const summaryItems = [
    {
      label: "Top Scorer",
      value: topScorer ? `${topScorer.PLAYER_NAME ?? topScorer.player_name} (${topScorer.PTS ?? topScorer.pts})` : "",
      show: !!topScorer,
    },
    {
      label: "Top Rebounder",
      value: topRebounder
        ? `${topRebounder.PLAYER_NAME ?? topRebounder.player_name} (${topRebounder.REB ?? topRebounder.reb})`
        : "",
      show: !!topRebounder,
    },
    {
      label: "Top Assists",
      value: topAssist
        ? `${topAssist.PLAYER_NAME ?? topAssist.player_name} (${topAssist.AST ?? topAssist.ast})`
        : "",
      show: !!topAssist,
    },
  ].filter((item) => item.show && item.value);

  return (
    <div className="h-full rounded border border-border bg-background-primary p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-text-primary">Game recap</h4>
          <p className="mt-0.5 text-xs text-text-secondary">Summary and top category contributors</p>
        </div>
        <div className="shrink-0 rounded border border-border bg-background-tertiary px-3 py-1.5 text-right">
          <p className="text-xs font-medium text-text-secondary">Final margin</p>
          <p className="text-base font-semibold tabular-nums leading-tight text-text-primary">{margin} <span className="text-xs font-normal text-text-secondary">PTS</span></p>
        </div>
      </div>
      {winnerFull && (
        <div className="mb-3 flex items-center gap-2 rounded border border-border bg-background-tertiary px-3 py-2 text-xs text-text-secondary">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-success" />
          <span className="font-semibold text-text-primary">{winnerFull}</span>
          <span>{isClose ? "held on in a close finish" : margin >= 20 ? "pulled away for a big win" : "came away with the win"}</span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {summaryItems.map((item) => (
          <div key={item.label} className="min-w-0 rounded border border-border bg-background-primary p-3">
            <p className="text-xs font-medium text-text-secondary">{item.label}</p>
            <p className="mt-1 truncate text-xs font-semibold tabular-nums leading-tight text-text-primary">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
