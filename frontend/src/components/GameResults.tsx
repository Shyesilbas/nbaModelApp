import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import type { GameDetail, GameFeedRow } from "../types/gameFeed";
import { loadJson, loadPrivateApi } from "../lib/dataCache";
import {
  GameCard,
  GameCardDetail,
  fmtDate,
  normGid,
  playerTeamFilter,
  type PlayerBoxScore,
  type TeamBoxScore,
} from "./game-results";

type SeasonTypeFilter = "all" | "regular" | "playin" | "playoffs" | "finals";

const SEASON_TYPE_FILTERS: { id: SeasonTypeFilter; label: string; values: string[] }[] = [
  { id: "all", label: "All", values: [] },
  { id: "regular", label: "Regular Season", values: ["Regular Season"] },
  { id: "playin", label: "Play In", values: ["PlayIn"] },
  { id: "playoffs", label: "Play Off", values: ["Playoffs"] },
  { id: "finals", label: "NBA Finals", values: ["NBA Finals"] },
];


/* ── Main exported component ── */
export default function GameResults() {
  const [seasonsList, setSeasonsList] = useState<string[]>(["2025-26", "2024-25", "2023-24", "2022-23"]);
  const [allResults,  setAllResults]  = useState<(GameFeedRow & { SEASON?: string })[]>([]);
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
  const [initialDetailTab, setInitialDetailTab] = useState<"game" | "home" | "away" | "prediction">("game");

  const handleOpenGame = (gameId: string, startTab: "game" | "home" | "away" | "prediction" = "game") => {
    setInitialDetailTab(startTab);
    setSelectedGameId(gameId);
  };
  const [selectedSeason, setSelectedSeason] = useState<string>("2025-26");

  // Initial load: games index + current season boxscores
  useEffect(() => {
    loadJson<string[]>("/data/seasons.json", [])
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setSeasonsList(data);
        }
      })
      .catch(() => {});

    loadPrivateApi<GameFeedRow[]>("/frontend-data-api/games?season=2025-26")
      .then((r) => {
        const taggedCurrent = (r as any[]).map((g) => ({ ...g, SEASON: "2025-26" }));
        setAllResults(taggedCurrent);
        setResults(r);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  // Lazy-load compact game index when switching seasons.
  useEffect(() => {
    if (selectedSeason === "2025-26") return;
    if (allResults.some((g) => g.SEASON === selectedSeason)) return;
    loadPrivateApi<(GameFeedRow & { SEASON?: string })[]>(`/frontend-data-api/games?season=${encodeURIComponent(selectedSeason)}`).then((rows) => {
      setAllResults((prev) => [...prev, ...rows.map((g) => ({ ...g, SEASON: selectedSeason }))]);
    });
  }, [selectedSeason, allResults]);

  const sortedResults = useMemo(() => {
    const q = search.trim().toUpperCase();
    const seasonPool = selectedSeason === "2025-26" ? results : allResults.filter((g: any) => g.SEASON === selectedSeason);
    const typeFilter = SEASON_TYPE_FILTERS.find((f) => f.id === seasonTypeFilter);
    return [...seasonPool]
      .filter((x) => !typeFilter || typeFilter.id === "all" || typeFilter.values.includes(x.SEASON_TYPE))
      .filter((x) => !q || (x.HOME_TEAM_ABBREVIATION ?? "").includes(q) || (x.AWAY_TEAM_ABBREVIATION ?? "").includes(q) || x.GAME_ID.includes(q))
      .sort((a, b) => (b.GAME_DATE ?? "").localeCompare(a.GAME_DATE ?? ""));
  }, [results, allResults, selectedSeason, seasonTypeFilter, search]);

  const uniqueDates = useMemo(
    () => Array.from(new Set(sortedResults.map((g) => g.GAME_DATE ?? "").filter(Boolean))).sort((a, b) => b.localeCompare(a)),
    [sortedResults],
  );

  useEffect(() => {
    // Reset date when season changes
    setSelectedDate(uniqueDates[0] ?? "");
  }, [selectedSeason, seasonTypeFilter, uniqueDates.length]);

  const seasonTypeCounts = useMemo(() => {
    const seasonPool = selectedSeason === "2025-26" ? results : allResults.filter((g: any) => g.SEASON === selectedSeason);
    return SEASON_TYPE_FILTERS.reduce<Record<SeasonTypeFilter, number>>((acc, filter) => {
      acc[filter.id] = filter.id === "all"
        ? seasonPool.length
        : seasonPool.filter((g) => filter.values.includes(g.SEASON_TYPE)).length;
      return acc;
    }, { all: 0, regular: 0, playin: 0, playoffs: 0, finals: 0 });
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
    loadPrivateApi<{
      game_detail: GameDetail | null;
      team_boxscores: TeamBoxScore[];
      player_boxscores: PlayerBoxScore[];
    }>(`/frontend-data-api/games/${encodeURIComponent(selectedGame.GAME_ID)}?season=${encodeURIComponent(selectedSeason)}`)
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
        {detailLoading || !selectedDetail ? (
          <div className="flex h-32 items-center justify-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1d428a] border-t-transparent" />
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Loading box scores...</span>
          </div>
        ) : (
          <GameCardDetail
            key={selectedGame.GAME_ID}
            game={selectedGame}
            gameDetail={selectedDetail.game_detail}
            homeBS={homeBS}
            awayBS={awayBS}
            homePlayers={playerTeamFilter(gamePlayers, selectedGame.HOME_TEAM_ABBREVIATION)}
            awayPlayers={playerTeamFilter(gamePlayers, selectedGame.AWAY_TEAM_ABBREVIATION)}
            initialTab={initialDetailTab}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Hero ── */}
      <section className="rounded-[1.75rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#1d428a]/10">
              <Trophy size={15} className="text-[#1d428a]" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                Game Scores
              </h2>
              <p className="text-xs text-slate-500">Final scores, team edges and player logs.</p>
            </div>
          </div>
          {/* Season selector pills */}
          <div className="flex flex-wrap gap-1.5">
            {seasonsList.map((s) => (
              <button
                key={s}
                onClick={() => { setSelectedSeason(s); setSelectedGameId(null); }}
                className={[
                  "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] transition-all duration-200",
                  selectedSeason === s
                    ? "bg-[#1d428a] text-white shadow-md shadow-[#1d428a]/25"
                    : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700",
                ].join(" ")}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Season type filter ── */}
      <section className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">Season type</p>
            <p className="mt-0.5 text-xs font-medium text-slate-500">{sortedResults.length} matching games</p>
          </div>
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
                  "rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-35",
                  seasonTypeFilter === filter.id
                    ? "bg-slate-900 text-white shadow-md shadow-slate-900/15"
                    : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800",
                ].join(" ")}
              >
                {filter.label}
                <span className={seasonTypeFilter === filter.id ? "ml-1.5 text-white/70" : "ml-1.5 text-slate-400"}>
                  {seasonTypeCounts[filter.id]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Date navigation ── */}
      <section className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Nav controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedDate(uniqueDates[selectedDateIndex + 1] ?? selectedDate)}
              disabled={selectedDateIndex >= uniqueDates.length - 1}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>

            <div className="text-center">
              <p className="text-sm font-black text-slate-900">{selectedDate ? fmtDate(selectedDate) : "No date"}</p>
              <p className="text-[10px] text-slate-400">
                {selectedDateGames.length} game{selectedDateGames.length !== 1 ? "s" : ""}
                {" · "}
                {uniqueDates.length} days total
              </p>
            </div>

            <button
              onClick={() => setSelectedDate(uniqueDates[selectedDateIndex - 1] ?? selectedDate)}
              disabled={selectedDateIndex <= 0}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search team…"
            className="w-48 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#1d428a] focus:bg-white focus:ring-2 focus:ring-[#1d428a]/10 transition"
          />
        </div>
      </section>

      {/* ── Game cards grid ── */}
      {selectedDateGames.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">
          No games for this date.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {selectedDateGames.map((game) => (
            <GameCard
              key={game.GAME_ID}
              game={game}
              onOpen={() => handleOpenGame(game.GAME_ID, "game")}
              onPredict={() => handleOpenGame(game.GAME_ID, "prediction")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
