export function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-full px-5 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-all duration-200",
        active
          ? "bg-[#1d428a] text-white shadow-md shadow-[#1d428a]/20"
          : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
