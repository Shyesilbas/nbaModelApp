import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import PlayerPhoto from "../PlayerPhoto";
import type { PlayerBoxScore } from "./types";
import { fmtInt, fmtPct, parseMinutes } from "./utils";
import { updateUrlRoute } from "../../lib/router";
import { useLanguage } from "../../context/LanguageContext";

type SortKey = "Player" | "MIN" | "PTS" | "REB" | "AST" | "STL" | "BLK" | "TOV" | "+/-" | "FG" | "3P" | "FT";

const STAT_COLUMNS: { key: SortKey; label: string; hideOnMobile?: boolean }[] = [
  { key: "MIN", label: "MIN" },
  { key: "PTS", label: "PTS" },
  { key: "REB", label: "REB" },
  { key: "AST", label: "AST" },
  { key: "STL", label: "STL", hideOnMobile: true },
  { key: "BLK", label: "BLK", hideOnMobile: true },
  { key: "TOV", label: "TOV", hideOnMobile: true },
  { key: "+/-", label: "+/-" },
  { key: "FG", label: "FG" },
  { key: "3P", label: "3P" },
  { key: "FT", label: "FT", hideOnMobile: true },
];

const mobileHide = (hide?: boolean) => (hide ? "hidden sm:table-cell" : "");

const sortValue = (p: PlayerBoxScore, key: SortKey): number | string => {
  switch (key) {
    case "Player":
      return p.PLAYER_NAME ?? "";
    case "MIN":
      return parseMinutes(p.MIN);
    case "+/-":
      return p.PLUS_MINUS ?? -999;
    case "FG":
      return p.FGM ?? 0;
    case "3P":
      return p.FG3M ?? 0;
    case "FT":
      return p.FTM ?? 0;
    default:
      return Number(p[key as keyof PlayerBoxScore]) || 0;
  }
};

const shotCell = (made?: number | null, att?: number | null, pct?: number | null) =>
  made == null && att == null ? (
    "-"
  ) : (
    <>
      <span className="text-text-primary">{fmtInt(made ?? null)}</span>
      <span className="text-text-muted">/{fmtInt(att ?? null)}</span>
      <span className="ml-1.5 hidden text-text-muted lg:inline">{fmtPct(pct ?? null)}</span>
    </>
  );

