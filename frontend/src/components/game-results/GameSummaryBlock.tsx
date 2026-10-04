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
    <div className="relative h-full overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#c9082a] via-slate-200 to-[#1d428a]" />
      <div className="mb-4 flex items-start justify-between gap-3 pt-1">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Game at a glance</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">The story behind the final score</p>
        </div>
        <div className="shrink-0 rounded-xl bg-slate-50 px-3 py-2 text-right ring-1 ring-slate-100">
          <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Margin</p>
          <p className="text-lg font-black leading-tight text-slate-900">{margin}<span className="ml-1 text-[9px] font-bold text-slate-400">PTS</span></p>
        </div>
      </div>
      {winnerFull && <div className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-emerald-100">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span className="font-bold">{winnerFull}</span>
        <span className="text-emerald-700/70">{isClose ? "held on in a close finish" : margin >= 20 ? "pulled away for a big win" : "came away with the win"}</span>
      </div>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {summaryItems.map((item) => (
          <div key={item.label} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <p className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
            <p className="mt-1 truncate text-[12px] font-bold leading-tight text-slate-800">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
