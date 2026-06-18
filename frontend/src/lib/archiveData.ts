import { loadJson, loadPrivateApi } from "./dataCache";
import type { GameDetail, GameFeedRow } from "../types/gameFeed";
import type { PlayerBoxScore, TeamBoxScore } from "../components/game-results/types";

const normId = (id: string | number) =>
  String(id ?? "").replace(/\D/g, "").padStart(10, "0");

const seasonSuffix = (season?: string | null) =>
  !season || season === "2025-26" ? "" : `_${season}`;

let gameDetailsPromise: Promise<GameDetail[]> | null = null;
const pbpCache = new Map<string, Promise<any>>();

async function loadGameDetails(): Promise<GameDetail[]> {
  if (!gameDetailsPromise) {
    gameDetailsPromise = loadJson<GameDetail[]>("/data/game_details.json", []);
  }
  return gameDetailsPromise;
}

export async function loadArchivedGameIndex(season?: string | null): Promise<GameFeedRow[]> {
  const seasonParam = season ? `?season=${encodeURIComponent(season)}` : "";
  try {
    return await loadPrivateApi<GameFeedRow[]>(`/frontend-data-api/games${seasonParam}`);
  } catch {
    const rows = await loadJson<GameFeedRow[]>("/data/games.json", []);
    if (!season) return rows;

    const matchingRows = rows.filter((row: any) => !row.SEASON || row.SEASON === season);
    if (matchingRows.length > 0) return matchingRows;

    const archivedRows = await loadJson<GameFeedRow[]>("/data/all_seasons_games.json", []);
    return archivedRows.filter((row: any) => row.SEASON === season);
  }
}

export async function loadArchivedGameDetail(gameId: string) {
  const details = await loadGameDetails();
  const gid = normId(gameId);
  return details.find((detail) => normId(detail.game_id) === gid) ?? null;
}

export async function loadArchivedGameBoxscores(season: string | null | undefined, gameId: string) {
  const seasonParam = season ? `?season=${encodeURIComponent(season)}` : "";
  try {
    const detail = await loadPrivateApi<any>(`/frontend-data-api/games/${encodeURIComponent(gameId)}${seasonParam}`);
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
