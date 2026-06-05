import React from "react";
import { Database, Users, Calendar, Award, CheckCircle, AlertTriangle } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

interface SummaryData {
  total_teams: number;
  total_players: number;
  total_player_game_rows: number;
  total_team_game_rows: number;
  player_games_regular: number;
  player_games_playoffs: number;
  team_games_regular: number;
  team_games_playoffs: number;
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
    { name: "Playoffs", value: summary.team_games_playoffs },
  ];

  const COLORS = ["#06b6d4", "#e2b857"];

  // Bar chart data for model-ready datasets comparison
  const modelReadyData = [
    { name: "V1 Dataset", rows: summary.v1_rows, features: summary.v1_features },
    { name: "V2 Opponent-Aware", rows: summary.v2_rows, features: summary.v2_features },
    { name: "V3 Core Roster", rows: summary.v3_rows, features: summary.v3_features },
  ];

  return (
    <div className="space-y-6">
      {/* Glow effect */}
      <div className="glow-bg top-0 right-1/4"></div>

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white m-0">Lab Overview</h1>
          <p className="text-slate-400 mt-1 text-sm">NBA Intelligence Lab: Preprocessing & Feature Engineering status center</p>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Teams */}
        <div className="glass-card glass-card-hover p-5 rounded-xl flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Total NBA Teams</p>
            <p className="text-2xl font-bold text-white">{summary.total_teams}</p>
          </div>
          <div className="p-3 bg-cyan-500/10 rounded-lg text-cyan-400">
            <Calendar size={22} />
          </div>
        </div>

        {/* Total Players */}
        <div className="glass-card glass-card-hover p-5 rounded-xl flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Discovered Players</p>
            <p className="text-2xl font-bold text-white">{summary.total_players}</p>
          </div>
          <div className="p-3 bg-amber-500/10 rounded-lg text-amber-400">
            <Users size={22} />
          </div>
        </div>

        {/* Player Game Logs */}
        <div className="glass-card glass-card-hover p-5 rounded-xl flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Player Game Logs</p>
            <p className="text-2xl font-bold text-white">{summary.total_player_game_rows.toLocaleString()}</p>
          </div>
          <div className="p-3 bg-violet-500/10 rounded-lg text-violet-400">
            <Database size={22} />
          </div>
        </div>

        {/* Team Game Logs */}
        <div className="glass-card glass-card-hover p-5 rounded-xl flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Team Game Logs</p>
            <p className="text-2xl font-bold text-white">{summary.total_team_game_rows.toLocaleString()}</p>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-400">
            <Award size={22} />
          </div>
        </div>
      </div>

      {/* Charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Model Ready Comparison */}
        <div className="glass-card p-6 rounded-xl lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-white m-0">Model-Ready Datasets Comparison</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={modelReadyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis yAxisId="left" orientation="left" stroke="#06b6d4" fontSize={11} />
                <YAxis yAxisId="right" orientation="right" stroke="#e2b857" fontSize={11} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
                  labelStyle={{ color: "#fff" }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="rows" name="Row Count" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="features" name="Feature Count" fill="#e2b857" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Split details */}
        <div className="glass-card p-6 rounded-xl flex flex-col justify-between">
          <h2 className="text-lg font-semibold text-white m-0">Season Game Splits</h2>
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
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
                  itemStyle={{ color: "#fff" }}
                />
                <Legend iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute text-center">
              <span className="text-2xl font-bold text-white">{(summary.team_games_regular + summary.team_games_playoffs).toLocaleString()}</span>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Games Total</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-xs mt-2 border-t border-slate-800 pt-3">
            <div>
              <p className="text-slate-400 uppercase text-[10px] tracking-wider">Regular Season</p>
              <p className="text-sm font-semibold text-cyan-400 mt-0.5">{summary.team_games_regular.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-slate-400 uppercase text-[10px] tracking-wider">Playoffs</p>
              <p className="text-sm font-semibold text-nba-gold mt-0.5">{summary.team_games_playoffs.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Information Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Core Achievements */}
        <div className="glass-card p-6 rounded-xl space-y-4">
          <div className="flex items-center gap-2 text-cyan-400 font-semibold">
            <CheckCircle size={20} />
            <h3 className="text-white text-base m-0">Engineering Accomplishments</h3>
          </div>
          <ul className="space-y-2.5 text-slate-300 text-sm pl-4 list-disc">
            <li><strong>Chronological Sorting</strong>: Fully chronological rest and streak ordering.</li>
            <li><strong>Leakage-Free Features</strong>: Handled using explicit shift-1 lagging on historical variables.</li>
            <li><strong>Automatic Roster Mapping</strong>: Rigorous Importance Score rankings derived dynamically from live player data logs.</li>
            <li><strong>Opponent-Aware Joints</strong>: Self-joined game matchups matching opponent strength indexes side-by-side.</li>
          </ul>
        </div>

        {/* Warning Proxy Features */}
        <div className="glass-card p-6 rounded-xl border-amber-500/20 bg-amber-950/5 space-y-4">
          <div className="flex items-center gap-2 text-amber-500 font-semibold">
            <AlertTriangle size={20} />
            <h3 className="text-white text-base m-0">Post-Tipoff Proxy Warning</h3>
          </div>
          <p className="text-slate-300 text-sm leading-relaxed">
            Please be advised that the V3 dataset features tracking player attendance (<code>PLAYED_COUNT</code>) and actual game time (<code>MINUTES_SUM</code>) are derived from post-game box score data. 
          </p>
          <p className="text-slate-300 text-sm leading-relaxed">
            These features act as <strong>ideal proxies</strong> for roster stability during analysis. In a real-world predictive environment, these must be replaced with pre-game injury reports or starting rotation projections.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Overview;
