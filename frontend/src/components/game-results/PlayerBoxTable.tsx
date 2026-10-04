import PlayerPhoto from "../PlayerPhoto";
import type { PlayerBoxScore } from "./types";
import { fmtInt, fmtPair, fmtPct } from "./utils";

const HEAD = "px-2 py-3 text-right text-[9px] font-black uppercase tracking-[0.2em] text-slate-500";

export function PlayerBoxTable({
  players,
  accent,
}: {
  players: PlayerBoxScore[];
  accent: string;
}) {
  const sum = (k: keyof PlayerBoxScore) => players.reduce((a, p) => a + (Number(p[k]) || 0), 0);
  const maxOf = (k: keyof PlayerBoxScore) => Math.max(0, ...players.map((p) => Number(p[k]) || 0));
  const maxPts = Math.max(1, maxOf("PTS"));
  const maxReb = maxOf("REB");
  const maxAst = maxOf("AST");

  const cell = (v: number | null | undefined, max: number) =>
    `px-2 py-2.5 text-right tabular-nums ${
      v != null && v === max && max > 0 ? "font-black text-slate-900" : "font-medium text-slate-600"
    }`;

  return (
    <div
      className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"
      style={{ borderTop: `3px solid ${accent}` }}
    >
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50/80">
            <th className="sticky left-0 z-10 min-w-[190px] bg-slate-50 px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
              Player
            </th>
            {["MIN", "PTS", "FG", "3P", "FT", "REB", "AST", "STL", "BLK", "TOV", "+/-"].map((h) => (
              <th key={h} className={HEAD}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.length ? (
            players.map((p, idx) => {
              const pm = p.PLUS_MINUS ?? null;
              const bg = idx % 2 ? "bg-slate-50/40" : "bg-white";
              return (
                <tr key={p.PLAYER_ID} className={`group border-t border-slate-100 transition-colors hover:bg-slate-50 ${bg}`}>
                  <td className={`sticky left-0 z-10 px-3 py-2.5 group-hover:bg-slate-50 ${bg}`}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME} size={28} />
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-bold text-slate-800">{p.PLAYER_NAME}</p>
                        <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">
                          {p.MIN != null ? `${Math.round(p.MIN)} min` : "DNP"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-500">{p.MIN != null ? Math.round(p.MIN) : "—"}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <div className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-slate-100 sm:block">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${((p.PTS ?? 0) / maxPts) * 100}%`, backgroundColor: accent }}
                        />
                      </div>
                      <span className="w-6 text-right text-[13px] font-black tabular-nums text-slate-900">{fmtInt(p.PTS)}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">
                    {fmtPair(p.FGM ?? null, p.FGA ?? null)}
                    <span className="ml-1 text-[9px] text-slate-400">{fmtPct(p.FG_PCT)}</span>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">
                    {fmtPair(p.FG3M ?? null, p.FG3A ?? null)}
                    <span className="ml-1 text-[9px] text-slate-400">{fmtPct(p.FG3_PCT)}</span>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">
                    {fmtPair(p.FTM ?? null, p.FTA ?? null)}
                    <span className="ml-1 text-[9px] text-slate-400">{fmtPct(p.FT_PCT)}</span>
                  </td>
                  <td className={cell(p.REB, maxReb)}>{fmtInt(p.REB)}</td>
                  <td className={cell(p.AST, maxAst)}>{fmtInt(p.AST)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{fmtInt(p.STL)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{fmtInt(p.BLK)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{fmtInt(p.TOV)}</td>
                  <td className="px-2 py-2.5 text-right">
                    <span
                      className={`inline-block min-w-[2.2rem] rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                        pm == null
                          ? "text-slate-400"
                          : pm > 0
                            ? "bg-emerald-50 text-emerald-700"
                            : pm < 0
                              ? "bg-rose-50 text-rose-600"
                              : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {pm == null ? "—" : pm > 0 ? `+${pm}` : pm}
                    </span>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={12} className="border-t border-slate-100 px-3 py-6 text-center text-sm text-slate-400">
                No player rows for this side.
              </td>
            </tr>
          )}
        </tbody>
        {players.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50">
              <td className="sticky left-0 z-10 bg-slate-50 px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Team totals</td>
              <td />
              <td className="px-2 py-3 text-right text-[13px] font-black tabular-nums text-slate-900">{sum("PTS")}</td>
              <td className="px-2 py-3 text-right text-[11px] font-bold tabular-nums text-slate-700">{sum("FGM")}-{sum("FGA")}</td>
              <td className="px-2 py-3 text-right text-[11px] font-bold tabular-nums text-slate-700">{sum("FG3M")}-{sum("FG3A")}</td>
              <td className="px-2 py-3 text-right text-[11px] font-bold tabular-nums text-slate-700">{sum("FTM")}-{sum("FTA")}</td>
              <td className="px-2 py-3 text-right text-[11px] font-bold tabular-nums text-slate-700">{sum("REB")}</td>
              <td className="px-2 py-3 text-right text-[11px] font-bold tabular-nums text-slate-700">{sum("AST")}</td>
              <td className="px-2 py-3 text-right text-[11px] font-bold tabular-nums text-slate-700">{sum("STL")}</td>
              <td className="px-2 py-3 text-right text-[11px] font-bold tabular-nums text-slate-700">{sum("BLK")}</td>
              <td className="px-2 py-3 text-right text-[11px] font-bold tabular-nums text-slate-700">{sum("TOV")}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
