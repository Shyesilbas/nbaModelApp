import { useCallback, useEffect, useMemo, useState } from "react";
import { isGameEligibleForRefresh } from "./game-results/utils";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  RefreshCw,
  Search,
  Trophy,
} from "lucide-react";
import type { GameDetail, GameFeedRow } from "../types/gameFeed";
import { loadPrivateApi, loadPrivateApiFresh, postPrivateApi } from "../lib/dataCache";
import {
  loadArchivedGameBoxscores,
  loadArchivedGameIndex,
  invalidateGameIndexCache,
} from "../lib/archiveData";
import {
  GameCardDetail,
  fmtDate,
  normGid,
  playerTeamFilter,
  type PlayerBoxScore,
  type TeamBoxScore,
} from "./game-results";
import { Button } from "./common";
import { parseUrlRoute, updateUrlRoute } from "../lib/router";
import type { ActiveView, DayGroup, DisplayMode } from "./fixtures/types";
import { FixturesScheduleView } from "./fixtures/FixturesScheduleView";
import { FixturesStandingsView } from "./fixtures/FixturesStandingsView";

type SeasonTypeFilter = "all" | "regular" | "playin" | "playoffs" | "finals";

const SEASON_TYPE_FILTERS: { id: SeasonTypeFilter; label: string; values: string[] }[] = [
  { id: "all", label: "Tumu", values: [] },
  { id: "regular", label: "Normal Sezon", values: ["Regular Season"] },
  { id: "playoffs", label: "Play-Off", values: ["Playoffs"] },
  { id: "playin", label: "Play-In", values: ["PlayIn"] },
  { id: "finals", label: "NBA Finals", values: ["NBA Finals"] },
];

export interface FixturesTabProps {
  onNavigateToPrediction?: (game: {
    HOME_TEAM_ABBREVIATION: string;
    AWAY_TEAM_ABBREVIATION: string;
    GAME_DATE: string;
  }) => void;
  onSelectTeam?: (abbr: string) => void;
}

