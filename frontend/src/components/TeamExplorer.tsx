import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  Award,
  Layers3,
  User,
  Flame,
  TrendingUp,
  Info,
  ArrowUpDown,
  ChevronUp,
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
  Badge,
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
}

interface TeamExplorerProps {
  rosters?: any[];
  onSelectPlayer: (playerId: number) => void;
  initialTeam?: string;
}

const ROLE_BY_RANK: Record<number, { title: string; description: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  0: {
    title: "Franchise Anchor",
    description: "Primary scoring option, highest offensive usage, and centerpiece of game planning.",
    icon: Flame,
  },
  1: {
    title: "Secondary Engine",
    description: "Co-star who stabilizes secondary lineups, secondary shot creator and playmaker.",
    icon: TrendingUp,
  },
  2: {
    title: "High-Leverage Starter",
    description: "Crucial starting contributor who balances the floor through spacing, defense, or secondary creation.",
    icon: Layers3,
  },
  3: {
    title: "System Specialist",
    description: "Defined starting or sixth-man role player delivering elite finishing, wing defense, or perimeter shooting.",
    icon: User,
  },
  4: {
    title: "Rotation Stabilizer",
    description: "Fifth rotation core piece holding structural floor minutes with consistent baseline execution.",
    icon: Award,
  },
};

