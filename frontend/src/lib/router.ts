export interface RouteState {
  tab: string;
  gameId?: string | null;
  detailTab?: string | null;
  playerId?: number | null;
  playerGameId?: string | null;
  team?: string | null;
  predictHome?: string | null;
  predictAway?: string | null;
  predictDate?: string | null;
  compareP1?: number | null;
  compareP2?: number | null;
}

export function parseUrlRoute(): RouteState {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab") || "game-results";
  const gameId = params.get("gameId");
  const detailTab = params.get("detailTab");
  const playerIdStr = params.get("playerId");
  const playerId = playerIdStr ? Number(playerIdStr) : null;
  const playerGameId = params.get("playerGameId");
  const team = params.get("team");
  const predictHome = params.get("predictHome");
  const predictAway = params.get("predictAway");
  const predictDate = params.get("predictDate");
  const c1Str = params.get("p1");
  const c2Str = params.get("p2");
  const compareP1 = c1Str ? Number(c1Str) : null;
  const compareP2 = c2Str ? Number(c2Str) : null;

  return {
    tab,
    gameId,
    detailTab,
    playerId: playerId && !isNaN(playerId) ? playerId : null,
    playerGameId,
    team,
    predictHome,
    predictAway,
    predictDate,
    compareP1: compareP1 && !isNaN(compareP1) ? compareP1 : null,
    compareP2: compareP2 && !isNaN(compareP2) ? compareP2 : null,
  };
}

export function navigateTo(target: Partial<RouteState>, replace = false) {
  const current = parseUrlRoute();
  const nextTab = target.tab !== undefined ? target.tab : current.tab;
  const isSameTab = nextTab === current.tab;

  const params = new URLSearchParams();

  // 1. Only include tab parameter if it's not the default tab
  if (nextTab && nextTab !== "game-results") {
    params.set("tab", nextTab);
  }

  // 2. Strict entity scoping: Each tab only shows its own page entity in URL
  if (nextTab === "game-results") {
    const gameId = target.gameId !== undefined ? target.gameId : isSameTab ? current.gameId : null;
    const detailTab = target.detailTab !== undefined ? target.detailTab : isSameTab ? current.detailTab : null;
    if (gameId) params.set("gameId", gameId);
    if (detailTab && detailTab !== "game") params.set("detailTab", detailTab);
  } else if (nextTab === "player-profile") {
    const playerId = target.playerId !== undefined ? target.playerId : isSameTab ? current.playerId : null;
    const playerGameId = target.playerGameId !== undefined ? target.playerGameId : isSameTab ? current.playerGameId : null;
    if (playerId != null) params.set("playerId", String(playerId));
    if (playerGameId) params.set("playerGameId", playerGameId);
  } else if (nextTab === "team-explorer") {
    const team = target.team !== undefined ? target.team : isSameTab ? current.team : null;
    if (team) params.set("team", team);
  } else if (nextTab === "nba-prediction") {
    const pHome = target.predictHome !== undefined ? target.predictHome : isSameTab ? current.predictHome : null;
    const pAway = target.predictAway !== undefined ? target.predictAway : isSameTab ? current.predictAway : null;
    const pDate = target.predictDate !== undefined ? target.predictDate : isSameTab ? current.predictDate : null;
    if (pHome) params.set("predictHome", pHome);
    if (pAway) params.set("predictAway", pAway);
    if (pDate) params.set("predictDate", pDate);
  } else if (nextTab === "player-compare") {
    const p1 = target.compareP1 !== undefined ? target.compareP1 : isSameTab ? current.compareP1 : null;
    const p2 = target.compareP2 !== undefined ? target.compareP2 : isSameTab ? current.compareP2 : null;
    if (p1 != null) params.set("p1", String(p1));
    if (p2 != null) params.set("p2", String(p2));
  }

  const qs = params.toString();
  const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextUrl === currentUrl) return;

  if (replace) {
    window.history.replaceState({ ...current, ...target, tab: nextTab }, "", nextUrl);
  } else {
    window.history.pushState({ ...current, ...target, tab: nextTab }, "", nextUrl);
  }

  window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
}

export function updateUrlRoute(state: Partial<RouteState>, replace = false) {
  navigateTo(state, replace);
}
