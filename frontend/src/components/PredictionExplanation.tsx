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
        const res = await fetch(`${API_BASE_URL}/predict/explain`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            home_team: homeTeam,
            away_team: awayTeam,
            prediction_date: predictionDate,
            model_version: 'v9'
          })
        });
        if (!res.ok) throw new Error('Failed to load explanation');
        const json = await res.json();
        setData(json);
      } catch (e: any) {
        setError(e.message);
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

  const renderChart = (title: string, modelData: ModelExplanation, formatVal: (v: number) => string) => {
    // We reverse so the highest absolute impact is at the top of a horizontal bar chart
    const chartData = [...modelData.top_factors].reverse().map(f => ({
      name: f.feature,
      value: f.impact,
      type: f.type,
      direction: f.direction
    }));

    const chartTitle = modelData.model_type 
      ? `${title} (${modelData.model_type.toUpperCase()})` 
      : title;

    return (
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-2">{chartTitle}</h3>
        <div className="text-sm text-gray-400 mb-4 flex space-x-4">
          <span>Base Value: <strong className="text-white">{formatVal(modelData.base_value)}</strong></span>
          <span>Final Calibrated: <strong className="text-white">{formatVal(modelData.final_prediction)}</strong></span>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={chartData} margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <Tooltip 
                formatter={(value: number, _name: string, props: any) => {
                  const typeLabel = props.payload.type === 'calibration_adjustment' ? ' (Ridge/Isotonic Adj)' : '';
                  return [`${value > 0 ? '+' : ''}${formatVal(value)}${typeLabel}`, 'Impact'];
                }}
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '0.5rem', color: '#f3f4f6' }}
              />
              <ReferenceLine x={0} stroke="#4b5563" />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => {
                  let color = entry.value > 0 ? '#10b981' : '#ef4444'; // green or red
                  if (entry.type === 'calibration_adjustment') {
                    color = entry.value > 0 ? '#3b82f6' : '#8b5cf6'; // blue/purple for calibration
                  }
                  return <Cell key={`cell-${index}`} fill={color} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex text-xs space-x-4 mt-2 justify-center">
          <div className="flex items-center"><div className="w-3 h-3 bg-emerald-500 rounded-sm mr-1"></div> Positive Impact</div>
          <div className="flex items-center"><div className="w-3 h-3 bg-red-500 rounded-sm mr-1"></div> Negative Impact</div>
          <div className="flex items-center"><div className="w-3 h-3 bg-blue-500 rounded-sm mr-1"></div> Calibration (+/+)</div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 mt-6">
      <div className="mb-4 border-b border-gray-700 pb-2">
        <h2 className="text-xl font-bold text-gray-100 flex items-center">
          <svg className="w-5 h-5 mr-2 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          AI Decision Explanation (SHAP)
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Displays the top features influencing the raw model before and after mathematical calibration.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {data.win_model_explanation && renderChart(
          "Win Probability Drivers (Home)", 
          data.win_model_explanation, 
          (v) => (v * 100).toFixed(1) + '%'
        )}
        
        {data.score_model_explanation && renderChart(
          "Pace & Score Drivers", 
          data.score_model_explanation, 
          (v) => {
            const unit = data.score_model_explanation.unit || "pts";
            const unitStr = unit === "pace" ? " possessions" : (unit === "probability" ? "%" : ` ${unit}`);
            return v.toFixed(2) + unitStr;
          }
        )}
      </div>
    </div>
  );
}
