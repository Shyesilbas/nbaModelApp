import React from "react";
import { Database, Users, Calendar, Award, CheckCircle, AlertTriangle } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

interface SummaryData {
  total_teams: number;
  total_players: number;
  total_player_game_rows: number;
  total_team_game_rows: number;
  player_games_regular: number;
  player_games_playin: number;
  player_games_playoffs: number;
  player_games_finals: number;
  team_games_regular: number;
  team_games_playin: number;
  team_games_playoffs: number;
  team_games_finals: number;
  v1_rows: number;
  v1_features: number;
  v2_rows: number;
  v2_features: number;
  v3_rows: number;
  v3_features: number;
}

interface OverviewProps {
  summary: SummaryData | null;
}

const Overview: React.FC<OverviewProps> = ({ summary }) => {
  if (!summary) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent"></div>
      </div>
    );
  }



  const teamGamesSplit = [
    { name: "Regular Season", value: summary.team_games_regular },
    { name: "Play-In", value: summary.team_games_playin },
    { name: "Playoffs", value: summary.team_games_playoffs },
    { name: "NBA Finals", value: summary.team_games_finals },
  ];

  const COLORS = ["#06b6d4", "#8b5cf6", "#1d428a", "#e2b857"];

  // Bar chart data for model-ready datasets comparison
  const modelReadyData = [
    { name: "V1 Dataset", rows: summary.v1_rows, features: summary.v1_features },
    { name: "V2 Opponent-Aware", rows: summary.v2_rows, features: summary.v2_features },
    { name: "V3 Core Roster", rows: summary.v3_rows, features: summary.v3_features },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 m-0" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Dashboard Overview
          </h1>
          <p className="text-slate-500 mt-1 text-sm">NBA Stats Intelligence: Live roster mapping, schedule context, and season splits</p>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Teams */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Total NBA Teams</p>
            <p className="text-2xl font-black text-slate-800 font-mono">{summary.total_teams}</p>
          </div>
          <div className="p-3 bg-slate-100 rounded-lg text-slate-700">
            <Calendar size={20} />
          </div>
        </div>

        {/* Total Players */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Discovered Players</p>
            <p className="text-2xl font-black text-slate-800 font-mono">{summary.total_players}</p>
          </div>
          <div className="p-3 bg-slate-100 rounded-lg text-slate-700">
            <Users size={20} />
          </div>
        </div>

        {/* Player Game Logs */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Player Game Logs</p>
            <p className="text-2xl font-black text-slate-800 font-mono">{(summary.total_player_game_rows ?? 0).toLocaleString()}</p>
          </div>
          <div className="p-3 bg-slate-100 rounded-lg text-slate-700">
            <Database size={20} />
          </div>
        </div>

        {/* Team Game Logs */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Team Game Logs</p>
            <p className="text-2xl font-black text-slate-800 font-mono">{(summary.total_team_game_rows ?? 0).toLocaleString()}</p>
          </div>
          <div className="p-3 bg-slate-100 rounded-lg text-slate-700">
            <Award size={20} />
          </div>
        </div>
      </div>

      {/* Charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Model Ready Comparison */}
        <div className="glass-card p-6 rounded-xl lg:col-span-2 space-y-4">
          <h2 className="text-base font-bold text-slate-900 m-0 uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Dataset Record & Feature Comparison
          </h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={modelReadyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                <YAxis yAxisId="left" orientation="left" stroke="#1d428a" fontSize={11} />
                <YAxis yAxisId="right" orientation="right" stroke="#c9082a" fontSize={11} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "8px" }}
                  itemStyle={{ color: "#334155" }}
                  labelStyle={{ color: "#0f172a", fontWeight: "bold" }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="rows" name="Row Count" fill="#1d428a" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="features" name="Feature Count" fill="#c9082a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Split details */}
        <div className="glass-card p-6 rounded-xl flex flex-col justify-between">
          <h2 className="text-base font-bold text-slate-900 m-0 uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Season Stage Splits
          </h2>
          <div className="h-56 w-full relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={teamGamesSplit}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {teamGamesSplit.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "8px" }}
                  itemStyle={{ color: "#334155" }}
                />
                <Legend iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute text-center">
              <span className="text-2xl font-black text-slate-800 font-mono">
                {((summary.team_games_regular ?? 0) + (summary.team_games_playoffs ?? 0) + (summary.team_games_playin ?? 0) + (summary.team_games_finals ?? 0)).toLocaleString()}
              </span>
              <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-0.5 font-bold">Total Games</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-xs mt-2 border-t border-slate-200 pt-3">
            <div>
              <p className="text-slate-400 uppercase text-[9px] font-bold tracking-wider">Regular Season</p>
              <p className="text-sm font-bold text-[#1d428a] font-mono mt-0.5">{(summary.team_games_regular ?? 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-slate-400 uppercase text-[9px] font-bold tracking-wider">Play-In</p>
              <p className="text-sm font-bold text-violet-600 font-mono mt-0.5">{(summary.team_games_playin ?? 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-slate-400 uppercase text-[9px] font-bold tracking-wider">Playoffs</p>
              <p className="text-sm font-bold text-[#c9082a] font-mono mt-0.5">{(summary.team_games_playoffs ?? 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-slate-400 uppercase text-[9px] font-bold tracking-wider">NBA Finals</p>
              <p className="text-sm font-bold text-amber-600 font-mono mt-0.5">{(summary.team_games_finals ?? 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Information Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Core Achievements */}
        <div className="glass-card p-6 rounded-xl space-y-4">
          <div className="flex items-center gap-2 text-[#1d428a] font-bold">
            <CheckCircle size={20} />
            <h3 className="text-slate-900 text-base m-0 uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Roster & Historical Metrics Details
            </h3>
          </div>
          <ul className="space-y-2.5 text-slate-600 text-sm pl-4 list-disc">
            <li><strong>Rest Day Calculations</strong>: Chronological tracking of back-to-back schedules and team rest offsets.</li>
            <li><strong>Lagged Historical Performance</strong>: Calculated using shift-1 lagging to ensure stats are strictly pre-game.</li>
            <li><strong>Roster Importance Mapping</strong>: Core player rankings computed dynamically from seasonal average minutes.</li>
            <li><strong>Matchup Comparison Matrix</strong>: Integrates side-by-side team statistics for balanced head-to-head records.</li>
          </ul>
        </div>

        {/* Warning Proxy Features */}
        <div className="glass-card p-6 rounded-xl border-amber-200 bg-amber-50/50 space-y-4">
          <div className="flex items-center gap-2 text-amber-600 font-bold">
            <AlertTriangle size={20} />
            <h3 className="text-slate-900 text-base m-0 uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Roster Stability Data Notice
            </h3>
          </div>
          <p className="text-slate-600 text-sm leading-relaxed">
            Please be advised that the roster features tracking player attendance (<code>PLAYED_COUNT</code>) and actual game time (<code>MINUTES_SUM</code>) are derived from seasonal data logs.
          </p>
          <p className="text-slate-600 text-sm leading-relaxed">
            These features act as <strong>ideal proxies</strong> for roster stability during analysis. In a real-world predictive environment, these would be supplemented with pre-game injury reports or starting rotation projections.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Overview;
