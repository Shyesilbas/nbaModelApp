import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import type { GameDetail, GameFeedRow } from "../types/gameFeed";
import { loadJson, loadPrivateApiFresh, postPrivateApi } from "../lib/dataCache";
import { loadArchivedGameBoxscores, loadArchivedGameIndex } from "../lib/archiveData";
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
  const selectedGame       = useMemo(() => results.find((g) => g.GAME_ID === selectedGameId) ?? (allResults.find((g) => g.GAME_ID === selectedGameId) as GameFeedRow | undefined) ?? null, [results, allResults, selectedGameId]);
  const selectedDetail = selectedGameId ? gameDetailCache[selectedGameId] : null;

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
          setGameDetailCache((prev) => ({
            ...prev,
            [targetGame.GAME_ID]: status.detail as unknown as {
              game_detail: GameDetail;
              team_boxscores: TeamBoxScore[];
              player_boxscores: PlayerBoxScore[];
            },
          }));
          setFreshPlayByPlay(status.play_by_play ?? null);
          setRefreshDone(true);
          const home = status.detail?.team_boxscores?.find((row) => row.TEAM_ABBREVIATION === targetGame.HOME_TEAM_ABBREVIATION);
          const away = status.detail?.team_boxscores?.find((row) => row.TEAM_ABBREVIATION === targetGame.AWAY_TEAM_ABBREVIATION);
          const markFinal = (row: GameFeedRow): GameFeedRow => row.GAME_ID === targetGame.GAME_ID ? {
            ...row,
            GAME_STATUS: "Final",
            HOME_SCORE: home?.PTS ?? row.HOME_SCORE,
            AWAY_SCORE: away?.PTS ?? row.AWAY_SCORE,
            WINNER_TEAM_ABBREVIATION: home?.WL === "W" ? row.HOME_TEAM_ABBREVIATION : away?.WL === "W" ? row.AWAY_TEAM_ABBREVIATION : row.WINNER_TEAM_ABBREVIATION,
          } : row;
          setAllResults((prev) => prev.map(markFinal));
          setResults((prev) => prev.map(markFinal));
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
    if (!selectedGame || !selectedGameId || gameDetailCache[selectedGameId]) return;
    setDetailLoading(true);
    loadArchivedGameBoxscores(selectedSeason, selectedGame.GAME_ID)
      .then((detail) => {
        setGameDetailCache((prev) => ({ ...prev, [selectedGameId]: detail }));
      })
      .catch((e) => setError(e.message))
      .finally(() => setDetailLoading(false));
  }, [selectedGame, selectedGameId, selectedSeason, gameDetailCache]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1d428a] border-t-transparent" />
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Loading results...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <AlertTriangle size={32} className="mx-auto mb-3 text-rose-500" />
        <p className="text-sm font-bold text-rose-600">{error}</p>
        <p className="mt-2 font-mono text-xs text-slate-400">
          Run: <code className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5">python3 main.py --fetch-boxscores</code>
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
      <div className="space-y-5">
        <button
          onClick={() => setSelectedGameId(null)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        >
          <ArrowLeft size={11} />
          Back to games
        </button>
        {isCompletedGame && detailLoading ? (
          <div className="flex h-32 items-center justify-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1d428a] border-t-transparent" />
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Loading box scores...</span>
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
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white px-6 py-6 shadow-[0_8px_30px_rgba(15,23,42,0.055)] sm:px-8 sm:py-7">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-blue-50/80 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-slate-400">NBA · Scores &amp; Schedule</p>
            <h2 className="mt-2 text-3xl font-black leading-none tracking-tight text-slate-900 sm:text-4xl" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Game Results</h2>
            <p className="mt-2 text-sm text-slate-500">Every matchup. Every final. Full box scores.</p>
          </div>
        </div>
      </section>
      {/* ── Filters & Controls Bar ── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_5px_22px_rgba(15,23,42,0.045)] sm:p-6">
        <div className="flex flex-col gap-5">
          
          {/* Top Row: Season Selector & Season Types */}
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-b border-slate-100 pb-5">
            {/* Season Selector */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Season</span>
              <div className="flex flex-wrap gap-1.5">
                {seasonsList.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSelectedSeason(s); setSelectedGameId(null); }}
                    className={[
                      "rounded-lg px-3 py-2 text-[11px] font-semibold transition-all duration-150 cursor-pointer",
                      selectedSeason === s
                        ? "bg-slate-900 text-white shadow-sm"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                    ].join(" ")}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Season Type Filter Tabs */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Type</span>
              <div className="flex flex-wrap gap-1.5">
                {SEASON_TYPE_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => {
                      setSeasonTypeFilter(filter.id);
                      setSelectedGameId(null);
                    }}
                    disabled={seasonTypeCounts[filter.id] === 0}
                    className={[
                      "rounded-lg px-3 py-2 text-[10px] font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer flex items-center gap-1.5",
                      seasonTypeFilter === filter.id
                        ? "bg-[#c8102e] text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
                    ].join(" ")}
                  >
                    {filter.label}
                    <span className={seasonTypeFilter === filter.id ? "text-white/70" : "text-slate-400 font-semibold"}>
                      ({seasonTypeCounts[filter.id]})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Row: Date Navigation & Team Search */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-0.5">
            {/* Date Navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedDate(uniqueDates[selectedDateIndex - 1] ?? selectedDate)}
                disabled={selectedDateIndex <= 0}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:border-slate-300 disabled:opacity-30 cursor-pointer shadow-2xs"
                title="Previous match day"
              >
                <ChevronLeft size={14} />
              </button>

              <div className="min-w-[170px] rounded-xl bg-slate-50 px-4 py-2 text-center">
                <p className="text-sm font-bold text-slate-900 leading-tight">
                  {selectedDate ? fmtDate(selectedDate) : "No date"}
                </p>
                <p className="text-[9px] font-bold text-slate-400 leading-none mt-0.5">
                  {selectedDateGames.length} game{selectedDateGames.length !== 1 ? "s" : ""}
                </p>
              </div>

              <button
                onClick={() => setSelectedDate(uniqueDates[selectedDateIndex + 1] ?? selectedDate)}
                disabled={selectedDateIndex >= uniqueDates.length - 1}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:border-slate-300 disabled:opacity-30 cursor-pointer shadow-2xs"
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-xs text-slate-700 outline-none placeholder:text-slate-400 transition focus:border-[#c8102e] focus:bg-white focus:ring-4 focus:ring-rose-50"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

        </div>
      </section>

      {/* ── Game cards grid ── */}
      {selectedDateGames.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
            <Trophy size={20} />
          </div>
          <p className="text-sm font-black uppercase tracking-wide text-slate-700">No games found for this selection</p>
          <p className="text-xs text-slate-400 mt-1">Try selecting a different match day, category, or clear search filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
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
