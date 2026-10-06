import { Shield, Award } from "lucide-react";
import type { ParsedOfficial } from "./utils";

export function OfficialsCard({
  officials,
  className,
}: {
  officials: ParsedOfficial[];
  className?: string;
}) {
  if (!officials || officials.length === 0) {
    return null;
  }

  return (
    <div className={`rounded-[1.5rem] border border-slate-200/80 bg-white p-5 sm:p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)] ${className || ""}`}>
      <div className="flex items-center justify-between mb-4 border-b border-slate-100/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
            <Shield size={15} />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">Hakem Kadrosu</p>
            <h3 className="text-sm font-bold text-slate-900">Resmi Karşılaşma Hakemleri</h3>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100/90 border border-slate-200/70 px-2.5 py-1 rounded-full">
          <Award size={11} className="text-slate-500" />
          {officials.length} Hakem Atandı
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
        {officials.map((o, idx) => (
          <div
            key={idx}
            className="group relative flex items-center gap-3.5 rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50/80 to-white p-3.5 transition-all hover:border-slate-300 hover:shadow-xs"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 font-mono text-sm font-black text-white shadow-sm transition-transform group-hover:scale-105">
              {o.jerseyNum ? `#${o.jerseyNum}` : `#${idx + 1}`}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-900 truncate tracking-tight">{o.cleanName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <p className="text-[10px] font-medium text-slate-500">{o.role}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
