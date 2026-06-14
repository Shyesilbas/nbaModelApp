import type { GameFeedRow } from "../../types/gameFeed";
import type { TeamBoxScore } from "./types";
import { teamFull } from "./utils";

export function GameSummaryBlock({
  game,
  topPlayers,
}: {
  game: GameFeedRow;
  home: TeamBoxScore | null;
  away: TeamBoxScore | null;
  topPlayers: any[];
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
      label: isClose ? "Closest Game" : "Game Type",
      value: isClose ? `${margin}-point margin` : margin >= 20 ? "Blowout" : "Comfortable win",
      show: true,
    },
    { label: "Winner", value: winnerFull, show: !!winnerFull },
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
    <div className="rounded-[1.5rem] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.05)]">
      <div className="mb-4">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Game Summary</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-700">10-second read</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {summaryItems.map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">{item.label}</p>
            <p className="mt-1 text-[13px] font-bold leading-tight text-slate-800">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
