import { useState } from "react";
import { ChevronDown, ChevronUp, Cpu } from "lucide-react";

export function ModelDiagnostics({ modelStatus, result }: { modelStatus: any; result: any }) {
  const [open, setOpen] = useState(false);

  if (!modelStatus) return null;

  const winModel = modelStatus.win_model;
  const scoreModel = modelStatus.score_model;

  return (
    <div className="bg-background-primary border border-border rounded p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left cursor-pointer"
        id="diagnostics-toggle"
      >
        <div className="flex items-center gap-2">
          <Cpu size={16} className="text-text-secondary" />
          <span className="text-xs font-semibold text-text-primary">
            Model Tanılama ve Doğrulama
          </span>
        </div>
        {open ? <ChevronUp size={16} className="text-text-secondary" /> : <ChevronDown size={16} className="text-text-secondary" />}
      </button>

      {open && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "ROC-AUC", value: winModel?.metrics?.roc_auc?.toFixed(4) },
            { label: "Doğruluk", value: winModel?.metrics?.accuracy ? `%${(winModel.metrics.accuracy * 100).toFixed(1)}` : null },
            { label: "Model Sürümü", value: result?.win_probability?.model_version },
            { label: "Ev H-MAE", value: scoreModel?.metrics?.home_mae?.toFixed(2) },
            { label: "Dep A-MAE", value: scoreModel?.metrics?.away_mae?.toFixed(2) },
          ]
            .filter((d) => d.value)
            .map((d, i) => (
              <div key={i} className="bg-background-secondary rounded border border-border p-3 text-center">
                <p className="text-xs font-medium text-text-secondary uppercase">{d.label}</p>
                <p className="text-sm font-semibold tabular-nums text-text-primary mt-1">
                  {d.value}
                </p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
