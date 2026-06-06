import React from "react";
import { Cpu, BarChart2, ShieldCheck, Zap, Activity, BookOpen, Play } from "lucide-react";

const FutureModeling: React.FC = () => {
  const futurePhases = [
    {
      title: "Logistic Regression Baseline",
      desc: "Train a simple L1/L2 regularized logistic regression baseline using V1 and V2 pre-game features.",
      icon: <Cpu size={20} />,
      badge: "Milestone 4",
      status: "Planned"
    },
    {
      title: "Random Forest Classifier",
      desc: "Build an ensemble tree model to capture non-linear relationships and schedule rest interactions.",
      icon: <Activity size={20} />,
      badge: "Milestone 4",
      status: "Planned"
    },
    {
      title: "XGBoost Classifier",
      desc: "Implement gradient boosted trees with hyperparameter tuning to achieve state-of-the-art NBA prediction accuracy.",
      icon: <Zap size={20} />,
      badge: "Milestone 4",
      status: "Planned"
    },
    {
      title: "Probability Calibration",
      desc: "Apply Platt Scaling or Isotonic Regression to ensure output prediction probabilities match actual historical win rates.",
      icon: <ShieldCheck size={20} />,
      badge: "Milestone 5",
      status: "Proposed"
    },
    {
      title: "Time-Series Backtesting",
      desc: "Run chronological out-of-sample backtests, simulating bet placements game-by-game over past seasons.",
      icon: <BookOpen size={20} />,
      badge: "Milestone 5",
      status: "Proposed"
    },
    {
      title: "SHAP Feature Importance",
      desc: "Explain model predictions using SHAP values, showing which pre-game factors (e.g. rest days vs core player rating) impact win margins.",
      icon: <BarChart2 size={20} />,
      badge: "Milestone 5",
      status: "Proposed"
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 m-0 uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
          Model Roadmap
        </h1>
        <p className="text-slate-500 mt-1 text-sm">Preview upcoming training algorithms, backtesting simulators, and interpretability pipelines</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {futurePhases.map((phase, idx) => (
          <div key={idx} className="glass-card p-6 rounded-xl relative overflow-hidden group shadow-sm hover:shadow-md transition-all border border-slate-100 bg-white flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div className="p-2.5 bg-slate-100 text-[#1d428a] rounded-lg">
                  {phase.icon}
                </div>
                <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                  phase.status === "Planned" 
                    ? "bg-[#1d428a]/10 text-[#1d428a]" 
                    : "bg-slate-100 text-slate-500"
                }`}>
                  {phase.status}
                </span>
              </div>
              
              <div className="space-y-2">
                <span className="text-[9px] uppercase font-bold tracking-widest text-[#c9082a] font-mono block">
                  {phase.badge}
                </span>
                <h3 className="text-base font-bold text-slate-800 m-0 uppercase tracking-wide" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {phase.title}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed m-0">{phase.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Info footer */}
      <div className="glass-card p-5 rounded-xl border border-blue-200 bg-blue-50/20 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1 text-center md:text-left">
          <p className="text-sm font-bold text-slate-900 m-0">Ready to initiate model training?</p>
          <p className="text-xs text-slate-500 m-0">The V1/V2/V3 pre-game features are clean, formatted, and stored in <code className="bg-slate-100/80 px-1 py-0.5 rounded font-mono text-slate-700 text-[10px]">data/processed/</code>.</p>
        </div>
        
        <div className="flex items-center gap-2 text-xs bg-white text-slate-600 px-3.5 py-2 rounded-lg border border-slate-200 shadow-xs font-medium">
          <Play size={12} className="text-emerald-500 animate-pulse" />
          <span>Pipeline Ready for Modeling</span>
        </div>
      </div>
    </div>
  );
};

export default FutureModeling;
