import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  ChevronDown,
  User,
  TrendingUp,
  Calendar,
  AlertCircle,
  Trophy,
  GraduationCap,
  Globe,
  Ruler,
  Weight,
  ArrowRightLeft,
  Users2,
} from "lucide-react";
import { loadJson, loadPrivateApi } from "../lib/dataCache";
import PlayerPhoto from "./PlayerPhoto";
import TeamLogo from "./TeamLogo";
import GameDetailPanel from "./GameDetailPanel";

/* ─────────── Types ─────────── */
interface PlayerProfile {
  PLAYER_ID: number;
  PLAYER_NAME: string;
  CURRENT_TEAM?: string | null;
  CURRENT_TEAM_ABBREVIATION?: string | null;
  HEIGHT: string | null;
  WEIGHT: string | null;
  COLLEGE: string | null;
  COUNTRY: string | null;
  OFFICIAL_POSITION: string | null;
  POSITION_GROUP: string | null;
  DRAFT_YEAR: number | null;
  DRAFT_ROUND: number | null;
  DRAFT_NUMBER: number | null;
  FROM_YEAR: number | null;
  TO_YEAR: number | null;
  ROSTER_STATUS: string | null;
}

interface SeasonAverages {
  games_played: number;
  games_total: number;
  teams?: string[];
  MIN: number | null;
  PTS: number | null;
  REB: number | null;
  AST: number | null;
  STL: number | null;
  BLK: number | null;
  TOV: number | null;
  FGM: number | null;
  FGA: number | null;
  FG_PCT: number | null;
  FG3M: number | null;
  FG3A: number | null;
  FG3_PCT: number | null;
  FTM: number | null;
  FTA: number | null;
  FT_PCT: number | null;
  OREB: number | null;
  DREB: number | null;
  PLUS_MINUS: number | null;
  is_roster_preview?: boolean;
  IMPORTANCE_SCORE?: number | null;
}

interface GameRow {
  GAME_ID: string;
  GAME_DATE: string | null;
  SEASON: string;
  TEAM_ABBREVIATION: string | null;
  MATCHUP: string | null;
  WL: string | null;
  SEASON_TYPE: string | null;
  DID_NOT_PLAY: boolean;
  HOME_TEAM_ABBREVIATION: string | null;
  HOME_TEAM_NAME: string | null;
  HOME_SCORE: number | null;
  AWAY_TEAM_ABBREVIATION: string | null;
  AWAY_TEAM_NAME: string | null;
  AWAY_SCORE: number | null;
  WINNER_TEAM_ABBREVIATION: string | null;
  IS_PLAYOFF: boolean;
  MIN?: number | null;
  PTS?: number | null;
  REB?: number | null;
  AST?: number | null;
  STL?: number | null;
  BLK?: number | null;
  TOV?: number | null;
  FGM?: number | null;
  FGA?: number | null;
  FG_PCT?: number | null;
  FG3M?: number | null;
  FG3A?: number | null;
  FG3_PCT?: number | null;
  FTM?: number | null;
  FTA?: number | null;
  FT_PCT?: number | null;
  PLUS_MINUS?: number | null;
}

/* ─────────── Helpers ─────────── */

const fmtPct = (v: number | null | undefined) =>
  v != null ? `%${(v * 100).toFixed(1)}` : "—";
const fmtStat = (v: number | null | undefined, dec = 1) =>
  v != null ? v.toFixed(dec) : "—";
const fmtDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("tr-TR", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

/* ─────────── Sub-components ─────────── */

function InfoChip({
  icon,
  label,
  value,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  className?: string;
}) {
  if (!value) return null;
  return (
    <div className={`flex items-start gap-2.5 py-1 ${className || ""}`}>
      <span className="mt-0.5 shrink-0 text-text-muted">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-text-secondary">{label}</p>
        <p className="text-xs font-semibold text-text-primary leading-tight truncate mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function SeasonSelector({
  seasons,
  selected,
  onChange,
}: {
  seasons: string[];
  selected: string;
  onChange: (s: string) => void;
  }) {
  return (
    <div className="flex flex-wrap gap-3 border-b border-border-light">
      {seasons.map((s) => {
        const isSelected = selected === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={`border-b-2 px-1.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
              isSelected
                ? "border-primary text-text-primary font-semibold"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

function AveragesGrid({ avgs }: { avgs: SeasonAverages }) {
  const headline = [
    { label: "Sayı (PPG)", short: "PPG", value: fmtStat(avgs.PTS) },
    { label: "Ribaund (RPG)", short: "RPG", value: fmtStat(avgs.REB) },
    { label: "Asist (APG)", short: "APG", value: fmtStat(avgs.AST) },
  ];
  const supporting = [
    { label: "MIN", value: fmtStat(avgs.MIN) },
    { label: "STL", value: fmtStat(avgs.STL) },
    { label: "BLK", value: fmtStat(avgs.BLK) },
    { label: "TOV", value: fmtStat(avgs.TOV) },
    { label: "+/-", value: fmtStat(avgs.PLUS_MINUS) },
    { label: "OREB", value: fmtStat(avgs.OREB) },
    { label: "DREB", value: fmtStat(avgs.DREB) },
  ];
  const shooting = [
    {
      label: "FG%",
      value: fmtPct(avgs.FG_PCT),
      sub: avgs.FGM != null && avgs.FGA != null ? `${fmtStat(avgs.FGM)} / ${fmtStat(avgs.FGA)}` : undefined,
    },
    {
      label: "3P%",
      value: fmtPct(avgs.FG3_PCT),
      sub: avgs.FG3M != null && avgs.FG3A != null ? `${fmtStat(avgs.FG3M)} / ${fmtStat(avgs.FG3A)}` : undefined,
    },
    {
      label: "FT%",
      value: fmtPct(avgs.FT_PCT),
      sub: avgs.FTM != null && avgs.FTA != null ? `${fmtStat(avgs.FTM)} / ${fmtStat(avgs.FTA)}` : undefined,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 divide-x divide-border-light rounded border border-border-light bg-background-secondary/40 py-4 px-2">
        {headline.map((item) => (
          <div key={item.short} className="text-center px-2">
            <p className="text-xs font-medium text-text-secondary">{item.label}</p>
            <div className="mt-1 flex items-baseline justify-center gap-1.5">
              <span className="text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums text-text-primary">
                {item.value}
              </span>
              <span className="text-xs font-medium text-text-muted">{item.short}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border-light pt-4">
        <h3 className="text-xs font-semibold text-text-secondary">Diğer maç başına değerler</h3>
        <div className="mt-3 grid grid-cols-2 gap-y-3 sm:grid-cols-4 xl:grid-cols-7 divide-y sm:divide-y-0 sm:divide-x divide-border-light">
          {supporting.map((item, idx) => (
            <div key={item.label} className={`pt-2 sm:pt-0 ${idx > 0 ? "sm:pl-3" : ""}`}>
              <div className="text-xs text-text-secondary">{item.label}</div>
              <div className="mt-0.5 text-base font-semibold tabular-nums text-text-primary">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border-light pt-4">
        <h3 className="text-xs font-semibold text-text-secondary">Şut oranları</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border-light">
          {shooting.map((item, idx) => (
            <div key={item.label} className={`flex items-baseline justify-between ${idx > 0 ? "sm:pl-4 pt-2 sm:pt-0" : ""}`}>
              <div>
                <span className="text-xs font-medium text-text-secondary">{item.label}</span>
                {item.sub && <span className="ml-2 text-xs tabular-nums text-text-muted">({item.sub})</span>}
              </div>
              <span className="text-lg font-semibold tabular-nums text-text-primary">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type RenderItem =
  | { type: "game"; data: GameRow }
  | { type: "trade"; from: string; to: string; dateBefore: string | null; dateAfter: string | null };

function GameLogTable({
  games,
  onGameClick,
}: {
  games: GameRow[];
  onGameClick?: (game: GameRow) => void;
}) {
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const renderItems = useMemo(() => {
    const items: RenderItem[] = [];
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      items.push({ type: "game", data: g });

      const nextGame = games[i + 1];
      if (
        nextGame &&
        g.TEAM_ABBREVIATION &&
        nextGame.TEAM_ABBREVIATION &&
        g.TEAM_ABBREVIATION !== nextGame.TEAM_ABBREVIATION
      ) {
        items.push({
          type: "trade",
          from: nextGame.TEAM_ABBREVIATION,
          to: g.TEAM_ABBREVIATION,
          dateBefore: nextGame.GAME_DATE,
          dateAfter: g.GAME_DATE,
        });
      }
    }
    return items;
  }, [games]);

  const totalPages = Math.ceil(renderItems.length / PAGE_SIZE);
  const visible = renderItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const wlColor = (wl: string | null) => {
    if (wl === "W") return "text-status-success font-semibold";
    if (wl === "L") return "text-status-error font-semibold";
    return "text-text-muted";
  };

  const pmColor = (pm: number | null | undefined) => {
    if (pm == null) return "text-text-muted";
    if (pm > 0) return "text-status-success font-medium";
    if (pm < 0) return "text-status-error font-medium";
    return "text-text-secondary";
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded border border-border bg-background-primary">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-background-secondary border-b border-border">
              <th className="sticky left-0 bg-background-secondary px-3 py-2.5 text-left text-xs font-semibold text-text-secondary min-w-[120px]">Tarih</th>
              <th className="px-2 py-2.5 text-left text-xs font-semibold text-text-secondary min-w-[130px]">Eşleşme</th>
              <th className="px-2 py-2.5 text-center text-xs font-semibold text-text-secondary">G/M</th>
              <th className="px-2 py-2.5 text-right text-xs font-semibold text-text-secondary">Skor</th>
              <th className="px-2 py-2.5 text-right text-xs font-semibold text-text-secondary">MIN</th>
              <th className="px-2 py-2.5 text-right text-xs font-semibold text-text-secondary">PTS</th>
              <th className="px-2 py-2.5 text-right text-xs font-semibold text-text-secondary">REB</th>
              <th className="px-2 py-2.5 text-right text-xs font-semibold text-text-secondary">AST</th>
              <th className="px-2 py-2.5 text-right text-xs font-semibold text-text-secondary">STL</th>
              <th className="px-2 py-2.5 text-right text-xs font-semibold text-text-secondary">BLK</th>
              <th className="px-2 py-2.5 text-right text-xs font-semibold text-text-secondary">TOV</th>
              <th className="px-2 py-2.5 text-right text-xs font-semibold text-text-secondary">FG%</th>
              <th className="px-2 py-2.5 text-right text-xs font-semibold text-text-secondary">3P%</th>
              <th className="px-2 py-2.5 text-right text-xs font-semibold text-text-secondary">FT%</th>
              <th className="px-2 py-2.5 text-right text-xs font-semibold text-text-secondary">+/-</th>
              <th className="px-2 py-2.5 text-center text-xs font-semibold text-text-secondary">Tür</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {visible.map((item, idx) => {
              if (item.type === "trade") {
                return (
                  <tr key={`trade-${idx}`} className="bg-background-secondary border-t border-b border-border">
                    <td colSpan={16} className="px-3 py-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1.5 bg-background-primary border border-border text-text-primary px-2 py-0.5 rounded-sm text-xs font-medium uppercase">
                            <ArrowRightLeft size={12} />
                            Takas / Transfer
                          </span>
                          <div className="flex items-center gap-2 font-medium text-text-primary text-xs">
                            <TeamLogo abbr={item.from} name="" size={18} />
                            <span className="text-text-secondary">{item.from}</span>
                            <ArrowRightLeft size={12} className="text-text-muted mx-1" />
                            <TeamLogo abbr={item.to} name="" size={18} />
                            <span className="text-text-primary font-semibold">{item.to}</span>
                          </div>
                        </div>
                        <p className="text-xs text-text-secondary">
                          Geçiş: {fmtDate(item.dateBefore)} → {fmtDate(item.dateAfter)}
                        </p>
                      </div>
                    </td>
                  </tr>
                );
              }

              const g = item.data;
              const isDnp = g.DID_NOT_PLAY;
              const score =
                g.HOME_SCORE != null && g.AWAY_SCORE != null
                  ? `${g.AWAY_SCORE} - ${g.HOME_SCORE}`
                  : "—";
              const clickable = !!onGameClick && !!g.GAME_ID;

              return (
                <tr
                  key={`${g.GAME_ID}-${idx}`}
                  onClick={clickable ? () => onGameClick!(g) : undefined}
                  className={`transition-colors ${
                    isDnp ? "bg-background-secondary/50 opacity-70" : "hover:bg-background-secondary/60"
                  } ${clickable ? "cursor-pointer group" : ""}`}
                >
                  <td className="sticky left-0 bg-background-primary px-3 py-2">
                    <p className="text-xs font-medium text-text-primary tabular-nums">{fmtDate(g.GAME_DATE)}</p>
                    {clickable && (
                      <p className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        Kutu skorunu gör
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      {g.HOME_TEAM_ABBREVIATION && (
                        <TeamLogo
                          abbr={g.MATCHUP?.includes("vs.") ? g.AWAY_TEAM_ABBREVIATION ?? "" : g.HOME_TEAM_ABBREVIATION ?? ""}
                          name=""
                          size={16}
                        />
                      )}
                      <span className="text-xs font-medium text-text-primary whitespace-nowrap">
                        {g.MATCHUP ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center">
                    {isDnp ? (
                      <span className="rounded-sm bg-background-secondary border border-border px-1.5 py-0.5 text-xs font-medium text-text-muted uppercase">DNP</span>
                    ) : (
                      <span className={wlColor(g.WL)}>{g.WL ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {isDnp ? (
                      <span className="text-xs text-text-muted">Sakat / Oynamadı</span>
                    ) : (
                      <span className="text-xs font-medium text-text-secondary tabular-nums">{score}</span>
                    )}
                  </td>
                  {isDnp ? (
                    <>
                      {Array.from({ length: 11 }).map((_, i) => (
                        <td key={i} className="px-2 py-2 text-right text-text-muted">—</td>
                      ))}
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">{g.MIN != null ? Math.round(g.MIN) : "—"}</td>
                      <td className="px-2 py-2 text-right font-semibold text-text-primary tabular-nums">{g.PTS ?? "—"}</td>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">{g.REB ?? "—"}</td>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">{g.AST ?? "—"}</td>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">{g.STL ?? "—"}</td>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">{g.BLK ?? "—"}</td>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">{g.TOV ?? "—"}</td>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">{fmtPct(g.FG_PCT)}</td>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">{fmtPct(g.FG3_PCT)}</td>
                      <td className="px-2 py-2 text-right text-text-secondary tabular-nums">{fmtPct(g.FT_PCT)}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${pmColor(g.PLUS_MINUS)}`}>
                        {g.PLUS_MINUS != null ? `${g.PLUS_MINUS > 0 ? "+" : ""}${g.PLUS_MINUS}` : "—"}
                      </td>
                    </>
                  )}
                  <td className="px-2 py-2 text-center">
                    <span className="rounded-sm px-1.5 py-0.5 text-xs font-medium uppercase bg-background-secondary border border-border text-text-secondary">
                      {g.IS_PLAYOFF ? "PO" : "RS"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-secondary">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, games.length)} / {games.length} maç
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="h-8 rounded border border-border bg-background-primary px-3 text-xs font-medium text-text-primary hover:bg-background-secondary disabled:opacity-30 transition-colors cursor-pointer"
            >
              Önceki
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
              return (
                <button
                  key={pg}
                  type="button"
                  onClick={() => setPage(pg)}
                  className={`h-8 w-8 rounded text-xs font-medium transition-colors cursor-pointer ${
                    pg === page
                      ? "bg-primary text-white"
                      : "border border-border bg-background-primary text-text-secondary hover:bg-background-secondary hover:text-text-primary"
                  }`}
                >
                  {pg + 1}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="h-8 rounded border border-border bg-background-primary px-3 text-xs font-medium text-text-primary hover:bg-background-secondary disabled:opacity-30 transition-colors cursor-pointer"
            >
              Sonraki
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────── Featured player card ─────────── */
function FeaturedCard({
  profile,
  label,
  avgs,
  onClick,
}: {
  profile: PlayerProfile;
  label: string;
  avgs: SeasonAverages | null;
  onClick: () => void;
}) {
  const teamAbbr = profile.CURRENT_TEAM || avgs?.teams?.[avgs.teams.length - 1] || null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded border border-border bg-background-primary text-left transition-colors hover:border-card-border-hover p-4 cursor-pointer"
    >
      <div>
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <PlayerPhoto
              playerId={profile.PLAYER_ID}
              name={profile.PLAYER_NAME ?? ""}
              size={48}
              className="rounded-full border border-border"
            />
            {teamAbbr && (
              <div className="absolute -bottom-1 -right-1 bg-background-primary border border-border rounded-full p-0.5">
                <TeamLogo abbr={teamAbbr} name="" size={16} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text-primary leading-tight group-hover:text-primary transition-colors">
              {profile.PLAYER_NAME}
            </p>
            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
              {profile.OFFICIAL_POSITION && (
                <span className="rounded-sm border border-border bg-background-secondary px-1.5 py-0.2 text-xs font-medium uppercase text-text-secondary">
                  {profile.OFFICIAL_POSITION}
                </span>
              )}
              {teamAbbr && (
                <span className="rounded-sm bg-background-secondary border border-border px-1.5 py-0.2 text-xs font-medium uppercase text-text-secondary">
                  {teamAbbr}
                </span>
              )}
              <span className="rounded-sm bg-background-secondary px-1.5 py-0.2 text-xs font-medium uppercase text-text-secondary">
                {label}
              </span>
            </div>
          </div>
        </div>

        {avgs ? (
          <div className="mt-3 flex items-center justify-around border-t border-border-light pt-2.5">
            <div className="text-center">
              <p className="text-base font-semibold tabular-nums text-text-primary">
                {avgs.PTS != null ? avgs.PTS.toFixed(1) : "—"}
              </p>
              <p className="text-xs text-text-secondary">PPG</p>
            </div>
            <div className="h-5 w-px bg-border-light" />
            <div className="text-center">
              <p className="text-base font-semibold tabular-nums text-text-primary">
                {avgs.REB != null ? avgs.REB.toFixed(1) : "—"}
              </p>
              <p className="text-xs text-text-secondary">RPG</p>
            </div>
            <div className="h-5 w-px bg-border-light" />
            <div className="text-center">
              <p className="text-base font-semibold tabular-nums text-text-primary">
                {avgs.AST != null ? avgs.AST.toFixed(1) : "—"}
              </p>
              <p className="text-xs text-text-secondary">APG</p>
            </div>
          </div>
        ) : (
          <p className="mt-3 border-t border-border-light pt-2.5 text-xs text-text-secondary">Veri bulunamadı</p>
        )}
      </div>
    </button>
  );
}

/* ─────────── Discovery / suggestion grid ─────────── */
function DiscoveryGrid({
  profiles,
  averagesData,
  onSelect,
  seasons,
}: {
  profiles: PlayerProfile[];
  averagesData: Record<string, Record<string, SeasonAverages>>;
  onSelect: (p: PlayerProfile) => void;
  seasons: string[];
}) {
  const latestSeason = useMemo(() =>
    [...seasons].reverse().find((season) => profiles.some((profile) =>
      (averagesData[String(profile.PLAYER_ID)]?.[season]?.games_played ?? 0) >= 15
    )) ?? seasons[seasons.length - 1] ?? "2025-26",
  [profiles, averagesData, seasons]);
  const getBestAvgs = (pid: number, preferSeason?: string): { avgs: SeasonAverages; season: string } | null => {
    const pidStr = String(pid);
    const pAvgs = averagesData[pidStr];
    if (!pAvgs) return null;
    const ordered = preferSeason
      ? [preferSeason, ...seasons.filter((s) => s !== preferSeason).reverse()]
      : [...seasons].reverse();
    for (const s of ordered) {
      if (pAvgs[s] && pAvgs[s].games_played >= 15) return { avgs: pAvgs[s], season: s };
    }
    return null;
  };

  const topScorers = useMemo(() =>
    profiles
      .map((p) => ({ p, res: getBestAvgs(p.PLAYER_ID, latestSeason) }))
      .filter((x) => x.res?.season === latestSeason && (x.res.avgs.PTS ?? 0) > 0)
      .sort((a, b) => (b.res!.avgs.PTS ?? 0) - (a.res!.avgs.PTS ?? 0))
      .slice(0, 12)
      .map(({ p, res }) => ({ p, avgs: res!.avgs, label: "Skorer" })),
  [profiles, averagesData, seasons, latestSeason]);

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-text-primary">Keşfedilecek Oyuncular</h2>
        <p className="text-xs text-text-secondary">En Skorerler · {latestSeason}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {topScorers.map(({ p, avgs, label }) => (
          <FeaturedCard
            key={p.PLAYER_ID}
            profile={p}
            label={label}
            avgs={avgs}
            onClick={() => onSelect(p)}
          />
        ))}
      </div>
    </div>
  );
}

function calculateAveragesFromGames(seasonGames: GameRow[]): SeasonAverages {
  const activeGames = seasonGames.filter(g => !g.DID_NOT_PLAY);
  const gp = activeGames.length;

  if (gp === 0) {
    return {
      games_played: 0,
      games_total: seasonGames.length,
      teams: [],
      MIN: null, PTS: null, REB: null, AST: null, STL: null, BLK: null, TOV: null,
      FGM: null, FGA: null, FG_PCT: null, FG3M: null, FG3A: null, FG3_PCT: null,
      FTM: null, FTA: null, FT_PCT: null, OREB: null, DREB: null, PLUS_MINUS: null
    };
  }

  const sum = (key: keyof GameRow) => {
    let s = 0;
    let count = 0;
    for (const g of activeGames) {
      const val = g[key];
      if (typeof val === 'number') {
        s += val;
        count++;
      }
    }
    return count > 0 ? s : null;
  };

  const avg = (key: keyof GameRow) => {
    const s = sum(key);
    return s !== null ? s / gp : null;
  };

  const uniqueTeams = new Set<string>();
  for (const g of seasonGames) {
    if (g.TEAM_ABBREVIATION) uniqueTeams.add(g.TEAM_ABBREVIATION);
  }

  const fgmSum = sum("FGM");
  const fgaSum = sum("FGA");
  const fgPct = (fgmSum !== null && fgaSum !== null && fgaSum > 0) ? fgmSum / fgaSum : null;

  const fg3mSum = sum("FG3M");
  const fg3aSum = sum("FG3A");
  const fg3Pct = (fg3mSum !== null && fg3aSum !== null && fg3aSum > 0) ? fg3mSum / fg3aSum : null;

  const ftmSum = sum("FTM");
  const ftaSum = sum("FTA");
  const ftPct = (ftmSum !== null && ftaSum !== null && ftaSum > 0) ? ftmSum / ftaSum : null;

  return {
    games_played: gp,
    games_total: seasonGames.length,
    teams: Array.from(uniqueTeams),
    MIN: avg("MIN"),
    PTS: avg("PTS"),
    REB: avg("REB"),
    AST: avg("AST"),
    STL: avg("STL"),
    BLK: avg("BLK"),
    TOV: avg("TOV"),
    FGM: avg("FGM"),
    FGA: avg("FGA"),
    FG_PCT: fgPct,
    FG3M: avg("FG3M"),
    FG3A: avg("FG3A"),
    FG3_PCT: fg3Pct,
    FTM: avg("FTM"),
    FTA: avg("FTA"),
    FT_PCT: ftPct,
    OREB: null,
    DREB: null,
    PLUS_MINUS: avg("PLUS_MINUS"),
  } as any;
}

/* ─────────── Main Component ─────────── */
export default function PlayerPage({ initialPlayerId = null }: { initialPlayerId?: number | null }) {
  const [seasonsList, setSeasonsList] = useState<string[]>(["2022-23", "2023-24", "2024-25", "2025-26", "2026-27"]);
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [gamesData, setGamesData] = useState<Record<string, Record<string, GameRow[]>>>({});
  const [averagesData, setAveragesData] = useState<Record<string, Record<string, SeasonAverages>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerProfile | null>(null);
  const [selectedSeason, setSelectedSeason] = useState("2026-27");
  const [selectedGame, setSelectedGame] = useState<GameRow | null>(null);
  const [opponentSearch, setOpponentSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        loadJson<string[]>("/data/seasons.json", [])
          .then((data) => {
            if (Array.isArray(data) && data.length > 0) {
              const asc = [...data].sort((a, b) => a.localeCompare(b));
              setSeasonsList(asc);
            }
          })
          .catch(() => {});

        const [prof, avgs] = await Promise.all([
          loadJson<PlayerProfile[]>("/data/player_profiles.json"),
          loadJson<Record<string, Record<string, SeasonAverages>>>("/data/player_season_averages.json"),
        ]);
        setProfiles(prof);
        setAveragesData(avgs);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filteredProfiles = useMemo(() => {
    if (!search.trim()) return profiles.slice(0, 20);
    const q = search.toLowerCase();
    return profiles.filter((p) => p.PLAYER_NAME?.toLowerCase().includes(q)).slice(0, 20);
  }, [profiles, search]);

  useEffect(() => {
    if (!selectedPlayer) return;
    const playerId = String(selectedPlayer.PLAYER_ID);
    const pGames = gamesData[playerId] ?? {};
    const pAvgs = averagesData[playerId] ?? {};
    const available = seasonsList.filter((s) => (pGames[s]?.length > 0) || (pAvgs[s] != null) || s === "2026-27");
    if (available.length > 0 && !available.includes(selectedSeason)) {
      setSelectedSeason(available[available.length - 1]);
    }
  }, [selectedPlayer, gamesData, averagesData, seasonsList, selectedSeason]);

  const handleSelectPlayer = useCallback((p: PlayerProfile) => {
    setSelectedPlayer(p);
    setSelectedGame(null);
    setOpponentSearch("");
    setSearch(p.PLAYER_NAME ?? "");
    setShowDropdown(false);
    const playerId = String(p.PLAYER_ID);
    loadPrivateApi<{
      player_id: string;
      games: Record<string, GameRow[]>;
      averages: Record<string, SeasonAverages>;
    }>(`/frontend-data-api/players/${encodeURIComponent(playerId)}`)
      .then((payload) => {
        setGamesData((prev) => ({ ...prev, [payload.player_id]: payload.games }));
        setAveragesData((prev) => ({ ...prev, [payload.player_id]: payload.averages }));
      })
      .catch(() => {
        loadJson<Record<string, GameRow[]>>(`/data/player_games/${encodeURIComponent(playerId)}.json`, {})
          .then((games) => {
            setGamesData((prev) => ({ ...prev, [playerId]: games }));
            const calculatedAverages: Record<string, SeasonAverages> = {};
            for (const s of Object.keys(games)) {
              calculatedAverages[s] = calculateAveragesFromGames(games[s]);
            }
            setAveragesData((prev) => ({ ...prev, [playerId]: calculatedAverages }));
          })
          .catch((e) => setError(e.message));
      });
  }, []);

  useEffect(() => {
    if (initialPlayerId == null || loading) return;
    const target = profiles.find((profile) => profile.PLAYER_ID === initialPlayerId);
    if (target) handleSelectPlayer(target);
  }, [handleSelectPlayer, initialPlayerId, loading, profiles]);

  const pid = selectedPlayer ? String(selectedPlayer.PLAYER_ID) : null;
  const playerGames = useMemo(() => (pid ? (gamesData[pid] ?? {}) : {}), [pid, gamesData]);
  const playerAvgs = useMemo(() => (pid ? (averagesData[pid] ?? {}) : {}), [pid, averagesData]);
  const availableSeasons = useMemo(() => {
    return seasonsList.filter((s) => (playerGames[s]?.length > 0) || (playerAvgs[s] != null) || s === "2026-27");
  }, [seasonsList, playerGames, playerAvgs]);
  const currentAvgs = playerAvgs[selectedSeason] ?? null;

  const currentGames = useMemo(() => {
    const games = playerGames[selectedSeason] ?? [];
    const sorted = [...games].sort((a, b) => {
      const dateA = a.GAME_DATE ?? "";
      const dateB = b.GAME_DATE ?? "";
      return dateB.localeCompare(dateA);
    });

    const query = opponentSearch.toLowerCase().trim();
    if (!query) return sorted;

    return sorted.filter((g) => {
      const teamAbbr = g.TEAM_ABBREVIATION ?? "";
      const home = g.HOME_TEAM_ABBREVIATION ?? "";
      const away = g.AWAY_TEAM_ABBREVIATION ?? "";
      const homeName = g.HOME_TEAM_NAME ?? "";
      const awayName = g.AWAY_TEAM_NAME ?? "";
      const matchup = g.MATCHUP ?? "";

      const oppAbbr = (teamAbbr === home ? away : home).toLowerCase();
      const oppName = (teamAbbr === home ? awayName : homeName).toLowerCase();

      return oppAbbr.includes(query) ||
             oppName.includes(query) ||
             matchup.toLowerCase().includes(query);
    });
  }, [playerGames, selectedSeason, opponentSearch]);

  const draftStr = (p: PlayerProfile) => {
    if (!p.DRAFT_YEAR) return "Draft Edilmedi";
    const round = p.DRAFT_ROUND ? `${p.DRAFT_ROUND}. Tur` : "";
    const pick = p.DRAFT_NUMBER ? `${p.DRAFT_NUMBER}. Sıra` : "";
    return [p.DRAFT_YEAR, round, pick].filter(Boolean).join(" · ");
  };

  if (loading) {
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-xs font-medium text-text-secondary">
          Oyuncu verileri yükleniyor
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-3 rounded border border-status-error/20 bg-background-primary p-6 text-center">
        <div className="rounded p-2 text-status-error">
          <AlertCircle size={24} />
        </div>
        <div>
          <h2 className="text-base font-semibold text-text-primary">Veri bulunamadı</h2>
          <p className="mt-1 text-xs text-text-secondary">{error}</p>
        </div>
        <p className="rounded border border-border bg-background-secondary px-3 py-1.5 font-mono text-xs text-text-secondary">
          python3 scripts/export_player_profiles.py
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div className="rounded border border-border bg-background-primary p-5 sm:p-6 space-y-4">
        <div className="flex flex-col gap-1 border-b border-border-light pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium text-text-secondary">NBA Oyuncu Profilleri</p>
            <h1 className="text-2xl font-semibold leading-none tracking-tight text-text-primary mt-1">Oyuncular</h1>
          </div>
          <p className="text-xs text-text-secondary">{profiles.length.toLocaleString()} profil · 2018–26</p>
        </div>
        <div>
          <label htmlFor="player-profile-search" className="mb-1.5 block text-xs font-medium text-text-secondary">Oyuncu Ara</label>
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input
              id="player-profile-search"
              type="text"
              placeholder="Oyuncu adına göre ara..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              className="w-full h-10 rounded border border-border bg-background-secondary pl-10 pr-10 text-xs font-medium text-text-primary placeholder:text-text-secondary transition focus:border-border-focus focus:bg-background-primary focus:outline-none"
            />
            <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-secondary" />
          </div>

          {showDropdown && filteredProfiles.length > 0 && (
            <div className="absolute z-50 mt-1 max-h-64 w-full max-w-lg overflow-y-auto rounded border border-border bg-background-primary shadow-sm divide-y divide-border-light">
              {filteredProfiles.map((p) => (
                <button
                  key={p.PLAYER_ID}
                  type="button"
                  onClick={() => handleSelectPlayer(p)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-background-secondary cursor-pointer"
                >
                  <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME ?? ""} size={32} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-text-primary">{p.PLAYER_NAME}</p>
                    <p className="text-xs text-text-secondary">
                      {[
                        p.OFFICIAL_POSITION,
                        p.FROM_YEAR && p.TO_YEAR && `${p.FROM_YEAR}–${p.TO_YEAR}`,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedPlayer && (
          <div className="flex items-center justify-between border-t border-border-light pt-2 text-xs">
            <div className="flex items-center gap-1.5 text-text-secondary">
              <User size={13} className="shrink-0" />
              <span>Görüntülenen: <strong className="text-text-primary font-medium">{selectedPlayer.PLAYER_NAME}</strong></span>
            </div>
            <button
              type="button"
              onClick={() => { setSelectedPlayer(null); setSearch(""); }}
              className="text-xs text-text-secondary hover:text-text-primary underline cursor-pointer"
            >
              Farklı oyuncu seç
            </button>
          </div>
        )}
      </div>

      {/* Player Profile (when selected) */}
      {selectedPlayer && (
        <div className="space-y-5">
          {/* Hero Card */}
          {(() => {
            const primaryTeamAbbr =
              (selectedSeason === "2026-27" ? (currentAvgs?.teams?.[0] || selectedPlayer.CURRENT_TEAM) : null) ||
              currentAvgs?.teams?.[currentAvgs.teams.length - 1] ||
              selectedPlayer.CURRENT_TEAM ||
              null;
            return (
              <div className="rounded border border-border bg-background-primary p-5 sm:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                  <div className="shrink-0">
                    <PlayerPhoto
                      playerId={selectedPlayer.PLAYER_ID}
                      name={selectedPlayer.PLAYER_NAME ?? ""}
                      size={96}
                      className="rounded border border-border"
                    />
                  </div>

                  <div className="flex-1 space-y-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-xs font-medium text-text-secondary">
                          NBA Oyuncu Profili
                        </p>
                        {primaryTeamAbbr && (
                          <div className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background-secondary px-2 py-0.5 text-xs font-medium text-text-primary">
                            <TeamLogo abbr={primaryTeamAbbr} name="" size={14} />
                            <span>{primaryTeamAbbr}</span>
                          </div>
                        )}
                      </div>

                      <h2 className="text-2xl sm:text-3xl font-semibold leading-tight tracking-tight text-text-primary">
                        {selectedPlayer.PLAYER_NAME}
                      </h2>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selectedPlayer.OFFICIAL_POSITION && (
                          <span className="rounded-sm border border-border bg-background-secondary px-2 py-0.5 text-xs font-medium text-text-secondary uppercase">
                            {selectedPlayer.OFFICIAL_POSITION}
                          </span>
                        )}
                        {selectedPlayer.POSITION_GROUP && (
                          <span className="rounded-sm border border-border bg-background-secondary px-2 py-0.5 text-xs font-medium text-text-secondary uppercase">
                            {selectedPlayer.POSITION_GROUP}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 xl:grid-cols-4 border-t border-border-light pt-3">
                      {currentAvgs?.teams && currentAvgs.teams.length > 1 && (
                        <InfoChip
                          icon={<ArrowRightLeft size={13} />}
                          label="Takımlar (Takas)"
                          value={currentAvgs.teams.join(" → ")}
                        />
                      )}
                      {primaryTeamAbbr && (!currentAvgs?.teams || currentAvgs.teams.length <= 1) && (
                        <InfoChip
                          icon={<Users2 size={13} />}
                          label="Güncel Takım"
                          value={primaryTeamAbbr}
                        />
                      )}
                      <InfoChip icon={<Ruler size={13} />} label="Boy (Height)" value={selectedPlayer.HEIGHT} />
                      <InfoChip
                        icon={<Weight size={13} />}
                        label="Kilo (Weight)"
                        value={selectedPlayer.WEIGHT ? `${selectedPlayer.WEIGHT} lbs` : null}
                      />
                      <InfoChip icon={<Globe size={13} />} label="Ülke" value={selectedPlayer.COUNTRY} />
                      <InfoChip icon={<GraduationCap size={13} />} label="Kolej" value={selectedPlayer.COLLEGE} />
                      <InfoChip icon={<Trophy size={13} />} label="Draft" value={draftStr(selectedPlayer)} />
                      <InfoChip
                        icon={<Calendar size={13} />}
                        label="NBA Sezonları"
                        value={
                          selectedPlayer.FROM_YEAR && selectedPlayer.TO_YEAR
                            ? `${selectedPlayer.FROM_YEAR} – ${selectedPlayer.TO_YEAR}`
                            : null
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {availableSeasons.length === 0 ? (
            <div className="rounded border border-border bg-background-primary p-6 text-center">
              <AlertCircle size={22} className="mx-auto mb-2 text-text-secondary" />
              <p className="text-xs font-medium text-text-secondary">Bu oyuncu için veritabanında maç kaydı bulunamadı.</p>
            </div>
          ) : (
            <>
              {/* Season Averages + Integrated Season Selector */}
              <div className="rounded border border-border bg-background-primary p-5 sm:p-6 space-y-4">
                <div className="flex flex-col gap-4 border-b border-border-light pb-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded border border-border bg-background-secondary text-primary">
                      <TrendingUp size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold text-text-primary">Sezon Ortalamaları</h2>
                        {currentAvgs && (
                          <span className="rounded-sm bg-background-secondary border border-border px-2 py-0.5 text-xs font-medium tabular-nums text-text-secondary">
                            {currentAvgs.games_played} / {currentAvgs.games_total} Maç
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-secondary">{selectedSeason} maç başına istatistikler</p>
                    </div>
                  </div>

                  <SeasonSelector
                    seasons={availableSeasons}
                    selected={selectedSeason}
                    onChange={setSelectedSeason}
                  />
                </div>

                {currentAvgs && currentAvgs.games_total > 0 ? (
                  <AveragesGrid avgs={currentAvgs} />
                ) : (
                  <p className="py-2 text-xs text-text-secondary">{selectedSeason} sezonu için ortalama verisi bulunamadı.</p>
                )}
              </div>

              {/* Game Log */}
              <div className="rounded border border-border bg-background-primary p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light pb-4">
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-text-secondary" />
                    <h2 className="text-base font-semibold text-text-primary">
                      {selectedSeason} Maç Günlüğü
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-sm bg-background-secondary border border-border px-2 py-0.5 text-xs font-medium text-text-secondary">
                      {currentGames.length} maç
                    </span>
                    <span className="rounded-sm bg-status-warning/10 border border-status-warning/20 px-2 py-0.5 text-xs font-medium text-status-warning">
                      {currentGames.filter((g) => g.DID_NOT_PLAY).length} DNP
                    </span>
                    <span className="rounded-sm bg-background-secondary border border-border px-2 py-0.5 text-xs font-medium text-text-secondary">
                      {currentGames.filter((g) => g.IS_PLAYOFF).length} playoff
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {!selectedGame && (playerGames[selectedSeason] ?? []).length > 0 && (
                    <div className="relative flex-1 max-w-sm">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                      <input
                        type="text"
                        placeholder="Rakip takıma göre filtrele..."
                        value={opponentSearch}
                        onChange={(e) => setOpponentSearch(e.target.value)}
                        className="w-full h-8 rounded border border-border bg-background-secondary pl-9 pr-4 text-xs font-medium text-text-primary placeholder:text-text-secondary focus:border-border-focus focus:bg-background-primary focus:outline-none"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-xs text-text-secondary ml-auto">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm bg-status-warning/40 border border-status-warning/60" />
                      DNP = Oynamadı
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="rounded-sm bg-background-secondary border border-border px-1 py-0.2 text-xs font-medium text-text-primary">PO</span>
                      Playoff
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="rounded-sm bg-background-secondary border border-border px-1 py-0.2 text-xs font-medium text-text-secondary">RS</span>
                      Normal Sezon
                    </span>
                  </div>
                </div>

                {selectedGame ? (
                  <GameDetailPanel
                    game={selectedGame as any}
                    season={selectedSeason}
                    highlightPlayerId={selectedPlayer?.PLAYER_ID}
                    onBack={() => setSelectedGame(null)}
                  />
                ) : (playerGames[selectedSeason] ?? []).length > 0 ? (
                  currentGames.length > 0 ? (
                    <GameLogTable
                      games={currentGames}
                      onGameClick={(g) => setSelectedGame(g)}
                    />
                  ) : (
                    <div className="py-8 text-center space-y-2">
                      <p className="text-xs text-text-secondary">&quot;{opponentSearch}&quot; ile eşleşen maç bulunamadı.</p>
                      <button
                        type="button"
                        onClick={() => setOpponentSearch("")}
                        className="h-8 rounded border border-border bg-background-primary px-3 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                      >
                        Aramayı Temizle
                      </button>
                    </div>
                  )
                ) : selectedSeason === "2026-27" ? (
                  <div className="rounded border border-border bg-background-secondary py-8 px-4 text-center">
                    <Calendar size={24} className="mx-auto mb-2 text-text-secondary" />
                    <p className="text-sm font-semibold text-text-primary">2026-27 Sezonu Fikstürü Hazırlandı</p>
                    <p className="mt-1 text-xs text-text-secondary max-w-md mx-auto">
                      1,274 maçlık yeni sezon fikstürü sisteme yüklenmiştir. Maçlar oynandıkça maç sonuçları ve detaylı kutu istatistikleri burada listelenecektir.
                    </p>
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-text-secondary">{selectedSeason} için maç kaydı bulunamadı.</div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Discovery grid (shown when no player selected) */}
      {!selectedPlayer && profiles.length > 0 && (
        <div className="rounded border border-border bg-background-primary p-5 sm:p-6">
          <DiscoveryGrid
            profiles={profiles}
            averagesData={averagesData}
            onSelect={handleSelectPlayer}
            seasons={seasonsList}
          />
        </div>
      )}
    </div>
  );
}
