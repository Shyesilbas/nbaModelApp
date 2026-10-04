import { loadJson, loadPrivateApi, loadPrivateApiFresh } from "./dataCache";
import type { GameDetail, GameFeedRow } from "../types/gameFeed";
import type { PlayerBoxScore, TeamBoxScore } from "../components/game-results/types";

const normId = (id: string | number) =>
  String(id ?? "").replace(/\D/g, "").padStart(10, "0");

const seasonSuffix = (season?: string | null) =>
  !season || season === "2025-26" ? "" : `_${season}`;

let gameDetailsPromise: Promise<GameDetail[]> | null = null;
let currentGamesPromise: Promise<GameFeedRow[] | null> | null = null;
let allSeasonGamesPromise: Promise<GameFeedRow[] | null> | null = null;
let scheduleGamesPromise: Promise<GameFeedRow[] | null> | null = null;
const pbpCache = new Map<string, Promise<any>>();

async function loadGameDetails(): Promise<GameDetail[]> {
  if (!gameDetailsPromise) {
    gameDetailsPromise = loadJson<GameDetail[]>("/data/game_details.json", []);
  }
  return gameDetailsPromise;
}

const inferSeasonFromGameId = (gameId?: string | number | null): string => {
  if (!gameId) return "2026-27";
  const s = String(gameId).replace(/\D/g, "").padStart(10, "0");
  const yy = s.slice(3, 5);
  if (yy === "26") return "2026-27";
  if (yy === "25") return "2025-26";
  if (yy === "24") return "2024-25";
  if (yy === "23") return "2023-24";
  if (yy === "22") return "2022-23";
  if (yy === "21") return "2021-22";
  if (yy === "20") return "2020-21";
  if (yy === "19") return "2019-20";
  if (yy === "18") return "2018-19";
  return "2026-27";
};

export async function loadArchivedGameIndex(season?: string | null): Promise<GameFeedRow[]> {
  const seasonParam = season ? `?season=${encodeURIComponent(season)}` : "";
  currentGamesPromise ??= loadGameJson("/data/games.json");
  allSeasonGamesPromise ??= loadGameJson("/data/all_seasons_games.json");
  scheduleGamesPromise ??= loadGameJson("/data/schedule.json");
  const [apiResult, archiveResult, scheduleResult, currentResult] = await Promise.allSettled([
    loadPrivateApiFresh<GameFeedRow[]>(`/frontend-data-api/games${seasonParam}`),
    allSeasonGamesPromise,
    scheduleGamesPromise,
    currentGamesPromise,
  ]);
  const sources = [
    apiResult.status === "fulfilled" ? apiResult.value : [],
    archiveResult.status === "fulfilled" ? archiveResult.value ?? [] : [],
    scheduleResult.status === "fulfilled" ? scheduleResult.value ?? [] : [],
    currentResult.status === "fulfilled" ? currentResult.value ?? [] : [],
  ];
  const byId = new Map<string, GameFeedRow>();
  for (const source of sources) {
    for (const raw of source) {
      const gid = normId(raw.GAME_ID);
      const inferredSeason = inferSeasonFromGameId(gid);
      const rowSeason = inferredSeason || raw.SEASON || season || undefined;
      if (season && rowSeason !== season) continue;
      byId.set(gid, {
        ...byId.get(gid),
        ...raw,
        GAME_ID: gid,
        SEASON: rowSeason,
      });
    }
  }
  return [...byId.values()].sort((a, b) => (a.GAME_DATE ?? "").localeCompare(b.GAME_DATE ?? ""));
}

export async function loadArchivedGameDetail(gameId: string) {
  const details = await loadGameDetails();
  const gid = normId(gameId);
  return details.find((detail) => normId(detail.game_id) === gid) ?? null;
}

export async function loadArchivedGameBoxscores(season: string | null | undefined, gameId: string) {
  const seasonParam = season ? `?season=${encodeURIComponent(season)}` : "";
  try {
    const detail = await loadPrivateApiFresh<any>(`/frontend-data-api/games/${encodeURIComponent(gameId)}${seasonParam}`);
    return detail;
  } catch (err) {
    const suffix = seasonSuffix(season);
    const [teamBoxscores, playerBoxscores, gameDetail] = await Promise.all([
      loadJson<TeamBoxScore[]>(`/data/team_boxscores${suffix}.json`, []),
      loadJson<PlayerBoxScore[]>(`/data/player_boxscores${suffix}.json`, []),
      loadArchivedGameDetail(gameId),
    ]);

    const gid = normId(gameId);
    return {
      game_detail: gameDetail,
      team_boxscores: teamBoxscores.filter((row) => normId(row.GAME_ID) === gid),
      player_boxscores: playerBoxscores.filter((row) => normId(row.GAME_ID) === gid),
    };
  }
}

async function fetchStaticJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path, { cache: "no-cache" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function loadGameJson(path: string): Promise<GameFeedRow[]> {
  const staticRows = await fetchStaticJson<GameFeedRow[]>(path);
  if (Array.isArray(staticRows) && staticRows.length > 0) return staticRows;
  try {
    return await loadJson<GameFeedRow[]>(path, []);
  } catch {
    return [];
  }
}

export async function loadArchivedPlayByPlay(gameId: string, season?: string | null) {
  const gid = normId(gameId);
  const seasonKey = season ?? "2025-26";
  const cacheKey = `${seasonKey}:${gid}`;

  if (!pbpCache.has(cacheKey)) {
    pbpCache.set(
      cacheKey,
      (async () => {
        const staticPath = `/data/play_by_play_moments/${seasonKey}/${gid}.json`;
        const archived = await fetchStaticJson<any>(staticPath);
        if (archived) return archived;

        return loadPrivateApi<any>(`/frontend-data-api/play-by-play/${encodeURIComponent(gid)}?season=${encodeURIComponent(seasonKey)}`);
      })()
    );
  }

  return pbpCache.get(cacheKey)!;
}
