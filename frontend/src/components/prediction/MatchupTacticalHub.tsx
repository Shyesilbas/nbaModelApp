import { Activity, Flame, TrendingUp, Zap } from "lucide-react";
import type { TeamInfo } from "./types";

interface MatchupTacticalHubProps {
  result: any;
  homeInfo: TeamInfo;
  awayInfo: TeamInfo;
  winnerInfo: TeamInfo;
}

export function MatchupTacticalHub({
  result,
  homeInfo,
  awayInfo,
  winnerInfo,
}: MatchupTacticalHubProps) {
  const win = result?.win_probability || {};
  const score = result?.score_prediction || {};
  const expl = result?.explanation || {};

  const prob = Math.max(win?.home_win_probability ?? 0.5, win?.away_win_probability ?? 0.5);
  const probPct = (prob * 100).toFixed(1);
  const margin = score?.predicted_margin ? Math.abs(score.predicted_margin).toFixed(1) : "0.0";
  const isHomeWinner = winnerInfo.abbr === homeInfo.abbr;
  const scoreWinnerInfo = (score?.predicted_margin ?? 0) >= 0 ? homeInfo : awayInfo;
  const scoreLoserInfo = scoreWinnerInfo.abbr === homeInfo.abbr ? awayInfo : homeInfo;

  const winFeatures = expl?.win_probability?.features || [];
  const findFeature = (keyPart: string) =>
    winFeatures.find((f: any) => f.feature_name?.toUpperCase().includes(keyPart));

  const netRtgFeat = findFeature("NET_RTG");
  const threePtFeat = findFeature("3PT") || findFeature("THREE");

  const paceVal = score?.predicted_pace ? score.predicted_pace.toFixed(1) : "--";
  const homeOffRtg = score?.predicted_home_off_rtg ? score.predicted_home_off_rtg.toFixed(1) : "--";
  const awayOffRtg = score?.predicted_away_off_rtg ? score.predicted_away_off_rtg.toFixed(1) : "--";

  const buildGameScript = () => {
    const paceDesc =
      parseFloat(paceVal) >= 101.5
        ? "yüksek tempolu ve hızlı hücum geçişlerinin bol olduğu bir maç dinamiği"
        : parseFloat(paceVal) <= 97.5
        ? "yarı saha set hücumlarının ve savunma disiplininin öne çıktığı kontrollü bir maç"
        : "dengeli ve kontrollü bir tempo";

    const marginDesc =
      parseFloat(margin) >= 10.0
        ? `Skor modeli ${scoreWinnerInfo.name} (${scoreWinnerInfo.abbr}) takımını yaklaşık ${margin} sayı farkla önde öngörüyor.`
        : parseFloat(margin) <= 4.0
        ? `Skor modeli iki takım arasında yaklaşık ${margin} sayılık dar bir fark öngörüyor; bu skor tahmini kazanma olasılığı tahmininden ayrı hesaplanır.`
        : `Skor modeli ${scoreWinnerInfo.abbr} takımını yaklaşık ${margin} sayı farkla önde öngörüyor.`;

    const edgeFactor = isHomeWinner
      ? `Saha avantajı ve ev sahibi seyirci desteği, modelin ${homeInfo.abbr} lehine verdiği %${probPct}'lik ağırlıkta ana katalizör görevi görüyor.`
      : `Deplasman ekibi ${awayInfo.abbr}, son dönemdeki form grafiği ve hücum etkinliğiyle deplasman dezavantajını telafi ederek modelde öne çıkıyor.`;

    return {
      tempo: paceDesc,
      body: marginDesc,
      edge: edgeFactor,
    };
  };

  const script = buildGameScript();

  return (
    <div className="space-y-6">
      {/* 2-Column Grid: Editorial Script + Matchup Pillars */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Game Script & Pace Insights */}
        <div className="lg:col-span-7 flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary">
                Model Simülasyon Akışı & Taktik Raporu
              </span>
              <span className="text-xs font-semibold tabular-nums text-text-primary">
                {winnerInfo.abbr} Favori · %{probPct}
              </span>
            </div>

            <p className="text-xs text-text-primary leading-relaxed font-medium">
              Model tahminine göre karşılaşmada <span className="underline decoration-border-focus underline-offset-2">{script.tempo}</span> bekleniyor. {script.body}
            </p>

            <p className="text-xs text-text-secondary leading-relaxed">
              {script.edge} Skor modelinde görece dezavantajlı görünen taraf: <span className="font-semibold text-text-primary">{scoreLoserInfo.name}</span>.
            </p>
          </div>

          {/* Micro stats inline strip */}
          <div className="grid grid-cols-3 gap-4 pt-3 border-t border-border-light tabular-nums">
            <div>
              <span className="text-xs font-medium text-text-muted block">
                Öngörülen Tempo
              </span>
              <span className="text-sm font-semibold text-text-primary mt-0.5 block">
                {paceVal} <span className="text-xs font-normal text-text-muted">Poss</span>
              </span>
            </div>
            <div>
              <span className="text-xs font-medium text-text-muted block">
                {homeInfo.abbr} Hücum Rtg
              </span>
              <span className="text-sm font-semibold text-text-primary mt-0.5 block">
                {homeOffRtg}
              </span>
            </div>
            <div>
              <span className="text-xs font-medium text-text-muted block">
                {awayInfo.abbr} Hücum Rtg
              </span>
              <span className="text-sm font-semibold text-text-primary mt-0.5 block">
                {awayOffRtg}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: 4 Matchup Pillars in Clean Divided List */}
        <div className="lg:col-span-5 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-border-light pt-4 lg:pt-0 lg:pl-6">
          <span className="text-xs font-semibold text-text-secondary mb-2 block">
            Önemli Saha Üstünlükleri
          </span>

          <div className="divide-y divide-border-light flex-1 flex flex-col justify-around">
            {/* Pillar 1 */}
            <div className="py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <TrendingUp size={16} className="text-text-muted shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-text-primary truncate">
                    {netRtgFeat
                      ? netRtgFeat.contribution > 0
                        ? `${homeInfo.abbr} Form Avantajı`
                        : `${awayInfo.abbr} Form Avantajı`
                      : `${winnerInfo.abbr} Net Rating Üstünlüğü`}
                  </p>
                  <p className="text-xs text-text-muted">Takım formu ve net verimlilik</p>
                </div>
              </div>
              <span className="text-xs font-semibold tabular-nums text-text-primary shrink-0">
                +{isHomeWinner ? homeInfo.abbr : awayInfo.abbr}
              </span>
            </div>

            {/* Pillar 2 */}
            <div className="py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Activity size={16} className="text-text-muted shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-text-primary truncate">
                    {isHomeWinner
                      ? `${homeInfo.abbr} Ev Sahibi Avantajı`
                      : `${awayInfo.abbr} Deplasman Direnci`}
                  </p>
                  <p className="text-xs text-text-muted">Saha faktörü ve seyirci</p>
                </div>
              </div>
              <span className="text-xs font-medium tabular-nums text-text-secondary shrink-0">
                {isHomeWinner ? "+3.5 Pts" : "Deplasman"}
              </span>
            </div>

            {/* Pillar 3 */}
            <div className="py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Flame size={16} className="text-text-muted shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-text-primary truncate">
                    {threePtFeat ? "Dış Şut Etkinliği" : "Boyalı Alan Üstünlüğü"}
                  </p>
                  <p className="text-xs text-text-muted">Yay gerisi ve bitiricilik</p>
                </div>
              </div>
              <span className="text-xs font-medium text-text-secondary shrink-0">
                Şut Payı
              </span>
            </div>

            {/* Pillar 4 */}
            <div className="py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Zap size={16} className="text-text-muted shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-text-primary truncate">
                    Tahmin Güven Derecesi
                  </p>
                  <p className="text-xs text-text-muted">Model güven aralığı</p>
                </div>
              </div>
              <span className="text-xs font-semibold tabular-nums text-text-primary shrink-0">
                {win?.confidence_bucket || "ORTA"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
