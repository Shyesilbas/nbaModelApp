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
      label: "Saha Avantajı",
      value: isHome ? `+${homeInfo.abbr} Üstünlüğü` : "Nötr / Denge",
      detail: isHome ? "Ev sahibi faktörü" : "Deplasman direnci",
    },
    {
      icon: <TrendingUp size={16} />,
      label: "Kazanma Olasılığı",
      value: `%${(winProb * 100).toFixed(1)}`,
      detail: "Model güveni",
    },
    {
      icon: <Target size={16} />,
      label: "Güven Seviyesi",
      value: win?.confidence_bucket || "ORTA",
      detail: "Tahmin gücü",
    },
    ...(margin !== null
      ? [
          {
            icon: <BarChart2 size={16} />,
            label: "Beklenen Fark",
            value: `+${margin.toFixed(1)} Sayı`,
            detail: `${winnerInfo.abbr} öngörülen marj`,
          },
        ]
      : []),
    ...(score
      ? [
          {
            icon: <Zap size={16} />,
            label: "Toplam Sayı",
            value: `${score.predicted_total_points.toFixed(0)} Sayı`,
            detail: `Aralık: ${score.total_points_range[0]}–${score.total_points_range[1]}`,
          },
        ]
      : []),
    {
      icon: <Shield size={16} />,
      label: "Model Kararı",
      value: result.final_display_recommendation?.primary_winner_signal || "WIN_PROB",
      detail: "Birincil sinyal",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {signals.map((s, i) => (
        <div
          key={i}
          className="bg-background-primary border border-border rounded p-3 flex flex-col justify-between gap-1.5"
        >
          <div className="flex items-center gap-1.5 text-text-secondary">
            {s.icon}
            <span className="text-xs font-medium text-text-secondary truncate">
              {s.label}
            </span>
          </div>
          <p className="text-base font-semibold tabular-nums text-text-primary">
            {s.value}
          </p>
          <p className="text-xs text-text-secondary truncate">{s.detail}</p>
        </div>
      ))}
    </div>
  );
}
