import { Award, Calendar, Cpu, Download, RefreshCw, TrendingUp, Trophy, Zap } from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { TeamInfo } from "./types";
import { exportPredictionAsPDF } from "../../lib/predictionReport";

interface MatchupHeroCardProps {
  result: any;
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
  const win = result?.win_probability || {};
  const score = result?.score_prediction || {};

  const homeProb = win.home_win_probability ?? 0.5;
  const awayProb = win.away_win_probability ?? 0.5;
  const homeProbPct = (homeProb * 100).toFixed(1);
  const awayProbPct = (awayProb * 100).toFixed(1);

  const homeScore = score.predicted_home_score?.toFixed(0) ?? "--";
  const awayScore = score.predicted_away_score?.toFixed(0) ?? "--";
  const homeRange = score.home_score_range || [0, 0];
  const awayRange = score.away_score_range || [0, 0];

  const margin = score.predicted_margin ? Math.abs(score.predicted_margin).toFixed(1) : "0.0";
  const scoreWinnerInfo = (score.predicted_margin ?? 0) >= 0 ? homeInfo : awayInfo;
  const total = score.predicted_total_points ? score.predicted_total_points.toFixed(1) : "--";
  const totalRange = score.total_points_range || [0, 0];
  const pace = score.predicted_pace ? score.predicted_pace.toFixed(1) : "99.5";

