import { Activity, Shield, TrendingUp } from "lucide-react";
import type { TeamInfo } from "./types";
import type { FeatureImpact, NormalizedPrediction } from "../../types/prediction";
import { formatFeatureInsight } from "./featureLabels";
import { useLanguage } from "../../context/useLanguage";

interface MatchupTacticalHubProps {
  result: NormalizedPrediction;
  homeInfo: TeamInfo;
  awayInfo: TeamInfo;
  winnerInfo: TeamInfo;
}

const isInactiveRestFlag = (f: FeatureImpact) =>
  (f.feature_name === "IS_B2B" || f.feature_name === "OPP_IS_B2B") && f.value === 0;

export function MatchupTacticalHub({
  result,
  homeInfo,
  awayInfo,
  winnerInfo,
}: MatchupTacticalHubProps) {
  const { language } = useLanguage();
  const tr = language === "tr";
  const win = result?.win_probability || {};
  const score = result?.score_prediction || {};
  const expl = result?.explanation || {};

  const prob = Math.max(win?.home_win_probability ?? 0.5, win?.away_win_probability ?? 0.5);
  const probPct = (prob * 100).toFixed(1);
  const formattedProb = tr ? `%${probPct}` : `${probPct}%`;

  const marginVal = score?.predicted_margin != null ? Math.abs(score.predicted_margin) : null;
  const margin = marginVal != null ? marginVal.toFixed(1) : "--";
  const scoreWinnerInfo = (score?.predicted_margin ?? 0) >= 0 ? homeInfo : awayInfo;
  const scoreLoserInfo = scoreWinnerInfo.abbr === homeInfo.abbr ? awayInfo : homeInfo;

  const paceNum = score?.predicted_pace;
  const paceVal = paceNum != null ? paceNum.toFixed(1) : "--";
  const homeOffRtg = score?.predicted_home_off_rtg != null ? score.predicted_home_off_rtg.toFixed(1) : "--";
  const awayOffRtg = score?.predicted_away_off_rtg != null ? score.predicted_away_off_rtg.toFixed(1) : "--";

  const winContext = expl?.win_probability?.context;
  const activeWinFeatures = (expl?.win_probability?.features ?? [])
    .filter((f) => Math.abs(f.contribution) > 0.0001 && !isInactiveRestFlag(f))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  const totalImpact = activeWinFeatures.reduce((s, f) => s + Math.abs(f.contribution), 0) || 1;
  const topDrivers = activeWinFeatures.slice(0, 3).map((f) => {
    const info = formatFeatureInsight(
      f.feature_name,
      f.value,
      f.influence ?? "NEUTRAL",
      homeInfo,
      awayInfo,
      winContext,
      language
    );
    const share = Math.round((Math.abs(f.contribution) / totalImpact) * 100);
    const edgeTeam =
      info.neutralBadge
        ? null
        : f.influence === "FAVORS_HOME"
          ? homeInfo.abbr
          : f.influence === "FAVORS_AWAY"
            ? awayInfo.abbr
            : null;
    return { feature: f, info, share, edgeTeam };
  });

  const paceDesc =
    paceNum == null
      ? tr
        ? "modelin öngördüğü tempo profili"
        : "the model's projected game pace"
      : paceNum >= 101.5
        ? tr
          ? "yüksek tempolu ve hızlı hücum geçişlerinin öne çıktığı bir maç dinamiği"
          : "a fast-paced transition dynamic with high possessions"
        : paceNum <= 97.5
          ? tr
            ? "yarı saha set hücumlarının ve savunma disiplininin öne çıktığı kontrollü bir tempo"
            : "a disciplined half-court battle with controlled possessions"
          : tr
            ? "dengeli ve kontrollü bir tempo profili"
            : "a balanced and measured tempo profile";

  const marginDesc =
    marginVal == null
      ? ""
      : tr
        ? marginVal <= 4.0
          ? `Skor modeli iki takım arasında yaklaşık ${margin} sayılık dar bir fark öngörüyor.`
          : `Skor modeli ${scoreWinnerInfo.name} (${scoreWinnerInfo.abbr}) takımını yaklaşık ${margin} sayı farkla önde görüyor.`
        : marginVal <= 4.0
          ? `The score model projects a tight ~${margin}-point game between the two sides.`
          : `The score model projects ${scoreWinnerInfo.name} (${scoreWinnerInfo.abbr}) ahead by roughly ${margin} points.`;

  const topDriver = topDrivers[0];
  const driverSummary = topDriver
    ? tr
      ? `Kazanma olasılığında en yüksek ağırlığı "${topDriver.info.title}" faktörü taşıyor.`
      : `The largest driver in the win probability model is "${topDriver.info.title}".`
    : tr
      ? `Kazanma olasılığı ve skor modelleri birbirinden bağımsız özellik setleriyle çalışır.`
      : `Win probability and score models operate as separate estimators.`;

  const pillarIcons = [TrendingUp, Activity, Shield] as const;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Game Script & Pace Insights */}
        <div className="flex flex-col justify-between space-y-5 lg:col-span-7">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-text-secondary">
                {tr ? "Model Simülasyon Özeti" : "Model Simulation Summary"}
              </span>
              <span className="text-xs font-semibold tabular-nums text-text-primary">
                {winnerInfo.abbr} {tr ? "Favori" : "Favorite"} · {formattedProb}
              </span>
            </div>

            <p className="text-xs font-medium leading-relaxed text-text-primary">
              {tr ? "Skor ve tempo tahminine göre karşılaşmada " : "Score and pace projections point toward "}
              <span className="underline decoration-border-focus underline-offset-2">{paceDesc}</span>
              {tr ? " bekleniyor." : "."} {marginDesc}
            </p>

            <p className="text-xs leading-relaxed text-text-secondary">
              {driverSummary}{" "}
              {marginVal != null && (
                <>
                  {tr ? "Skor modelinde görece dezavantajlı taraf: " : "Trailing in score projection: "}
                  <span className="font-semibold text-text-primary">{scoreLoserInfo.name}</span>.
                </>
              )}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 border-t border-border-light pt-3 tabular-nums">
            <div>
              <span className="block text-xs font-medium text-text-muted">
                {tr ? "Öngörülen Tempo" : "Projected Pace"}
              </span>
              <span className="mt-0.5 block text-sm font-semibold text-text-primary">
                {paceVal} <span className="text-xs font-normal text-text-muted">Poss</span>
              </span>
            </div>
            <div>
              <span className="block text-xs font-medium text-text-muted">
                {homeInfo.abbr} {tr ? "Hücum Rtg" : "Off Rtg"}
              </span>
              <span className="mt-0.5 block text-sm font-semibold text-text-primary">{homeOffRtg}</span>
            </div>
            <div>
              <span className="block text-xs font-medium text-text-muted">
                {awayInfo.abbr} {tr ? "Hücum Rtg" : "Off Rtg"}
              </span>
              <span className="mt-0.5 block text-sm font-semibold text-text-primary">{awayOffRtg}</span>
            </div>
          </div>
        </div>

        {/* Right Column: Top Actual Model Drivers */}
        <div className="flex flex-col justify-between border-t border-border-light pt-4 lg:col-span-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <span className="mb-2 block text-xs font-semibold text-text-secondary">
            {tr ? "Modelde Öne Çıkan Etkenler" : "Top Model Drivers"}
          </span>

          {topDrivers.length > 0 ? (
            <div className="flex flex-1 flex-col justify-around divide-y divide-border-light">
              {topDrivers.map((d, idx) => {
                const Icon = pillarIcons[idx % pillarIcons.length];
                const shareLabel = tr ? `%${d.share}` : `${d.share}%`;
                return (
                  <div key={d.feature.feature_name} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Icon size={16} strokeWidth={1.5} className="shrink-0 text-text-muted" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-text-primary">{d.info.title}</p>
                        <p className="truncate text-xs text-text-muted">
                          {d.info.simpleValue ? `${d.info.category} · ${d.info.simpleValue}` : d.info.category}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-text-primary">
                      {d.edgeTeam ? `${d.edgeTeam} · ${shareLabel}` : shareLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-1 items-center text-xs text-text-secondary">
              {tr ? "Detaylı etken dökümü Gerekçe sekmesinde gösterilir." : "Detailed driver breakdown appears under Rationale."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
