import type { PlayerBoxScore } from "./types";

export const normGid = (id: string | null | undefined): string =>
  id ? id.padStart(10, "0") : "";

export const fmtPct = (v: number | null) => (v != null ? `${(v * 100).toFixed(1)}%` : "-");

export const fmtInt = (v: number | null) => (v != null ? Math.round(v).toString() : "-");

export const fmtPair = (made: number | null | undefined, att: number | null | undefined) =>
  made != null || att != null ? `${fmtInt(made ?? null)} / ${fmtInt(att ?? null)}` : "-";

export const fmtDate = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export const playerTeamFilter = (players: PlayerBoxScore[], abbr: string) =>
  players.filter((p) => p.TEAM_ABBREVIATION === abbr);

const TEAM_FULL: Record<string, string> = {
  ATL: "Hawks",
  BOS: "Celtics",
  BKN: "Nets",
  CHA: "Hornets",
  CHI: "Bulls",
  CLE: "Cavaliers",
  DAL: "Mavericks",
  DEN: "Nuggets",
  DET: "Pistons",
  GSW: "Warriors",
  HOU: "Rockets",
  IND: "Pacers",
  LAC: "Clippers",
  LAL: "Lakers",
  MEM: "Grizzlies",
  MIA: "Heat",
  MIL: "Bucks",
  MIN: "Timberwolves",
  NOP: "Pelicans",
  NYK: "Knicks",
  OKC: "Thunder",
  ORL: "Magic",
  PHI: "76ers",
  PHX: "Suns",
  POR: "Trail Blazers",
  SAC: "Kings",
  SAS: "Spurs",
  TOR: "Raptors",
  UTA: "Jazz",
  WAS: "Wizards",
};

const TEAM_CITY: Record<string, string> = {
  ATL: "Atlanta",
  BOS: "Boston",
  BKN: "Brooklyn",
  CHA: "Charlotte",
  CHI: "Chicago",
  CLE: "Cleveland",
  DAL: "Dallas",
  DEN: "Denver",
  DET: "Detroit",
  GSW: "Golden State",
  HOU: "Houston",
  IND: "Indiana",
  LAC: "LA",
  LAL: "Los Angeles",
  MEM: "Memphis",
  MIA: "Miami",
  MIL: "Milwaukee",
  MIN: "Minnesota",
  NOP: "New Orleans",
  NYK: "New York",
  OKC: "Oklahoma City",
  ORL: "Orlando",
  PHI: "Philadelphia",
  PHX: "Phoenix",
  POR: "Portland",
  SAC: "Sacramento",
  SAS: "San Antonio",
  TOR: "Toronto",
  UTA: "Utah",
  WAS: "Washington",
};

export const teamFull = (abbr: string, fallback?: string | null) =>
  TEAM_FULL[abbr] ?? fallback ?? abbr;

export const teamCity = (abbr: string) => TEAM_CITY[abbr] ?? abbr;

export interface ParsedOfficial {
  name: string;
  cleanName: string;
  jerseyNum: string | null;
  role: string;
}

export function parseOfficials(rawList: unknown): ParsedOfficial[] {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .map((item, idx) => {
      if (!item) return null;
      if (typeof item === "string") {
        const m = item.match(/^(.*?)(?:\s*\(#(\d+)\))?$/);
        const cleanName = m?.[1]?.trim() || item.trim();
        const jerseyNum = m?.[2] || null;
        return {
          name: item.trim(),
          cleanName,
          jerseyNum,
          role: "NBA Resmi Hakem",
        };
      }
      if (typeof item === "object" && item !== null) {
        const record = item as Record<string, unknown>;
        const rawName = String(record.raw_name || record.name || record.n || "");
        const m = rawName.match(/#(\d+)/);
        const jerseyNum = record.jerseyNum ? String(record.jerseyNum) : (record.jersey_num ? String(record.jersey_num) : (m?.[1] || null));
        const cleanName = record.raw_name ? String(record.raw_name) : (rawName ? rawName.replace(/\s*\(#\d+\)/, "").trim() : `Hakem ${idx + 1}`);
        return {
          name: rawName || cleanName,
          cleanName,
          jerseyNum,
          role: "NBA Resmi Hakem",
        };
      }
      return null;
    })
    .filter((o): o is ParsedOfficial => Boolean(o && o.cleanName));
}

export function isGameEligibleForRefresh(game: {
  GAME_STATUS?: string | null;
  HOME_SCORE?: number | null;
  AWAY_SCORE?: number | null;
  WINNER_TEAM_ABBREVIATION?: string | null;
  GAME_START_UTC?: string | null;
  GAME_TIME_EST?: string | null;
  GAME_DATE?: string | null;
}): boolean {
  // 1. If game already has final score, winner or is completed, NEVER allow refresh button
  const hasData =
    game.GAME_STATUS === "Final" ||
    game.GAME_STATUS === "FINAL" ||
    Boolean(game.WINNER_TEAM_ABBREVIATION) ||
    ((Number(game.HOME_SCORE) || 0) > 0 && (Number(game.AWAY_SCORE) || 0) > 0);

  if (hasData) {
    return false;
  }

  // 2. Only active if game scheduled tip-off was at least 4 hours ago
  const now = Date.now();
  const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

  // Case A: exact UTC tip-off timestamp
  if (game.GAME_START_UTC) {
    const tipoff = new Date(game.GAME_START_UTC).getTime();
    if (!isNaN(tipoff)) {
      return (now - tipoff) >= FOUR_HOURS_MS;
    }
  }

  // Case B: parse time string if present (e.g. "7:00 pm ET" or "7:00 pm")
  const timeStr = game.GAME_TIME_EST || (game.GAME_STATUS && /pm|am/i.test(game.GAME_STATUS) ? game.GAME_STATUS : null);
  if (game.GAME_DATE && timeStr) {
    const match = timeStr.match(/(\d+):(\d+)\s*(am|pm)/i);
    if (match) {
      let h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const ampm = match[3].toLowerCase();
      if (ampm === "pm" && h !== 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      // ET is UTC-4 during October EDT
      const etDateStr = `${game.GAME_DATE}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-04:00`;
      const tipoff = new Date(etDateStr).getTime();
      if (!isNaN(tipoff)) {
        return (now - tipoff) >= FOUR_HOURS_MS;
      }
    }
  }

  // Case C: only GAME_DATE is available
  // NBA evening games typically start around 7:00 pm ET (23:00 UTC).
  // 4 hours after tip-off is 03:00 UTC the following day.
  if (game.GAME_DATE) {
    const defaultTipoff = new Date(`${game.GAME_DATE}T23:00:00Z`).getTime();
    if (!isNaN(defaultTipoff)) {
      return (now - defaultTipoff) >= FOUR_HOURS_MS;
    }
  }

  return false;
}