  const confidence = win.confidence_bucket || "MEDIUM";
  const isHighConfidence = confidence.toUpperCase().includes("STRONG");
  const isModerateConfidence = confidence.toUpperCase().includes("MODERATE");

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleDateString("tr-TR", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const isHomeWinner = winnerInfo.abbr === homeInfo.abbr;

  return (
    <div className="bg-background-primary border border-border rounded p-5 lg:p-6 space-y-6">
      {/* Top Metadata and Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border-light">
        <div className="flex flex-wrap items-center gap-2">
          {win.model_version && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-background-secondary border border-border text-text-secondary text-xs font-medium">
              <Cpu size={14} className="text-primary" />
              <span>Model {win.model_version}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-background-secondary border border-border text-text-secondary text-xs font-medium tabular-nums">
            <Calendar size={13} />
            <span>{formatDate(date)}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="flex items-center gap-1.5 h-8 px-3 rounded border border-border bg-background-primary hover:bg-background-secondary text-text-primary text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={13} className={isLoading ? "animate-spin text-primary" : ""} />
              <span>Yenile</span>
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
              })
            }
            className="flex items-center gap-1.5 h-8 px-3 rounded bg-primary hover:bg-primary/90 text-white text-xs font-medium transition-colors cursor-pointer"
          >
            <Download size={13} />
            <span>Raporu İndir (PDF)</span>
          </button>
        </div>
      </div>

      {/* Main Matchup Arena */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-6 lg:gap-8">
        {/* Away Team */}
        <div className="flex flex-col items-center md:items-start text-center md:text-left gap-3">
          <div className="flex items-center gap-3.5">
            <div className="relative w-16 h-16 rounded border border-border bg-background-secondary flex items-center justify-center p-2 shrink-0">
              <TeamLogo abbr={awayInfo.abbr} name={awayInfo.name} size={48} />
              {!isHomeWinner && (
                <span
                  className="absolute -top-1.5 -right-1.5 p-1 bg-background-primary border border-border rounded-full text-status-warning "
                  title="Galibiyet Favorisi"
                >
                  <Trophy size={13} />
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center gap-1.5 justify-center md:justify-start">
                <span className="text-xs font-medium text-text-secondary uppercase">Deplasman</span>
                {!isHomeWinner && (
                  <span className="px-1.5 py-0.5 rounded-sm bg-status-success/10 text-status-success text-xs font-semibold">
                    Favori
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-semibold text-text-primary tracking-tight mt-0.5">
                {awayInfo.name}
              </h2>
              <p className="text-xs font-medium text-text-secondary">{awayInfo.abbr}</p>
            </div>
          </div>

          <div className="flex items-baseline gap-4 pt-1">
            <div>
              <span className="text-xs font-medium text-text-secondary block">Kazanma Olasılığı</span>
              <span className="text-2xl sm:text-3xl font-semibold tabular-nums text-text-primary">
                %{awayProbPct}
              </span>
            </div>
            <div className="pl-4 border-l border-border-light">
              <span className="text-xs font-medium text-text-secondary block">Tahmini Skor</span>
              <span className="text-2xl sm:text-3xl font-semibold tabular-nums text-text-primary">
                {awayScore}
              </span>
              <span className="text-xs text-text-secondary tabular-nums block">
                {awayRange[0]}–{awayRange[1]} Sayı
              </span>
            </div>
          </div>
        </div>

        {/* Center Matchup Bar & Conviction */}
        <div className="flex flex-col items-center justify-center gap-3 px-2 py-2 w-full max-w-xs mx-auto">
          {/* Matchup Conviction */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm border border-border bg-background-secondary text-xs font-medium text-text-primary text-center">
            <span>
              {isHighConfidence
                ? "Yüksek Güvenilirlik"
                : isModerateConfidence
                ? "Orta Güvenilirlik"
                : "Dengeli Karşılaşma"}
              {" · "}
              {scoreWinnerInfo.abbr} +{margin} Fark
            </span>
          </div>

          {/* Probability Split Bar */}
          <div className="w-full space-y-1.5">
            <div className="flex justify-between text-xs font-medium tabular-nums">
              <span className="text-text-primary">{awayInfo.abbr} %{awayProbPct}</span>
              <span className="text-text-secondary text-xs font-normal">VS</span>
              <span className="text-text-primary">%{homeProbPct} {homeInfo.abbr}</span>
            </div>

            <div className="relative h-2.5 w-full bg-background-tertiary rounded-full overflow-hidden flex">
              <div
                className="h-full transition-all duration-500 ease-out"
                style={{
                  width: `${awayProb * 100}%`,
                  backgroundColor: awayInfo.color,
                }}
              />
              <div
                className="h-full transition-all duration-500 ease-out"
                style={{
                  width: `${homeProb * 100}%`,
                  backgroundColor: homeInfo.color,
                }}
              />
              <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-background-primary -translate-x-1/2" />
            </div>
          </div>

          {/* Model Favorite Note */}
          <div className="flex items-center gap-1.5 text-xs text-text-secondary text-center">
            <Award size={14} className="text-status-warning shrink-0" />
            <span>
              Galibiyet favorisi:{" "}
              <strong className="text-text-primary font-semibold">{winnerInfo.name}</strong>
            </span>
          </div>
        </div>

        {/* Home Team */}
        <div className="flex flex-col items-center md:items-end text-center md:text-right gap-3">
          <div className="flex items-center md:flex-row-reverse gap-3.5">
            <div className="relative w-16 h-16 rounded border border-border bg-background-secondary flex items-center justify-center p-2 shrink-0">
              <TeamLogo abbr={homeInfo.abbr} name={homeInfo.name} size={48} />
              {isHomeWinner && (
                <span
                  className="absolute -top-1.5 -right-1.5 p-1 bg-background-primary border border-border rounded-full text-status-warning "
                  title="Galibiyet Favorisi"
                >
                  <Trophy size={13} />
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center gap-1.5 justify-center md:justify-end">
                {isHomeWinner && (
                  <span className="px-1.5 py-0.5 rounded-sm bg-status-success/10 text-status-success text-xs font-semibold">
                    Favori
                  </span>
                )}
                <span className="text-xs font-medium text-text-secondary uppercase">Ev Sahibi</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-semibold text-text-primary tracking-tight mt-0.5">
                {homeInfo.name}
              </h2>
              <p className="text-xs font-medium text-text-secondary">{homeInfo.abbr}</p>
            </div>
          </div>

          <div className="flex items-baseline md:flex-row-reverse gap-4 pt-1">
            <div>
              <span className="text-xs font-medium text-text-secondary block">Kazanma Olasılığı</span>
              <span className="text-2xl sm:text-3xl font-semibold tabular-nums text-text-primary">
                %{homeProbPct}
              </span>
            </div>
            <div className="pr-4 md:border-r border-border-light text-right">
              <span className="text-xs font-medium text-text-secondary block">Tahmini Skor</span>
              <span className="text-2xl sm:text-3xl font-semibold tabular-nums text-text-primary">
                {homeScore}
              </span>
              <span className="text-xs text-text-secondary tabular-nums block">
                {homeRange[0]}–{homeRange[1]} Sayı
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom KPI Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-border-light">
        <div className="p-3 rounded border border-border bg-background-secondary">
          <div className="flex items-center gap-1.5 text-text-secondary mb-1">
            <TrendingUp size={14} />
            <span className="text-xs font-medium text-text-secondary">
              Beklenen Fark
            </span>
          </div>
          <p className="text-base sm:text-lg font-semibold tabular-nums text-text-primary">
            {winnerInfo.abbr} +{margin} Sayı
          </p>
          <p className="text-xs text-text-secondary mt-0.5">Öngörülen galibiyet marjı</p>
        </div>

        <div className="p-3 rounded border border-border bg-background-secondary">
          <div className="flex items-center gap-1.5 text-text-secondary mb-1">
            <Zap size={14} />
            <span className="text-xs font-medium text-text-secondary">
              Toplam Sayı
            </span>
          </div>
          <p className="text-base sm:text-lg font-semibold tabular-nums text-text-primary">
            {total} Sayı
          </p>
          <p className="text-xs text-text-secondary tabular-nums mt-0.5">
            Aralık: {totalRange[0]}–{totalRange[1]}
          </p>
        </div>

        <div className="p-3 rounded border border-border bg-background-secondary">
          <div className="flex items-center gap-1.5 text-text-secondary mb-1">
            <Cpu size={14} />
            <span className="text-xs font-medium text-text-secondary">
              Tempo (Pace)
            </span>
          </div>
          <p className="text-base sm:text-lg font-semibold tabular-nums text-text-primary">
            {pace} <span className="text-xs font-normal text-text-secondary">pos/48m</span>
          </p>
          <p className="text-xs text-text-secondary mt-0.5">
            {parseFloat(pace) > 100 ? "Yüksek Tempolu Hücum" : "Kontrollü Set Oyunu"}
          </p>
        </div>
      </div>
    </div>
  );
}
