import type { GameFeedRow } from "../types/gameFeed";
import { NBA_TEAM_ABBRS, TEAM_NAME_BY_ABBR, getTeamShortName, isKnownTeamAbbr } from "./nbaTeams";

export const EAST_TEAMS = new Set([
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DET", "IND",
  "MIA", "MIL", "NYK", "ORL", "PHI", "TOR", "WAS",
]);

export interface TeamRecordStats {
  abbr: string;
  w: number;
  l: number;
  gp: number;
  recordFormatted: string; // "W-L" e.g. "4-0"
  hw: number;
  hl: number;
  homeRecord: string;
  aw: number;
  al: number;
  awayRecord: string;
  history: ("W" | "L")[];
  form: ("W" | "L")[];
  streak: string;
  ptsFor: number;
  ptsAgainst: number;
  ppg: string;
  oppPpg: string;
  diff: string;
  diffNum: number;
  pct: number;
  pctFormatted: string;
  conference: "East" | "West";
  name: string;
  fullName: string;
}

export type TeamRecordsMap = Map<string, TeamRecordStats>;

/**
 * Computes official regular season team records and standings stats from a list of games.
 * Only completed Regular Season games are counted.
 */
export function computeSeasonTeamRecords(games: GameFeedRow[]): TeamRecordsMap {
  const map = new Map<string, {
    w: number;
    l: number;
    hw: number;
    hl: number;
    aw: number;
    al: number;
    pf: number;
    pa: number;
    history: ("W" | "L")[];
  }>();

  for (const abbr of NBA_TEAM_ABBRS) {
    map.set(abbr, {
      w: 0,
      l: 0,
      hw: 0,
      hl: 0,
      aw: 0,
      al: 0,
      pf: 0,
      pa: 0,
      history: [],
    });
  }

  // Sort games chronologically so streak and form are exact
  const sorted = [...games].sort((a, b) => (a.GAME_DATE ?? "").localeCompare(b.GAME_DATE ?? ""));

  for (const g of sorted) {
    // Official 82-game regular season games only
    if (g.SEASON_TYPE !== "Regular Season") continue;

    const isCompleted =
      g.GAME_STATUS === "Final" ||
      g.GAME_STATUS === "FINAL" ||
      Boolean(g.WINNER_TEAM_ABBREVIATION) ||
      ((Number(g.HOME_SCORE) || 0) > 0 && (Number(g.AWAY_SCORE) || 0) > 0);

    if (!isCompleted) continue;

    const home = g.HOME_TEAM_ABBREVIATION;
    const away = g.AWAY_TEAM_ABBREVIATION;
    if (!home || !away) continue;

    const hStats = map.get(home);
    const aStats = map.get(away);
    if (!hStats || !aStats) continue;

    const hScore = Number(g.HOME_SCORE) || 0;
    const aScore = Number(g.AWAY_SCORE) || 0;
    const homeWon = g.WINNER_TEAM_ABBREVIATION
      ? g.WINNER_TEAM_ABBREVIATION === home
      : hScore > aScore;

    hStats.pf += hScore;
    hStats.pa += aScore;
    aStats.pf += aScore;
    aStats.pa += hScore;

    if (homeWon) {
      hStats.w += 1;
      hStats.hw += 1;
      aStats.l += 1;
      aStats.al += 1;
      hStats.history.push("W");
      aStats.history.push("L");
    } else {
      hStats.l += 1;
      hStats.hl += 1;
      aStats.w += 1;
      aStats.aw += 1;
      hStats.history.push("L");
      aStats.history.push("W");
    }
  }

  const resultMap: TeamRecordsMap = new Map();

  for (const abbr of NBA_TEAM_ABBRS) {
    const s = map.get(abbr)!;
    const gp = s.w + s.l;
    const pct = gp > 0 ? s.w / gp : 0;
    const ppgNum = gp > 0 ? s.pf / gp : 0;
    const oppPpgNum = gp > 0 ? s.pa / gp : 0;
    const diffNum = gp > 0 ? ppgNum - oppPpgNum : 0;

    // Current Streak
    let streak = "-";
    if (s.history.length > 0) {
      const lastRes = s.history[s.history.length - 1];
      let count = 0;
      for (let i = s.history.length - 1; i >= 0; i--) {
        if (s.history[i] === lastRes) count++;
        else break;
      }
      streak = `${lastRes}${count}`;
    }

    const fullName = isKnownTeamAbbr(abbr) ? TEAM_NAME_BY_ABBR[abbr] : abbr;
    const name = getTeamShortName(abbr, fullName);

    resultMap.set(abbr, {
      abbr,
      w: s.w,
      l: s.l,
      gp,
      recordFormatted: `${s.w}-${s.l}`,
      hw: s.hw,
      hl: s.hl,
      homeRecord: `${s.hw}-${s.hl}`,
      aw: s.aw,
      al: s.al,
      awayRecord: `${s.aw}-${s.al}`,
      history: s.history,
      form: s.history.slice(-5),
      streak,
      ptsFor: s.pf,
      ptsAgainst: s.pa,
      ppg: ppgNum.toFixed(1),
      oppPpg: oppPpgNum.toFixed(1),
      diff: diffNum > 0 ? `+${diffNum.toFixed(1)}` : diffNum.toFixed(1),
      diffNum,
      pct,
      pctFormatted: pct.toFixed(3).replace(/^0/, ""),
      conference: EAST_TEAMS.has(abbr) ? "East" : "West",
      name,
      fullName,
    });
  }

  return resultMap;
}
