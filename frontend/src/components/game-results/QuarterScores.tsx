export function QuarterScores({
  homeAbbr,
  awayAbbr,
  homeQS,
  awayQS,
}: {
  homeAbbr: string;
  awayAbbr: string;
  homeQS: number[] | null | undefined;
  awayQS: number[] | null | undefined;
}) {
  if (!Array.isArray(homeQS) || !Array.isArray(awayQS) || (homeQS.length === 0 && awayQS.length === 0)) return null;

  const quarters = Math.max(homeQS.length, awayQS.length);
  const cols = Array.from({ length: quarters }, (_, i) => i);

  return (
    <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
      <div className="mb-4">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Quarter Scores</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="pb-2 text-left text-[9px] font-black uppercase tracking-[0.24em] text-slate-400 w-16">Team</th>
              {cols.map((i) => (
                <th key={i} className="pb-2 text-center text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">
                  Q{i + 1}
                </th>
              ))}
              <th className="pb-2 text-center text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="py-2 text-left text-[10px] font-black text-[#1d428a]">{homeAbbr}</td>
              {cols.map((i) => (
                <td key={i} className="py-2 text-center font-semibold text-slate-700">{homeQS[i] ?? "-"}</td>
              ))}
              <td className="py-2 text-center font-black text-slate-900">{homeQS.reduce((a, b) => a + b, 0)}</td>
            </tr>
            <tr>
              <td className="py-2 text-left text-[10px] font-black text-[#c9082a]">{awayAbbr}</td>
              {cols.map((i) => (
                <td key={i} className="py-2 text-center font-semibold text-slate-700">{awayQS[i] ?? "-"}</td>
              ))}
              <td className="py-2 text-center font-black text-slate-900">{awayQS.reduce((a, b) => a + b, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
