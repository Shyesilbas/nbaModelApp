import React, { useState } from "react";
import { AlertCircle, CheckCircle2, Clock, UserX, Users, RotateCcw, Sparkles, Search } from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { TeamInfo } from "./types";
import type { PlayerStatusOverride } from "../../api/predictions";

export interface RotationPlayer {
  player_id?: number | string;
  player_name: string;
  position_group?: string;
  predicted_pts?: number;
  predicted_reb?: number;
  predicted_ast?: number;
  status?: "ACTIVE" | "RESTRICTED" | "OUT";
}

interface LineupInjuryHubProps {
  homeInfo: TeamInfo;
  awayInfo: TeamInfo;
  homePlayers: RotationPlayer[];
  awayPlayers: RotationPlayer[];
  overrides: Record<string, PlayerStatusOverride>;
  onOverrideChange: (playerIdOrName: string, override: PlayerStatusOverride) => void;
  onResetOverrides: () => void;
  onApplyChanges?: () => void;
  loading?: boolean;
}

export const LineupInjuryHub: React.FC<LineupInjuryHubProps> = ({
  homeInfo,
  awayInfo,
  homePlayers,
  awayPlayers,
  overrides,
  onOverrideChange,
  onResetOverrides,
  onApplyChanges,
  loading = false,
}) => {
  const [homeQuery, setHomeQuery] = useState("");
  const [awayQuery, setAwayQuery] = useState("");

  const getPlayerStatus = (p: RotationPlayer): "ACTIVE" | "RESTRICTED" | "OUT" => {
    const key = String(p.player_id ?? p.player_name);
    if (overrides[key]) return overrides[key].status;
    return p.status || "ACTIVE";
  };

  const handleStatusSelect = (p: RotationPlayer, status: "ACTIVE" | "RESTRICTED" | "OUT") => {
    const key = String(p.player_id ?? p.player_name);
    const factor = status === "OUT" ? 0.0 : status === "RESTRICTED" ? 0.6 : 1.0;
    const minLimit = status === "RESTRICTED" ? 20.0 : undefined;
    onOverrideChange(key, {
      player_id: typeof p.player_id === "number" ? p.player_id : undefined,
      player_name: p.player_name,
      status,
      minute_limit: minLimit,
      status_factor: factor,
    });
  };

  const overrideCount = Object.keys(overrides).length;

  const renderRosterColumn = (team: TeamInfo, players: RotationPlayer[], isHome: boolean) => {
    const outCount = players.filter((p) => getPlayerStatus(p) === "OUT").length;
    const restCount = players.filter((p) => getPlayerStatus(p) === "RESTRICTED").length;
    const query = (isHome ? homeQuery : awayQuery).toLowerCase().trim();
    const displayedPlayers = query
      ? players.filter((p) => p.player_name.toLowerCase().includes(query))
      : players;

    return (
      <div className="flex-1 bg-slate-900/60 rounded-2xl border border-slate-800/80 p-4 flex flex-col gap-3">
        {/* Team Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2.5">
            <TeamLogo abbr={team.abbr} name={team.name} size={28} />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black text-white">{team.name}</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                  {isHome ? "HOME" : "AWAY"}
                </span>
              </div>
              <p className="text-[10px] font-medium text-slate-400">
                {players.length} Players Available · Rotation &amp; Injury
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {outCount > 0 && (
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                {outCount} Out
              </span>
            )}
            {restCount > 0 && (
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                {restCount} Restricted
              </span>
            )}
            {outCount === 0 && restCount === 0 && (
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Full Strength
              </span>
            )}
          </div>
        </div>

        {/* Quick Search Filter */}
        {players.length > 8 && (
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder={`Search ${team.name} roster (${players.length} players)...`}
              value={isHome ? homeQuery : awayQuery}
              onChange={(e) => (isHome ? setHomeQuery(e.target.value) : setAwayQuery(e.target.value))}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-1.5 pl-8 pr-3 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50"
            />
          </div>
        )}

        {/* Players List */}
        <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
          {displayedPlayers.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500">
              {query ? `No players matching "${query}"` : "No rotation players listed"}
            </div>
          ) : (
            displayedPlayers.map((p) => {
              const currentStatus = getPlayerStatus(p);
              const isOut = currentStatus === "OUT";
              const isRestricted = currentStatus === "RESTRICTED";

              return (
                <div
                  key={String(p.player_id ?? p.player_name)}
                  className={`flex items-center justify-between p-2 rounded-xl transition-all border ${
                    isOut
                      ? "bg-rose-950/20 border-rose-900/40 opacity-75"
                      : isRestricted
                      ? "bg-amber-950/20 border-amber-900/40"
                      : "bg-slate-950/40 border-slate-800/60 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-black truncate ${isOut ? "line-through text-slate-400" : "text-slate-100"}`}>
                          {p.player_name}
                        </span>
                        {p.position_group && (
                          <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-slate-800 text-slate-400">
                            {p.position_group}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                        {p.predicted_pts !== undefined && (
                          <span>
                            Proj PTS: <strong className={isOut ? "text-slate-500" : "text-indigo-300"}>{p.predicted_pts}</strong>
                          </span>
                        )}
                        {isRestricted && <span className="text-amber-400 font-sans font-bold">• 60% Mins Limit</span>}
                        {isOut && <span className="text-rose-400 font-sans font-bold">• 0 Mins (Usage Distributed)</span>}
                      </div>
                    </div>
                  </div>

                  {/* 3-Way Status Toggle */}
                  <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-lg p-0.5 shrink-0">
                    <button
                      type="button"
                      title="Full Available (100% Usage)"
                      onClick={() => handleStatusSelect(p, "ACTIVE")}
                      className={`px-2 py-1 rounded text-[9px] font-black uppercase transition-all flex items-center gap-1 ${
                        currentStatus === "ACTIVE"
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <CheckCircle2 size={10} />
                      Full
                    </button>
                    <button
                      type="button"
                      title="Restricted / Minutes Cap (60% Usage)"
                      onClick={() => handleStatusSelect(p, "RESTRICTED")}
                      className={`px-2 py-1 rounded text-[9px] font-black uppercase transition-all flex items-center gap-1 ${
                        currentStatus === "RESTRICTED"
                          ? "bg-amber-600 text-white shadow-xs"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Clock size={10} />
                      Restr.
                    </button>
                    <button
                      type="button"
                      title="Out / Inactive (0% Usage)"
                      onClick={() => handleStatusSelect(p, "OUT")}
                      className={`px-2 py-1 rounded text-[9px] font-black uppercase transition-all flex items-center gap-1 ${
                        currentStatus === "OUT"
                          ? "bg-rose-600 text-white shadow-xs"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <UserX size={10} />
                      Out
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-slate-800 p-5 shadow-xl space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Users size={16} />
          </div>
          <div>
            <h3 className="text-sm font-black text-white tracking-wide flex items-center gap-2">
              Interactive Lineup & Injury Hub
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Live Simulation
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Set player injuries or minutes restrictions. Lost scoring usage is automatically redistributed to teammates.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {overrideCount > 0 && (
            <button
              onClick={onResetOverrides}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[10px] font-bold uppercase tracking-wider transition-colors"
            >
              <RotateCcw size={11} />
              Reset All ({overrideCount})
            </button>
          )}

          {onApplyChanges && (
            <button
              onClick={onApplyChanges}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-wider transition-all shadow-md shadow-indigo-900/30"
            >
              <Sparkles size={11} />
              {loading ? "Recalculating..." : "Apply & Update Model"}
            </button>
          )}
        </div>
      </div>

      {/* Roster Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderRosterColumn(homeInfo, homePlayers, true)}
        {renderRosterColumn(awayInfo, awayPlayers, false)}
      </div>

      {/* Analytics Explainer Footer */}
      <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/80 border border-slate-800/90 text-[11px] text-slate-400">
        <AlertCircle size={13} className="text-indigo-400 shrink-0" />
        <span>
          <strong>Usage Redistribution Engine:</strong> When a key player is marked <em>OUT</em> or <em>RESTRICTED</em>, 35% of their lost scoring output is redistributed proportionally across active rotation teammates, dynamically updating team totals and win probabilities.
        </span>
      </div>
    </div>
  );
};
