import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { API_BASE_URL } from '../api/predictions';

interface ShapFactor {
  feature: string;
  impact: number;
  direction: 'positive' | 'negative';
  type: 'shap_feature' | 'calibration_adjustment';
}

interface ModelExplanation {
  base_value: number;
  final_prediction: number;
  top_factors: ShapFactor[];
  unit?: string;
  model_type?: string;
}

interface ExplanationResponse {
  home_team: string;
  away_team: string;
  prediction_date: string;
  win_model_explanation: ModelExplanation;
  score_model_explanation: ModelExplanation;
}

interface Props {
  homeTeam: string;
  awayTeam: string;
  predictionDate: string;
}

export default function PredictionExplanation({ homeTeam, awayTeam, predictionDate }: Props) {
  const [data, setData] = useState<ExplanationResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchExplanation() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE_URL}/predict/explain`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            home_team: homeTeam,
            away_team: awayTeam,
            prediction_date: predictionDate,
            model_version: 'v10'
          })
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.detail || errBody.error || `Server error (${res.status})`);
        }
        const json = await res.json();
        setData(json);
      } catch (e: any) {
        setError(e.message || "Açıklama yüklenemedi");
      } finally {
        setLoading(false);
      }
    }
    if (homeTeam && awayTeam && predictionDate) {
      fetchExplanation();
    }
  }, [homeTeam, awayTeam, predictionDate]);

  if (loading) return <div className="p-4 text-sm text-gray-500 animate-pulse">Analyzing model decisions (SHAP)...</div>;
  if (error) return <div className="p-4 text-sm text-red-500">Failed to load explanation: {error}</div>;
  if (!data) return null;

  const formatFeatureName = (name: string) => {
    return name
      .replace(/^HOME_OFF_RTG_/, "")
      .replace(/^PACE_/, "")
      .replace(/^OPP_/, "Rakip ")
      .replace(/^TEAM_/, "Takım ")
      .replace(/_LAST_\d+/, "")
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const renderChart = (title: string, modelData: ModelExplanation, formatVal: (v: number) => string) => {
    const chartData = [...modelData.top_factors].reverse().map(f => ({
      name: formatFeatureName(f.feature),
      rawFeature: f.feature,
      value: f.impact,
      type: f.type,
      direction: f.direction
    }));

    return (
      <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 sm:p-5 flex-1 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-200 m-0">
            {title}
          </h3>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            {modelData.model_type?.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-400 font-mono">
          <span>Baz Değer (Base): <strong className="text-slate-200">{formatVal(modelData.base_value)}</strong></span>
          <span>Kalibre Edilmiş Sonuç: <strong className="text-emerald-400">{formatVal(modelData.final_prediction)}</strong></span>
        </div>

        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={chartData} margin={{ top: 5, right: 20, left: 130, bottom: 5 }}>
              <XAxis type="number" hide />
              <YAxis 
                dataKey="name" 
                type="category" 
                width={130} 
                tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} 
              />
              <Tooltip 
                formatter={(value: any, _name: any, props: any) => {
                  const num = typeof value === "number" ? value : Number(value) || 0;
                  const typeLabel = props?.payload?.type === 'calibration_adjustment' ? ' (Kalibrasyon Etkisi)' : '';
                  return [`${num > 0 ? '+' : ''}${formatVal(num)}${typeLabel}`, 'Etki (Impact)'];
                }}
                labelFormatter={(_label, payload) => payload?.[0]?.payload?.rawFeature || _label}
                contentStyle={{ 
                  backgroundColor: '#0f172a', 
                  borderColor: '#334155', 
                  borderRadius: '0.75rem', 
                  color: '#f8fafc',
                  fontSize: '11px',
                  fontWeight: 600
                }}
              />
              <ReferenceLine x={0} stroke="#475569" strokeDasharray="3 3" />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => {
                  let color = entry.value > 0 ? '#10b981' : '#f43f5e';
                  if (entry.type === 'calibration_adjustment') {
                    color = entry.value > 0 ? '#6366f1' : '#8b5cf6';
                  }
                  return <Cell key={`cell-${index}`} fill={color} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex text-[10px] font-bold space-x-4 pt-2 border-t border-slate-800 justify-center text-slate-400">
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm"></span> Pozitif Katkı</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-rose-500 rounded-sm"></span> Negatif Baskı</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-indigo-500 rounded-sm"></span> Kalibrasyon Düzeltmesi</div>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-[1.5rem] bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-slate-800 p-5 lg:p-6 text-white shadow-xl space-y-5 animate-fade-in-up">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider m-0">
              SHAP Matematiksel Karar Analizi
            </h3>
            <p className="text-[10px] text-slate-400 font-medium m-0">
              Her bir feature'ın modele kattığı pozitif ve negatif marjinal değerler
            </p>
          </div>
        </div>

        <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono">
          TreeSHAP Engine
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {data.win_model_explanation && renderChart(
          "Kazanma Olasılığı Etkenleri",
          data.win_model_explanation,
          (v) => `${(v * 100).toFixed(1)}%`
        )}

        {data.score_model_explanation && renderChart(
          "Skor & Tempo Dinamikleri",
          data.score_model_explanation,
          (v) => `${v.toFixed(1)} pts`
        )}
      </div>
    </div>
  );
}
