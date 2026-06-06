import React from "react";
import { RefreshCcw, Info, ArrowRightLeft } from "lucide-react";

interface MultiTeamPlayer {
  PLAYER_ID: number;
  PLAYER_NAME: string;
  TEAM_COUNT: number;
  TEAMS_PLAYED_FOR: string;
}

interface MultiTeamPlayersProps {
  players: MultiTeamPlayer[];
}

const MultiTeamPlayers: React.FC<MultiTeamPlayersProps> = ({ players }) => {
  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 px-6 py-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">
            <ArrowRightLeft size={11} />
            Mobility map
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 m-0 uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Trade & Multi-Team Discovery
          </h1>
          <p className="text-slate-500 mt-1 text-sm">Detect players who appeared for multiple franchises during the season.</p>
        </div>
      </section>

      {/* Roster & Information Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Table of traded players */}
        <div className="glass-card rounded-[1.5rem] overflow-hidden lg:col-span-2 flex flex-col justify-between shadow-sm">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 m-0 uppercase tracking-wide" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Traded Players Registry
            </h2>
            <span className="text-xs bg-[#1d428a]/10 text-[#1d428a] px-2 py-0.5 rounded font-bold font-mono">
              {players.length} Players Found
            </span>
          </div>
          
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto bg-white">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="sticky top-0 bg-slate-50 text-slate-400 text-xs uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="p-4">Player Name</th>
                  <th className="p-4 font-mono">PLAYER_ID</th>
                  <th className="p-4 text-center">Team Count</th>
                  <th className="p-4">Teams Logged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {players.map((player) => (
                  <tr key={player.PLAYER_ID} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-bold text-slate-800 flex items-center gap-2">
                      <RefreshCcw size={12} className="text-[#1d428a] animate-spin-slow" />
                      {player.PLAYER_NAME}
                    </td>
                    <td className="p-4 font-mono text-slate-400 text-xs">{player.PLAYER_ID}</td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${player.TEAM_COUNT >= 3 ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                        {player.TEAM_COUNT}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-xs text-slate-500 font-semibold tracking-wider">{player.TEAMS_PLAYED_FOR}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Why this matters card */}
        <div className="space-y-6">
          <div className="glass-card p-6 rounded-[1.5rem] space-y-4 shadow-sm">
            <div className="flex items-center gap-2 text-[#1d428a] font-bold">
              <Info size={20} />
              <h3 className="text-slate-900 text-base m-0 uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                Why Track Traded Players?
              </h3>
            </div>
            <p className="text-slate-600 text-xs leading-relaxed">
              NBA players frequently shift franchises mid-season via blockbusters, free-agent buyouts, or 10-day contracts.
            </p>
            <p className="text-slate-600 text-xs leading-relaxed">
              In game prediction, a player's stint averages are computed <strong>separately per team</strong> because their role, teammates, and defensive schemes change entirely.
            </p>
            <p className="text-slate-600 text-xs leading-relaxed">
              Our roster discovery pipeline automatically accounts for this by grouping statistics on <code>["TEAM_ABBREVIATION", "Player_ID"]</code>, ensuring player contributions map to the correct roster at any given date.
            </p>
          </div>

          {/* Trade Impact Indicator */}
          <div className="glass p-6 rounded-[1.5rem] bg-slate-50/50 border border-slate-200/60 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 text-[#c9082a] font-bold">
              <ArrowRightLeft size={20} />
              <h3 className="text-slate-900 text-base m-0 uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                Trade Analytics Metrics
              </h3>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-xs">
                <span className="text-xs text-slate-500 font-medium">Total Traded Players</span>
                <span className="text-sm font-bold text-slate-800 font-mono">{players.length}</span>
              </div>
              
              <div className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-xs">
                <span className="text-xs text-slate-500 font-medium">Played for 3+ Teams</span>
                <span className="text-sm font-bold text-slate-800 font-mono">
                  {players.filter(p => p.TEAM_COUNT >= 3).length}
                </span>
              </div>

              <div className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-xs">
                <span className="text-xs text-slate-500 font-medium">Max Teams Logged</span>
                <span className="text-sm font-bold text-rose-600 font-mono">
                  {players.length > 0 ? Math.max(...players.map(p => p.TEAM_COUNT)) : 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiTeamPlayers;
