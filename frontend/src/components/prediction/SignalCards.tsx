import { BarChart2, Home, Shield, Target, TrendingUp, Zap } from "lucide-react";
import type { TeamInfo } from "./types";

interface SignalCardsProps {
  result: any;
  homeInfo: TeamInfo;
  awayInfo: TeamInfo;
  winnerInfo: TeamInfo;
}

export function SignalCards({
  result,
  homeInfo,
  awayInfo: _awayInfo,
  winnerInfo,
}: SignalCardsProps) {
  const win = result.win_probability;
  const score = result.score_prediction;
  const winProb = Math.max(win?.home_win_probability ?? 0, win?.away_win_probability ?? 0);
  const margin = score ? Math.abs(score.predicted_margin) : null;
  const isHome = win?.predicted_winner === homeInfo.abbr;

  const signals = [
    {
      icon: <Home size={16} />,
      label: "Home Court",
      value: isHome ? `+${homeInfo.abbr} Edge` : "Neutral Factor",
      detail: isHome ? "Home team favored" : "Away team overcoming",
      color: winnerInfo.color,
    },
    {
      icon: <TrendingUp size={16} />,
      label: "Win Probability",
      value: `${(winProb * 100).toFixed(1)}%`,
      detail: "Model confidence",
      color: winProb > 0.65 ? "#10b981" : winProb > 0.55 ? "#3b82f6" : "#f59e0b",
    },
    {
      icon: <Target size={16} />,
      label: "Confidence Tier",
      value: win?.confidence_bucket || "MEDIUM",
      detail: "Prediction strength",
      color:
        win?.confidence_bucket?.toUpperCase().includes("STRONG")
          ? "#10b981"
          : win?.confidence_bucket?.toUpperCase().includes("MODERATE")
            ? "#3b82f6"
            : "#f59e0b",
    },
    ...(margin !== null
      ? [
          {
            icon: <BarChart2 size={16} />,
            label: "Expected Margin",
            value: `${margin.toFixed(1)} pts`,
            detail: `${winnerInfo.abbr} projected lead`,
            color: winnerInfo.color,
          },
        ]
      : []),
    ...(score
      ? [
          {
            icon: <Zap size={16} />,
            label: "Total Points",
            value: `${score.predicted_total_points.toFixed(0)} pts`,
            detail: `Range: ${score.total_points_range[0]}-${score.total_points_range[1]}`,
            color: "#8b5cf6",
          },
        ]
      : []),
    {
      icon: <Shield size={16} />,
      label: "Model Signal",
      value: result.final_display_recommendation?.primary_winner_signal || "WIN_PROB",
      detail: "Primary decision source",
      color: "#64748b",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {signals.map((s, i) => (
        <div
          key={i}
          className={`signal-card animate-fade-in-up stagger-${Math.min(i + 1, 8)}`}
          style={{ borderLeftColor: s.color }}
        >
          <div className="flex items-center gap-2" style={{ color: s.color }}>
            {s.icon}
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{s.label}</span>
          </div>
          <p className="text-sm font-black text-slate-900 leading-tight font-mono" style={{ color: s.color }}>
            {s.value}
          </p>
          <p className="text-[10px] text-slate-400 font-medium">{s.detail}</p>
        </div>
      ))}
    </div>
  );
}
