import React, { useState, useMemo, useEffect, useCallback } from "react";
import { ArrowDown, ArrowUp, Calendar, Users } from "lucide-react";
import TeamLogo from "./TeamLogo";
import PlayerPhoto from "./PlayerPhoto";
import { NBA_TEAM_ABBRS, TEAM_NAME_BY_ABBR, getTeamShortName } from "../lib/nbaTeams";
import { loadPrivateApi } from "../lib/dataCache";
import { CURRENT_SEASON } from "../lib/constants";
import { loadArchivedGameIndex } from "../lib/archiveData";
import { computeSeasonTeamRecords, type TeamRecordsMap } from "../lib/teamRecords";
import type { GameFeedRow, TeamRosterEntry } from "../types/gameFeed";
import {
  Card,
  Skeleton,
  EmptyState,
  InlineError,
  Select,
} from "./common";
import { useLanguage } from "../context/useLanguage";

interface TeamRosterItem {
  TEAM_ABBREVIATION: string;
  PLAYER_ID: number;
  PLAYER_NAME: string;
  GP: number;
  AVG_MIN: number;
  AVG_PTS: number;
  AVG_REB: number;
  AVG_AST: number;
  IMPORTANCE_SCORE: number;
  STATS_SEASON?: string | null;
}

interface TeamExplorerProps {
  rosters?: TeamRosterEntry[];
  onSelectPlayer: (playerId: number) => void;
  initialTeam?: string;
}

type SortKey = "IMPORTANCE_SCORE" | "GP" | "AVG_MIN" | "AVG_PTS" | "AVG_REB" | "AVG_AST";

function TeamExplorerSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      {/* Header skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton variant="circular" width={40} height={40} className="shrink-0" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-44 rounded" />
            <Skeleton className="h-3.5 w-32 rounded" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-40 rounded" />
          <Skeleton className="h-9 w-28 rounded" />
        </div>
      </div>

      {/* KPI strip skeleton */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={84} />
        ))}
      </div>

      {/* Tabs skeleton */}
      <Skeleton className="h-9 w-64 rounded" />

      {/* Roster + Recent games skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Card padding="none" className="divide-y divide-border-light overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Skeleton variant="circular" width={28} height={28} />
                  <Skeleton className="h-4 w-32 rounded" />
                </div>
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-8 rounded" />
                  <Skeleton className="h-4 w-8 rounded" />
                  <Skeleton className="h-4 w-10 rounded" />
                </div>
              </div>
            ))}
          </Card>
        </div>
        <div className="lg:col-span-4">
          <Skeleton height={280} />
        </div>
      </div>
    </div>
  );
}

const isGameCompleted = (g: GameFeedRow): boolean =>
  g.GAME_STATUS === "Final" ||
  g.GAME_STATUS === "FINAL" ||
  Boolean(g.WINNER_TEAM_ABBREVIATION) ||
  ((Number(g.HOME_SCORE) || 0) > 0 && (Number(g.AWAY_SCORE) || 0) > 0);

const hasCurrentSeasonStats = (entry: TeamRosterEntry, season: string): boolean => {
  const s = entry.STATS_SEASON;
  return s !== "previous" && (s == null || s === season);
};

const TeamExplorer: React.FC<TeamExplorerProps> = ({ onSelectPlayer, initialTeam }) => {
  const { t, language, formatDate } = useLanguage();
  const tr = language === "tr";
  const [selectedSeason, setSelectedSeason] = useState<string>(CURRENT_SEASON);
  const [activeRosters, setActiveRosters] = useState<TeamRosterEntry[]>([]);
  const [seasonGames, setSeasonGames] = useState<GameFeedRow[]>([]);
  const [teamRecords, setTeamRecords] = useState<TeamRecordsMap | null>(null);
  const [playerPositions, setPlayerPositions] = useState<Record<number, "guard" | "forward" | "center">>({});
  const [loadingSeason, setLoadingSeason] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [teamOverride, setTeamOverride] = useState<{ base: string | undefined; team: string } | null>(null);
  const [sortBy, setSortBy] = useState<{ key: SortKey; dir: "desc" | "asc" }>({
    key: "IMPORTANCE_SCORE",
    dir: "desc",
  });

  const selectedTeam =
    teamOverride && teamOverride.base === initialTeam
      ? teamOverride.team
      : initialTeam || "BOS";
  const setSelectedTeam = useCallback(
    (team: string) => setTeamOverride({ base: initialTeam, team }),
    [initialTeam]
  );

  useEffect(() => {
    loadPrivateApi<Array<{ PLAYER_ID: number; POSITION_GROUP?: string; OFFICIAL_POSITION?: string }>>(
      "/frontend-data-api/player-profiles"
    )
      .then((profiles) => {
        const map: Record<number, "guard" | "forward" | "center"> = {};
        (profiles || []).forEach((p) => {
          const raw = (p.POSITION_GROUP || p.OFFICIAL_POSITION || "").toUpperCase();
          if (raw.includes("GUARD") || raw === "G") {
            map[p.PLAYER_ID] = "guard";
          } else if (raw.includes("BIG") || raw === "C" || raw.includes("CENTER")) {
            map[p.PLAYER_ID] = "center";
          } else {
            map[p.PLAYER_ID] = "forward";
          }
        });
        setPlayerPositions(map);
      })
      .catch(() => { });
  }, []);

  const [view, setView] = useState<"team" | "league">("team");
  const [posFilter, setPosFilter] = useState<"all" | "guard" | "forward" | "center">("all");

  const seasonsList = useMemo(
    () => ["2026-27", "2025-26", "2024-25", "2023-24", "2022-23", "2021-22", "2020-21"],
    []
  );

  useEffect(() => {
    let active = true;
    Promise.all([
      loadPrivateApi<TeamRosterEntry[]>(
        `/frontend-data-api/team-rosters?season=${encodeURIComponent(selectedSeason)}`
      ),
      loadArchivedGameIndex(selectedSeason).catch(() => []),
    ])
      .then(([rosterData, gamesData]) => {
        if (!active) return;
        const games = gamesData || [];
        setActiveRosters(rosterData || []);
        setSeasonGames(games);
        setTeamRecords(computeSeasonTeamRecords(games));
        setLoadError(null);
      })
      .catch(() => {
        if (!active) return;
        setLoadError(`${selectedSeason} ${tr ? "kadro verileri yüklenemedi." : "roster data could not be loaded."}`);
        setActiveRosters([]);
        setSeasonGames([]);
        setTeamRecords(null);
      })
      .finally(() => {
        if (active) setLoadingSeason(false);
      });
    return () => {
      active = false;
    };
  }, [selectedSeason, reloadTick, tr]);

  const fetchRosters = useCallback(() => {
    setLoadingSeason(true);
    setLoadError(null);
    setReloadTick((n) => n + 1);
  }, []);

  const teamsList = useMemo(() => {
    if (!activeRosters || activeRosters.length === 0) return [...NBA_TEAM_ABBRS];
    const extracted = Array.from(
      new Set(activeRosters.map((r) => r.TEAM_ABBREVIATION))
    ).filter(Boolean);
    return extracted.length > 0 ? (extracted as string[]).sort() : [...NBA_TEAM_ABBRS];
  }, [activeRosters]);

  const activeTeam = teamsList.includes(selectedTeam) ? selectedTeam : teamsList[0] || "BOS";
  const activeTeamFull = TEAM_NAME_BY_ABBR[activeTeam as keyof typeof TEAM_NAME_BY_ABBR] || activeTeam;
  const activeRecord = teamRecords?.get(activeTeam);

  const rawTeamRoster: TeamRosterItem[] = useMemo(() => {
    if (!activeRosters) return [];
    return activeRosters
      .filter((r) => r.TEAM_ABBREVIATION === activeTeam)
      .map((r) => {
        const hasStats = hasCurrentSeasonStats(r, selectedSeason);
        const gp = hasStats ? Number(r.GP || 0) : 0;
        return {
          TEAM_ABBREVIATION: r.TEAM_ABBREVIATION,
          PLAYER_ID: Number(r.PLAYER_ID),
          PLAYER_NAME: r.PLAYER_NAME || `Player ${r.PLAYER_ID}`,
          GP: gp,
          AVG_MIN: gp > 0 ? Number(r.AVG_MIN || 0) : 0,
          AVG_PTS: gp > 0 ? Number(r.AVG_PTS || 0) : 0,
          AVG_REB: gp > 0 ? Number(r.AVG_REB || 0) : 0,
          AVG_AST: gp > 0 ? Number(r.AVG_AST || 0) : 0,
          IMPORTANCE_SCORE: gp > 0 ? Number(r.IMPORTANCE_SCORE || 0) : 0,
          STATS_SEASON: r.STATS_SEASON,
        };
      });
  }, [activeRosters, activeTeam, selectedSeason]);

  const sortedTeamRoster = useMemo(() => {
    const mult = sortBy.dir === "desc" ? -1 : 1;
    return [...rawTeamRoster].sort((a, b) => {
      if ((a.GP > 0) !== (b.GP > 0)) return a.GP > 0 ? -1 : 1;
      const diff = (a[sortBy.key] - b[sortBy.key]) * mult;
      return diff !== 0 ? diff : b.IMPORTANCE_SCORE - a.IMPORTANCE_SCORE;
    });
  }, [rawTeamRoster, sortBy]);

  const leagueTeamRanks = useMemo(() => {
    if (!activeRosters || activeRosters.length === 0) return [];
    const teamScores: Record<string, number[]> = {};
    activeRosters.forEach((r) => {
      const team = r.TEAM_ABBREVIATION;
      if (!team || !hasCurrentSeasonStats(r, selectedSeason) || Number(r.GP || 0) <= 0) return;
      if (!teamScores[team]) teamScores[team] = [];
      teamScores[team].push(Number(r.IMPORTANCE_SCORE || 0));
    });

    return Object.entries(teamScores)
      .map(([team, scores]) => {
        const top3 = scores.sort((a, b) => b - a).slice(0, 3);
        const avg = top3.length ? top3.reduce((sum, val) => sum + val, 0) / top3.length : 0;
        return { team, score: avg };
      })
      .sort((a, b) => b.score - a.score);
  }, [activeRosters, selectedSeason]);

  const leagueAverage = useMemo(() => {
    if (!leagueTeamRanks.length) return 0;
    return leagueTeamRanks.reduce((sum, item) => sum + item.score, 0) / leagueTeamRanks.length;
  }, [leagueTeamRanks]);

  const maxTeamScore = leagueTeamRanks[0]?.score ?? 1;
  const activePowerIndex = leagueTeamRanks.findIndex((item) => item.team === activeTeam);
  const activePowerScore = activePowerIndex >= 0 ? leagueTeamRanks[activePowerIndex].score : null;

  const leaguePlayerLeaders = useMemo(() => {
    if (!activeRosters) return [];
    return activeRosters
      .filter((r) => hasCurrentSeasonStats(r, selectedSeason) && Number(r.GP || 0) > 0)
      .map((r) => ({
        ...r,
        PLAYER_NAME: r.PLAYER_NAME || `Player ${r.PLAYER_ID}`,
        AVG_PTS: Number(r.AVG_PTS || 0),
        AVG_REB: Number(r.AVG_REB || 0),
        AVG_AST: Number(r.AVG_AST || 0),
        IMPORTANCE_SCORE: Number(r.IMPORTANCE_SCORE || 0),
      }))
      .sort((a, b) => b.IMPORTANCE_SCORE - a.IMPORTANCE_SCORE)
      .slice(0, 15);
  }, [activeRosters, selectedSeason]);

  const teamRecentGames = useMemo(() => {
    return seasonGames
      .filter((g) => (g.HOME_TEAM_ABBREVIATION === activeTeam || g.AWAY_TEAM_ABBREVIATION === activeTeam) && isGameCompleted(g))
      .sort((a, b) => (b.GAME_DATE ?? "").localeCompare(a.GAME_DATE ?? ""))
      .slice(0, 6);
  }, [seasonGames, activeTeam]);

  const teamLeader = useMemo(() => {
    const played = rawTeamRoster.filter((p) => p.GP > 0);
    if (!played.length) return null;
    return [...played].sort((a, b) => b.IMPORTANCE_SCORE - a.IMPORTANCE_SCORE)[0];
  }, [rawTeamRoster]);

  const posLabel = (k: "all" | "guard" | "forward" | "center") =>
    k === "all"
      ? (tr ? "Hepsi" : "All")
      : k === "guard"
        ? "Guard"
        : k === "forward"
          ? (tr ? "Forvet" : "Forward")
          : (tr ? "Pivot" : "Center");

  const filteredRoster = sortedTeamRoster.filter(
    (p) => posFilter === "all" || (playerPositions[p.PLAYER_ID] || "forward") === posFilter
  );

  const toggleSort = (key: SortKey) => {
    setSortBy((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: "desc" }
    );
  };

  const sortHeader = (key: SortKey, label: string, title?: string, extraClass = "") => {
    const active = sortBy.key === key;
    const Icon = sortBy.dir === "desc" ? ArrowDown : ArrowUp;
    return (
      <th scope="col" className={`px-2.5 py-2.5 text-right font-medium ${extraClass}`} title={title}>
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className={`inline-flex cursor-pointer items-center justify-end gap-1 transition-colors hover:text-text-primary ${
            active ? "font-semibold text-text-primary" : ""
          }`}
        >
          {active && <Icon size={12} strokeWidth={1.5} />}
          <span>{label}</span>
        </button>
      </th>
    );
  };

  const renderRosterTable = (players: TeamRosterItem[]) => (
    <Card padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border bg-background-tertiary/60 text-text-secondary">
              <th scope="col" className="w-8 px-3 py-2.5 text-right font-medium">#</th>
              <th scope="col" className="px-2.5 py-2.5 text-left font-medium">{tr ? "Oyuncu" : "Player"}</th>
              <th scope="col" className="hidden px-2.5 py-2.5 text-left font-medium md:table-cell">{tr ? "Poz" : "Pos"}</th>
              {sortHeader("GP", tr ? "Maç" : "GP", tr ? "Oynanan maç" : "Games played", "hidden sm:table-cell")}
              {sortHeader("AVG_MIN", tr ? "Dk" : "MIN", tr ? "Ortalama dakika" : "Minutes per game")}
              {sortHeader("AVG_PTS", tr ? "Sayı" : "PTS", tr ? "Maç başı sayı" : "Points per game")}
              {sortHeader("AVG_REB", tr ? "Rib" : "REB", tr ? "Maç başı ribaund" : "Rebounds per game")}
              {sortHeader("AVG_AST", tr ? "Ast" : "AST", tr ? "Maç başı asist" : "Assists per game")}
              {sortHeader("IMPORTANCE_SCORE", tr ? "Etki" : "Impact", tr ? "Model etki puanı" : "Model impact score", "pr-4")}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light tabular-nums">
            {players.map((p, idx) => {
              const played = p.GP > 0;
              const dash = (v: string) => (played ? v : "—");
              return (
                <tr
                  key={p.PLAYER_ID}
                  onClick={() => onSelectPlayer(p.PLAYER_ID)}
                  className="group cursor-pointer transition-colors hover:bg-background-tertiary/50"
                >
                  <td className="px-3 py-2.5 text-right text-text-muted">{idx + 1}</td>
                  <td className="px-2.5 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <PlayerPhoto
                        playerId={p.PLAYER_ID}
                        name={p.PLAYER_NAME}
                        size={28}
                        className="shrink-0 rounded-full border border-border"
                      />
                      <span className="truncate text-sm font-medium text-text-primary transition-colors group-hover:text-primary">
                        {p.PLAYER_NAME}
                      </span>
                    </div>
                  </td>
                  <td className="hidden px-2.5 py-2.5 text-text-secondary md:table-cell">
                    {posLabel(playerPositions[p.PLAYER_ID] || "forward")}
                  </td>
                  <td className="hidden px-2.5 py-2.5 text-right text-text-muted sm:table-cell">
                    {played ? p.GP : "—"}
                  </td>
                  <td className="px-2.5 py-2.5 text-right text-text-secondary">{dash(p.AVG_MIN.toFixed(0))}</td>
                  <td className="px-2.5 py-2.5 text-right font-semibold text-text-primary">{dash(p.AVG_PTS.toFixed(1))}</td>
                  <td className="px-2.5 py-2.5 text-right text-text-secondary">{dash(p.AVG_REB.toFixed(1))}</td>
                  <td className="px-2.5 py-2.5 text-right text-text-secondary">{dash(p.AVG_AST.toFixed(1))}</td>
                  <td className="px-2.5 py-2.5 pr-4 text-right font-semibold text-text-primary">
                    {dash(p.IMPORTANCE_SCORE.toFixed(1))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );

  if (loadingSeason && activeRosters.length === 0) {
    return <TeamExplorerSkeleton />;
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TeamLogo abbr={activeTeam} name={activeTeamFull} size={40} />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-tight text-text-primary sm:text-xl">
              {activeTeamFull}
            </h1>
            <p className="mt-0.5 text-xs tabular-nums text-text-secondary">
              {[
                activeRecord?.conference ? (tr ? (activeRecord.conference === "East" ? "Doğu" : "Batı") : activeRecord.conference) : null,
                activeRecord?.recordFormatted,
                activeRecord?.streak && activeRecord.streak !== "-" ? activeRecord.streak : null,
                selectedSeason,
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="w-44">
            <Select
              aria-label={t.team.selectTeam}
              value={activeTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
            >
              {teamsList.map((team) => (
                <option key={team} value={team}>
                  {TEAM_NAME_BY_ABBR[team as keyof typeof TEAM_NAME_BY_ABBR] || team}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-28">
            <Select
              aria-label={t.team.selectSeason}
              value={selectedSeason}
              onChange={(e) => {
                setLoadingSeason(true);
                setLoadError(null);
                setSelectedSeason(e.target.value);
              }}
            >
              {seasonsList.map((season) => (
                <option key={season} value={season}>
                  {season}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {loadingSeason && <p className="text-xs text-text-secondary">{t.team.loadingRosters}</p>}
      {loadError && <InlineError title={t.common.error} message={loadError} onRetry={fetchRosters} />}

      {/* Team Summary KPI Strip */}
      {view === "team" && (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card padding="sm" className="flex flex-col justify-between">
            <dt className="text-xs font-medium text-text-secondary">{tr ? "Sezon Derecesi" : "Season Record"}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
              {activeRecord && activeRecord.gp > 0 ? activeRecord.recordFormatted : "—"}
            </dd>
            <p className="mt-1 truncate text-xs tabular-nums text-text-muted">
              {activeRecord && activeRecord.gp > 0
                ? tr
                  ? `İç ${activeRecord.homeRecord} · Dep ${activeRecord.awayRecord}`
                  : `Home ${activeRecord.homeRecord} · Away ${activeRecord.awayRecord}`
                : selectedSeason}
            </p>
          </Card>

          <Card padding="sm" className="flex flex-col justify-between">
            <dt className="text-xs font-medium text-text-secondary">{tr ? "Maç Başı Sayı" : "Scoring (PPG)"}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
              {activeRecord && activeRecord.gp > 0 ? activeRecord.ppg : "—"}
            </dd>
            <p className="mt-1 truncate text-xs tabular-nums text-text-muted">
              {activeRecord && activeRecord.gp > 0
                ? tr
                  ? `Yenen ${activeRecord.oppPpg} · Fark ${activeRecord.diff}`
                  : `Opp ${activeRecord.oppPpg} · Diff ${activeRecord.diff}`
                : "—"}
            </p>
          </Card>

          <Card padding="sm" className="flex flex-col justify-between">
            <dt className="text-xs font-medium text-text-secondary">{tr ? "Güç Sırası" : "Power Rank"}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
              {activePowerIndex >= 0 ? `#${activePowerIndex + 1} / ${leagueTeamRanks.length}` : "—"}
            </dd>
            <p className="mt-1 truncate text-xs tabular-nums text-text-muted">
              {activePowerScore != null
                ? tr
                  ? `Etki ${activePowerScore.toFixed(1)} · Lig ort. ${leagueAverage.toFixed(1)}`
                  : `Impact ${activePowerScore.toFixed(1)} · Avg ${leagueAverage.toFixed(1)}`
                : "—"}
            </p>
          </Card>

          <Card
            padding="sm"
            className={`flex flex-col justify-between ${teamLeader ? "cursor-pointer transition-colors hover:border-card-border-hover" : ""}`}
            onClick={() => teamLeader && onSelectPlayer(teamLeader.PLAYER_ID)}
          >
            <dt className="text-xs font-medium text-text-secondary">{tr ? "Takım Lideri" : "Team Leader"}</dt>
            <dd className="mt-1 truncate text-base font-semibold text-text-primary sm:text-lg">
              {teamLeader ? teamLeader.PLAYER_NAME : "—"}
            </dd>
            <p className="mt-1 truncate text-xs tabular-nums text-text-muted">
              {teamLeader
                ? tr
                  ? `${teamLeader.AVG_PTS.toFixed(1)} SAY · ${teamLeader.AVG_REB.toFixed(1)} RİB · ${teamLeader.AVG_AST.toFixed(1)} AST`
                  : `${teamLeader.AVG_PTS.toFixed(1)} PTS · ${teamLeader.AVG_REB.toFixed(1)} REB · ${teamLeader.AVG_AST.toFixed(1)} AST`
                : "—"}
            </p>
          </Card>
        </dl>
      )}

      {/* View Switcher */}
      <div
        role="tablist"
        aria-label={tr ? "Takım görünümleri" : "Team views"}
        className="flex gap-6 border-b border-border"
      >
        {([
          ["team", tr ? "Takım Genel Bakış" : "Team Overview"],
          ["league", tr ? "Lig Sıralaması" : "League Rankings"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`-mb-px cursor-pointer border-b-2 pb-2.5 text-sm font-medium transition-colors ${
              view === id
                ? "border-primary font-semibold text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "team" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* Roster Table */}
          <section className="min-w-0 space-y-3 lg:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-text-primary">
                {tr ? "Kadro" : "Roster"}
                <span className="ml-2 text-xs font-normal tabular-nums text-text-muted">
                  ({filteredRoster.length})
                </span>
              </h2>
              <div
                role="group"
                aria-label={tr ? "Pozisyon filtresi" : "Position filter"}
                className="inline-flex items-center rounded border border-border bg-background-tertiary p-0.5 text-xs font-medium"
              >
                {(["all", "guard", "forward", "center"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPosFilter(k)}
                    aria-pressed={posFilter === k}
                    className={`cursor-pointer rounded-sm px-2.5 py-1 transition-colors ${
                      posFilter === k
                        ? "bg-background-primary font-semibold text-text-primary"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {posLabel(k)}
                  </button>
                ))}
              </div>
            </div>

            {sortedTeamRoster.length === 0 ? (
              <EmptyState
                icon={<Users size={28} strokeWidth={1.5} />}
                title={tr ? "Kadro bulunamadı" : "No roster found"}
                description={
                  tr
                    ? `${activeTeamFull} için ${selectedSeason} sezonunda kayıtlı oyuncu bulunamadı.`
                    : `No registered players found for ${activeTeamFull} in the ${selectedSeason} season.`
                }
              />
            ) : filteredRoster.length > 0 ? (
              renderRosterTable(filteredRoster)
            ) : (
              <EmptyState
                icon={<Users size={24} strokeWidth={1.5} />}
                title={tr ? "Bu pozisyonda oyuncu yok" : "No players at this position"}
                description={tr ? "Farklı bir pozisyon filtresi seçmeyi deneyin." : "Try selecting a different position filter."}
              />
            )}
          </section>

          {/* Recent Games Sidebar */}
          <aside className="lg:col-span-4">
            <Card padding="none" className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
                <h2 className="text-sm font-semibold text-text-primary">
                  {tr ? "Son Maçlar" : "Recent Games"}
                </h2>
                {activeRecord?.form && activeRecord.form.length > 0 && (
                  <div className="flex items-center gap-1" title={tr ? "Son 5 maç formu" : "Last 5 form"}>
                    {activeRecord.form.map((res, idx) => (
                      <span
                        key={idx}
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-sm text-xs font-semibold ${
                          res === "W"
                            ? "bg-status-success/10 text-status-success"
                            : "bg-status-error/10 text-status-error"
                        }`}
                      >
                        {tr ? (res === "W" ? "G" : "M") : res}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {teamRecentGames.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <Calendar size={24} strokeWidth={1.5} className="text-text-muted" />
                  <p className="text-xs text-text-secondary">
                    {tr ? "Henüz tamamlanmış maç yok." : "No completed games yet."}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border-light">
                  {teamRecentGames.map((g) => {
                    const isHome = g.HOME_TEAM_ABBREVIATION === activeTeam;
                    const oppAbbr = (isHome ? g.AWAY_TEAM_ABBREVIATION : g.HOME_TEAM_ABBREVIATION) || "";
                    const teamScore = Number(isHome ? g.HOME_SCORE : g.AWAY_SCORE) || 0;
                    const oppScore = Number(isHome ? g.AWAY_SCORE : g.HOME_SCORE) || 0;
                    const won = g.WINNER_TEAM_ABBREVIATION
                      ? g.WINNER_TEAM_ABBREVIATION === activeTeam
                      : teamScore > oppScore;

                    return (
                      <li
                        key={g.GAME_ID}
                        onClick={() => oppAbbr && setSelectedTeam(oppAbbr)}
                        className="flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-xs transition-colors hover:bg-background-tertiary/50"
                        title={tr ? `${getTeamShortName(oppAbbr, oppAbbr)} takımına geç` : `View ${getTeamShortName(oppAbbr, oppAbbr)}`}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm font-semibold ${
                              won
                                ? "bg-status-success/10 text-status-success"
                                : "bg-status-error/10 text-status-error"
                            }`}
                          >
                            {tr ? (won ? "G" : "M") : (won ? "W" : "L")}
                          </span>
                          <span className="w-4 shrink-0 text-center text-text-muted">
                            {isHome ? "vs" : "@"}
                          </span>
                          <TeamLogo abbr={oppAbbr} name={oppAbbr} size={20} className="shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-text-primary">
                              {getTeamShortName(oppAbbr, TEAM_NAME_BY_ABBR[oppAbbr as keyof typeof TEAM_NAME_BY_ABBR] || oppAbbr)}
                            </p>
                            <p className="truncate text-xs tabular-nums text-text-muted">
                              {formatDate(g.GAME_DATE)}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums text-text-primary">
                          {teamScore} – {oppScore}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </aside>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {/* Franchise strength section */}
          <Card padding="none" className="overflow-hidden">
            <div
              className="flex items-baseline justify-between border-b border-border px-4 py-3"
              title={tr ? "İlk 3 oyuncunun ortalama etki puanı" : "Average impact score of the top 3 players"}
            >
              <h2 className="text-sm font-semibold text-text-primary">
                {tr ? "Takım güç endeksi" : "Team power index"}
              </h2>
              <span className="text-xs tabular-nums text-text-muted">
                {tr ? "ort." : "avg"} {leagueAverage.toFixed(1)}
              </span>
            </div>
            <div className="divide-y divide-border-light">
              {leagueTeamRanks.map((item, index) => {
                const difference = item.score - leagueAverage;
                const barPct = Math.max(4, Math.min(100, (item.score / (maxTeamScore || 1)) * 100));
                return (
                  <button
                    key={item.team}
                    type="button"
                    onClick={() => {
                      setSelectedTeam(item.team);
                      setView("team");
                    }}
                    className="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left text-xs transition-colors hover:bg-background-tertiary/50"
                  >
                    <span className="w-5 text-right tabular-nums text-text-muted">
                      {index + 1}
                    </span>
                    <TeamLogo abbr={item.team} size={22} />
                    <span className="w-36 truncate font-medium text-text-primary">
                      {TEAM_NAME_BY_ABBR[item.team as keyof typeof TEAM_NAME_BY_ABBR] || item.team}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background-tertiary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <span className="w-10 text-right font-semibold tabular-nums text-text-primary">
                      {item.score.toFixed(1)}
                    </span>
                    <span
                      className={`hidden w-12 text-right tabular-nums sm:block ${
                        difference >= 0 ? "font-medium text-status-success" : "text-text-muted"
                      }`}
                    >
                      {difference >= 0 ? "+" : ""}
                      {difference.toFixed(1)}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* League leaders section */}
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-text-primary">
                {tr ? "Lig liderleri" : "League leaders"}
              </h2>
              <span className="text-xs text-text-muted">
                {tr ? "Etki puanına göre" : "By impact score"}
              </span>
            </div>
            <div className="divide-y divide-border-light">
              {leaguePlayerLeaders.map((player, index) => (
                <button
                  key={`${player.TEAM_ABBREVIATION}-${player.PLAYER_ID}`}
                  type="button"
                  onClick={() => onSelectPlayer(player.PLAYER_ID)}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left text-xs transition-colors hover:bg-background-tertiary/50"
                  aria-label={`Open ${player.PLAYER_NAME} player profile`}
                >
                  <span className="w-5 text-right tabular-nums text-text-muted">
                    {index + 1}
                  </span>
                  <PlayerPhoto
                    playerId={player.PLAYER_ID}
                    name={player.PLAYER_NAME}
                    size={28}
                    className="rounded-full border border-border"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-text-primary">
                      {player.PLAYER_NAME}
                    </p>
                    <p className="truncate text-xs tabular-nums text-text-muted">
                      {player.TEAM_ABBREVIATION} · {player.AVG_PTS.toFixed(1)} {tr ? "SAY" : "PTS"} · {player.AVG_REB.toFixed(1)} {tr ? "RİB" : "REB"} · {player.AVG_AST.toFixed(1)} AST
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums text-text-primary">
                    {player.IMPORTANCE_SCORE.toFixed(1)}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default TeamExplorer;
