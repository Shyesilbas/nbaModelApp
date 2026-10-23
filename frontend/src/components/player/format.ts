export const fmtPct = (v: number | null | undefined) =>
  v != null ? `${(v * 100).toFixed(1)}%` : "—";
export const fmtStat = (v: number | null | undefined, dec = 1) =>
  v != null ? v.toFixed(dec) : "—";
