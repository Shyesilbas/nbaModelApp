import { useCallback, useEffect, useMemo, useState } from "react";
import { isGameEligibleForRefresh } from "./game-results/utils";
import {
  LayoutGrid,
  List,
  RefreshCw,
  Search,
  X,
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
  normGid,
  playerTeamFilter,
  type PlayerBoxScore,
  type TeamBoxScore,
} from "./game-results";
import { parseUrlRoute, updateUrlRoute } from "../lib/router";
import type { ActiveView, DayGroup, DisplayMode } from "./fixtures/types";
import { DatePicker, InlineError, Select, Skeleton } from "./common";
import { FixturesScheduleView } from "./fixtures/FixturesScheduleView";
import { FixturesStandingsView } from "./fixtures/FixturesStandingsView";
import { computeSeasonTeamRecords } from "../lib/teamRecords";
import { useLanguage } from "../context/LanguageContext";



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
  const { t, language, formatDate } = useLanguage();
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
    } catch { }
  };

  const [search, setSearch] = useState<string>(() => sessionStorage.getItem("nba-results-search") ?? "");
  const [pickedDate, setSelectedDate] = useState<string>(
    () => sessionStorage.getItem("nba-results-date") ?? ""
  );
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


  useEffect(() => {
    sessionStorage.setItem("nba-fixtures-active-view", activeView);
    sessionStorage.setItem("nba-results-search", search);
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
  }, [activeView, search, pickedDate, selectedSeason, selectedGameId, initialDetailTab]);

  // Load available seasons
  useEffect(() => {
    loadPrivateApi<string[]>("/frontend-data-api/seasons")
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setSeasonsList(data);
        }
      })
      .catch(() => { });
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
  const fetchSeasonGames = useCallback((season: string) => {
    setLoading(true);
    setError(null);
    loadArchivedGameIndex(season)
      .then((rows) => {
        const currentSeasonRows = rows.map((g) => ({ ...g, SEASON: g.SEASON ?? season }));
        setAllResults((prev) => [
          ...prev.filter((g) => g.SEASON !== season),
          ...currentSeasonRows,
        ]);
        setResults(currentSeasonRows);
      })
      .catch((e) => {
        setError(e.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

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
    return [...seasonPool]
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
  }, [seasonPool, search]);

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

  const dateCounts = useMemo(() => {
    const map: Record<string, number> = {};
    sortedResults.forEach((g) => {
      if (g.GAME_DATE) map[g.GAME_DATE] = (map[g.GAME_DATE] ?? 0) + 1;
    });
    return map;
  }, [sortedResults]);

  // Group games for the active view
  // If a single date is selected: show that date. If 'all', show all days in range.
  const displayedDayGroups = useMemo<DayGroup[]>(() => {
    const targetDates = selectedDate ? [selectedDate] : uniqueDates;
    return targetDates
      .map((date) => {
        const gamesForDate = sortedResults.filter((g) => g.GAME_DATE === date);
        return {
          date,
          formattedDate: formatDate(date),
          games: gamesForDate,
        };
      })
      .filter((group) => group.games.length > 0);
  }, [sortedResults, selectedDate, uniqueDates, formatDate]);

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

  // Compute regular season team records (W-L) e.g. "4-0"
  const teamRecords = useMemo(() => {
    const recordsMap = computeSeasonTeamRecords(seasonPool);
    const simpleMap = new Map<string, string>();
    for (const [abbr, stat] of recordsMap.entries()) {
      simpleMap.set(abbr, stat.recordFormatted);
    }
    return simpleMap;
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
          if (status.status === "failed") throw new Error(status.error || "Maç verileri alınamadı.");
        }
        throw new Error("Veri cekme islemi zaman asimina ugradi. Biraz sonra tekrar deneyin.");
      } catch (err) {
        setRefreshError(err instanceof Error ? err.message : "Maç verileri alınamadı.");
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
    setBatchMsg(language === "tr" ? `0/${games.length} maç güncelleniyor...` : `Updating 0/${games.length} games...`);
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
        setBatchMsg(language === "tr" ? `${finished}/${games.length} maç işlendi` : `${finished}/${games.length} games processed`);
      }
      setBatchMsg(failed.size
        ? (language === "tr" ? `${done.size} alındı, ${failed.size} alınamadı` : `${done.size} fetched, ${failed.size} failed`)
        : (language === "tr" ? `${done.size} maç güncellendi` : `${done.size} games updated`));
    } catch (err) {
      setBatchMsg(err instanceof Error ? err.message : t.fixtures.refreshFailed);
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
        {isCompletedGame && detailLoading ? (
          <div className="space-y-4 rounded border border-border bg-background-primary p-5" aria-busy="true">
            <Skeleton className="h-6 w-48" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
            <Skeleton className="h-64 w-full" />
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
            homeRecord={teamRecords.get(selectedGame.HOME_TEAM_ABBREVIATION)}
            awayRecord={teamRecords.get(selectedGame.AWAY_TEAM_ABBREVIATION)}
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
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border">
          <div role="tablist" className="flex gap-6">
            {([
              ["fixtures", language === "tr" ? "Fikstür" : "Schedule"],
              ["table", language === "tr" ? "Puan tablosu" : "Standings"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeView === id}
                onClick={() => setActiveView(id)}
                className={`-mb-px border-b-2 pb-2.5 text-sm font-medium transition-colors ${activeView === id
                  ? "border-primary text-text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mb-2 w-28">
            <Select
              aria-label={t.common.season}
              value={selectedSeason}
              onChange={(e) => {
                setSelectedSeason(e.target.value);
                setSelectedGameId(null);
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

        {activeView === "fixtures" && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {uniqueDates.length > 0 && (
              <DatePicker
                dates={uniqueDates}
                value={selectedDate}
                onChange={setSelectedDate}
                todayStr={todayStr}
                counts={dateCounts}
                formatDate={formatDate}
                order="asc"
                className="shrink-0"
              />
            )}
            {selectedDate && selectedDate !== todayStr && uniqueDates.includes(todayStr) && (
              <button
                type="button"
                onClick={() => setSelectedDate(todayStr)}
                className="rounded border border-border bg-background-primary px-2.5 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-card-border-hover hover:bg-background-tertiary"
                title={t.fixtures.goToToday}
              >
                {t.common.today}
              </button>
            )}

            {/* Fetch every finished game of the day that has no data yet */}
            {selectedDate && (pendingDateGames.length > 0 || batchRunning || batchProgress) && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={refreshDateGames}
                  disabled={batchRunning}
                  className="inline-flex h-9 items-center gap-1.5 rounded border border-border bg-background-primary px-3 text-xs font-medium text-text-secondary transition-colors hover:border-card-border-hover hover:text-text-primary disabled:opacity-50"
                  title={language === "tr" ? `${pendingDateGames.length} tamamlanan maçın kutu puanını çek` : `Fetch box scores for ${pendingDateGames.length} finished games`}
                >
                  <RefreshCw size={14} className={batchRunning ? "animate-spin text-primary" : ""} />
                  {batchRunning
                    ? language === "tr" ? "Çekiliyor..." : "Fetching..."
                    : language === "tr" ? `Eksik kutu puanlarını çek (${pendingDateGames.length})` : `Fetch missing box scores (${pendingDateGames.length})`}
                </button>
                {batchProgress && (
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-background-tertiary">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${Math.round((batchProgress.current / (batchProgress.total || 1)) * 100)}%` }}
                      />
                    </div>
                    <span className="tabular-nums">{batchMsg || `${batchProgress.current}/${batchProgress.total}`}</span>
                  </div>
                )}
                {!batchRunning && !batchProgress && batchMsg && (
                  <span className="text-xs text-text-secondary">{batchMsg}</span>
                )}
              </div>
            )}

            <div className="relative ml-auto min-w-[180px] flex-1 sm:max-w-[240px] sm:flex-initial">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.fixtures.searchPlaceholder}
                aria-label={t.fixtures.searchPlaceholder}
                className="h-9 w-full rounded border border-border bg-background-primary pl-8 pr-7 text-xs text-text-primary outline-none transition-colors placeholder:text-text-muted hover:border-card-border-hover focus:border-border-focus"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-text-secondary transition-colors hover:text-text-primary"
                  title={t.fixtures.clearSearch}
                  aria-label={t.fixtures.clearSearch}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="inline-flex h-9 items-center rounded border border-border bg-background-tertiary p-0.5 text-xs font-medium">
              {([
                ["list", List, language === "tr" ? "Liste" : "List"],
                ["cards", LayoutGrid, language === "tr" ? "Kart" : "Cards"],
              ] as const).map(([mode, Icon, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleDisplayModeChange(mode)}
                  aria-pressed={displayMode === mode}
                  className={`inline-flex h-full items-center gap-1.5 rounded-sm px-2.5 transition-colors ${displayMode === mode
                      ? "bg-background-primary font-semibold text-text-primary"
                      : "text-text-secondary hover:text-text-primary"
                    }`}
                >
                  <Icon size={14} />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error alert if any */}
      {error && (
        <InlineError
          message={error}
          onRetry={() => fetchSeasonGames(selectedSeason)}
        />
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
          teamRecords={teamRecords}
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
          hasActiveSearch={Boolean(search.trim())}
          onClearSearch={() => setSearch("")}
        />
      )}
    </div>
  );
}
