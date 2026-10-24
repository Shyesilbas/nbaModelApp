import type { PlayerBoxScore } from "./types";

export const normGid = (id: string | null | undefined): string =>
  id ? id.padStart(10, "0") : "";

export const fmtPct = (v: number | null) => (v != null ? `${(v * 100).toFixed(1)}%` : "-");

export const fmtInt = (v: number | null) => (v != null ? Math.round(v).toString() : "-");

export const fmtPair = (made: number | null | undefined, att: number | null | undefined) =>
  made != null || att != null ? `${fmtInt(made ?? null)} / ${fmtInt(att ?? null)}` : "-";

const DATE_EN = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

export const fmtDate = (d: string) => DATE_EN.format(new Date(d + "T12:00:00"));

export const parseMinutes = (val: number | string | null | undefined): number => {
  if (val == null) return -1;
  if (typeof val === "number") return isNaN(val) ? -1 : val;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed || trimmed === "—" || trimmed.toUpperCase().startsWith("DNP") || trimmed.toUpperCase() === "NWT") {
      return -1;
    }
    if (trimmed.includes(":")) {
      const parts = trimmed.split(":");
      const m = parseFloat(parts[0]) || 0;
      const s = parseFloat(parts[1]) || 0;
      return m + s / 60;
    }
    const parsed = parseFloat(trimmed);
    return isNaN(parsed) ? -1 : parsed;
  }
  return -1;
};

type LoosePlayer = PlayerBoxScore & {
  min?: number | string | null;
  pts?: number | null;
  player_name?: string | null;
};

export const sortPlayersByMinutes = (players: PlayerBoxScore[]): PlayerBoxScore[] => {
  return [...players].sort((a, b) => {
    const pA = a as LoosePlayer;
    const pB = b as LoosePlayer;
    const minA = parseMinutes(pA.MIN ?? pA.min);
    const minB = parseMinutes(pB.MIN ?? pB.min);
    if (minB !== minA) return minB - minA;
    const ptsA = Number(pA.PTS ?? pA.pts) || 0;
    const ptsB = Number(pB.PTS ?? pB.pts) || 0;
    if (ptsB !== ptsA) return ptsB - ptsA;
    const nameA = pA.PLAYER_NAME ?? pA.player_name ?? "";
    const nameB = pB.PLAYER_NAME ?? pB.player_name ?? "";
    return nameA.localeCompare(nameB);
  });
};

export const playerTeamFilter = (players: PlayerBoxScore[], abbr: string) =>
  sortPlayersByMinutes(players.filter((p) => p.TEAM_ABBREVIATION === abbr));

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


export const teamFull = (abbr: string, fallback?: string | null) =>
  TEAM_FULL[abbr] ?? fallback ?? abbr;

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

// toLocaleTimeString with options builds a new formatter on every call (~1 ms each).
const TIPOFF_TR = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hour12: false });
const TIPOFF_EN = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true });

/** Scheduled tip-off in local or ET time, or null when the feed has no start time. */
export function fmtTipoffTR(startUtc?: string | null, lang: string = "tr"): string | null {
  if (!startUtc) return null;
  const t = new Date(startUtc);
  if (isNaN(t.getTime())) return null;
  if (lang === "en") {
    return `${TIPOFF_EN.format(t)} ET`;
  }
  return `${TIPOFF_TR.format(t)} TSİ`;
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

  // 2. Only active if game scheduled tip-off was at least 2.5 hours ago
  const now = Date.now();
  const MIN_ELAPSED_MS = 2.5 * 60 * 60 * 1000;

  // Case A: exact UTC tip-off timestamp
  if (game.GAME_START_UTC) {
    const tipoff = new Date(game.GAME_START_UTC).getTime();
    if (!isNaN(tipoff)) {
      return (now - tipoff) >= MIN_ELAPSED_MS;
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
        return (now - tipoff) >= MIN_ELAPSED_MS;
      }
    }
  }

  // Case C: only GAME_DATE is available
  // NBA evening games typically start around 7:00 pm ET (23:00 UTC).
  // 2.5 hours after tip-off is 01:30 UTC the following day.
  if (game.GAME_DATE) {
    const defaultTipoff = new Date(`${game.GAME_DATE}T23:00:00Z`).getTime();
    if (!isNaN(defaultTipoff)) {
      return (now - defaultTipoff) >= MIN_ELAPSED_MS;
    }
  }

  return false;
}

