import { useState } from "react";
import { ChevronDown, ChevronUp, Cpu } from "lucide-react";

export function ModelDiagnostics({ modelStatus, result }: { modelStatus: any; result: any }) {
  const [open, setOpen] = useState(false);

  if (!modelStatus) return null;

  const winModel = modelStatus.win_model;
  const scoreModel = modelStatus.score_model;

  return (
    <div className="diagnostics-card animate-fade-in-up stagger-8">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
        id="diagnostics-toggle"
      >
        <div className="flex items-center gap-2">
          <Cpu size={13} className="text-slate-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Model Diagnostics</span>
        </div>
        {open ? <ChevronUp size={14} className="text-slate-300" /> : <ChevronDown size={14} className="text-slate-300" />}
      </button>

      {open && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 animate-fade-in">
          {[
            { label: "ROC-AUC", value: winModel?.metrics?.roc_auc?.toFixed(4), color: "#10b981" },
            { label: "Accuracy", value: winModel?.metrics?.accuracy ? `${(winModel.metrics.accuracy * 100).toFixed(1)}%` : null, color: "#3b82f6" },
            { label: "Win Model", value: result?.win_probability?.model_version ? (result.win_probability.model_version.startsWith("v") ? result.win_probability.model_version : `v${result.win_probability.model_version}`) : "v6.0", color: "#8b5cf6" },
            { label: "Score H-MAE", value: scoreModel?.metrics?.home_mae?.toFixed(2), color: "#f59e0b" },
            { label: "Score A-MAE", value: scoreModel?.metrics?.away_mae?.toFixed(2), color: "#f97316" },
          ]
            .filter((d) => d.value)
            .map((d, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200/60 p-3 text-center">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{d.label}</p>
                <p className="text-sm font-black font-mono mt-1" style={{ color: d.color }}>
                  {d.value}
                </p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
