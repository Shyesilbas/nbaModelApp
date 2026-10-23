import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  ChevronDown,
  Search,
  Users,
  ChevronRight,
} from "lucide-react";
import TeamLogo from "./TeamLogo";
import PlayerPhoto from "./PlayerPhoto";
import { NBA_TEAM_ABBRS, TEAM_NAME_BY_ABBR } from "../lib/nbaTeams";
import { loadPrivateApi } from "../lib/dataCache";
import { CURRENT_SEASON } from "../lib/constants";
import {
  Card,
  Skeleton,
  EmptyState,
  InlineError,
} from "./common";

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
  const [selectedSeason, setSelectedSeason] = useState<string>(CURRENT_SEASON);
  const [activeRosters, setActiveRosters] = useState<any[]>([]);
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

  const seasonsList = useMemo(
    () => ["2026-27", "2025-26", "2024-25", "2023-24", "2022-23", "2021-22", "2020-21"],
    []
  );

  const fetchRosters = useCallback(async () => {
    setLoadingSeason(true);
    setLoadError(null);
    try {
      const data = await loadPrivateApi<any[]>(
        `/frontend-data-api/team-rosters?season=${encodeURIComponent(selectedSeason)}`
      );
      setActiveRosters(data || []);
    } catch {
      setLoadError(`${selectedSeason} kadro verileri yüklenemedi.`);
      setActiveRosters([]);
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


  if (loadingSeason && activeRosters.length === 0) {
    return <TeamExplorerSkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <Card padding="md">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <Search size={14} strokeWidth={1.5} />
              <span className="font-medium">Franchise deep lens</span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <TeamLogo
                abbr={activeTeam}
                name={TEAM_NAME_BY_ABBR[activeTeam as keyof typeof TEAM_NAME_BY_ABBR]}
                size={40}
              />
              <div>
                <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">
                  {TEAM_NAME_BY_ABBR[activeTeam as keyof typeof TEAM_NAME_BY_ABBR] || activeTeam}
                </h1>
                <p className="text-xs text-text-secondary">
                  Team Explorer · {selectedSeason} Sezonu
                </p>
              </div>
            </div>
            <p className="mt-2 max-w-2xl text-xs text-text-secondary">
              Kadrolar, çekirdek oyuncu rotasyonu ve takım güç endeksleri.
            </p>
          </div>

          {/* Selectors: Season & Team Dropdowns */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {/* Team Dropdown */}
            <div className="flex flex-col gap-1">
              <label htmlFor="team-explorer-team-select" className="text-xs font-medium text-text-secondary">
                Takım Seçimi
              </label>
              <div className="relative">
                <select
                  id="team-explorer-team-select"
                  value={activeTeam}
                  onChange={(e) => setSelectedTeam(e.target.value)}
                  className="appearance-none rounded border border-border bg-background-primary py-1.5 pl-3 pr-8 text-xs font-semibold tabular-nums text-text-primary outline-none transition-colors hover:bg-background-tertiary focus:border-border-focus cursor-pointer"
                >
                  {teamsList.map((team) => (
                    <option key={team} value={team}>
                      {team} - {TEAM_NAME_BY_ABBR[team as keyof typeof TEAM_NAME_BY_ABBR] || team}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted"
                />
              </div>
            </div>

            {/* Season Dropdown */}
            <div className="flex flex-col gap-1">
              <label htmlFor="team-explorer-season-select" className="text-xs font-medium text-text-secondary">
                Sezon Seçimi
              </label>
              <div className="relative">
                <select
                  id="team-explorer-season-select"
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(e.target.value)}
                  className="appearance-none rounded border border-border bg-background-primary py-1.5 pl-3 pr-8 text-xs font-semibold tabular-nums text-text-primary outline-none transition-colors hover:bg-background-tertiary focus:border-border-focus cursor-pointer"
                >
                  {seasonsList.map((season) => (
                    <option key={season} value={season}>
                      {season} Sezonu
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Season Status Info */}
        {(loadingSeason || loadError) && (
          <div className="mt-3 border-t border-border-light pt-2.5">
            {loadingSeason && (
              <p className="text-xs text-text-secondary">
                {selectedSeason} kadro verileri yükleniyor...
              </p>
            )}
            {loadError && (
              <div className="mt-2">
                <InlineError
                  title="Kadro verisi yüklenemedi"
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
          Takım Genel Bakış
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
          Lig Sıralaması
        </button>
      </nav>

      {view === "team" ? (
        <>
          {/* Franchise Hierarchy Overview */}
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Çekirdek Rotasyon (Top 5)</h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                Model etki puanına göre takımın en belirleyici ilk 5 oyuncusu
              </p>
            </div>

            {corePlayers.length > 0 ? (
              <div className="rounded border border-border bg-background-primary divide-y divide-border-light">
                {corePlayers.map((player, idx) => {
                  return (
                    <div
                      key={player.PLAYER_ID}
                      onClick={() => onSelectPlayer(player.PLAYER_ID)}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 transition-colors hover:bg-background-tertiary/40 cursor-pointer"
                    >
                      {/* Left: Player Info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-bold tabular-nums text-text-muted w-4">
                          #{idx + 1}
                        </span>
                        <PlayerPhoto
                          playerId={player.PLAYER_ID}
                          name={player.PLAYER_NAME}
                          size={40}
                          className="shrink-0 rounded-full border border-border ring-1 ring-border"
                        />
                        <div className="min-w-0">
                          <span className="truncate text-sm font-semibold text-text-primary group-hover:text-primary transition-colors block">
                            {player.PLAYER_NAME}
                          </span>
                          <p className="text-xs tabular-nums text-text-muted">
                            {player.GP > 0 ? `${player.GP} maç oynadı` : "Henüz maça çıkmadı"}
                          </p>
                        </div>
                      </div>

                      {/* Right: Model Score + Stats */}
                      <div className="flex items-center gap-5 sm:gap-6 shrink-0 self-end sm:self-center">
                        {/* Model Score */}
                        <div className="text-right">
                          <span className="text-sm font-bold tabular-nums text-text-primary">
                            {player.IMPORTANCE_SCORE.toFixed(1)}%
                          </span>
                          <p className="text-[10px] uppercase tracking-wider text-text-muted">
                            Model Etki
                          </p>
                        </div>

                        {/* Traditional Stats */}
                        <div className="flex items-center gap-3 sm:gap-4 border-l border-border-light pl-4 tabular-nums text-right">
                          <div>
                            <span className="text-xs font-bold text-text-primary">
                              {player.AVG_PTS.toFixed(1)}
                            </span>
                            <p className="text-[10px] text-text-muted">PTS</p>
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-text-secondary">
                              {player.AVG_REB.toFixed(1)}
                            </span>
                            <p className="text-[10px] text-text-muted">REB</p>
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-text-secondary">
                              {player.AVG_AST.toFixed(1)}
                            </span>
                            <p className="text-[10px] text-text-muted">AST</p>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-text-muted">
                              {player.AVG_MIN.toFixed(0)}m
                            </span>
                            <p className="text-[10px] text-text-muted">MIN</p>
                          </div>
                        </div>

                        <ChevronRight size={15} className="text-text-muted group-hover:text-primary transition-colors hidden sm:block" />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={<Users size={28} strokeWidth={1.5} />}
                title="Kadro bulunamadı"
                description={`${activeTeam} takımı için ${selectedSeason} sezonunda kayıtlı oyuncu bulunamadı.`}
              />
            )}
          </div>

          {/* Full Discovered Roster Grouped by Position */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Tam Takım Kadrosu</h3>
              <p className="text-xs text-text-secondary">
                Pozisyon bazında (Guard, Forvet, Center) ayrılmış oyuncu listesi ve sezon istatistikleri
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {(["guard", "forward", "center"] as const).map((posKey) => {
                const title = posKey === "guard" ? "Guards" : posKey === "forward" ? "Forwards" : "Centers";
                const players = sortedTeamRoster.filter((p) => {
                  const pos = playerPositions[p.PLAYER_ID] || "forward";
                  return pos === posKey;
                });

                return (
                  <div key={posKey} className="rounded border border-border bg-background-primary p-4 flex flex-col">
                    <div className="flex items-center justify-between border-b border-border-light pb-2.5 mb-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                        {title}
                      </span>
                      <span className="text-xs font-medium text-text-muted tabular-nums">
                        {players.length} oyuncu
                      </span>
                    </div>

                    {players.length === 0 ? (
                      <p className="text-xs text-text-muted py-6 text-center italic">
                        Kayıtlı oyuncu bulunamadı
                      </p>
                    ) : (
                      <div className="divide-y divide-border-light">
                        {players.map((p) => {
                          return (
                            <div
                              key={p.PLAYER_ID}
                              onClick={() => onSelectPlayer(p.PLAYER_ID)}
                              className="group flex items-center justify-between py-2.5 px-1 transition-colors hover:bg-background-tertiary/40 cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <PlayerPhoto
                                  playerId={p.PLAYER_ID}
                                  name={p.PLAYER_NAME}
                                  size={34}
                                  className="shrink-0 rounded-full border border-border ring-1 ring-border"
                                />
                                <div className="min-w-0">
                                  <span className="truncate text-xs font-semibold text-text-primary group-hover:text-primary transition-colors block">
                                    {p.PLAYER_NAME}
                                  </span>
                                  <p className="text-[11px] tabular-nums text-text-muted">
                                    {p.GP > 0 ? `${p.GP} maç · ${p.AVG_MIN.toFixed(0)} dk` : "Henüz oynamadı"}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 tabular-nums text-right shrink-0">
                                <div>
                                  <span className="text-xs font-bold text-text-primary">
                                    {p.AVG_PTS.toFixed(1)}
                                  </span>
                                  <span className="ml-1 text-[10px] text-text-muted">PTS</span>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-text-secondary">
                                    {p.AVG_REB.toFixed(1)}
                                  </span>
                                  <span className="ml-1 text-[10px] text-text-muted">REB</span>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-text-secondary">
                                    {p.AVG_AST.toFixed(1)}
                                  </span>
                                  <span className="ml-1 text-[10px] text-text-muted">AST</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Franchise strength section */}
          <Card padding="none" className="overflow-hidden">
            <div className="border-b border-border p-4">
              <h2 className="text-sm font-semibold text-text-primary">Takım Güç Endeksi</h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                İlk 3 oyuncunun ortalama önem puanı · lig ortalaması{" "}
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
                    <span className="w-10 font-semibold text-text-primary">{item.team}</span>
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
              <h2 className="text-sm font-semibold text-text-primary">Lig Liderleri</h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                Önem puanına göre en etkili oyuncular · {selectedSeason}
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
                      {player.TEAM_ABBREVIATION} · sıra #{player.CORE_RANK}
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
