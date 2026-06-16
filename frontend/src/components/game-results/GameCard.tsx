import { Cpu, Users2 } from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { GameFeedRow } from "../../types/gameFeed";
import { fmtDate, teamFull } from "./utils";

export function GameCard({
  game,
  onOpen,
  onPredict,
}: {
  game: GameFeedRow;
  onOpen: () => void;
  onPredict: () => void;
}) {
  const margin = Math.abs((game.HOME_SCORE ?? 0) - (game.AWAY_SCORE ?? 0));
  const awayWon = game.WINNER_TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION;
  const homeWon = game.WINNER_TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION;
  const awayFull = teamFull(game.AWAY_TEAM_ABBREVIATION, game.AWAY_TEAM_NAME);
  const homeFull = teamFull(game.HOME_TEAM_ABBREVIATION, game.HOME_TEAM_NAME);
  const winnerFull = homeWon ? homeFull : awayFull;
  const seasonLabel = game.SEASON_TYPE === "Regular Season" ? "Regular" : (game.SEASON_TYPE ?? "Regular");
  return (
    <button
      onClick={onOpen}
      className="group w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.06)] transition-all duration-200 hover:shadow-[0_8px_32px_rgba(15,23,42,0.10)] hover:-translate-y-0.5 text-left"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">{seasonLabel}</span>
          {game.SERIES_GAME_NUMBER != null && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
              Game {game.SERIES_GAME_NUMBER}
            </span>
          )}
          {game.IS_ELIMINATION_GAME && (
            <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-bold text-red-500">Elim</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700">
            {game.GAME_STATUS}
          </span>
          <span
            onClick={(e) => {
              e.stopPropagation();
              onPredict();
            }}
            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-indigo-700 hover:bg-indigo-100 hover:border-indigo-200 transition-colors cursor-pointer"
          >
            <Cpu size={9} /> Predict
          </span>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex items-center gap-2.5">
            <TeamLogo abbr={game.AWAY_TEAM_ABBREVIATION} name={game.AWAY_TEAM_NAME} size={34} />
            <div className="min-w-0">
              <p className={`text-sm font-black leading-tight ${awayWon ? "text-slate-900" : "text-slate-400"}`}>
                {awayFull}
              </p>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Away</p>
            </div>
          </div>

          <div className="min-w-[5.5rem] text-center" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            <div className="flex items-baseline justify-center gap-1">
              <span className={`text-3xl font-black leading-none ${awayWon ? "text-slate-900" : "text-slate-400"}`}>
                {game.AWAY_SCORE ?? "-"}
              </span>
              <span className="text-lg font-semibold text-slate-300">-</span>
              <span className={`text-3xl font-black leading-none ${homeWon ? "text-slate-900" : "text-slate-400"}`}>
                {game.HOME_SCORE ?? "-"}
              </span>
            </div>
            {game.WINNER_TEAM_ABBREVIATION && (
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
                {winnerFull} +{margin}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5">
            <div className="min-w-0 text-right">
              <p className={`text-sm font-black leading-tight ${homeWon ? "text-slate-900" : "text-slate-400"}`}>
                {homeFull}
              </p>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Home</p>
            </div>
            <TeamLogo abbr={game.HOME_TEAM_ABBREVIATION} name={game.HOME_TEAM_NAME} size={34} />
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-between">
          <p className="text-[10px] text-slate-400">{fmtDate(game.GAME_DATE)}</p>
          <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.22em] text-[#1d428a] opacity-0 transition-opacity group-hover:opacity-100">
            <Users2 size={10} /> Details
          </span>
        </div>

      </div>
    </button>
  );
}
