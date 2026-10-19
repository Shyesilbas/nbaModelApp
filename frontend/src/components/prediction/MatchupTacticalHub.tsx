import { Activity, Compass, Flame, Sparkles, TrendingUp, Zap } from "lucide-react";
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

  const paceVal = score?.predicted_pace ? score.predicted_pace.toFixed(1) : "99.8";
  const homeOffRtg = score?.predicted_home_off_rtg ? score.predicted_home_off_rtg.toFixed(1) : "114.5";
  const awayOffRtg = score?.predicted_away_off_rtg ? score.predicted_away_off_rtg.toFixed(1) : "110.2";

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
    <div className="bg-background-primary border border-border rounded p-5 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border-light">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded border border-border bg-background-secondary flex items-center justify-center text-primary shrink-0">
            <Compass size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Taktiksel Maç Senaryosu ve Saha Dinamikleri
            </h3>
            <p className="text-xs text-text-secondary">
              Veriye dayalı maç akışı, tempo analizi ve takımların kilit saha üstünlükleri
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-sm bg-background-secondary border border-border text-text-primary text-xs font-semibold tabular-nums uppercase">
            {winnerInfo.abbr} Favori · %{probPct}
          </span>
        </div>
      </div>

      {/* 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Game Script */}
        <div className="lg:col-span-7 flex flex-col justify-between p-4 rounded border border-border bg-background-secondary space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-primary" />
              <span className="text-xs font-semibold text-text-primary">
                Model Simülasyon Akışı ve Taktik Raporu
              </span>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed font-normal">
              Model tahminine göre karşılaşmada{" "}
              <strong className="font-semibold text-text-primary">{script.tempo}</strong>{" "}
              bekleniyor. {script.body}
            </p>

            <p className="text-xs text-text-secondary leading-relaxed font-normal">
              {script.edge} Skor tahmininde geride görünen taraf:{" "}
              <strong className="font-semibold text-text-primary">{scoreLoserInfo.name}</strong>.
            </p>
          </div>

          {/* Micro stats banner */}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border-light">
            <div className="text-center p-2.5 rounded border border-border bg-background-primary">
              <span className="text-xs font-medium text-text-secondary uppercase block">
                Öngörülen Tempo
              </span>
              <span className="text-xs font-semibold text-text-primary tabular-nums mt-0.5 block">
                {paceVal} Poss
              </span>
            </div>
            <div className="text-center p-2.5 rounded border border-border bg-background-primary">
              <span className="text-xs font-medium text-text-secondary uppercase block">
                {homeInfo.abbr} Hücum Rtg
              </span>
              <span className="text-xs font-semibold text-text-primary tabular-nums mt-0.5 block">
                {homeOffRtg}
              </span>
            </div>
            <div className="text-center p-2.5 rounded border border-border bg-background-primary">
              <span className="text-xs font-medium text-text-secondary uppercase block">
                {awayInfo.abbr} Hücum Rtg
              </span>
              <span className="text-xs font-semibold text-text-primary tabular-nums mt-0.5 block">
                {awayOffRtg}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: 4 Key Matchup Pillars */}
        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
          {/* Pillar 1 */}
          <div className="p-3 rounded border border-border bg-background-secondary flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded border border-border bg-background-primary flex items-center justify-center shrink-0 text-text-secondary">
                <TrendingUp size={16} />
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary">
                  Takım Formu ve Net Rating
                </p>
                <p className="text-xs font-semibold text-text-primary mt-0.5">
                  {netRtgFeat
                    ? netRtgFeat.contribution > 0
                      ? `${homeInfo.abbr} Form Avantajı`
                      : `${awayInfo.abbr} Form Avantajı`
                    : `${winnerInfo.abbr} Üstün`}
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-sm border border-border bg-background-primary text-xs font-semibold tabular-nums text-text-primary shrink-0">
              +{isHomeWinner ? homeInfo.abbr : awayInfo.abbr}
            </span>
          </div>

          {/* Pillar 2 */}
          <div className="p-3 rounded border border-border bg-background-secondary flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded border border-border bg-background-primary flex items-center justify-center shrink-0 text-text-secondary">
                <Activity size={16} />
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary">
                  Saha Faktörü ve Seyirci
                </p>
                <p className="text-xs font-semibold text-text-primary mt-0.5">
                  {isHomeWinner
                    ? `${homeInfo.abbr} Ev Sahibi Avantajı`
                    : `${awayInfo.abbr} Deplasman Direnci`}
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-sm border border-border bg-background-primary text-xs font-semibold tabular-nums text-text-primary shrink-0">
              {isHomeWinner ? "+3.5 Sayı" : "Deplasman"}
            </span>
          </div>

          {/* Pillar 3 */}
          <div className="p-3 rounded border border-border bg-background-secondary flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded border border-border bg-background-primary flex items-center justify-center shrink-0 text-text-secondary">
                <Flame size={16} />
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary">
                  Yay Gerisi (3PT) Etkinliği
                </p>
                <p className="text-xs font-semibold text-text-primary mt-0.5">
                  {threePtFeat ? "Dış Şut Ağırlığı Etkili" : "Boyalı Alan ve Ceza Şutları"}
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-sm border border-border bg-background-primary text-xs font-medium text-text-secondary shrink-0">
              Şut Payı
            </span>
          </div>

          {/* Pillar 4 */}
          <div className="p-3 rounded border border-border bg-background-secondary flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded border border-border bg-background-primary flex items-center justify-center shrink-0 text-text-secondary">
                <Zap size={16} />
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary">
                  Tahmin Güvenilirlik Derecesi
                </p>
                <p className="text-xs font-semibold text-text-primary mt-0.5">
                  {win?.confidence_bucket || "ORTA"} (%{probPct} Sinyal)
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-sm border border-border bg-background-primary text-xs font-medium text-text-secondary shrink-0">
              V10 Hibrit
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
