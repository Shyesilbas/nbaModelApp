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
  const isCurrentSeason = !season || season === "2026-27";
  const sourceResults = isCurrentSeason
    ? (currentGamesPromise ??= loadGameJson("/data/games.json"), await Promise.allSettled([
        currentGamesPromise,
        loadPrivateApiFresh<GameFeedRow[]>(`/frontend-data-api/games${seasonParam}`),
      ]))
    : (allSeasonGamesPromise ??= loadGameJson("/data/all_seasons_games.json"), await Promise.allSettled([
        allSeasonGamesPromise,
        loadPrivateApiFresh<GameFeedRow[]>(`/frontend-data-api/games${seasonParam}`),
      ]));
  const sources = sourceResults.map((result) => result.status === "fulfilled" ? result.value ?? [] : []);
  const byId = new Map<string, GameFeedRow>();
  for (const source of sources) {
    for (const raw of source) {
      const gid = normId(raw.GAME_ID);
      const inferredSeason = inferSeasonFromGameId(gid);
      const rowSeason = inferredSeason || raw.SEASON || season || undefined;
      if (season && rowSeason !== season) continue;
      const existing = byId.get(gid);
      const isExistingCompleted =
        existing?.GAME_STATUS === "Final" ||
        existing?.GAME_STATUS === "FINAL" ||
        ((Number(existing?.HOME_SCORE) || 0) > 0 && (Number(existing?.AWAY_SCORE) || 0) > 0);
      const isRawCompleted =
        raw.GAME_STATUS === "Final" ||
        raw.GAME_STATUS === "FINAL" ||
        ((Number(raw.HOME_SCORE) || 0) > 0 && (Number(raw.AWAY_SCORE) || 0) > 0);

      const merged = isExistingCompleted && !isRawCompleted
        ? { ...raw, ...existing }
        : { ...existing, ...raw };

      byId.set(gid, {
        ...merged,
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
    if (detail && ((detail.team_boxscores?.length ?? 0) > 0 || (detail.player_boxscores?.length ?? 0) > 0)) {
      return detail;
    }
  } catch {
    // continue to static fallback
  }

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
