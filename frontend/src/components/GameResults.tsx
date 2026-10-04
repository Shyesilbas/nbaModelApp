import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import type { GameDetail, GameFeedRow } from "../types/gameFeed";
import { loadJson } from "../lib/dataCache";
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
  const [search,      setSearch]      = useState("");
  const [seasonTypeFilter, setSeasonTypeFilter] = useState<SeasonTypeFilter>("all");
  const [selectedDate,setSelectedDate]= useState<string>("");
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [initialDetailTab, setInitialDetailTab] = useState<"game" | "home" | "away" | "pbp">("game");

  const handleOpenGame = (gameId: string, startTab: "game" | "home" | "away" | "pbp" = "game") => {
    setInitialDetailTab(startTab);
    setSelectedGameId(gameId);
  };
  const [selectedSeason, setSelectedSeason] = useState<string>("2026-27");

  // Initial load: archived games index
  useEffect(() => {
    loadJson<string[]>("/data/seasons.json", [])
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setSeasonsList(data);
        }
      })
      .catch(() => {});

    loadArchivedGameIndex("2026-27")
      .then((rows) => {
        setAllResults(rows.map((g) => ({ ...g, SEASON: g.SEASON ?? "2026-27" })));
        setResults(rows.filter((g) => g.SEASON === "2026-27"));
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  // Lazy-load compact game index when switching seasons.
  useEffect(() => {
    loadArchivedGameIndex(selectedSeason).then((rows) => {
      const filtered = rows
        .map((g) => ({ ...g, SEASON: g.SEASON ?? selectedSeason }));
      if (filtered.length > 0) {
        setAllResults((prev) => {
          const existingIds = new Set(prev.map(x => x.GAME_ID));
          const newRows = filtered.filter(x => !existingIds.has(x.GAME_ID));
          return [...prev, ...newRows];
        });
      }
    });
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
      setSelectedDate(uniqueDates.find((day) => day >= today) ?? uniqueDates[uniqueDates.length - 1]);
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
      <div className="space-y-4">
        <button
          onClick={() => setSelectedGameId(null)}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
        >
          <ArrowLeft size={11} />
          Back to games
        </button>
        {isCompletedGame && (detailLoading || !selectedDetail) ? (
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
      <section className="border-y-[3px] border-[#c8102e] bg-[#101820] px-5 py-5 text-white sm:px-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.28em] text-white/55">NBA · Scores &amp; Schedule</p>
            <h2 className="mt-1 text-3xl font-black uppercase leading-none tracking-tight sm:text-4xl" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Game Results</h2>
            <p className="mt-2 text-xs text-white/65">Every matchup. Every final. Full box scores.</p>
          </div>
          <div className="flex items-center gap-2 border-l border-white/20 pl-4">
            <span className="h-2 w-2 bg-[#c8102e]" />
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/50">Selected slate</p>
              <p className="text-sm font-bold">{selectedDateGames.length} {selectedDateGames.length === 1 ? "game" : "games"}</p>
            </div>
          </div>
        </div>
      </section>
      {/* ── Filters & Controls Bar ── */}
      <section className="border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
        <div className="flex flex-col gap-4">
          
          {/* Top Row: Season Selector & Season Types */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
            {/* Season Selector */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Season:</span>
              <div className="flex flex-wrap gap-1 border-b border-slate-200">
                {seasonsList.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSelectedSeason(s); setSelectedGameId(null); }}
                    className={[
                      "border-b-2 px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition-all duration-150 cursor-pointer",
                      selectedSeason === s
                        ? "border-[#c8102e] text-slate-900"
                        : "border-transparent text-slate-500 hover:text-slate-900",
                    ].join(" ")}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Season Type Filter Tabs */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Type:</span>
              <div className="flex flex-wrap gap-1">
                {SEASON_TYPE_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => {
                      setSeasonTypeFilter(filter.id);
                      setSelectedGameId(null);
                    }}
                    disabled={seasonTypeCounts[filter.id] === 0}
                    className={[
                      "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer flex items-center gap-1",
                      seasonTypeFilter === filter.id
                        ? "border-[#c8102e] bg-[#c8102e] text-white"
                        : "border border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900",
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
          <div className="flex flex-wrap items-center justify-between gap-3">
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

              <div className="min-w-[150px] border-x-2 border-[#c8102e] px-4 py-1 text-center">
                <p className="text-sm font-black uppercase text-slate-900 leading-tight">
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
                className="w-full border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#c8102e] transition"
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {selectedDateGames.map((game) => (
            <GameCard
              key={game.GAME_ID}
              game={game}
              onOpen={() => handleOpenGame(game.GAME_ID, "game")}
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
