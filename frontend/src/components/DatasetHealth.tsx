import React from "react";
import { CheckCircle, XCircle, AlertTriangle, AlertCircle } from "lucide-react";

interface FileStatus {
  name: string;
  path: string;
  exists: boolean;
  rows: number;
  columns: number;
  size_kb: number;
}

interface DatasetHealthProps {
  filesStatus: FileStatus[] | null;
}

const DatasetHealth: React.FC<DatasetHealthProps> = ({ filesStatus }) => {
  if (!filesStatus) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Glow */}
      <div className="glow-bg bottom-12 left-10"></div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white m-0">Dataset Health Audit</h1>
        <p className="text-slate-400 mt-1 text-sm">Verify preprocessed shapes, file existences, and leakage risks</p>
      </div>

      {/* File Status List */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800/60 bg-slate-900/40">
          <h2 className="text-base font-semibold text-white m-0">Pipeline Files Verification</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="p-4">Dataset Name</th>
                <th className="p-4">File Path</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 text-right">Row Count</th>
                <th className="p-4 text-right">Col Count</th>
                <th className="p-4 text-right">File Size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filesStatus.map((file, idx) => (
                <tr key={idx} className="hover:bg-slate-900/30 transition-colors">
                  <td className="p-4 font-semibold text-white">{file.name}</td>
                  <td className="p-4 font-mono text-xs text-slate-500">{file.path}</td>
                  <td className="p-4 text-center">
                    {file.exists ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle size={12} />
                        Found
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        <XCircle size={12} />
                        Missing
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right font-mono">{file.exists ? file.rows.toLocaleString() : "-"}</td>
                  <td className="p-4 text-right font-mono">{file.exists ? file.columns.toLocaleString() : "-"}</td>
                  <td className="p-4 text-right font-mono">{file.exists ? `${file.size_kb.toLocaleString()} KB` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Warnings & Integrity Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Warning 1 */}
        <div className="glass-card p-5 rounded-xl border-amber-500/25 bg-amber-950/5 space-y-3">
          <div className="flex items-center gap-2 text-amber-400 font-semibold">
            <AlertTriangle size={18} />
            <h3 className="text-white text-sm m-0">Core Availability Leakage</h3>
          </div>
          <p className="text-slate-300 text-xs leading-relaxed">
            The Top 3 and Top 5 player availability columns track the attendance and playing time of the core players in the current game being predicted. 
          </p>
          <p className="text-slate-300 text-xs leading-relaxed">
            Since this data is only finalized after tip-off, it acts as an analytical proxy. **Do not use in production pre-game deployment** without replacing them with starting projections or injury news.
          </p>
        </div>

        {/* Warning 2 */}
        <div className="glass-card p-5 rounded-xl border-amber-500/25 bg-amber-950/5 space-y-3">
          <div className="flex items-center gap-2 text-amber-400 font-semibold">
            <AlertCircle size={18} />
            <h3 className="text-white text-sm m-0">No Model Trained Yet</h3>
          </div>
          <p className="text-slate-300 text-xs leading-relaxed">
            The model-ready datasets V1, V2, and V3 have been compiled and structured successfully under <code>data/processed/</code>. 
          </p>
          <p className="text-slate-300 text-xs leading-relaxed">
            However, **no machine learning models have been trained or evaluated yet**. This project is currently in the feature-engineering and validation stage to guarantee data purity.
          </p>
        </div>

        {/* Warning 3 */}
        <div className="glass-card p-5 rounded-xl border-cyan-500/20 bg-cyan-950/5 space-y-3">
          <div className="flex items-center gap-2 text-cyan-400 font-semibold">
            <CheckCircle size={18} />
            <h3 className="text-white text-sm m-0">Data Integrity Checks</h3>
          </div>
          <p className="text-slate-300 text-xs leading-relaxed">
            Standard checks confirm that:
          </p>
          <ul className="space-y-1.5 text-slate-300 text-xs list-disc pl-4">
            <li>Duplicate records in player names are normalized.</li>
            <li>No overlaps or multiple name representations exist for single <code>Player_ID</code> keys.</li>
            <li>Chronological sorting ensures rest offsets are correct.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DatasetHealth;
