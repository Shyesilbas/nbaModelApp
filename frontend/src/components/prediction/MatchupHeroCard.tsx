import { Download, RefreshCw } from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { TeamInfo } from "./types";
import type { NormalizedPrediction } from "../../types/prediction";
import { exportPredictionAsPDF } from "../../lib/predictionReport";
import { useLanguage } from "../../context/useLanguage";

interface MatchupHeroCardProps {
  result: NormalizedPrediction;
  homeInfo: TeamInfo;
  awayInfo: TeamInfo;
  winnerInfo: TeamInfo;
  date: string;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function MatchupHeroCard({
  result,
  homeInfo,
  awayInfo,
  winnerInfo,
  date,
  onRefresh,
  isLoading = false,
}: MatchupHeroCardProps) {
  const { t, language, formatDate } = useLanguage();
  const tr = language === "tr";
  const win = result?.win_probability || {};
  const score = result?.score_prediction || {};

  const homeProb = win.home_win_probability ?? 0.5;
  const awayProb = win.away_win_probability ?? 0.5;
  const homePct = (homeProb * 100).toFixed(1);
  const awayPct = (awayProb * 100).toFixed(1);

  const homeScore = score.predicted_home_score?.toFixed(0) ?? "--";
  const awayScore = score.predicted_away_score?.toFixed(0) ?? "--";
  const homeRange = score.home_score_range;
  const awayRange = score.away_score_range;

  const margin = score.predicted_margin != null ? Math.abs(score.predicted_margin).toFixed(1) : "0.0";
  const scoreWinner = (score.predicted_margin ?? 0) >= 0 ? homeInfo : awayInfo;
  const pace = score.predicted_pace != null ? score.predicted_pace.toFixed(1) : "--";

  const confidence = String(win.confidence_bucket || "MEDIUM").toUpperCase();
  const confidenceLabel = confidence.includes("STRONG")
    ? t.predictions.highConfidence
    : confidence.includes("MODERATE")
      ? t.predictions.moderateConfidence
      : tr
        ? "Dengeli Karşılaşma"
        : "Balanced Matchup";

  const isHomeWinner = winnerInfo.abbr === homeInfo.abbr;

  const side = (
    info: TeamInfo,
    pct: string,
    pts: string,
    range: number[] | null | undefined,
    favorite: boolean,
    label: string
  ) => (
    <div className={`flex flex-col items-center gap-2 text-center ${favorite ? "" : "opacity-75"}`}>
      <TeamLogo abbr={info.abbr} name={info.name} size={56} />
      <div>
        <h2 className="text-base font-semibold text-text-primary sm:text-lg">{info.name}</h2>
        <p className="text-xs text-text-muted">{label}</p>
      </div>
      <p className={`text-4xl font-semibold tabular-nums sm:text-5xl ${favorite ? "text-text-primary" : "text-text-muted"}`}>
        {tr ? `%${pct}` : `${pct}%`}
      </p>
      <p className="text-xs tabular-nums text-text-secondary">
        {t.predictions.expectedScore}: <span className="font-semibold text-text-primary">{pts}</span>
        {range && range.length >= 2 ? ` (${range[0]}–${range[1]})` : ""}
      </p>
    </div>
  );

  return (
    <div className="space-y-5 rounded border border-border bg-background-primary p-5 lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs tabular-nums text-text-muted">
          {formatDate(date)}
          {win.model_version ? ` · Model ${win.model_version}` : ""}
        </p>
        <div className="flex items-center gap-1">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              aria-label={tr ? "Yenile" : "Refresh"}
              title={tr ? "Yenile" : "Refresh"}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-border text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50"
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              exportPredictionAsPDF({
                result,
                date,
                fallbackHome: homeInfo.abbr,
                fallbackAway: awayInfo.abbr,
                language,
              })
            }
            aria-label={t.predictions.downloadPdf}
            title={t.predictions.downloadPdf}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-border text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <Download size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 items-start gap-4 sm:gap-8">
        {side(awayInfo, awayPct, awayScore, awayRange, !isHomeWinner, t.common.away)}
        {side(homeInfo, homePct, homeScore, homeRange, isHomeWinner, t.common.home)}
      </div>

      <div className="mx-auto w-full max-w-md space-y-2">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-background-tertiary">
          <div style={{ width: `${awayProb * 100}%`, backgroundColor: awayInfo.color }} className="h-full" />
          <div style={{ width: `${homeProb * 100}%`, backgroundColor: homeInfo.color }} className="h-full" />
        </div>
        <p className="text-center text-xs tabular-nums text-text-muted">
          {confidenceLabel} · {scoreWinner.abbr} +{margin} · {t.predictions.expectedPace} {pace}
        </p>
      </div>
    </div>
  );
}
