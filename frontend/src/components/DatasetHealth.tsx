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
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-[#1d428a]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 px-6 py-6 shadow-sm">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">
            <CheckCircle size={11} />
            Pipeline health
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 m-0 uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Data Quality Control
          </h1>
          <p className="text-slate-500 mt-1 text-sm">Verify preprocessed shapes, file existences, and data integrity metrics.</p>
        </div>
      </section>

      {/* File Status List */}
      <div className="glass-card rounded-[1.5rem] overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 m-0 uppercase tracking-wide" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Pipeline Files Verification
          </h2>
          <span className="text-xs bg-[#1d428a]/10 text-[#1d428a] px-2 py-0.5 rounded font-bold font-mono">
            {filesStatus.length} Checked
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="sticky top-0 bg-slate-50 text-slate-400 text-xs uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="p-4">Dataset Name</th>
                <th className="p-4">File Path</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 text-right">Row Count</th>
                <th className="p-4 text-right">Col Count</th>
                <th className="p-4 text-right">File Size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filesStatus.map((file, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-bold text-slate-800">{file.name}</td>
                  <td className="p-4 font-mono text-xs text-slate-400 max-w-[320px] truncate">{file.path}</td>
                  <td className="p-4 text-center">
                    {file.exists ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
                        <CheckCircle size={12} />
                        Found
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold bg-rose-50 text-rose-600 border border-rose-100">
                        <XCircle size={12} />
                        Missing
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right font-mono text-slate-700 font-semibold">{file.exists ? file.rows.toLocaleString() : "-"}</td>
                  <td className="p-4 text-right font-mono text-slate-700 font-semibold">{file.exists ? file.columns.toLocaleString() : "-"}</td>
                  <td className="p-4 text-right font-mono text-slate-700 font-semibold">{file.exists ? `${file.size_kb.toLocaleString()} KB` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Warnings & Integrity Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Warning 1 */}
        <div className="glass-card p-5 rounded-[1.5rem] border border-amber-200 bg-amber-50/30 space-y-3 shadow-sm">
          <div className="flex items-center gap-2 text-amber-600 font-bold">
            <AlertTriangle size={18} />
            <h3 className="text-slate-900 text-sm m-0 uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Core Availability Leakage
            </h3>
          </div>
          <p className="text-slate-600 text-xs leading-relaxed">
            The Top 3 and Top 5 player availability columns track the attendance and playing time of the core players in the current game being predicted.
          </p>
          <p className="text-slate-600 text-xs leading-relaxed">
            Since this data is only finalized after tip-off, it acts as an analytical proxy. <strong>Do not use in production pre-game deployment</strong> without replacing them with starting projections or injury news.
          </p>
        </div>

        {/* Warning 2 */}
        <div className="glass-card p-5 rounded-[1.5rem] border border-amber-200 bg-amber-50/30 space-y-3 shadow-sm">
          <div className="flex items-center gap-2 text-amber-600 font-bold">
            <AlertCircle size={18} />
            <h3 className="text-slate-900 text-sm m-0 uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              No Model Trained Yet
            </h3>
          </div>
          <p className="text-slate-600 text-xs leading-relaxed">
            The model-ready datasets V1, V2, and V3 have been compiled and structured successfully under <code className="bg-slate-100/80 px-1 py-0.5 rounded font-mono text-slate-700 text-[10px]">data/processed/</code>.
          </p>
          <p className="text-slate-600 text-xs leading-relaxed">
            However, <strong>no machine learning models have been trained or evaluated yet</strong>. This project is currently in the feature-engineering and validation stage to guarantee data purity.
          </p>
        </div>

        {/* Warning 3 */}
        <div className="glass-card p-5 rounded-[1.5rem] border border-blue-200 bg-blue-50/30 space-y-3 shadow-sm">
          <div className="flex items-center gap-2 text-blue-600 font-bold">
            <CheckCircle size={18} />
            <h3 className="text-slate-900 text-sm m-0 uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Data Integrity Checks
            </h3>
          </div>
          <p className="text-slate-600 text-xs leading-relaxed">
            Standard checks confirm that:
          </p>
          <ul className="space-y-1.5 text-slate-600 text-xs list-disc pl-4">
            <li>Duplicate records in player names are normalized.</li>
            <li>No overlaps or multiple name representations exist for single <code className="bg-slate-100/80 px-1 py-0.5 rounded font-mono text-slate-700 text-[10px]">Player_ID</code> keys.</li>
            <li>Chronological sorting ensures rest offsets are correct.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DatasetHealth;
