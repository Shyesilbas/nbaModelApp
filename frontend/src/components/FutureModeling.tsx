import React from "react";
import { Lock, Cpu, BarChart2, ShieldCheck, Zap, Activity, BookOpen } from "lucide-react";

const FutureModeling: React.FC = () => {
  const futurePhases = [
    {
      title: "Logistic Regression Baseline",
      desc: "Train a simple L1/L2 regularized logistic regression baseline using V1 and V2 pre-game features.",
      icon: <Cpu size={24} />,
      badge: "Phase 4 - Coming Soon"
    },
    {
      title: "Random Forest Classifier",
      desc: "Build an ensemble tree model to capture non-linear relationships and schedule rest interactions.",
      icon: <Activity size={24} />,
      badge: "Phase 4 - Coming Soon"
    },
    {
      title: "XGBoost Classifier",
      desc: "Implement gradient boosted trees with hyperparameter tuning to achieve state-of-the-art NBA prediction accuracy.",
      icon: <Zap size={24} />,
      badge: "Phase 4 - Coming Soon"
    },
    {
      title: "Probability Calibration",
      desc: "Apply Platt Scaling or Isotonic Regression to ensure output prediction probabilities match actual historical win rates.",
      icon: <ShieldCheck size={24} />,
      badge: "Phase 5 - Coming Soon"
    },
    {
      title: "Time-Series Backtesting",
      desc: "Run chronological out-of-sample backtests, simulating bet placements game-by-game over past seasons.",
      icon: <BookOpen size={24} />,
      badge: "Phase 5 - Coming Soon"
    },
    {
      title: "SHAP Feature Importance",
      desc: "Explain model predictions using SHAP values, showing which pre-game factors (e.g. rest days vs core player rating) impact win margins.",
      icon: <BarChart2 size={24} />,
      badge: "Phase 5 - Coming Soon"
    }
  ];

  return (
    <div className="space-y-6">
      {/* Glow */}
      <div className="glow-bg top-0 right-1/4"></div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white m-0">Future Modeling Laboratory</h1>
        <p className="text-slate-400 mt-1 text-sm">Preview upcoming training algorithms, backtesting simulators, and interpretability pipelines</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {futurePhases.map((phase, idx) => (
          <div key={idx} className="glass-card p-6 rounded-xl relative overflow-hidden group border border-slate-900/60 opacity-60">
            {/* Blurry layer */}
            <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] group-hover:backdrop-blur-none transition-all duration-300"></div>
            
            {/* Lock icon overlay */}
            <div className="absolute top-4 right-4 p-1.5 bg-slate-800 text-slate-400 rounded-lg flex items-center justify-center">
              <Lock size={14} />
            </div>

            <div className="relative z-10 space-y-4">
              <div className="p-3 bg-slate-800/80 text-slate-400 w-fit rounded-lg">
                {phase.icon}
              </div>
              
              <div className="space-y-2">
                <span className="text-[9px] uppercase font-bold tracking-widest text-nba-gold">
                  {phase.badge}
                </span>
                <h3 className="text-base font-bold text-slate-300 m-0">{phase.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed m-0">{phase.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Info footer */}
      <div className="glass-card p-5 rounded-xl border-cyan-500/10 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center md:text-left">
          <p className="text-sm font-bold text-white m-0">Ready to start training models?</p>
          <p className="text-xs text-slate-400 m-0">The V1/V2/V3 pre-game features are clean, formatted, and ready for sklearn/xgboost.</p>
        </div>
        <button 
          disabled
          className="px-4 py-2 bg-slate-800 border border-slate-700 text-slate-400 text-xs font-bold rounded-lg cursor-not-allowed"
        >
          Model Training Locked
        </button>
      </div>
    </div>
  );
};

export default FutureModeling;
