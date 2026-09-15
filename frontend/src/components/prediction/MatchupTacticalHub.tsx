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
  const loserInfo = winnerInfo.abbr === homeInfo.abbr ? awayInfo : homeInfo;
  const isHomeWinner = winnerInfo.abbr === homeInfo.abbr;

  // Extract key features if available
  const winFeatures = expl?.win_probability?.features || [];
  const findFeature = (keyPart: string) =>
    winFeatures.find((f: any) => f.feature_name?.toUpperCase().includes(keyPart));

  const netRtgFeat = findFeature("NET_RTG");
  const threePtFeat = findFeature("3PT") || findFeature("THREE");


  const paceVal = score?.predicted_pace ? score.predicted_pace.toFixed(1) : "99.8";
  const homeOffRtg = score?.predicted_home_off_rtg ? score.predicted_home_off_rtg.toFixed(1) : "114.5";
  const awayOffRtg = score?.predicted_away_off_rtg ? score.predicted_away_off_rtg.toFixed(1) : "110.2";

  // Dynamic game script synthesis based on statistical features
  const buildGameScript = () => {
    const paceDesc = parseFloat(paceVal) >= 101.5 
      ? "yüksek tempolu ve hızlı hücum geçişlerinin bol olduğu bir maç dinamiği"
      : parseFloat(paceVal) <= 97.5
      ? "yarı saha set hücumlarının ve savunma disiplininin öne çıktığı kontrollü bir maç"
      : "dengeli ve kontrollü bir tempo temposu";

    const marginDesc = parseFloat(margin) >= 10.0
      ? `Maçın genelinde ${winnerInfo.name} (${winnerInfo.abbr}) takımının skoru ve tempoyu domine etmesi, ribaund ve şut yüzdesi avantajıyla çift haneli farkı koruması bekleniyor.`
      : parseFloat(margin) <= 4.0
      ? `Karşılaşmanın son çeyreğin son dakikalarına kadar tek pozisyonluk farklarla çok çekişmeli geçmesi ve clutch anlardaki karar kalitesinin belirleyici olması öngörülüyor.`
      : `${winnerInfo.abbr}, hücum verimliliğindeki istikrarı sayesinde farkı 5-9 sayı bandında tutarak maçı kontrol etmeye yakın taraf.`;

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
    <div className="surface rounded-[1.75rem] p-5 lg:p-7 border border-slate-200/80 bg-white shadow-sm space-y-6 animate-fade-in-up stagger-2">
      
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Compass size={17} />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              Taktiksel Maç Senaryosu & Saha Dinamikleri
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              Veriye dayalı maç akışı, tempo analizi ve iki takımın kilit saha üstünlükleri
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-black font-mono uppercase tracking-wider">
            {winnerInfo.abbr} FAVORİ · %{probPct}
          </span>
        </div>
      </div>

      {/* ── 2-COLUMN INTELLIGENCE GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Column: AI Game Script (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col justify-between p-5 rounded-2xl bg-gradient-to-br from-slate-50/90 via-slate-50/50 to-white border border-slate-200/80 shadow-2xs space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-indigo-600" />
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-900">
                Model Simülasyon Akışı & Taktik Raporu
              </span>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed font-normal">
              Model tahminine göre karşılaşmada <strong className="font-semibold text-slate-900">{script.tempo}</strong> bekleniyor. {script.body}
            </p>

            <p className="text-xs text-slate-700 leading-relaxed font-normal">
              {script.edge} Karşılaşmada rakip <strong className="font-semibold text-slate-900">{loserInfo.name}</strong> ekibinin maçta kalabilmesi için dış şut yüzdesini lig ortalamasının üzerine çekmesi ve geçiş hücumlarını sınırlaması gerekecek.
            </p>
          </div>

          {/* Micro stats banner */}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-200/60">
            <div className="text-center p-2 rounded-xl bg-white border border-slate-200/60 shadow-2xs">
              <span className="text-[9px] font-black uppercase text-slate-400 block">Öngörülen Tempo</span>
              <span className="text-xs font-black text-slate-800 font-mono">{paceVal} Poss</span>
            </div>
            <div className="text-center p-2 rounded-xl bg-white border border-slate-200/60 shadow-2xs">
              <span className="text-[9px] font-black uppercase text-slate-400 block">{homeInfo.abbr} Hücum Rtg</span>
              <span className="text-xs font-black font-mono" style={{ color: homeInfo.color }}>{homeOffRtg}</span>
            </div>
            <div className="text-center p-2 rounded-xl bg-white border border-slate-200/60 shadow-2xs">
              <span className="text-[9px] font-black uppercase text-slate-400 block">{awayInfo.abbr} Hücum Rtg</span>
              <span className="text-xs font-black font-mono" style={{ color: awayInfo.color }}>{awayOffRtg}</span>
            </div>
          </div>
        </div>

        {/* Right Column: 4 Key Matchup Pillars (5 Cols) */}
        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
          
          {/* Pillar 1: Form & Net Rating Edge */}
          <div className="p-3 rounded-xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <TrendingUp size={16} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Takım Formu & Net Rating</p>
                <p className="text-xs font-black text-slate-800">
                  {netRtgFeat ? (netRtgFeat.contribution > 0 ? `${homeInfo.abbr} Form Avantajı` : `${awayInfo.abbr} Form Avantajı`) : `${winnerInfo.abbr} Üstün`}
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-black font-mono bg-emerald-50 text-emerald-700 shrink-0">
              +{isHomeWinner ? homeInfo.abbr : awayInfo.abbr}
            </span>
          </div>

          {/* Pillar 2: Home Court vs Road Efficiency */}
          <div className="p-3 rounded-xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Activity size={16} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Saha Faktörü & Atmosfer</p>
                <p className="text-xs font-black text-slate-800">
                  {isHomeWinner ? `${homeInfo.abbr} Ev Sahibi Dominasyonu` : `${awayInfo.abbr} Deplasman Direnci`}
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-black font-mono bg-indigo-50 text-indigo-700 shrink-0">
              {isHomeWinner ? "+3.5 Pts" : "Deplasman"}
            </span>
          </div>

          {/* Pillar 3: Perimeter & 3-Point Volume */}
          <div className="p-3 rounded-xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Flame size={16} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Yay Gerisi (3PT) Etkinliği</p>
                <p className="text-xs font-black text-slate-800">
                  {threePtFeat ? "Dış Şut Ağırlığı Etkili" : "Boyalı Alan & Ceza Şutları"}
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-black font-mono bg-amber-50 text-amber-700 shrink-0">
              Şut Payı
            </span>
          </div>

          {/* Pillar 4: Model Confidence Signal */}
          <div className="p-3 rounded-xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                <Zap size={16} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tahmin Güvenilirlik Derecesi</p>
                <p className="text-xs font-black text-slate-800">
                  {win?.confidence_bucket || "MEDIUM"} ({probPct}% Sinyal)
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-black font-mono bg-violet-50 text-violet-700 shrink-0">
              V10 LR+XGB
            </span>
          </div>

        </div>

      </div>

    </div>
  );
}