export function PlayerBoxTable({
  players,
}: {
  players: PlayerBoxScore[];
  accent?: string;
}) {
  const { language } = useLanguage();
  const tr = language === "tr";
  const [sortCol, setSortCol] = useState<SortKey>("MIN");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (col: SortKey) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir(col === "Player" ? "asc" : "desc");
    }
  };

  const sortRows = (rows: PlayerBoxScore[]) =>
    [...rows].sort((a, b) => {
      const va = sortValue(a, sortCol);
      const vb = sortValue(b, sortCol);
      const diff = typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
      if (diff !== 0) return sortDir === "asc" ? diff : -diff;
      const minDiff = parseMinutes(b.MIN) - parseMinutes(a.MIN);
      if (minDiff !== 0) return minDiff;
      return (b.PTS ?? 0) - (a.PTS ?? 0);
    });

  const { starters, bench, inactive } = useMemo(() => {
    const played = players.filter((p) => parseMinutes(p.MIN) > 0);
    return {
      starters: sortRows(played.filter((p) => p.IS_STARTER === 1)),
      bench: sortRows(played.filter((p) => p.IS_STARTER !== 1)),
      inactive: players.filter((p) => parseMinutes(p.MIN) <= 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, sortCol, sortDir]);

  const hasStarterInfo = players.some((p) => p.IS_STARTER === 1);
  const played = players.filter((p) => parseMinutes(p.MIN) > 0);
  const sum = (k: keyof PlayerBoxScore) => played.reduce((a, p) => a + (Number(p[k]) || 0), 0);
  const maxOf = (k: keyof PlayerBoxScore) => Math.max(0, ...played.map((p) => Number(p[k]) || 0));
  const maxPts = maxOf("PTS");
  const maxReb = maxOf("REB");
  const maxAst = maxOf("AST");
  const maxStl = maxOf("STL");
  const maxBlk = maxOf("BLK");

  const lead = (v: number | null | undefined, max: number) =>
    v != null && v === max && max > 0 ? "font-semibold text-text-primary" : "text-text-secondary";

  const goToPlayer = (playerId: number) => updateUrlRoute({ tab: "player-profile", playerId });

  const renderRow = (p: PlayerBoxScore) => {
    const pm = p.PLUS_MINUS ?? null;
    const pMin = parseMinutes(p.MIN);
    return (
      <tr key={p.PLAYER_ID} className="group transition-colors hover:bg-background-tertiary">
        <td className="sticky left-0 z-10 bg-background-primary px-3 py-2 transition-colors group-hover:bg-background-tertiary">
          <button
            type="button"
            onClick={() => goToPlayer(p.PLAYER_ID)}
            className="flex min-w-0 cursor-pointer items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
            aria-label={`${p.PLAYER_NAME} ${tr ? "profilini aç" : "open profile"}`}
          >
            <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME} size={28} />
            <span className="truncate text-xs font-medium text-text-primary group-hover:underline">
              {p.PLAYER_NAME}
            </span>
          </button>
        </td>
        <td className="px-2 py-2 text-right text-xs tabular-nums text-text-muted">{Math.round(pMin)}</td>
        <td className="px-2 py-2">
          <div className="flex items-center justify-end gap-2">
            <div className="hidden h-1 w-10 overflow-hidden rounded-full bg-background-tertiary md:block">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${maxPts > 0 ? ((p.PTS ?? 0) / maxPts) * 100 : 0}%` }}
              />
            </div>
            <span className="w-6 text-right text-xs font-semibold tabular-nums text-text-primary">{fmtInt(p.PTS)}</span>
          </div>
        </td>
        <td className={`px-2 py-2 text-right text-xs tabular-nums ${lead(p.REB, maxReb)}`}>{fmtInt(p.REB)}</td>
        <td className={`px-2 py-2 text-right text-xs tabular-nums ${lead(p.AST, maxAst)}`}>{fmtInt(p.AST)}</td>
        <td className={`hidden px-2 py-2 text-right text-xs tabular-nums sm:table-cell ${lead(p.STL, maxStl)}`}>{fmtInt(p.STL)}</td>
        <td className={`hidden px-2 py-2 text-right text-xs tabular-nums sm:table-cell ${lead(p.BLK, maxBlk)}`}>{fmtInt(p.BLK)}</td>
        <td className="hidden px-2 py-2 text-right text-xs tabular-nums text-text-secondary sm:table-cell">{fmtInt(p.TOV)}</td>
        <td
          className={`px-2 py-2 text-right text-xs tabular-nums ${
            pm == null
              ? "text-text-muted"
              : pm > 0
                ? "font-medium text-status-success"
                : pm < 0
                  ? "font-medium text-status-error"
                  : "text-text-secondary"
          }`}
        >
          {pm == null ? "-" : pm > 0 ? `+${pm}` : pm}
        </td>
        <td className="whitespace-nowrap px-2 py-2 text-right text-xs tabular-nums">{shotCell(p.FGM, p.FGA, p.FG_PCT)}</td>
        <td className="whitespace-nowrap px-2 py-2 text-right text-xs tabular-nums">{shotCell(p.FG3M, p.FG3A, p.FG3_PCT)}</td>
        <td className="hidden whitespace-nowrap px-2 py-2 text-right text-xs tabular-nums sm:table-cell">
          {shotCell(p.FTM, p.FTA, p.FT_PCT)}
        </td>
      </tr>
    );
  };

  const groupLabel = (label: string, count: number) => (
    <tr className="bg-background-secondary">
      <td colSpan={STAT_COLUMNS.length + 1} className="sticky left-0 px-3 py-1.5 text-xs font-medium text-text-secondary">
        {label} <span className="tabular-nums text-text-muted">{count}</span>
      </td>
    </tr>
  );

  const total = (v: number | string) => (
    <td className="px-2 py-2.5 text-right text-xs font-semibold tabular-nums text-text-primary">{v}</td>
  );

  return (
    <div className="overflow-x-auto rounded border border-border bg-background-primary">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-background-tertiary">
            <th
              scope="col"
              aria-sort={sortCol === "Player" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
              className="sticky left-0 z-10 min-w-40 bg-background-tertiary px-3 py-2.5 text-left text-xs font-medium text-text-secondary sm:min-w-48"
            >
              <button
                type="button"
                onClick={() => handleSort("Player")}
                className="inline-flex cursor-pointer items-center gap-1 hover:text-text-primary"
              >
                <span className={sortCol === "Player" ? "font-semibold text-text-primary" : ""}>
                  {tr ? "Oyuncu" : "Player"}
                </span>
                {sortCol === "Player" &&
                  (sortDir === "asc" ? <ChevronUp size={16} className="text-primary" /> : <ChevronDown size={16} className="text-primary" />)}
              </button>
            </th>
            {STAT_COLUMNS.map(({ key, label, hideOnMobile }) => {
              const isActive = sortCol === key;
              return (
                <th
                  key={key}
                  scope="col"
                  aria-sort={isActive ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                  className={`px-2 py-2.5 text-right text-xs font-medium ${mobileHide(hideOnMobile)} ${
                    isActive ? "font-semibold text-text-primary" : "text-text-secondary"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSort(key)}
                    className="inline-flex cursor-pointer items-center justify-end gap-0.5 hover:text-text-primary"
                  >
                    <span>{label}</span>
                    {isActive &&
                      (sortDir === "asc" ? <ChevronUp size={16} className="text-primary" /> : <ChevronDown size={16} className="text-primary" />)}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-light">
          {players.length === 0 ? (
            <tr>
              <td colSpan={STAT_COLUMNS.length + 1} className="px-3 py-6 text-center text-xs text-text-muted">
                {tr ? "Bu takım için oyuncu kaydı bulunamadı." : "No player rows for this side."}
              </td>
            </tr>
          ) : hasStarterInfo ? (
            <>
              {starters.length > 0 && groupLabel(tr ? "İlk 5" : "Starters", starters.length)}
              {starters.map(renderRow)}
              {bench.length > 0 && groupLabel(tr ? "Yedekler" : "Bench", bench.length)}
              {bench.map(renderRow)}
            </>
          ) : (
            [...starters, ...bench].map(renderRow)
          )}
        </tbody>
        {played.length > 0 && (
          <tfoot>
            <tr className="border-t border-border bg-background-tertiary">
              <td className="sticky left-0 z-10 bg-background-tertiary px-3 py-2.5 text-xs font-semibold text-text-primary">
                {tr ? "Takım toplamı" : "Team totals"}
              </td>
              <td />
              {total(sum("PTS"))}
              {total(sum("REB"))}
              {total(sum("AST"))}
              <td className="hidden px-2 py-2.5 text-right text-xs font-semibold tabular-nums text-text-primary sm:table-cell">{sum("STL")}</td>
              <td className="hidden px-2 py-2.5 text-right text-xs font-semibold tabular-nums text-text-primary sm:table-cell">{sum("BLK")}</td>
              <td className="hidden px-2 py-2.5 text-right text-xs font-semibold tabular-nums text-text-primary sm:table-cell">{sum("TOV")}</td>
              <td />
              <td className="whitespace-nowrap px-2 py-2.5 text-right text-xs font-medium tabular-nums text-text-secondary">{sum("FGM")}/{sum("FGA")}</td>
              <td className="whitespace-nowrap px-2 py-2.5 text-right text-xs font-medium tabular-nums text-text-secondary">{sum("FG3M")}/{sum("FG3A")}</td>
              <td className="hidden whitespace-nowrap px-2 py-2.5 text-right text-xs font-medium tabular-nums text-text-secondary sm:table-cell">
                {sum("FTM")}/{sum("FTA")}
              </td>
            </tr>
            {inactive.length > 0 && (
              <tr className="border-t border-border-light">
                <td colSpan={STAT_COLUMNS.length + 1} className="px-3 py-2 text-xs text-text-muted">
                  {tr ? "Oynamadı: " : "Did not play: "}
                  {inactive.map((p) => p.PLAYER_NAME).join(", ")}
                </td>
              </tr>
            )}
          </tfoot>
        )}
      </table>
    </div>
  );
}
