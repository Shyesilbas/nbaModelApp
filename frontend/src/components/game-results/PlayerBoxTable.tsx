import PlayerPhoto from "../PlayerPhoto";
import type { PlayerBoxScore } from "./types";
import { fmtInt, fmtPair, fmtPct } from "./utils";

const HEAD = "px-2 py-2.5 text-right text-xs font-medium text-text-secondary";

export function PlayerBoxTable({
  players,
}: {
  players: PlayerBoxScore[];
  accent?: string;
}) {
  const sum = (k: keyof PlayerBoxScore) => players.reduce((a, p) => a + (Number(p[k]) || 0), 0);
  const maxOf = (k: keyof PlayerBoxScore) => Math.max(0, ...players.map((p) => Number(p[k]) || 0));
  const maxPts = Math.max(1, maxOf("PTS"));
  const maxReb = maxOf("REB");
  const maxAst = maxOf("AST");

  const cell = (v: number | null | undefined, max: number) =>
    `px-2 py-2 text-right tabular-nums text-xs ${
      v != null && v === max && max > 0 ? "font-semibold text-text-primary" : "text-text-secondary"
    }`;

  return (
    <div className="overflow-x-auto rounded border border-border bg-background-primary">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-background-tertiary">
            <th className="sticky left-0 z-10 min-w-[190px] bg-background-tertiary px-3 py-2.5 text-left text-xs font-medium text-text-secondary">
              Player
            </th>
            {["MIN", "PTS", "REB", "AST", "TOV", "STL", "BLK", "+/-", "FG", "3P", "FT"].map((h) => (
              <th key={h} className={HEAD}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-light">
          {players.length ? (
            players.map((p) => {
              const pm = p.PLUS_MINUS ?? null;
              return (
                <tr key={p.PLAYER_ID} className="group transition-colors hover:bg-background-tertiary">
                  <td className="sticky left-0 z-10 bg-background-primary px-3 py-2 transition-colors group-hover:bg-background-tertiary">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME} size={28} />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-text-primary">{p.PLAYER_NAME}</p>
                        <p className="text-xs text-text-muted">
                          {p.MIN != null ? `${Math.round(p.MIN)} min` : "DNP"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-text-muted">{p.MIN != null ? Math.round(p.MIN) : "—"}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <div className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-background-tertiary sm:block">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${((p.PTS ?? 0) / maxPts) * 100}%` }}
                        />
                      </div>
                      <span className="w-6 text-right text-xs font-semibold tabular-nums text-text-primary">{fmtInt(p.PTS)}</span>
                    </div>
                  </td>
                  <td className={cell(p.REB, maxReb)}>{fmtInt(p.REB)}</td>
                  <td className={cell(p.AST, maxAst)}>{fmtInt(p.AST)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">{fmtInt(p.TOV)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">{fmtInt(p.STL)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">{fmtInt(p.BLK)}</td>
                  <td className="px-2 py-2 text-right">
                    <span
                      className={`tabular-nums text-xs ${
                        pm == null
                          ? "text-text-muted"
                          : pm > 0
                            ? "font-medium text-status-success"
                            : pm < 0
                              ? "font-medium text-status-error"
                              : "text-text-secondary"
                      }`}
                    >
                      {pm == null ? "—" : pm > 0 ? `+${pm}` : pm}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">
                    {fmtPair(p.FGM ?? null, p.FGA ?? null)}
                    <span className="ml-1 text-xs text-text-muted">{fmtPct(p.FG_PCT)}</span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">
                    {fmtPair(p.FG3M ?? null, p.FG3A ?? null)}
                    <span className="ml-1 text-xs text-text-muted">{fmtPct(p.FG3_PCT)}</span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">
                    {fmtPair(p.FTM ?? null, p.FTA ?? null)}
                    <span className="ml-1 text-xs text-text-muted">{fmtPct(p.FT_PCT)}</span>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={12} className="px-3 py-6 text-center text-xs text-text-muted">
                No player rows for this side.
              </td>
            </tr>
          )}
        </tbody>
        {players.length > 0 && (
          <tfoot>
            <tr className="border-t border-border bg-background-tertiary">
              <td className="sticky left-0 z-10 bg-background-tertiary px-3 py-2.5 text-xs font-semibold text-text-primary">Team totals</td>
              <td />
              <td className="px-2 py-2.5 text-right text-xs font-semibold tabular-nums text-text-primary">{sum("PTS")}</td>
              <td className="px-2 py-2.5 text-right text-xs font-medium tabular-nums text-text-primary">{sum("REB")}</td>
              <td className="px-2 py-2.5 text-right text-xs font-medium tabular-nums text-text-primary">{sum("AST")}</td>
              <td className="px-2 py-2.5 text-right text-xs font-medium tabular-nums text-text-primary">{sum("TOV")}</td>
              <td className="px-2 py-2.5 text-right text-xs font-medium tabular-nums text-text-primary">{sum("STL")}</td>
              <td className="px-2 py-2.5 text-right text-xs font-medium tabular-nums text-text-primary">{sum("BLK")}</td>
              <td />
              <td className="px-2 py-2.5 text-right text-xs font-medium tabular-nums text-text-secondary">{sum("FGM")}-{sum("FGA")}</td>
              <td className="px-2 py-2.5 text-right text-xs font-medium tabular-nums text-text-secondary">{sum("FG3M")}-{sum("FG3A")}</td>
              <td className="px-2 py-2.5 text-right text-xs font-medium tabular-nums text-text-secondary">{sum("FTM")}-{sum("FTA")}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
