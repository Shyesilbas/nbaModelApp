import { BarChart2, Home, Shield, Target, TrendingUp, Zap } from "lucide-react";
import type { TeamInfo } from "./types";
import { useLanguage } from "../../context/LanguageContext";

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
  const { t, language } = useLanguage();
  const win = result.win_probability;
  const score = result.score_prediction;
  const winProb = Math.max(win?.home_win_probability ?? 0, win?.away_win_probability ?? 0);
  const margin = score ? Math.abs(score.predicted_margin) : null;
  const isHome = win?.predicted_winner === homeInfo.abbr;

  const signals = [
    {
      icon: <Home size={16} />,
      label: language === "tr" ? "Saha Avantajı" : "Court Factor",
      value: isHome
        ? (language === "tr" ? `+${homeInfo.abbr} Üstünlüğü` : `+${homeInfo.abbr} Edge`)
        : (language === "tr" ? "Nötr / Denge" : "Neutral / Road"),
      detail: isHome ? t.predictions.homeCourtAdvantage : t.predictions.roadResistance,
    },
    {
      icon: <TrendingUp size={16} />,
      label: t.predictions.winProbability,
      value: `%${(winProb * 100).toFixed(1)}`,
      detail: language === "tr" ? "Model güveni" : "Model confidence",
    },
    {
      icon: <Target size={16} />,
      label: language === "tr" ? "Güven Seviyesi" : "Confidence Level",
      value: win?.confidence_bucket || (language === "tr" ? "ORTA" : "MODERATE"),
      detail: language === "tr" ? "Tahmin gücü" : "Prediction strength",
    },
    ...(margin !== null
      ? [
          {
            icon: <BarChart2 size={16} />,
            label: t.predictions.expectedMargin,
            value: `+${margin.toFixed(1)} ${t.common.ptsUnit}`,
            detail: `${winnerInfo.abbr} ${language === "tr" ? "öngörülen marj" : "projected margin"}`,
          },
        ]
      : []),
    ...(score
      ? [
          {
            icon: <Zap size={16} />,
            label: t.predictions.expectedTotal,
            value: `${score.predicted_total_points.toFixed(0)} ${t.common.ptsUnit}`,
            detail: `${language === "tr" ? "Aralık" : "Range"}: ${score.total_points_range[0]}–${score.total_points_range[1]}`,
          },
        ]
      : []),
    {
      icon: <Shield size={16} />,
      label: t.predictions.modelDecision,
      value: result.final_display_recommendation?.primary_winner_signal || "WIN_PROB",
      detail: language === "tr" ? "Birincil sinyal" : "Primary signal",
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
