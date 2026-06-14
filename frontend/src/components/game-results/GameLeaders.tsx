export function GameLeaders({
  leaders,
}: {
  leaders: { points?: any; rebounds?: any; assists?: any } | null | undefined;
}) {
  if (!leaders) return null;

  const items = [
    { label: "Points", data: leaders.points },
    { label: "Rebounds", data: leaders.rebounds },
    { label: "Assists", data: leaders.assists },
  ].filter((item) => item.data && (item.data.player_name || item.data.n));

  if (items.length === 0) return null;

  return (
    <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
      <div className="mb-4">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Game Leaders</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-700">Category leaders</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {items.map((entry) => (
          <div key={entry.label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-400">{entry.label}</p>
            <p className="mt-1.5 text-[13px] font-bold leading-tight text-slate-900">
              {entry.data.player_name || entry.data.n}
            </p>
            {entry.data.value != null && (
              <p className="mt-0.5 text-xl font-black text-[#1d428a]">{entry.data.value}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
