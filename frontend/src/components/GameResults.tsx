import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import type { GameDetail, GameFeedRow } from "../types/gameFeed";
import { loadJson, loadPrivateApiFresh, postPrivateApi } from "../lib/dataCache";
import { loadArchivedGameBoxscores, loadArchivedGameIndex, invalidateGameIndexCache } from "../lib/archiveData";
import {
  GameCard,
  GameCardDetail,
  fmtDate,
  normGid,
  playerTeamFilter,
  type PlayerBoxScore,
  type TeamBoxScore,
} from "./game-results";

type SeasonTypeFilter = "all" | "preseason" | "regular" | "playin" | "playoffs" | "finals";

const SEASON_TYPE_FILTERS: { id: SeasonTypeFilter; label: string; values: string[] }[] = [
  { id: "all", label: "All", values: [] },
  { id: "preseason", label: "Pre Season", values: ["Pre Season", "Preseason"] },
  { id: "regular", label: "Regular Season", values: ["Regular Season"] },
  { id: "playin", label: "Play In", values: ["PlayIn"] },
  { id: "playoffs", label: "Play Off", values: ["Playoffs"] },
  { id: "finals", label: "NBA Finals", values: ["NBA Finals"] },
];

/* ── Main exported component ── */
export default function GameResults({
  onNavigateToPrediction,
}: {
  onNavigateToPrediction?: (game: { HOME_TEAM_ABBREVIATION: string; AWAY_TEAM_ABBREVIATION: string; GAME_DATE: string }) => void;
} = {}) {
  const [seasonsList, setSeasonsList] = useState<string[]>(["2026-27", "2025-26", "2024-25", "2023-24", "2022-23"]);
  const [allResults,  setAllResults]  = useState<(GameFeedRow & { SEASON?: string | null })[]>([]);
  const [results,     setResults]     = useState<GameFeedRow[]>([]);
  const [gameDetailCache, setGameDetailCache] = useState<Record<string, {
    game_detail: GameDetail | null;
    team_boxscores: TeamBoxScore[];
    player_boxscores: PlayerBoxScore[];
  }>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [search, setSearch] = useState(() => sessionStorage.getItem("nba-results-search") ?? "");
  const [seasonTypeFilter, setSeasonTypeFilter] = useState<SeasonTypeFilter>(() => (sessionStorage.getItem("nba-results-type") as SeasonTypeFilter | null) ?? "all");
  const [selectedDate, setSelectedDate] = useState<string>(() => sessionStorage.getItem("nba-results-date") ?? "");
  const [selectedGameId, setSelectedGameId] = useState<string | null>(() => sessionStorage.getItem("nba-results-game"));
  const [initialDetailTab, setInitialDetailTab] = useState<"game" | "home" | "away" | "pbp">(() => (sessionStorage.getItem("nba-results-detail-tab") as "game" | "home" | "away" | "pbp" | null) ?? "game");
  const [refreshState, setRefreshState] = useState<"idle" | "running" | "failed">("idle");
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshDone, setRefreshDone] = useState(false);
  const [freshPlayByPlay, setFreshPlayByPlay] = useState<any>(null);

  const handleOpenGame = (gameId: string, startTab: "game" | "home" | "away" | "pbp" = "game") => {
    if (gameId !== selectedGameId) {
      setRefreshState("idle");
      setRefreshError(null);
      setRefreshDone(false);
      setFreshPlayByPlay(null);
    }
    setInitialDetailTab(startTab);
    setSelectedGameId(gameId);
  };
  const [selectedSeason, setSelectedSeason] = useState<string>(() => sessionStorage.getItem("nba-results-season") ?? "2026-27");

  useEffect(() => {
    sessionStorage.setItem("nba-results-search", search);
    sessionStorage.setItem("nba-results-type", seasonTypeFilter);
    sessionStorage.setItem("nba-results-date", selectedDate);
    sessionStorage.setItem("nba-results-season", selectedSeason);
    if (selectedGameId) sessionStorage.setItem("nba-results-game", selectedGameId);
    else sessionStorage.removeItem("nba-results-game");
    sessionStorage.setItem("nba-results-detail-tab", initialDetailTab);
  }, [search, seasonTypeFilter, selectedDate, selectedSeason, selectedGameId, initialDetailTab]);

  // Initial load: archived games index
  useEffect(() => {
    loadJson<string[]>("/data/seasons.json", [])
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setSeasonsList(data);
        }
      })
      .catch(() => {});
  }, []);

  // Load the selected season once and replace its rows atomically. This avoids
  // stale/partial indexes surviving a season switch and racing the first load.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loadArchivedGameIndex(selectedSeason)
      .then((rows) => {
        if (!active) return;
        const currentSeasonRows = rows.map((g) => ({ ...g, SEASON: g.SEASON ?? selectedSeason }));
        setAllResults((prev) => [
          ...prev.filter((g) => g.SEASON !== selectedSeason),
          ...currentSeasonRows,
        ]);
        setResults(currentSeasonRows);
      })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedSeason]);

  const sortedResults = useMemo(() => {
    const q = search.trim().toUpperCase();
    const seasonPool = allResults.filter((g: any) => g.SEASON === selectedSeason);
    const typeFilter = SEASON_TYPE_FILTERS.find((f) => f.id === seasonTypeFilter);
    return [...seasonPool]
      .filter((x) => !typeFilter || typeFilter.id === "all" || typeFilter.values.includes(x.SEASON_TYPE))
      .filter((x) => !q || (x.HOME_TEAM_ABBREVIATION ?? "").includes(q) || (x.AWAY_TEAM_ABBREVIATION ?? "").includes(q) || x.GAME_ID.includes(q))
      .sort((a, b) => (a.GAME_DATE ?? "").localeCompare(b.GAME_DATE ?? ""));
  }, [results, allResults, selectedSeason, seasonTypeFilter, search]);

  const uniqueDates = useMemo(
    () => Array.from(new Set(sortedResults.map((g) => g.GAME_DATE ?? "").filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [sortedResults],
  );

  useEffect(() => {
    if (uniqueDates.length > 0) {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const defaultDate = uniqueDates.find((day) => day >= today) ?? uniqueDates[uniqueDates.length - 1];
      setSelectedDate((current) => uniqueDates.includes(current) ? current : defaultDate);
    } else {
      setSelectedDate("");
    }
  }, [selectedSeason, seasonTypeFilter, uniqueDates]);

  const seasonTypeCounts = useMemo(() => {
    const seasonPool = allResults.filter((g: any) => g.SEASON === selectedSeason);
    return SEASON_TYPE_FILTERS.reduce<Record<SeasonTypeFilter, number>>((acc, filter) => {
      acc[filter.id] = filter.id === "all"
        ? seasonPool.length
        : seasonPool.filter((g) => filter.values.includes(g.SEASON_TYPE)).length;
      return acc;
    }, { all: 0, preseason: 0, regular: 0, playin: 0, playoffs: 0, finals: 0 });
  }, [results, allResults, selectedSeason]);

  const selectedDateIndex = uniqueDates.indexOf(selectedDate);
  const selectedDateGames = useMemo(
    () => sortedResults.filter((g) => g.GAME_DATE === selectedDate),
    [sortedResults, selectedDate],
  );
  const selectedGame = useMemo(() => {
    if (!selectedGameId) return null;
    const targetGid = normGid(selectedGameId);
    return results.find((g) => normGid(g.GAME_ID) === targetGid) ??
           (allResults.find((g) => normGid(g.GAME_ID) === targetGid) as GameFeedRow | undefined) ??
           null;
  }, [results, allResults, selectedGameId]);
  const selectedDetail = selectedGameId ? (gameDetailCache[normGid(selectedGameId)] ?? gameDetailCache[selectedGameId] ?? null) : null;

  const [refreshingGameId, setRefreshingGameId] = useState<string | null>(null);

  const refreshGame = useCallback(async (targetGame: GameFeedRow) => {
    if (!targetGame || refreshingGameId === targetGame.GAME_ID) return;
    setRefreshingGameId(targetGame.GAME_ID);
    setRefreshState("running");
    setRefreshError(null);
    try {
      const targetSeason = targetGame.SEASON || selectedSeason || "2026-27";
      await postPrivateApi(`/frontend-data-api/games/${encodeURIComponent(targetGame.GAME_ID)}/refresh`, {
        season: targetSeason,
      });
      const startTime = Date.now();
      const timeoutMs = 5 * 60_000;
      while (Date.now() - startTime < timeoutMs) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const status = await loadPrivateApiFresh<{
          status: string;
          detail?: { team_boxscores?: { TEAM_ABBREVIATION: string; PTS: number; WL: string }[] };
          play_by_play?: unknown;
          error?: string;
        }>(`/frontend-data-api/games/${encodeURIComponent(targetGame.GAME_ID)}/refresh`);
        if (status.status === "complete") {
          const gid = normGid(targetGame.GAME_ID);
          const detailObj = status.detail as unknown as {
            game_detail: GameDetail;
            team_boxscores: TeamBoxScore[];
            player_boxscores: PlayerBoxScore[];
          };
          setGameDetailCache((prev) => ({
            ...prev,
            [targetGame.GAME_ID]: detailObj,
            [gid]: detailObj,
          }));
          setFreshPlayByPlay(status.play_by_play ?? null);
          setRefreshDone(true);
          const home = status.detail?.team_boxscores?.find((row) => row.TEAM_ABBREVIATION === targetGame.HOME_TEAM_ABBREVIATION);
          const away = status.detail?.team_boxscores?.find((row) => row.TEAM_ABBREVIATION === targetGame.AWAY_TEAM_ABBREVIATION);
          const markFinal = (row: GameFeedRow): GameFeedRow => normGid(row.GAME_ID) === gid ? {
            ...row,
            GAME_STATUS: "Final",
            HOME_SCORE: home?.PTS ?? row.HOME_SCORE,
            AWAY_SCORE: away?.PTS ?? row.AWAY_SCORE,
            WINNER_TEAM_ABBREVIATION: home?.WL === "W" ? row.HOME_TEAM_ABBREVIATION : away?.WL === "W" ? row.AWAY_TEAM_ABBREVIATION : row.WINNER_TEAM_ABBREVIATION,
          } : row;
          setAllResults((prev) => prev.map(markFinal));
          setResults((prev) => prev.map(markFinal));
          invalidateGameIndexCache();
          setRefreshingGameId(null);
          setRefreshState("idle");
          return;
        }
        if (status.status === "failed") throw new Error(status.error || "Maç verileri alınamadı.");
      }
      throw new Error("Veri çekme işlemi zaman aşımına uğradı. Biraz sonra tekrar deneyin.");
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Maç verileri alınamadı.");
      setRefreshState("failed");
      setRefreshingGameId(null);
    }
  }, [refreshingGameId, selectedSeason]);

  const refreshSelectedGame = () => {
    if (selectedGame) {
      refreshGame(selectedGame);
    }
  };

  useEffect(() => {
    if (!selectedGame || !selectedGameId) return;
    const gid = normGid(selectedGameId);
    if (gameDetailCache[gid] || gameDetailCache[selectedGameId]) return;
    setDetailLoading(true);
    loadArchivedGameBoxscores(selectedSeason, selectedGame.GAME_ID)
      .then((detail) => {
        setGameDetailCache((prev) => ({ ...prev, [gid]: detail, [selectedGameId]: detail }));
      })
      .catch((e) => setError(e.message))
      .finally(() => setDetailLoading(false));
  }, [selectedGame, selectedGameId, selectedSeason, gameDetailCache]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-xs text-text-secondary">Loading results...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-border bg-background-primary p-6 text-center">
        <AlertTriangle size={24} className="mx-auto mb-2 text-status-error" />
        <p className="text-xs font-medium text-status-error">{error}</p>
        <p className="mt-2 font-mono text-xs text-text-muted">
          Run: <code className="rounded border border-border bg-background-tertiary px-1.5 py-0.5">python3 main.py --fetch-boxscores</code>
        </p>
      </div>
    );
  }

  if (selectedGame) {
    const isCompletedGame =
      selectedGame.GAME_STATUS === "Final" ||
      selectedGame.GAME_STATUS === "FINAL" ||
      ((Number(selectedGame.HOME_SCORE) || 0) > 0 && (Number(selectedGame.AWAY_SCORE) || 0) > 0);
    const gid = normGid(selectedGame.GAME_ID);
    const teamRows = selectedDetail?.team_boxscores ?? [];
    const gamePlayers = selectedDetail?.player_boxscores ?? [];
    const homeBS      = teamRows.find((t) => normGid(t.GAME_ID) === gid && t.TEAM_ABBREVIATION === selectedGame.HOME_TEAM_ABBREVIATION) ?? null;
    const awayBS      = teamRows.find((t) => normGid(t.GAME_ID) === gid && t.TEAM_ABBREVIATION === selectedGame.AWAY_TEAM_ABBREVIATION) ?? null;

    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelectedGameId(null)}
          className="inline-flex items-center gap-1.5 rounded border border-border bg-background-primary px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-background-tertiary"
        >
          <ArrowLeft size={13} />
          Back to games
        </button>
        {isCompletedGame && detailLoading ? (
          <div className="flex h-32 items-center justify-center gap-2 rounded border border-border bg-background-primary">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-xs text-text-secondary">Loading box scores...</span>
          </div>
        ) : (
          <GameCardDetail
            key={selectedGame.GAME_ID}
            game={selectedGame}
            gameDetail={selectedDetail?.game_detail ?? null}
            homeBS={homeBS}
            awayBS={awayBS}
            homePlayers={playerTeamFilter(gamePlayers, selectedGame.HOME_TEAM_ABBREVIATION)}
            awayPlayers={playerTeamFilter(gamePlayers, selectedGame.AWAY_TEAM_ABBREVIATION)}
            initialTab={initialDetailTab}
            season={selectedSeason}
            refreshState={refreshState}
            refreshError={refreshError}
            refreshDone={refreshDone}
            freshPlayByPlay={freshPlayByPlay}
            onRefresh={refreshSelectedGame}
            onPredict={() => {
              if (onNavigateToPrediction) {
                onNavigateToPrediction({
                  HOME_TEAM_ABBREVIATION: selectedGame.HOME_TEAM_ABBREVIATION,
                  AWAY_TEAM_ABBREVIATION: selectedGame.AWAY_TEAM_ABBREVIATION,
                  GAME_DATE: selectedGame.GAME_DATE,
                });
              }
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Page Header ── */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Game Results</h1>
        <p className="mt-0.5 text-xs text-text-secondary">Every matchup, final scores, and full box scores across seasons.</p>
      </div>

      {/* ── Filters & Controls Bar ── */}
      <section className="rounded border border-border bg-background-primary p-4">
        <div className="flex flex-col gap-3">
          
          {/* Top Row: Season Selector & Season Types */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light pb-3">
            {/* Season Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-text-secondary">Season</span>
              <div className="flex flex-wrap gap-1">
                {seasonsList.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSelectedSeason(s); setSelectedGameId(null); }}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      selectedSeason === s
                        ? "bg-primary text-white"
                        : "text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Season Type Filter Tabs */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-text-secondary">Type</span>
              <div className="flex flex-wrap gap-1">
                {SEASON_TYPE_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => {
                      setSeasonTypeFilter(filter.id);
                      setSelectedGameId(null);
                    }}
                    disabled={seasonTypeCounts[filter.id] === 0}
                    className={`inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-30 ${
                      seasonTypeFilter === filter.id
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-background-primary text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
                    }`}
                  >
                    <span>{filter.label}</span>
                    <span className={seasonTypeFilter === filter.id ? "text-white/80" : "text-text-muted"}>
                      ({seasonTypeCounts[filter.id]})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Row: Date Navigation & Team Search */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {/* Date Navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedDate(uniqueDates[selectedDateIndex - 1] ?? selectedDate)}
                disabled={selectedDateIndex <= 0}
                className="flex h-8 w-8 items-center justify-center rounded border border-border bg-background-primary text-text-secondary transition-colors hover:bg-background-tertiary disabled:opacity-30"
                title="Previous match day"
              >
                <ChevronLeft size={14} />
              </button>

              <div className="min-w-[150px] rounded border border-border bg-background-tertiary px-3 py-1 text-center">
                <p className="text-xs font-semibold text-text-primary">
                  {selectedDate ? fmtDate(selectedDate) : "No date"}
                </p>
                <p className="text-xs text-text-muted">
                  {selectedDateGames.length} game{selectedDateGames.length !== 1 ? "s" : ""}
                </p>
              </div>

              <button
                onClick={() => setSelectedDate(uniqueDates[selectedDateIndex + 1] ?? selectedDate)}
                disabled={selectedDateIndex >= uniqueDates.length - 1}
                className="flex h-8 w-8 items-center justify-center rounded border border-border bg-background-primary text-text-secondary transition-colors hover:bg-background-tertiary disabled:opacity-30"
                title="Next match day"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Team Search Input */}
            <div className="relative flex-1 max-w-xs min-w-[160px]">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search team (e.g. LAL, BOS)..."
                className="w-full rounded border border-border bg-background-primary px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-border-focus"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted hover:text-text-primary"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

        </div>
      </section>

      {/* ── Game cards grid ── */}
      {selectedDateGames.length === 0 ? (
        <div className="rounded border border-border bg-background-primary p-8 text-center">
          <p className="text-sm font-semibold text-text-primary">No games found for this selection</p>
          <p className="mt-1 text-xs text-text-secondary">Try selecting a different match day, category, or clear search filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {selectedDateGames.map((game) => (
            <GameCard
              key={game.GAME_ID}
              game={game}
              onOpen={() => handleOpenGame(game.GAME_ID, "game")}
              onRefresh={() => refreshGame(game)}
              isRefreshing={refreshingGameId === game.GAME_ID}
              onPredict={() => {
                if (onNavigateToPrediction) {
                  onNavigateToPrediction({
                    HOME_TEAM_ABBREVIATION: game.HOME_TEAM_ABBREVIATION,
                    AWAY_TEAM_ABBREVIATION: game.AWAY_TEAM_ABBREVIATION,
                    GAME_DATE: game.GAME_DATE,
                  });
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
