import { loadPrivateApi, loadPrivateApiFresh } from "./dataCache";
import { CURRENT_SEASON } from "./constants";
import type { GameDetail, GameFeedRow } from "../types/gameFeed";
import type { PlayerBoxScore, TeamBoxScore } from "../components/game-results/types";

export type GameBoxscores = {
  game_id: string;
  game_detail: GameDetail | null;
  team_boxscores: TeamBoxScore[];
  player_boxscores: PlayerBoxScore[];
};

const normId = (id: string | number) =>
  String(id ?? "").replace(/\D/g, "").padStart(10, "0");

const pbpCache = new Map<string, Promise<any>>();

/** Drop cached play-by-play so a refreshed game is fetched again. */
export function invalidateGameIndexCache() {
  pbpCache.clear();
}

export async function loadArchivedGameIndex(season?: string | null): Promise<GameFeedRow[]> {
  const seasonKey = season || CURRENT_SEASON;
  const rows = await loadPrivateApiFresh<GameFeedRow[]>(
    `/frontend-data-api/games?season=${encodeURIComponent(seasonKey)}`
  );
  return rows.map((row) => ({ ...row, GAME_ID: normId(row.GAME_ID), SEASON: seasonKey }));
}

export async function loadArchivedGameBoxscores(season: string | null | undefined, gameId: string) {
  const seasonParam = season ? `?season=${encodeURIComponent(season)}` : "";
  return loadPrivateApiFresh<GameBoxscores>(`/frontend-data-api/games/${encodeURIComponent(gameId)}${seasonParam}`);
}

export async function loadArchivedPlayByPlay(gameId: string, season?: string | null) {
  const gid = normId(gameId);
  const seasonKey = season ?? CURRENT_SEASON;
  const cacheKey = `${seasonKey}:${gid}`;
  if (!pbpCache.has(cacheKey)) {
    const request = loadPrivateApi<any>(
      `/frontend-data-api/play-by-play/${encodeURIComponent(gid)}?season=${encodeURIComponent(seasonKey)}`
    ).catch((error) => {
      pbpCache.delete(cacheKey);
      throw error;
    });
    pbpCache.set(cacheKey, request);
  }
  return pbpCache.get(cacheKey)!;
}