const ROLE_BADGE_VARIANT: Record<number, "primary" | "info" | "neutral"> = {
  0: "primary",
  1: "info",
  2: "neutral",
  3: "neutral",
  4: "neutral",
};

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
  const [loadingSeason, setLoadingSeason] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string>(() => initialTeam || "BOS");

  useEffect(() => {
    if (initialTeam) {
      setSelectedTeam(initialTeam);
    }
  }, [initialTeam]);

  const [view, setView] = useState<"team" | "league">("team");
  const [sortBy, setSortBy] = useState<keyof TeamRosterItem>("IMPORTANCE_SCORE");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

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

  const currentStatsCount = useMemo(
    () => activeRosters.filter((r) => r.STATS_SEASON === selectedSeason).length,
    [activeRosters, selectedSeason]
  );

  const activeTeam = teamsList.includes(selectedTeam) ? selectedTeam : teamsList[0] || "BOS";

  const rawTeamRoster: TeamRosterItem[] = useMemo(() => {
    if (!activeRosters) return [];
    return activeRosters
      .filter((r) => r.TEAM_ABBREVIATION === activeTeam)
      .map((r) => ({
        TEAM_ABBREVIATION: r.TEAM_ABBREVIATION,
        PLAYER_ID: Number(r.PLAYER_ID),
        PLAYER_NAME: r.PLAYER_NAME || `Player ${r.PLAYER_ID}`,
        GP: Number(r.GP || 0),
        AVG_MIN: Number(r.AVG_MIN || 0),
        AVG_PTS: Number(r.AVG_PTS || 0),
        AVG_REB: Number(r.AVG_REB || 0),
        AVG_AST: Number(r.AVG_AST || 0),
        IMPORTANCE_SCORE: Number(r.IMPORTANCE_SCORE || 0),
      }));
  }, [activeRosters, activeTeam]);

  const corePlayers: CorePlayer[] = useMemo(() => {
    return [...rawTeamRoster]
      .sort((a, b) => b.IMPORTANCE_SCORE - a.IMPORTANCE_SCORE)
      .slice(0, 5)
      .map((p, index) => ({
        ...p,
        CORE_RANK: index + 1,
      }));
  }, [rawTeamRoster]);

  const handleSort = (field: keyof TeamRosterItem) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const sortedTeamRoster = useMemo(() => {
    return [...rawTeamRoster].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortOrder === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortOrder === "asc" ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
    });
  }, [rawTeamRoster, sortBy, sortOrder]);

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

  const teamSummary = useMemo(() => {
    const size = rawTeamRoster.length;
    const avgPts = size ? rawTeamRoster.reduce((sum, p) => sum + p.AVG_PTS, 0) / size : 0;
    const top3 = corePlayers.slice(0, 3);
    const strength = top3.length
      ? top3.reduce((sum, p) => sum + p.IMPORTANCE_SCORE, 0) / top3.length
      : 0;
    return { size, avgPts, strength };
  }, [rawTeamRoster, corePlayers]);

  const renderSortIndicator = (field: keyof TeamRosterItem) => {
    if (sortBy !== field) {
      return <ArrowUpDown size={12} className="inline ml-1 text-text-muted" />;
    }
    return sortOrder === "asc" ? (
      <ChevronUp size={12} className="inline ml-1 text-text-primary" />
    ) : (
      <ChevronDown size={12} className="inline ml-1 text-text-primary" />
    );
  };

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

          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded border border-border bg-background-tertiary p-2.5 text-center w-24 min-w-24 sm:w-28">
              <p className="text-xs font-normal text-text-secondary">Kadro</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-text-primary">
                {teamSummary.size}
              </p>
            </div>
            <div className="rounded border border-border bg-background-tertiary p-2.5 text-center w-24 min-w-24 sm:w-28">
              <p className="text-xs font-normal text-text-secondary">Ort. PTS</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-text-primary">
                {teamSummary.avgPts.toFixed(1)}
              </p>
            </div>
            <div className="rounded border border-border bg-background-tertiary p-2.5 text-center w-24 min-w-24 sm:w-28">
              <p className="text-xs font-normal text-text-secondary">İlk 3 Güç</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-text-primary">
                {teamSummary.strength.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>

        {/* Season Selector */}
        <div className="mt-4 border-t border-border-light pt-3">
          <p className="text-xs font-medium text-text-secondary mb-1.5">Sezon</p>
          <div className="flex flex-wrap gap-1">
            {seasonsList.map((season) => (
              <button
                key={season}
                type="button"
                onClick={() => setSelectedSeason(season)}
                className={`rounded px-2.5 py-1 text-xs font-medium tabular-nums transition-colors cursor-pointer ${
                  selectedSeason === season
                    ? "bg-primary text-white"
                    : "border border-border bg-background-primary text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
                }`}
              >
                {season}
              </button>
            ))}
          </div>
          {loadingSeason && (
            <p className="mt-2 text-xs text-text-secondary">
              {selectedSeason} kadro verileri yükleniyor...
            </p>
          )}
          {selectedSeason === CURRENT_SEASON && !loadingSeason && activeRosters.length > 0 && (
            <p className="mt-2 text-xs text-text-secondary">
              {currentStatsCount === 0
                ? "Kadrolar güncel takımlara göre; istatistikler bir önceki sezondan (2025-26)."
                : `${currentStatsCount} oyuncu ${CURRENT_SEASON} regular season istatistikleriyle; henüz oynamayanlar 2025-26 verisiyle gösteriliyor.`}
            </p>
          )}
          {loadError && (
            <div className="mt-3">
              <InlineError
                title="Kadro verisi yüklenemedi"
                message={loadError}
                onRetry={fetchRosters}
              />
            </div>
          )}
        </div>

        {/* Franchise Selector */}
        <div className="mt-3 border-t border-border-light pt-3">
          <p className="text-xs font-medium text-text-secondary mb-1.5">Takım</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {teamsList.map((team) => {
              const isSelected = activeTeam === team;
              return (
                <button
                  key={team}
                  type="button"
                  onClick={() => setSelectedTeam(team)}
                  className={`flex shrink-0 items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-background-primary text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
                  }`}
                >
                  <TeamLogo abbr={team} size={16} />
                  <span>{team}</span>
                </button>
              );
            })}
          </div>
        </div>
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
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Çekirdek Rotasyon</h2>
                <p className="mt-0.5 text-xs text-text-secondary">
                  İlk 5 çekirdek oyuncu ve rol hiyerarşisi (profil için tıklayın)
                </p>
              </div>
            </div>

            {corePlayers.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {corePlayers.map((player, idx) => {
                  const role = ROLE_BY_RANK[idx] ?? ROLE_BY_RANK[4];
                  const Icon = role.icon;
                  const badgeVariant = ROLE_BADGE_VARIANT[idx] ?? "neutral";
                  return (
                    <Card
                      key={player.PLAYER_ID}
                      hoverable
                      padding="md"
                      onClick={() => onSelectPlayer(player.PLAYER_ID)}
                      className="group flex flex-col justify-between transition-colors"
                    >
                      <div>
                        {/* Card Top Meta */}
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant={badgeVariant} size="sm">
                            <Icon size={12} className="mr-1 inline-block" />
                            Sıra #{idx + 1} · {role.title}
                          </Badge>
                          <span className="text-xs font-semibold tabular-nums text-text-muted">
                            {player.TEAM_ABBREVIATION}
                          </span>
                        </div>

                        {/* Player Info Row */}
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-base font-semibold text-text-primary truncate group-hover:text-primary transition-colors">
                              {player.PLAYER_NAME}
                            </p>
                            <p className="mt-0.5 text-xs text-text-secondary line-clamp-2">
                              {role.description}
                            </p>
                          </div>
                          <PlayerPhoto
                            playerId={player.PLAYER_ID}
                            name={player.PLAYER_NAME}
                            size={52}
                            className="shrink-0 rounded-full border border-border ring-2 ring-background-primary"
                          />
                        </div>

                        {/* Importance / Impact score progress bar */}
                        <div className="mt-3.5 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-text-secondary font-medium">Model Etki Puanı</span>
                            <span className="tabular-nums font-semibold text-text-primary">
                              {player.IMPORTANCE_SCORE.toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-background-tertiary">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                idx === 0
                                  ? "bg-primary"
                                  : idx === 1
                                  ? "bg-status-info"
                                  : "bg-text-secondary"
                              }`}
                              style={{ width: `${Math.min(player.IMPORTANCE_SCORE, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Stats Strip & Action */}
                      <div className="mt-4 border-t border-border-light pt-3">
                        <div className="grid grid-cols-4 gap-2 text-center">
                          <div className="rounded bg-background-tertiary py-1.5 px-1">
                            <p className="text-xs font-normal text-text-secondary">PPG</p>
                            <p className="text-sm font-semibold tabular-nums text-text-primary">
                              {player.AVG_PTS.toFixed(1)}
                            </p>
                          </div>
                          <div className="rounded bg-background-tertiary py-1.5 px-1">
                            <p className="text-xs font-normal text-text-secondary">RPG</p>
                            <p className="text-sm font-semibold tabular-nums text-text-primary">
                              {player.AVG_REB.toFixed(1)}
                            </p>
                          </div>
                          <div className="rounded bg-background-tertiary py-1.5 px-1">
                            <p className="text-xs font-normal text-text-secondary">APG</p>
                            <p className="text-sm font-semibold tabular-nums text-text-primary">
                              {player.AVG_AST.toFixed(1)}
                            </p>
                          </div>
                          <div className="rounded bg-background-tertiary py-1.5 px-1">
                            <p className="text-xs font-normal text-text-secondary">MIN</p>
                            <p className="text-sm font-semibold tabular-nums text-text-primary">
                              {player.AVG_MIN.toFixed(0)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-2.5 flex items-center justify-between text-xs text-text-muted">
                          <span className="tabular-nums">{player.GP} maç forma giydi</span>
                          <span className="flex items-center gap-0.5 text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                            Profili gör <ChevronRight size={13} />
                          </span>
                        </div>
                      </div>
                    </Card>
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

          {/* Full Discovered Roster */}
          <Card padding="none" className="overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border p-4">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Tam Takım Kadrosu</h3>
                <p className="text-xs text-text-secondary">
                  Oyuncu listesi, istatistiklere veya önem puanına göre sıralanabilir.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <Info size={13} /> Sütun başlıklarına tıklayarak sıralayabilirsiniz.
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-background-tertiary text-text-secondary font-semibold">
                    <th
                      onClick={() => handleSort("PLAYER_NAME")}
                      className="p-3 cursor-pointer hover:text-text-primary select-none"
                    >
                      Oyuncu {renderSortIndicator("PLAYER_NAME")}
                    </th>
                    <th
                      onClick={() => handleSort("PLAYER_ID")}
                      className="p-3 cursor-pointer hover:text-text-primary select-none tabular-nums"
                    >
                      ID {renderSortIndicator("PLAYER_ID")}
                    </th>
                    <th
                      onClick={() => handleSort("GP")}
                      className="p-3 cursor-pointer hover:text-text-primary select-none text-center tabular-nums"
                    >
                      GP {renderSortIndicator("GP")}
                    </th>
                    <th
                      onClick={() => handleSort("AVG_MIN")}
                      className="p-3 cursor-pointer hover:text-text-primary select-none text-right tabular-nums"
                    >
                      Min {renderSortIndicator("AVG_MIN")}
                    </th>
                    <th
                      onClick={() => handleSort("AVG_PTS")}
                      className="p-3 cursor-pointer hover:text-text-primary select-none text-right tabular-nums"
                    >
                      Pts {renderSortIndicator("AVG_PTS")}
                    </th>
                    <th
                      onClick={() => handleSort("AVG_REB")}
                      className="p-3 cursor-pointer hover:text-text-primary select-none text-right tabular-nums"
                    >
                      Reb {renderSortIndicator("AVG_REB")}
                    </th>
                    <th
                      onClick={() => handleSort("AVG_AST")}
                      className="p-3 cursor-pointer hover:text-text-primary select-none text-right tabular-nums"
                    >
                      Ast {renderSortIndicator("AVG_AST")}
                    </th>
                    <th
                      onClick={() => handleSort("IMPORTANCE_SCORE")}
                      className="p-3 cursor-pointer hover:text-text-primary select-none text-right tabular-nums font-semibold"
                    >
                      Önem Puanı {renderSortIndicator("IMPORTANCE_SCORE")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {sortedTeamRoster.map((player) => {
                    const isTop5 = corePlayers.some((cp) => cp.PLAYER_ID === player.PLAYER_ID);
                    const isTop3 = corePlayers
                      .slice(0, 3)
                      .some((cp) => cp.PLAYER_ID === player.PLAYER_ID);
                    return (
                      <tr
                        key={player.PLAYER_ID}
                        onClick={() => onSelectPlayer(player.PLAYER_ID)}
                        className="transition-colors hover:bg-background-tertiary cursor-pointer"
                      >
                        <td className="p-3 font-medium text-text-primary">
                          <div className="flex items-center gap-2.5">
                            <PlayerPhoto
                              playerId={player.PLAYER_ID}
                              name={player.PLAYER_NAME}
                              size={28}
                              className="rounded-full border border-border"
                            />
                            <div className="flex items-center gap-1.5">
                              <span>{player.PLAYER_NAME}</span>
                              {isTop3 && (
                                <Badge variant="primary" size="sm">
                                  Top 3
                                </Badge>
                              )}
                              {!isTop3 && isTop5 && (
                                <Badge variant="neutral" size="sm">
                                  Top 5
                                </Badge>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-xs tabular-nums text-text-muted">
                          {player.PLAYER_ID}
                        </td>
                        <td className="p-3 text-center tabular-nums text-text-secondary">
                          {player.GP}
                        </td>
                        <td className="p-3 text-right tabular-nums text-text-secondary">
                          {player.AVG_MIN.toFixed(1)}
                        </td>
                        <td className="p-3 text-right font-semibold tabular-nums text-text-primary">
                          {player.AVG_PTS.toFixed(1)}
                        </td>
                        <td className="p-3 text-right tabular-nums text-text-secondary">
                          {player.AVG_REB.toFixed(1)}
                        </td>
                        <td className="p-3 text-right tabular-nums text-text-secondary">
                          {player.AVG_AST.toFixed(1)}
                        </td>
                        <td className="p-3 text-right font-semibold tabular-nums text-text-primary">
                          {player.IMPORTANCE_SCORE.toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
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
