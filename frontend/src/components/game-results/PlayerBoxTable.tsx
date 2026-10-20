import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import PlayerPhoto from "../PlayerPhoto";
import type { PlayerBoxScore } from "./types";
import { fmtInt, fmtPair, fmtPct, parseMinutes } from "./utils";

const STAT_COLUMNS = [
  { key: "MIN", label: "MIN" },
  { key: "PTS", label: "PTS" },
  { key: "REB", label: "REB" },
  { key: "AST", label: "AST" },
  { key: "TOV", label: "TOV" },
  { key: "STL", label: "STL" },
  { key: "BLK", label: "BLK" },
  { key: "+/-", label: "+/-" },
  { key: "FG", label: "FG" },
  { key: "3P", label: "3P" },
  { key: "FT", label: "FT" },
] as const;

type LoosePlayer = PlayerBoxScore & {
  min?: number | string | null;
  pts?: number | null;
  reb?: number | null;
  ast?: number | null;
  tov?: number | null;
  stl?: number | null;
  blk?: number | null;
  plus_minus?: number | null;
  fg_pct?: number | null;
  fg3_pct?: number | null;
  ft_pct?: number | null;
  player_name?: string | null;
};

export function PlayerBoxTable({
  players,
}: {
  players: PlayerBoxScore[];
  accent?: string;
}) {
  const [sortCol, setSortCol] = useState<string>("MIN");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir(col === "Player" ? "asc" : "desc");
    }
  };

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const pA = a as LoosePlayer;
      const pB = b as LoosePlayer;

      let diff = 0;
      if (sortCol === "Player") {
        const nameA = pA.PLAYER_NAME ?? pA.player_name ?? "";
        const nameB = pB.PLAYER_NAME ?? pB.player_name ?? "";
        diff = nameA.localeCompare(nameB);
      } else if (sortCol === "MIN") {
        diff = parseMinutes(pA.MIN ?? pA.min) - parseMinutes(pB.MIN ?? pB.min);
      } else if (sortCol === "PTS") {
        diff = (Number(pA.PTS ?? pA.pts) || 0) - (Number(pB.PTS ?? pB.pts) || 0);
      } else if (sortCol === "REB") {
        diff = (Number(pA.REB ?? pA.reb) || 0) - (Number(pB.REB ?? pB.reb) || 0);
      } else if (sortCol === "AST") {
        diff = (Number(pA.AST ?? pA.ast) || 0) - (Number(pB.AST ?? pB.ast) || 0);
      } else if (sortCol === "TOV") {
        diff = (Number(pA.TOV ?? pA.tov) || 0) - (Number(pB.TOV ?? pB.tov) || 0);
      } else if (sortCol === "STL") {
        diff = (Number(pA.STL ?? pA.stl) || 0) - (Number(pB.STL ?? pB.stl) || 0);
      } else if (sortCol === "BLK") {
        diff = (Number(pA.BLK ?? pA.blk) || 0) - (Number(pB.BLK ?? pB.blk) || 0);
      } else if (sortCol === "+/-") {
        diff = (Number(pA.PLUS_MINUS ?? pA.plus_minus) || 0) - (Number(pB.PLUS_MINUS ?? pB.plus_minus) || 0);
      } else if (sortCol === "FG") {
        diff = (Number(pA.FG_PCT ?? pA.fg_pct) || 0) - (Number(pB.FG_PCT ?? pB.fg_pct) || 0);
      } else if (sortCol === "3P") {
        diff = (Number(pA.FG3_PCT ?? pA.fg3_pct) || 0) - (Number(pB.FG3_PCT ?? pB.fg3_pct) || 0);
      } else if (sortCol === "FT") {
        diff = (Number(pA.FT_PCT ?? pA.ft_pct) || 0) - (Number(pB.FT_PCT ?? pB.ft_pct) || 0);
      }

      if (diff !== 0) {
        return sortDir === "asc" ? diff : -diff;
      }

      // Tie-breaker: minutes descending, then PTS descending, then name
      const minDiff = parseMinutes(pB.MIN ?? pB.min) - parseMinutes(pA.MIN ?? pA.min);
      if (minDiff !== 0) return minDiff;
      const ptsDiff = (Number(pB.PTS ?? pB.pts) || 0) - (Number(pA.PTS ?? pA.pts) || 0);
      if (ptsDiff !== 0) return ptsDiff;
      const nameA = pA.PLAYER_NAME ?? pA.player_name ?? "";
      const nameB = pB.PLAYER_NAME ?? pB.player_name ?? "";
      return nameA.localeCompare(nameB);
    });
  }, [players, sortCol, sortDir]);

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
            <th
              onClick={() => handleSort("Player")}
              className="sticky left-0 z-10 min-w-[190px] cursor-pointer bg-background-tertiary px-3 py-2.5 text-left text-xs font-medium text-text-secondary select-none transition-colors hover:text-text-primary"
            >
              <div className="flex items-center gap-1">
                <span className={sortCol === "Player" ? "font-semibold text-text-primary" : ""}>Player</span>
                {sortCol === "Player" && (
                  sortDir === "asc" ? <ChevronUp size={12} className="text-primary" /> : <ChevronDown size={12} className="text-primary" />
                )}
              </div>
            </th>
            {STAT_COLUMNS.map(({ key, label }) => {
              const isActive = sortCol === key;
              return (
                <th
                  key={key}
                  onClick={() => handleSort(key)}
                  className={`px-2 py-2.5 text-right text-xs font-medium cursor-pointer select-none transition-colors hover:text-text-primary ${
                    isActive ? "font-semibold text-text-primary" : "text-text-secondary"
                  }`}
                >
                  <div className="inline-flex items-center justify-end gap-0.5">
                    <span>{label}</span>
                    {isActive && (
                      sortDir === "asc" ? <ChevronUp size={12} className="text-primary" /> : <ChevronDown size={12} className="text-primary" />
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-light">
          {sortedPlayers.length ? (
            sortedPlayers.map((p) => {
              const pm = p.PLUS_MINUS ?? null;
              const pMin = parseMinutes(p.MIN ?? (p as LoosePlayer).min);
              return (
                <tr key={p.PLAYER_ID} className="group transition-colors hover:bg-background-tertiary">
                  <td className="sticky left-0 z-10 bg-background-primary px-3 py-2 transition-colors group-hover:bg-background-tertiary">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME} size={28} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-xs font-medium text-text-primary">
                          {p.PLAYER_NAME}
                          {p.IS_STARTER === 1 && (
                            <span
                              title="Starter"
                              className="rounded bg-primary/15 px-1 text-[10px] font-semibold leading-4 text-primary"
                            >
                              S
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-text-muted">
                          {pMin >= 0 ? `${Math.round(pMin)} min` : "DNP"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-text-muted">{pMin >= 0 ? Math.round(pMin) : "—"}</td>
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
