import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  Users,
} from "lucide-react";
import TeamLogo from "./TeamLogo";
import PlayerPhoto from "./PlayerPhoto";
import { NBA_TEAM_ABBRS, TEAM_NAME_BY_ABBR } from "../lib/nbaTeams";
import { loadPrivateApi } from "../lib/dataCache";
import { CURRENT_SEASON } from "../lib/constants";
import { loadArchivedGameIndex } from "../lib/archiveData";
import { computeSeasonTeamRecords, type TeamRecordsMap } from "../lib/teamRecords";
import {
  Card,
  Skeleton,
  EmptyState,
  InlineError,
  Select,
} from "./common";
import { useLanguage } from "../context/LanguageContext";

interface CorePlayer {
  PLAYER_ID: number;
  PLAYER_NAME: string;
  TEAM_ABBREVIATION: string;
  CORE_RANK: number;
  IMPORTANCE_SCORE: number;
  GP: number;
  AVG_PTS: number;
  AVG_REB: number;
  AVG_AST: number;
  AVG_MIN: number;
}

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
  rosters?: any[];
  onSelectPlayer: (playerId: number) => void;
  initialTeam?: string;
}

function TeamExplorerSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header skeleton */}
      <Card padding="md" className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32 rounded" />
            <div className="flex items-center gap-3">
              <Skeleton variant="circular" width={40} height={40} className="shrink-0" />
              <div className="space-y-1">
                <Skeleton className="h-6 w-48 rounded" />
                <Skeleton className="h-4 w-36 rounded" />
              </div>
            </div>
            <Skeleton className="h-4 w-64 rounded" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-16 w-24 rounded" />
            <Skeleton className="h-16 w-24 rounded" />
            <Skeleton className="h-16 w-24 rounded" />
          </div>
        </div>
        <div className="border-t border-border-light pt-3 space-y-2">
          <Skeleton className="h-4 w-16 rounded" />
          <div className="flex gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-16 rounded" />
            ))}
          </div>
        </div>
      </Card>

      {/* Tabs skeleton */}
      <Skeleton className="h-9 w-48 rounded" />

      {/* Core players cards skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-40 rounded" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} padding="md" className="space-y-3">
              <div className="flex justify-between items-center">
                <Skeleton className="h-5 w-36 rounded-sm" />
                <Skeleton className="h-4 w-8 rounded" />
              </div>
              <div className="flex justify-between items-center gap-3">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-5 w-32 rounded" />
                  <Skeleton className="h-3.5 w-44 rounded" />
                </div>
                <Skeleton variant="circular" width={52} height={52} className="shrink-0" />
              </div>
              <div className="space-y-1 pt-1">
                <Skeleton className="h-3.5 w-full rounded" />
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
              <div className="border-t border-border-light pt-3 grid grid-cols-4 gap-2">
                <Skeleton className="h-11 rounded" />
                <Skeleton className="h-11 rounded" />
                <Skeleton className="h-11 rounded" />
                <Skeleton className="h-11 rounded" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

const TeamExplorer: React.FC<TeamExplorerProps> = ({ onSelectPlayer, initialTeam }) => {
  const { t, language } = useLanguage();
  const [selectedSeason, setSelectedSeason] = useState<string>(CURRENT_SEASON);
  const [activeRosters, setActiveRosters] = useState<any[]>([]);
  const [teamRecords, setTeamRecords] = useState<TeamRecordsMap | null>(null);
  const [playerPositions, setPlayerPositions] = useState<Record<number, "guard" | "forward" | "center">>({});
  const [loadingSeason, setLoadingSeason] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string>(() => initialTeam || "BOS");

  useEffect(() => {
    if (initialTeam) {
      setSelectedTeam(initialTeam);
    }
  }, [initialTeam]);

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
      .catch(() => {});
  }, []);

  const [view, setView] = useState<"team" | "league">("team");
  const [posFilter, setPosFilter] = useState<"all" | "guard" | "forward" | "center">("all");

  const seasonsList = useMemo(
    () => ["2026-27", "2025-26", "2024-25", "2023-24", "2022-23", "2021-22", "2020-21"],
    []
  );

  const fetchRosters = useCallback(async () => {
    setLoadingSeason(true);
    setLoadError(null);
    try {
      const [rosterData, gamesData] = await Promise.all([
        loadPrivateApi<any[]>(
          `/frontend-data-api/team-rosters?season=${encodeURIComponent(selectedSeason)}`
        ),
        loadArchivedGameIndex(selectedSeason).catch(() => []),
      ]);
      setActiveRosters(rosterData || []);
      setTeamRecords(computeSeasonTeamRecords(gamesData || []));
    } catch {
      setLoadError(`${selectedSeason} kadro verileri yüklenemedi.`);
      setActiveRosters([]);
      setTeamRecords(null);
    } finally {
      setLoadingSeason(false);
    }
  }, [selectedSeason]);

  useEffect(() => {
    fetchRosters();
  }, [fetchRosters]);

  const teamsList = useMemo(() => {
    if (!activeRosters || activeRosters.length === 0) return [...NBA_TEAM_ABBRS];
    const extracted = Array.from(
      new Set(activeRosters.map((r) => r.TEAM_ABBREVIATION))
    ).filter(Boolean);
    return extracted.length > 0 ? (extracted as string[]).sort() : [...NBA_TEAM_ABBRS];
  }, [activeRosters]);


  const activeTeam = teamsList.includes(selectedTeam) ? selectedTeam : teamsList[0] || "BOS";

  const rawTeamRoster: TeamRosterItem[] = useMemo(() => {
    if (!activeRosters) return [];
    return activeRosters
      .filter((r) => r.TEAM_ABBREVIATION === activeTeam)
      .map((r) => {
        const isCurrentSeasonStats = r.STATS_SEASON === selectedSeason;
        const gp = isCurrentSeasonStats ? Number(r.GP || 0) : 0;
        const min = isCurrentSeasonStats ? Number(r.AVG_MIN || 0) : 0;
        const pts = isCurrentSeasonStats ? Number(r.AVG_PTS || 0) : 0;
        const reb = isCurrentSeasonStats ? Number(r.AVG_REB || 0) : 0;
        const ast = isCurrentSeasonStats ? Number(r.AVG_AST || 0) : 0;
        const importance = isCurrentSeasonStats ? Number(r.IMPORTANCE_SCORE || 0) : 0;

        return {
          TEAM_ABBREVIATION: r.TEAM_ABBREVIATION,
          PLAYER_ID: Number(r.PLAYER_ID),
          PLAYER_NAME: r.PLAYER_NAME || `Player ${r.PLAYER_ID}`,
          GP: gp,
          AVG_MIN: min,
          AVG_PTS: pts,
          AVG_REB: reb,
          AVG_AST: ast,
          IMPORTANCE_SCORE: importance,
          STATS_SEASON: r.STATS_SEASON,
        };
      });
  }, [activeRosters, activeTeam, selectedSeason]);

  const corePlayers: CorePlayer[] = useMemo(() => {
    return [...rawTeamRoster]
      .sort((a, b) => b.IMPORTANCE_SCORE - a.IMPORTANCE_SCORE)
      .slice(0, 5)
      .map((p, index) => ({
        ...p,
        CORE_RANK: index + 1,
      }));
  }, [rawTeamRoster]);

  const sortedTeamRoster = useMemo(() => {
    return [...rawTeamRoster].sort((a, b) => b.IMPORTANCE_SCORE - a.IMPORTANCE_SCORE);
  }, [rawTeamRoster]);

  const leagueTeamRanks = useMemo(() => {
    if (!activeRosters || activeRosters.length === 0) return [];
    const teamScores: Record<string, number[]> = {};
    activeRosters.forEach((r) => {
      const team = r.TEAM_ABBREVIATION;
      if (!team) return;
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
  }, [activeRosters]);

  const leagueAverage = useMemo(() => {
    if (!leagueTeamRanks.length) return 0;
    return (
      leagueTeamRanks.reduce((sum, item) => sum + item.score, 0) / leagueTeamRanks.length
    );
  }, [leagueTeamRanks]);

  const leaguePlayerLeaders = useMemo(() => {
    if (!activeRosters) return [];
    return [...activeRosters]
      .map((r) => ({
        ...r,
        IMPORTANCE_SCORE: Number(r.IMPORTANCE_SCORE || 0),
        CORE_RANK: Number(r.CORE_RANK || 99),
      }))
      .sort((a, b) => b.IMPORTANCE_SCORE - a.IMPORTANCE_SCORE)
      .slice(0, 15);
  }, [activeRosters]);


  const posLabel = (k: "all" | "guard" | "forward" | "center") =>
    k === "all"
      ? (language === "tr" ? "Hepsi" : "All")
      : k === "guard" ? "Guard" : k === "forward" ? "Forward" : "Center";

  const filteredRoster = sortedTeamRoster.filter(
    (p) => posFilter === "all" || (playerPositions[p.PLAYER_ID] || "forward") === posFilter
  );

  const renderRosterTable = (players: TeamRosterItem[], ranked: boolean) => (
    <div className="overflow-x-auto rounded border border-border bg-background-primary">
      <table className="w-full min-w-[560px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-border-light bg-background-tertiary text-text-secondary">
            <th scope="col" className="w-8 px-3 py-2 text-right font-medium">#</th>
            <th scope="col" className="px-2 py-2 text-left font-medium">{language === "tr" ? "Oyuncu" : "Player"}</th>
            {!ranked && <th scope="col" className="px-2 py-2 text-left font-medium">{language === "tr" ? "Poz" : "Pos"}</th>}
            <th scope="col" className="px-2 py-2 text-right font-medium">GP</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">MIN</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">PTS</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">REB</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">AST</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{language === "tr" ? "Etki" : "Impact"}</th>
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
                className="group cursor-pointer transition-colors hover:bg-background-tertiary/40"
              >
                <td className="px-3 py-2 text-right text-text-muted">{idx + 1}</td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2.5">
                    <PlayerPhoto
                      playerId={p.PLAYER_ID}
                      name={p.PLAYER_NAME}
                      size={32}
                      className="shrink-0 rounded-full border border-border"
                    />
                    <span className="truncate text-sm font-semibold text-text-primary transition-colors group-hover:text-primary">
                      {p.PLAYER_NAME}
                    </span>
                  </div>
                </td>
                {!ranked && (
                  <td className="px-2 py-2 text-text-secondary">
                    {posLabel(playerPositions[p.PLAYER_ID] || "forward")}
                  </td>
                )}
                <td className="px-2 py-2 text-right text-text-muted">{p.GP}</td>
                <td className="px-2 py-2 text-right text-text-secondary">{dash(p.AVG_MIN.toFixed(0))}</td>
                <td className="px-2 py-2 text-right font-semibold text-text-primary">{dash(p.AVG_PTS.toFixed(1))}</td>
                <td className="px-2 py-2 text-right text-text-secondary">{dash(p.AVG_REB.toFixed(1))}</td>
                <td className="px-2 py-2 text-right text-text-secondary">{dash(p.AVG_AST.toFixed(1))}</td>
                <td className="px-3 py-2 text-right font-semibold text-text-primary">{p.IMPORTANCE_SCORE.toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );


  if (loadingSeason && activeRosters.length === 0) {
    return <TeamExplorerSkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <Card padding="md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <TeamLogo abbr={activeTeam} name={TEAM_NAME_BY_ABBR[activeTeam as keyof typeof TEAM_NAME_BY_ABBR]} size={56} />
            <div>
              <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">
                {TEAM_NAME_BY_ABBR[activeTeam as keyof typeof TEAM_NAME_BY_ABBR] || activeTeam}
              </h1>
              <p className="mt-0.5 text-xs text-text-secondary tabular-nums">
                {[teamRecords?.get(activeTeam)?.recordFormatted, selectedSeason].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-48">
              <Select
                label={t.team.selectTeam}
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
            <div className="w-32">
              <Select
                label={t.team.selectSeason}
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value)}
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

        {/* Season Status Info */}
        {(loadingSeason || loadError) && (
          <div className="mt-3 border-t border-border-light pt-2.5">
            {loadingSeason && (
              <p className="text-xs text-text-secondary">
                {t.team.loadingRosters}
              </p>
            )}
            {loadError && (
              <div className="mt-2">
                <InlineError
                  title={t.common.error}
                  message={loadError}
                  onRetry={fetchRosters}
                />
              </div>
            )}
          </div>
        )}
      </Card>

      {/* View Switcher */}
      <nav
        aria-label="Views"
        className="flex gap-1 border-b border-border bg-background-primary pb-px"
      >
        <button
          type="button"
          onClick={() => setView("team")}
          className={`border-b-2 px-3 py-2 text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
            view === "team"
              ? "border-primary text-text-primary"
              : "border-transparent text-text-secondary hover:border-border hover:text-text-primary"
          }`}
        >
          {language === "tr" ? "Takım Genel Bakış" : "Team Overview"}
        </button>
        <button
          type="button"
          onClick={() => setView("league")}
          className={`border-b-2 px-3 py-2 text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
            view === "league"
              ? "border-primary text-text-primary"
              : "border-transparent text-text-secondary hover:border-border hover:text-text-primary"
          }`}
        >
          {language === "tr" ? "Lig Sıralaması" : "League Rankings"}
        </button>
      </nav>

      {view === "team" ? (
        <>
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">
                {language === "tr" ? "Çekirdek Rotasyon" : "Core Rotation"}
              </h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                {language === "tr"
                  ? "Model etki puanına göre en belirleyici 5 oyuncu"
                  : "Top 5 players by model impact score"}
              </p>
            </div>
            {corePlayers.length > 0 ? (
              renderRosterTable(corePlayers, true)
            ) : (
              <EmptyState
                icon={<Users size={28} strokeWidth={1.5} />}
                title={language === "tr" ? "Kadro bulunamadı" : "No roster found"}
                description={
                  language === "tr"
                    ? `${TEAM_NAME_BY_ABBR[activeTeam as keyof typeof TEAM_NAME_BY_ABBR] || activeTeam} için ${selectedSeason} sezonunda kayıtlı oyuncu bulunamadı.`
                    : `No registered players found for ${TEAM_NAME_BY_ABBR[activeTeam as keyof typeof TEAM_NAME_BY_ABBR] || activeTeam} in the ${selectedSeason} season.`
                }
              />
            )}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">
                  {language === "tr" ? "Tam Kadro" : "Full Roster"}
                </h2>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {language === "tr" ? "Sezon ortalamaları, etki puanına göre sıralı" : "Season averages, sorted by impact score"}
                </p>
              </div>
              <div role="group" aria-label="Position filter" className="flex gap-1">
                {(["all", "guard", "forward", "center"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPosFilter(k)}
                    aria-pressed={posFilter === k}
                    className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      posFilter === k
                        ? "border-primary text-text-primary"
                        : "border-border text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {posLabel(k)}
                  </button>
                ))}
              </div>
            </div>
            {filteredRoster.length > 0 ? (
              renderRosterTable(filteredRoster, false)
            ) : (
              <p className="py-6 text-center text-xs italic text-text-muted">
                {language === "tr" ? "Kayıtlı oyuncu bulunamadı" : "No players found"}
              </p>
            )}
          </section>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Franchise strength section */}
          <Card padding="none" className="overflow-hidden">
            <div className="border-b border-border p-4">
              <h2 className="text-sm font-semibold text-text-primary">
                {language === "tr" ? "Takım Güç Endeksi" : "Team Power Index"}
              </h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                {language === "tr" ? "İlk 3 oyuncunun ortalama önem puanı · lig ortalaması " : "Top 3 players avg importance · league average "}
                <span className="tabular-nums font-medium text-text-primary">
                  {leagueAverage.toFixed(1)}
                </span>
              </p>
            </div>
            <div className="divide-y divide-border-light">
              {leagueTeamRanks.map((item, index) => {
                const difference = item.score - leagueAverage;
                return (
                  <button
                    key={item.team}
                    type="button"
                    onClick={() => {
                      setSelectedTeam(item.team);
                      setView("team");
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs transition-colors hover:bg-background-tertiary cursor-pointer"
                  >
                    <span className="w-5 text-right tabular-nums text-text-muted">
                      {index + 1}
                    </span>
                    <TeamLogo abbr={item.team} size={22} />
                    <span className="w-36 truncate font-semibold text-text-primary">
                      {TEAM_NAME_BY_ABBR[item.team as keyof typeof TEAM_NAME_BY_ABBR] || item.team}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background-tertiary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(item.score, 100)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right font-semibold tabular-nums text-text-primary">
                      {item.score.toFixed(1)}
                    </span>
                    <span
                      className={`hidden w-12 text-right tabular-nums sm:block ${
                        difference >= 0 ? "text-status-success font-medium" : "text-text-muted"
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
            <div className="border-b border-border p-4">
              <h2 className="text-sm font-semibold text-text-primary">
                {language === "tr" ? "Lig Liderleri" : "League Leaders"}
              </h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                {language === "tr"
                  ? `Önem puanına göre en etkili oyuncular · ${selectedSeason}`
                  : `Top players by importance score · ${selectedSeason}`}
              </p>
            </div>
            <div className="divide-y divide-border-light">
              {leaguePlayerLeaders.map((player, index) => (
                <button
                  key={`${player.TEAM_ABBREVIATION}-${player.PLAYER_ID}`}
                  type="button"
                  onClick={() => onSelectPlayer(player.PLAYER_ID)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs transition-colors hover:bg-background-tertiary cursor-pointer"
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
                    <p className="text-xs text-text-muted">
                      {player.TEAM_ABBREVIATION} · {language === "tr" ? `sıra #${player.CORE_RANK}` : `rank #${player.CORE_RANK}`}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums text-text-primary">
                    {player.IMPORTANCE_SCORE.toFixed(1)}%
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