export default function FixturesTab({
  onNavigateToPrediction,
  onSelectTeam,
}: FixturesTabProps) {
  const [seasonsList, setSeasonsList] = useState<string[]>([
    "2026-27",
    "2025-26",
    "2024-25",
    "2023-24",
    "2022-23",
  ]);
  const [selectedSeason, setSelectedSeason] = useState<string>(
    () => sessionStorage.getItem("nba-results-season") ?? "2026-27"
  );
  const [allResults, setAllResults] = useState<(GameFeedRow & { SEASON?: string | null })[]>([]);
  const [results, setResults] = useState<GameFeedRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active View: fixtures (Fikstur) | table (Puan Durumu)
  const [activeView, setActiveView] = useState<ActiveView>(() => {
    return (sessionStorage.getItem("nba-fixtures-active-view") as ActiveView) || "fixtures";
  });

  // Display Mode: list (Kompakt Liste) | cards (Detayli Kartlar)
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => {
    try {
      return (localStorage.getItem("fixtures_display_mode") as DisplayMode) || "list";
    } catch {
      return "list";
    }
  });

  const handleDisplayModeChange = (mode: DisplayMode) => {
    setDisplayMode(mode);
    try {
      localStorage.setItem("fixtures_display_mode", mode);
    } catch {}
  };

  const [search, setSearch] = useState<string>(() => sessionStorage.getItem("nba-results-search") ?? "");
  const [seasonTypeFilter, setSeasonTypeFilter] = useState<SeasonTypeFilter>(
    () => (sessionStorage.getItem("nba-results-type") as SeasonTypeFilter | null) ?? "all"
  );
  const [pickedDate, setSelectedDate] = useState<string>(
    () => sessionStorage.getItem("nba-results-date") ?? ""
  );
  const [isDateMenuOpen, setIsDateMenuOpen] = useState<boolean>(false);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(() => {
    const urlRoute = parseUrlRoute();
    return urlRoute.gameId ?? sessionStorage.getItem("nba-results-game");
  });
  const [initialDetailTab, setInitialDetailTab] = useState<"game" | "home" | "away" | "pbp">(() => {
    const urlRoute = parseUrlRoute();
    return (urlRoute.detailTab as "game" | "home" | "away" | "pbp") ??
      (sessionStorage.getItem("nba-results-detail-tab") as "game" | "home" | "away" | "pbp" | null) ??
      "game";
  });

  const [gameDetailCache, setGameDetailCache] = useState<
    Record<
      string,
      {
        game_detail: GameDetail | null;
        team_boxscores: TeamBoxScore[];
        player_boxscores: PlayerBoxScore[];
      }
    >
  >({});
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [refreshingGameId, setRefreshingGameId] = useState<string | null>(null);
  const [refreshState, setRefreshState] = useState<"idle" | "running" | "failed">("idle");
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshDone, setRefreshDone] = useState<boolean>(false);
  const [freshPlayByPlay, setFreshPlayByPlay] = useState<any>(null);

  // Persistence to session storage and URL (only if game-results is the active tab)
  useEffect(() => {
    sessionStorage.setItem("nba-fixtures-active-view", activeView);
    sessionStorage.setItem("nba-results-search", search);
    sessionStorage.setItem("nba-results-type", seasonTypeFilter);
    sessionStorage.setItem("nba-results-date", pickedDate);
    sessionStorage.setItem("nba-results-season", selectedSeason);
    if (selectedGameId) sessionStorage.setItem("nba-results-game", selectedGameId);
    else sessionStorage.removeItem("nba-results-game");
    sessionStorage.setItem("nba-results-detail-tab", initialDetailTab);

    const currentRoute = parseUrlRoute();
    if (currentRoute.tab === "game-results") {
      updateUrlRoute(
        {
          gameId: selectedGameId || null,
          detailTab: selectedGameId && initialDetailTab !== "game" ? initialDetailTab : null,
        },
        true
      );
    }
  }, [activeView, search, seasonTypeFilter, pickedDate, selectedSeason, selectedGameId, initialDetailTab]);

  // Load available seasons
  useEffect(() => {
    loadPrivateApi<string[]>("/frontend-data-api/seasons")
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setSeasonsList(data);
        }
      })
      .catch(() => {});
  }, []);

  // Listen to browser popstate (back/forward)
  useEffect(() => {
    const handlePopState = () => {
      const route = parseUrlRoute();
      if (route.tab === "game-results") {
        if (!route.gameId) {
          setSelectedGameId(null);
          sessionStorage.removeItem("nba-results-game");
        } else if (route.gameId !== selectedGameId) {
          setSelectedGameId(route.gameId);
        }
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [selectedGameId]);

  // Load matches of selected season
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
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedSeason]);

  // Filter pool based on season and season type
  const seasonPool = useMemo(() => {
    return allResults.filter((g) => g.SEASON === selectedSeason);
  }, [allResults, selectedSeason]);

  const sortedResults = useMemo(() => {
    const q = search.trim().toUpperCase();
    const typeFilter = SEASON_TYPE_FILTERS.find((f) => f.id === seasonTypeFilter);
    return [...seasonPool]
      .filter((x) => !typeFilter || typeFilter.id === "all" || typeFilter.values.includes(x.SEASON_TYPE ?? ""))
      .filter(
        (x) =>
          !q ||
          (x.HOME_TEAM_ABBREVIATION ?? "").toUpperCase().includes(q) ||
          (x.AWAY_TEAM_ABBREVIATION ?? "").toUpperCase().includes(q) ||
          (x.HOME_TEAM_NAME ?? "").toUpperCase().includes(q) ||
          (x.AWAY_TEAM_NAME ?? "").toUpperCase().includes(q) ||
          (x.ARENA ?? "").toUpperCase().includes(q) ||
          x.GAME_ID.includes(q)
      )
      .sort((a, b) => (a.GAME_DATE ?? "").localeCompare(b.GAME_DATE ?? ""));
  }, [seasonPool, seasonTypeFilter, search]);

  const uniqueDates = useMemo(
    () => Array.from(new Set(sortedResults.map((g) => g.GAME_DATE ?? "").filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [sortedResults]
  );

  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  // The picked day, or the next game day (else the last one) when it is not in the list.
  // Derived during render: fixing it up in an effect first rendered every game of the season.
  const selectedDate = useMemo(() => {
    if (uniqueDates.includes(pickedDate)) return pickedDate;
    return uniqueDates.find((day) => day >= todayStr) ?? uniqueDates[uniqueDates.length - 1] ?? "";
  }, [uniqueDates, pickedDate, todayStr]);

  const selectedDateIndex = uniqueDates.indexOf(selectedDate);

  // Group games for the active view
  // If a single date is selected: show that date. If 'all', show all days in range.
  const displayedDayGroups = useMemo<DayGroup[]>(() => {
    const targetDates = selectedDate ? [selectedDate] : uniqueDates;
    return targetDates
      .map((date) => {
        const gamesForDate = sortedResults.filter((g) => g.GAME_DATE === date);
        return {
          date,
          formattedDate: fmtDate(date),
          games: gamesForDate,
        };
      })
      .filter((group) => group.games.length > 0);
  }, [sortedResults, selectedDate, uniqueDates]);

  // Compute team forms (Son 5 mac) across the whole season pool
  const teamForms = useMemo(() => {
    const formMap = new Map<string, ("W" | "L")[]>();
    const completedGames = [...seasonPool]
      .filter(
        (g) =>
          g.GAME_STATUS === "Final" ||
          g.GAME_STATUS === "FINAL" ||
          ((Number(g.HOME_SCORE) || 0) > 0 && (Number(g.AWAY_SCORE) || 0) > 0)
      )
      .sort((a, b) => (a.GAME_DATE ?? "").localeCompare(b.GAME_DATE ?? ""));

    for (const g of completedGames) {
      const home = g.HOME_TEAM_ABBREVIATION;
      const away = g.AWAY_TEAM_ABBREVIATION;
      if (!home || !away) continue;

      if (!formMap.has(home)) formMap.set(home, []);
      if (!formMap.has(away)) formMap.set(away, []);

      const hWon = g.WINNER_TEAM_ABBREVIATION
        ? g.WINNER_TEAM_ABBREVIATION === home
        : (Number(g.HOME_SCORE) || 0) > (Number(g.AWAY_SCORE) || 0);

      if (hWon) {
        formMap.get(home)!.push("W");
        formMap.get(away)!.push("L");
      } else {
        formMap.get(home)!.push("L");
        formMap.get(away)!.push("W");
      }
    }

    // Keep only last 5
    for (const [team, history] of formMap.entries()) {
      formMap.set(team, history.slice(-5));
    }

    return formMap;
  }, [seasonPool]);

  // Season type counts for filter buttons
  const seasonTypeCounts = useMemo(() => {
    return SEASON_TYPE_FILTERS.reduce<Record<SeasonTypeFilter, number>>(
      (acc, filter) => {
        acc[filter.id] =
          filter.id === "all"
            ? seasonPool.length
            : seasonPool.filter((g) => filter.values.includes(g.SEASON_TYPE ?? "")).length;
        return acc;
      },
      { all: 0, regular: 0, playoffs: 0, playin: 0, finals: 0 }
    );
  }, [seasonPool]);

  const handleOpenGame = (gameId: string, startTab: "game" | "home" | "away" | "pbp" = "game") => {
    if (gameId !== selectedGameId) {
      setRefreshState("idle");
      setRefreshError(null);
      setRefreshDone(false);
      setFreshPlayByPlay(null);
    }
    setInitialDetailTab(startTab);
    setSelectedGameId(gameId);
    updateUrlRoute({ gameId, detailTab: startTab !== "game" ? startTab : null });
  };

  const selectedGame = useMemo(() => {
    if (!selectedGameId) return null;
    const targetGid = normGid(selectedGameId);
    return (
      results.find((g) => normGid(g.GAME_ID) === targetGid) ??
      (allResults.find((g) => normGid(g.GAME_ID) === targetGid) as GameFeedRow | undefined) ??
      null
    );
  }, [results, allResults, selectedGameId]);

  const selectedDetail = selectedGameId
    ? gameDetailCache[normGid(selectedGameId)] ?? gameDetailCache[selectedGameId] ?? null
    : null;

  // Boxscore detail loading
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

  type RefreshStatus = {
    status: string;
    detail?: { team_boxscores?: { TEAM_ABBREVIATION: string; PTS: number; WL: string }[] };
    play_by_play?: unknown;
    error?: string;
  };

  const applyRefreshed = (targetGame: GameFeedRow, status: RefreshStatus) => {
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
        const markFinal = (row: GameFeedRow): GameFeedRow =>
          normGid(row.GAME_ID) === gid
            ? {
                ...row,
                GAME_STATUS: "Final",
                HOME_SCORE: home?.PTS ?? row.HOME_SCORE,
                AWAY_SCORE: away?.PTS ?? row.AWAY_SCORE,
                WINNER_TEAM_ABBREVIATION:
                  home?.WL === "W"
                    ? row.HOME_TEAM_ABBREVIATION
                    : away?.WL === "W"
                    ? row.AWAY_TEAM_ABBREVIATION
                    : row.WINNER_TEAM_ABBREVIATION,
              }
            : row;
        setAllResults((prev) => prev.map(markFinal));
        setResults((prev) => prev.map(markFinal));
        invalidateGameIndexCache();
  };

  const refreshGame = useCallback(
    async (targetGame: GameFeedRow) => {
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
          const status = await loadPrivateApiFresh<RefreshStatus>(`/frontend-data-api/games/${encodeURIComponent(targetGame.GAME_ID)}/refresh`);
          if (status.status === "complete") {
            applyRefreshed(targetGame, status);
            setRefreshingGameId(null);
            setRefreshState("idle");
            return;
          }
          if (status.status === "failed") throw new Error(status.error || "Mac verileri alinamadi.");
        }
        throw new Error("Veri cekme islemi zaman asimina ugradi. Biraz sonra tekrar deneyin.");
      } catch (err) {
        setRefreshError(err instanceof Error ? err.message : "Mac verileri alinamadi.");
        setRefreshState("failed");
        setRefreshingGameId(null);
      }
    },
    [refreshingGameId, selectedSeason]
  );

  // Candidates: the day has come; the backend says which have no box scores yet. One worker runs them in order.
  const dueGames = useMemo(
    () => (selectedDate && selectedDate <= todayStr ? sortedResults.filter((g) => g.GAME_DATE === selectedDate && isGameEligibleForRefresh(g)) : []),
    [sortedResults, selectedDate, todayStr]
  );
  const [missingIds, setMissingIds] = useState<string[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchMsg, setBatchMsg] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; done: number; failed: number } | null>(null);
  useEffect(() => {
    if (dueGames.length === 0 || batchRunning) {
      setMissingIds([]);
      return;
    }
    let active = true;
    loadPrivateApiFresh<{ missing: string[] }>(
      `/frontend-data-api/games/refresh-batch/pending?season=${encodeURIComponent(selectedSeason)}&ids=${dueGames
        .map((g) => encodeURIComponent(g.GAME_ID))
        .join(",")}`
    )
      .then((r) => active && setMissingIds(r.missing))
      .catch(() => active && setMissingIds([]));
    return () => {
      active = false;
    };
  }, [dueGames, selectedSeason, batchRunning]);
  const pendingDateGames = dueGames.filter((g) => missingIds.includes(normGid(g.GAME_ID)));

  const refreshDateGames = async () => {
    const games = pendingDateGames;
    if (games.length === 0 || batchRunning) return;
    setBatchRunning(true);
    setBatchProgress({ current: 0, total: games.length, done: 0, failed: 0 });
    setBatchMsg(`0/${games.length} maç güncelleniyor...`);
    const stateOf: Record<string, string> = {};
    const ids = games.map((g) => g.GAME_ID);
    const done = new Set<string>();
    const failed = new Set<string>();
    try {
      await postPrivateApi("/frontend-data-api/games/refresh-batch", { season: selectedSeason, game_ids: ids });
      const deadline = Date.now() + 15 * 60_000;
      while (done.size + failed.size < games.length && Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        const { games: st } = await loadPrivateApiFresh<{ games: Record<string, { status: string }> }>(
          `/frontend-data-api/games/refresh-batch?ids=${ids.map(encodeURIComponent).join(",")}`
        );
        for (const g of games) {
          const gid = normGid(g.GAME_ID);
          stateOf[gid] = st[gid]?.status ?? stateOf[gid];
          if (done.has(gid) || failed.has(gid)) continue;
          if (stateOf[gid] === "complete") {
            applyRefreshed(g, await loadPrivateApiFresh<RefreshStatus>(`/frontend-data-api/games/${encodeURIComponent(g.GAME_ID)}/refresh`));
            done.add(gid);
          } else if (stateOf[gid] === "failed") failed.add(gid);
        }
        const finished = done.size + failed.size;
        setBatchProgress({ current: finished, total: games.length, done: done.size, failed: failed.size });
        setBatchMsg(`${finished}/${games.length} maç işlendi`);
      }
      setBatchMsg(failed.size ? `${done.size} alındı, ${failed.size} alınamadı` : `${done.size} maç güncellendi`);
    } catch (err) {
      setBatchMsg(err instanceof Error ? err.message : "Maç verileri alınamadı.");
    } finally {
      setBatchRunning(false);
      setTimeout(() => {
        setBatchProgress(null);
      }, 4000);
    }
  };

  // If a game detail is selected, show GameCardDetail
  if (selectedGame) {
    const isCompletedGame =
      selectedGame.GAME_STATUS === "Final" ||
      selectedGame.GAME_STATUS === "FINAL" ||
      ((Number(selectedGame.HOME_SCORE) || 0) > 0 && (Number(selectedGame.AWAY_SCORE) || 0) > 0);
    const gid = normGid(selectedGame.GAME_ID);
    const teamRows = selectedDetail?.team_boxscores ?? [];
    const gamePlayers = selectedDetail?.player_boxscores ?? [];
    const homeBS =
      teamRows.find((t) => normGid(t.GAME_ID) === gid && t.TEAM_ABBREVIATION === selectedGame.HOME_TEAM_ABBREVIATION) ?? null;
    const awayBS =
      teamRows.find((t) => normGid(t.GAME_ID) === gid && t.TEAM_ABBREVIATION === selectedGame.AWAY_TEAM_ABBREVIATION) ?? null;

    const handleBackToFixtures = () => {
      setSelectedGameId(null);
      sessionStorage.removeItem("nba-results-game");
      updateUrlRoute({ gameId: null, detailTab: null });
    };

    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBackToFixtures}
          leftIcon={<ArrowLeft size={16} strokeWidth={1.5} />}
        >
          Fikstüre dön
        </Button>
        {isCompletedGame && detailLoading ? (
          <div className="flex h-32 items-center justify-center gap-2 rounded border border-border bg-background-primary ">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-xs text-text-secondary">Kutu puanlari yukleniyor...</span>
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
            onRefresh={() => refreshGame(selectedGame)}
            onBack={handleBackToFixtures}
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
    <div className="space-y-5">
      {/* Consolidated Control Bar matching Premier League App format */}
      <div className="rounded border border-border bg-background-primary p-3 ">
        <div className="flex flex-col items-stretch justify-between gap-2.5 lg:flex-row lg:items-center">
          
          {/* Left: View Tabs (Fikstur vs Puan Tablosu) + Date Stepper */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle: Fikstur vs Puan Tablosu */}
            <div className="flex items-center rounded border border-border bg-background-tertiary p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setActiveView("fixtures")}
                className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold transition-all ${
                  activeView === "fixtures"
                    ? "bg-primary text-white "
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>Fikstur</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveView("table")}
                className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold transition-all ${
                  activeView === "table"
                    ? "bg-primary text-white "
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <Trophy className="h-3.5 w-3.5 text-amber-500" />
                <span>Puan Tablosu</span>
              </button>
            </div>

            {/* Date Stepper (Only active in fixtures view) */}
            {activeView === "fixtures" && uniqueDates.length > 0 && (
              <div className="flex items-center rounded border border-border bg-background-tertiary/70 p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedDate(uniqueDates[selectedDateIndex - 1] ?? selectedDate)}
                  disabled={selectedDateIndex <= 0}
                  className="rounded p-1 text-text-secondary transition-all hover:bg-background-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Onceki Gun"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {/* Date Dropdown Menu */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsDateMenuOpen((open) => !open)}
                    className="flex items-center gap-1 px-2 py-0.5 font-mono text-xs font-bold text-text-primary transition-colors hover:text-primary"
                  >
                    <span>{selectedDate ? fmtDate(selectedDate) : "Tarih Sec"}</span>
                    {selectedDate === todayStr && (
                      <span className="h-1.5 w-1.5 rounded-full bg-status-success" title="Bugun" />
                    )}
                    <ChevronDown className={`h-3.5 w-3.5 text-text-muted transition-transform ${isDateMenuOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isDateMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsDateMenuOpen(false)} />
                      <div className="absolute left-0 top-full z-50 mt-1.5 max-h-64 w-60 overflow-y-auto rounded border border-border bg-background-primary p-1.5 shadow-xl scrollbar-thin">
                        {uniqueDates.map((d) => {
                          const isSelected = selectedDate === d;
                          const isToday = d === todayStr;
                          const gameCount = sortedResults.filter((g) => g.GAME_DATE === d).length;
                          return (
                            <button
                              key={d}
                              type="button"
                              onClick={() => {
                                setSelectedDate(d);
                                setIsDateMenuOpen(false);
                              }}
                              className={`mt-0.5 flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs font-bold transition-all ${
                                isSelected ? "bg-primary text-white" : "text-text-primary hover:bg-background-tertiary"
                              }`}
                            >
                              <span>{fmtDate(d)}</span>
                              <div className="flex items-center gap-1.5">
                                {isToday && (
                                  <span
                                    className={`rounded px-1.5 py-0.2 text-[9px] font-sans font-semibold uppercase ${
                                      isSelected ? "bg-status-success text-white" : "bg-status-success/20 text-status-success"
                                    }`}
                                  >
                                    Bugun
                                  </span>
                                )}
                                <span className={`text-[10px] font-mono ${isSelected ? "text-white/80" : "text-text-muted"}`}>
                                  ({gameCount})
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedDate(uniqueDates[selectedDateIndex + 1] ?? selectedDate)}
                  disabled={selectedDateIndex >= uniqueDates.length - 1}
                  className="rounded p-1 text-text-secondary transition-all hover:bg-background-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Sonraki Gun"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Fetch every finished game of the day that has no data yet */}
            {activeView === "fixtures" && selectedDate && (pendingDateGames.length > 0 || batchRunning || batchProgress) && (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={refreshDateGames}
                  disabled={batchRunning}
                  className="inline-flex items-center gap-1.5 rounded border border-border bg-background-tertiary px-2.5 py-1 text-xs font-medium text-text-primary transition-colors hover:border-primary disabled:opacity-50"
                  title={`${pendingDateGames.length} tamamlanan maçın kutu puanını çek`}
                >
                  <RefreshCw size={12} className={batchRunning ? "animate-spin text-primary" : "text-text-muted"} />
                  <span>{batchRunning ? "Çekiliyor..." : "Yenile"}</span>
                  <span className="rounded-sm border border-border bg-background-primary px-1 py-0.2 text-[10px] text-text-muted">
                    {batchProgress ? `${batchProgress.current}/${batchProgress.total}` : pendingDateGames.length}
                  </span>
                </button>

                {/* Progress Bar & Status */}
                {batchProgress && (
                  <div className="flex items-center gap-2 rounded border border-border bg-background-primary px-2 py-1">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center justify-between gap-3 text-[10px] font-medium text-text-secondary">
                        <span>{batchMsg || `${batchProgress.current}/${batchProgress.total}`}</span>
                        <span>{Math.round((batchProgress.current / (batchProgress.total || 1)) * 100)}%</span>
                      </div>
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-background-tertiary">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{
                            width: `${Math.round((batchProgress.current / (batchProgress.total || 1)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {!batchRunning && !batchProgress && batchMsg && (
                  <span className="text-[11px] text-text-muted">{batchMsg}</span>
                )}
              </div>
            )}

            {/* Quick jump to Today or Latest */}
            {activeView === "fixtures" && selectedDate && selectedDate !== todayStr && uniqueDates.includes(todayStr) && (
              <button
                type="button"
                onClick={() => setSelectedDate(todayStr)}
                className="flex shrink-0 items-center gap-1.5 rounded border border-border bg-background-tertiary px-2.5 py-1 text-xs font-medium text-text-primary transition-colors hover:border-primary"
                title="Bugünkü maçlara git"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
                <span>Bugün</span>
              </button>
            )}
          </div>

          {/* Right: Search + View Mode (List/Card) + Season Select */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Search Input (fixtures view) */}
            {activeView === "fixtures" && (
              <div className="relative min-w-[170px] flex-1 sm:min-w-[210px] sm:flex-initial">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Takim / arena ara..."
                  className="w-full rounded border border-border bg-background-tertiary py-1.5 pl-8 pr-7 text-xs font-medium text-text-primary placeholder:text-text-muted outline-none transition-all focus:border-border-focus focus:bg-background-primary"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-xs font-bold text-text-muted hover:text-text-primary"
                    title="Aramayi temizle"
                  >
                    x
                  </button>
                )}
              </div>
            )}

            {/* View Mode Toggle: List <-> Cards */}
            {activeView === "fixtures" && (
              <div className="flex items-center rounded border border-border bg-background-tertiary p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDisplayModeChange("list")}
                  className={`flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-bold transition-all ${
                    displayMode === "list"
                      ? "bg-primary text-white "
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                  title="Kompakt Liste"
                >
                  <List className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Liste</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDisplayModeChange("cards")}
                  className={`flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-bold transition-all ${
                    displayMode === "cards"
                      ? "bg-primary text-white "
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                  title="Detayli Kartlar"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Kart</span>
                </button>
              </div>
            )}

            {/* Season Selector Dropdown */}
            <div className="relative shrink-0">
              <label htmlFor="fixtures-season-select" className="sr-only">
                Sezon sec
              </label>
              <select
                id="fixtures-season-select"
                value={selectedSeason}
                onChange={(e) => {
                  setSelectedSeason(e.target.value);
                  setSelectedGameId(null);
                }}
                className="appearance-none rounded border border-border bg-background-tertiary py-1.5 pl-2.5 pr-7 text-xs font-bold text-text-primary hover:bg-background-tertiary/90 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              >
                {seasonsList.map((season) => (
                  <option key={season} value={season}>
                    {season}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            </div>

          </div>

        </div>
      </div>

      {/* Season Type Pills (in fixtures view) */}
      {activeView === "fixtures" && (
        <div className="flex flex-wrap items-center gap-1.5">
          {SEASON_TYPE_FILTERS.map((filter) => {
            const count = seasonTypeCounts[filter.id];
            const isSelected = seasonTypeFilter === filter.id;
            return (
              <button
                key={filter.id}
                onClick={() => setSeasonTypeFilter(filter.id)}
                disabled={count === 0}
                className={`inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-bold transition-colors disabled:opacity-30 ${
                  isSelected
                    ? "border-primary bg-primary text-white "
                    : "border-border bg-background-primary text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
                }`}
              >
                <span>{filter.label}</span>
                <span className={`text-[10px] font-mono ${isSelected ? "text-white/80" : "text-text-muted"}`}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Error alert if any */}
      {error && (
        <div className="rounded border border-status-error/30 bg-background-primary p-4 text-center ">
          <AlertTriangle size={20} className="mx-auto mb-1.5 text-status-error" />
          <p className="text-xs font-bold text-status-error">{error}</p>
        </div>
      )}

      {/* Main Content Area: Standings vs Fixtures Schedule */}
      {activeView === "table" ? (
        <FixturesStandingsView
          games={allResults.filter((g) => g.SEASON === selectedSeason && g.SEASON_TYPE === "Regular Season")}
          season={selectedSeason}
          onSelectTeam={onSelectTeam}
        />
      ) : (
        <FixturesScheduleView
          loading={loading}
          dayGroups={displayedDayGroups}
          displayMode={displayMode}
          teamForms={teamForms}
          onOpenGame={(gameId) => handleOpenGame(gameId, "game")}
          onSelectTeam={onSelectTeam}
          onPredict={(game) => {
            if (onNavigateToPrediction) {
              onNavigateToPrediction({
                HOME_TEAM_ABBREVIATION: game.HOME_TEAM_ABBREVIATION,
                AWAY_TEAM_ABBREVIATION: game.AWAY_TEAM_ABBREVIATION,
                GAME_DATE: game.GAME_DATE,
              });
            }
          }}
          onRefresh={refreshGame}
          refreshingGameId={refreshingGameId}
        />
      )}
    </div>
  );
}
