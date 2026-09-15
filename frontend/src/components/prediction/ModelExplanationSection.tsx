import { useState } from "react";
import { Cpu, Info, Sparkles, ArrowUpRight, ArrowDownRight, Compass } from "lucide-react";
import type { TeamInfo } from "./types";
import { formatFeatureInsight } from "./featureLabels";


export function ModelExplanationSection({
  result,
  homeInfo,
  awayInfo,
}: {
  result: any;
  homeInfo: TeamInfo;
  awayInfo: TeamInfo;
}) {
  const [activeTab, setActiveTab] = useState<"win" | "score">("win");
  const expl = result.explanation;

  if (!expl) {
    return (
      <div className="surface rounded-[1.5rem] p-6 border border-slate-200/80 bg-white">
        <div className="flex items-center gap-3">
          <Info className="text-slate-400" size={16} />
          <p className="text-xs text-slate-500 font-semibold m-0">
            Açıklanabilir Yapay Zeka (XAI) detayları bu maç için oluşturulmadı.
          </p>
        </div>
      </div>
    );
  }

  const winExpl = expl.win_probability;
  const scoreExpl = expl.score_prediction;

  // Filter features to get meaningful ones
  const winFeatures = (winExpl?.features || []).filter(
    (f: any) => Math.abs(f.contribution) > 0.0001
  );

  // Calculate total absolute contribution for percentage scaling
  const totalWinContrib = winFeatures.reduce((sum: number, f: any) => sum + Math.abs(f.contribution), 0) || 1;

  // Group win features by category
  const categories: { [key: string]: any[] } = {};
  winFeatures.forEach((f: any) => {
    const formatted = formatFeatureInsight(f.feature_name, f.value, f.influence, homeInfo, awayInfo);
    const cat = formatted.category || f.category || "Genel Metrik";
    if (!categories[cat]) {
      categories[cat] = [];
    }
    categories[cat].push({ ...f, formatted });
  });

  const winnerAbbr = result?.win_probability?.predicted_winner || result?.predicted_winner || (result?.win_probability?.home_win_prob >= 0.5 ? homeInfo.abbr : awayInfo.abbr);
  const winnerInfo = winnerAbbr === homeInfo.abbr ? homeInfo : awayInfo;

  const top4Drivers = winFeatures.slice(0, 4);

  return (
    <div className="surface rounded-[1.5rem] p-5 lg:p-6 border border-slate-200/90 bg-white shadow-sm space-y-6">
      
      {/* ── TOP 4 PREDICTION DRIVERS (Hero Highlight) ── */}
      {top4Drivers.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                <Sparkles size={16} />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider m-0">
                  Modelin Kararını Belirleyen Temel Etkenler
                </h4>
                <p className="text-[10px] text-slate-400 font-medium m-0">
                  Model neden {winnerInfo.name} ({winnerInfo.abbr}) galibiyetini öngörüyor?
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
              SHAP Karar Ağırlıkları
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {top4Drivers.map((f: any, i: number) => {
              const formatted = formatFeatureInsight(f.feature_name, f.value, f.influence, homeInfo, awayInfo);
              const favorsHome = f.influence === "FAVORS_HOME";
              const favorsAway = f.influence === "FAVORS_AWAY";
              const teamColor = favorsHome ? homeInfo.color : favorsAway ? awayInfo.color : "#64748b";
              const teamAbbr = favorsHome ? homeInfo.abbr : favorsAway ? awayInfo.abbr : "NEUT";
              const weightPct = ((Math.abs(f.contribution) / totalWinContrib) * 100).toFixed(1);
              const isSupporting = (favorsHome && winnerAbbr === homeInfo.abbr) || (favorsAway && winnerAbbr === awayInfo.abbr);

              return (
                <div 
                  key={i} 
                  className="relative p-3.5 bg-gradient-to-br from-slate-50/70 to-white border border-slate-200/80 rounded-xl shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between gap-2.5 group"
                  style={{ borderLeft: `4px solid ${teamColor}` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span 
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white shrink-0 shadow-2xs"
                        style={{ backgroundColor: teamColor }}
                      >
                        {i + 1}
                      </span>
                      <div>
                        <h5 className="text-xs font-black text-slate-800 group-hover:text-indigo-600 transition-colors m-0 leading-tight">
                          {formatted.title}
                        </h5>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          {formatted.category}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span 
                        className="text-[9px] font-black px-1.5 py-0.5 rounded font-mono uppercase tracking-wider"
                        style={{ backgroundColor: `${teamColor}15`, color: teamColor }}
                      >
                        {teamAbbr}
                      </span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded font-mono ${
                        isSupporting ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                      }`}>
                        {isSupporting ? "+" : "-"}{weightPct}%
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-650 font-normal leading-relaxed m-0">
                    {formatted.insight}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── XAI DEEP-DIVE TABS ── */}
      <div className="pt-2 border-t border-slate-100 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Cpu className="text-indigo-600" size={16} />
            <div>
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider m-0">
                Açıklanabilir Yapay Zeka (XAI) Model Dağılımı
              </h4>
              <p className="text-[10px] text-slate-400 font-medium m-0">
                Oyun teorisine (Shapley Values) dayalı matematiksel karar faktörleri
              </p>
            </div>
          </div>

          <div className="flex border border-slate-200 bg-slate-50 p-0.5 rounded-xl w-fit gap-0.5">
            <button
              onClick={() => setActiveTab("win")}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-200 ${
                activeTab === "win"
                  ? "bg-white text-indigo-600 shadow-xs border border-slate-200/50"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Kazanma Olasılığı (Win Prob)
            </button>
            <button
              onClick={() => setActiveTab("score")}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-200 ${
                activeTab === "score"
                  ? "bg-white text-indigo-600 shadow-xs border border-slate-200/50"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Skor & Tempo Faktörleri
            </button>
          </div>
        </div>

        {activeTab === "win" && (
          <div className="space-y-5 animate-fade-in">
            {/* Tug-of-war visualization */}
            <div className="bg-slate-50/60 border border-slate-200/70 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h5 className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5 m-0">
                  <Compass size={13} className="text-indigo-500" />
                  Karar Çekişmesi (Feature Tug-of-War)
                </h5>
                <span className="text-[9px] font-bold text-slate-400">Merkez Noktası: Nötr Denge</span>
              </div>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {winFeatures.slice(0, 8).map((f: any, idx: number) => {
                  const formatted = formatFeatureInsight(f.feature_name, f.value, f.influence, homeInfo, awayInfo);
                  const maxContrib = Math.max(...winFeatures.map((x: any) => Math.abs(x.contribution)), 0.1);
                  const pct = Math.min(100, (Math.abs(f.contribution) / maxContrib) * 100);
                  const isHomeFavored = f.contribution > 0;
                  
                  return (
                    <div key={idx} className="flex items-center gap-3 text-xs">
                      <div className="w-36 text-left font-bold text-slate-700 truncate text-[11px]" title={formatted.title}>
                        {formatted.title}
                      </div>
                      <div className="flex-1 h-5 bg-slate-200/70 rounded-full relative overflow-hidden flex items-center">
                        {isHomeFavored ? (
                          <div className="absolute inset-y-0 left-1/2 flex items-center" style={{ width: "50%" }}>
                            <div 
                              className="h-full rounded-r-full transition-all duration-500 shadow-2xs" 
                              style={{ 
                                width: `${pct / 2}%`, 
                                backgroundColor: homeInfo.color 
                              }} 
                            />
                            <span className="text-[9px] font-bold ml-1.5 font-mono" style={{ color: homeInfo.color }}>
                              +{f.contribution.toFixed(3)}
                            </span>
                          </div>
                        ) : (
                          <div className="absolute inset-y-0 right-1/2 flex items-center justify-end" style={{ width: "50%" }}>
                            <span className="text-[9px] font-bold mr-1.5 font-mono" style={{ color: awayInfo.color }}>
                              {f.contribution.toFixed(3)}
                            </span>
                            <div 
                              className="h-full rounded-l-full transition-all duration-500 shadow-2xs" 
                              style={{ 
                                width: `${pct / 2}%`, 
                                backgroundColor: awayInfo.color 
                              }} 
                            />
                          </div>
                        )}
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-400 z-10" />
                      </div>
                      <div className="w-16 text-right font-mono font-bold text-slate-500 text-[11px]">
                        {typeof f.value === "number" ? f.value.toFixed(1) : f.value}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between text-[9px] font-black uppercase tracking-widest pt-2 border-t border-slate-200/70">
                <span className="flex items-center gap-1" style={{ color: awayInfo.color }}>
                  <ArrowDownRight size={12} /> {awayInfo.name} ({awayInfo.abbr}) Lehine
                </span>
                <span className="text-slate-400">Nötr</span>
                <span className="flex items-center gap-1" style={{ color: homeInfo.color }}>
                  {homeInfo.name} ({homeInfo.abbr}) Lehine <ArrowUpRight size={12} />
                </span>
              </div>
            </div>

            {/* Categorized detailed cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.keys(categories).map((catName, idx) => (
                <div key={idx} className="bg-slate-50/50 border border-slate-200/70 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200/70 pb-1.5">
                    <h6 className="text-[10px] font-black text-slate-700 uppercase tracking-wider m-0">
                      {catName}
                    </h6>
                    <span className="text-[9px] font-bold text-slate-400 font-mono">
                      {categories[catName].length} Parametre
                    </span>
                  </div>

                  <div className="space-y-2">
                    {categories[catName].slice(0, 4).map((f: any, fIdx: number) => (
                      <div key={fIdx} className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-650 truncate max-w-[200px]" title={f.formatted.title}>
                          {f.formatted.title}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-700">
                            {typeof f.value === "number" ? f.value.toFixed(1) : f.value}
                          </span>
                          <span 
                            className="px-1.5 py-0.5 rounded font-mono font-black text-[9px]"
                            style={{
                              backgroundColor: f.influence === "FAVORS_HOME" ? `${homeInfo.color}15` : f.influence === "FAVORS_AWAY" ? `${awayInfo.color}15` : "#f1f5f9",
                              color: f.influence === "FAVORS_HOME" ? homeInfo.color : f.influence === "FAVORS_AWAY" ? awayInfo.color : "#64748b"
                            }}
                          >
                            {f.influence === "FAVORS_HOME" ? homeInfo.abbr : f.influence === "FAVORS_AWAY" ? awayInfo.abbr : "NÖTR"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "score" && (
          <div className="space-y-5 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Pace Adjustments */}
              <div className="space-y-3 border border-slate-200/70 rounded-2xl p-4 bg-slate-50/50">
                <div className="flex justify-between items-center border-b border-slate-200/70 pb-1.5">
                  <h6 className="text-[10px] font-black text-slate-700 uppercase tracking-wider m-0">
                    Maç Temposu & Pozisyon Sayısı (Pace)
                  </h6>
                  <span className="text-[10px] font-mono font-black text-indigo-600">
                    Tempo Katkısı
                  </span>
                </div>
                <div className="space-y-2.5">
                  {(scoreExpl?.pace_features || []).slice(0, 5).map((f: any, idx: number) => {
                    const formatted = formatFeatureInsight(f.feature_name, f.value, f.influence, homeInfo, awayInfo);
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-[11px] font-semibold text-slate-650">
                          <span>{formatted.title}</span>
                          <span className="font-mono font-bold" style={{ color: f.contribution >= 0 ? "#10b981" : "#ef4444" }}>
                            {f.contribution >= 0 ? `+${f.contribution.toFixed(2)}` : f.contribution.toFixed(2)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-200/80 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-300"
                            style={{ 
                              width: `${Math.min(100, Math.abs(f.contribution) * 15)}%`,
                              backgroundColor: f.contribution >= 0 ? "#10b981" : "#ef4444",
                              marginLeft: f.contribution < 0 ? "auto" : "0"
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Margin Adjustments */}
              <div className="space-y-3 border border-slate-200/70 rounded-2xl p-4 bg-slate-50/50">
                <div className="flex justify-between items-center border-b border-slate-200/70 pb-1.5">
                  <h6 className="text-[10px] font-black text-slate-700 uppercase tracking-wider m-0">
                    Fark (Margin) & Hücum Verimliliği
                  </h6>
                  <span className="text-[10px] font-mono font-black text-indigo-600">
                    Fark Katkısı
                  </span>
                </div>
                <div className="space-y-2.5">
                  {(scoreExpl?.margin_features || []).slice(0, 5).map((f: any, idx: number) => {
                    const formatted = formatFeatureInsight(f.feature_name, f.value, f.influence, homeInfo, awayInfo);
                    const favorsHome = f.contribution > 0;
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-[11px] font-semibold text-slate-650">
                          <span>{formatted.title}</span>
                          <span className="font-mono font-bold" style={{ color: favorsHome ? homeInfo.color : awayInfo.color }}>
                            {favorsHome ? `+${f.contribution.toFixed(1)} ${homeInfo.abbr}` : `${f.contribution.toFixed(1)} ${awayInfo.abbr}`}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-200/80 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-300"
                            style={{ 
                              width: `${Math.min(100, Math.abs(f.contribution) * 10)}%`,
                              backgroundColor: favorsHome ? homeInfo.color : awayInfo.color,
                              marginLeft: favorsHome ? "0" : "auto"
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
