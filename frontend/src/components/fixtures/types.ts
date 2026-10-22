import type { GameFeedRow } from "../../types/gameFeed";

export type DisplayMode = "list" | "cards";
export type ActiveView = "fixtures" | "table";
export type ConferenceFilter = "all" | "east" | "west";

export interface TeamStanding {
  rank: number;
  abbr: string;
  name: string;
  fullName?: string;
  conference: "East" | "West";
  gp: number;
  w: number;
  l: number;
  pct: number;
  pctFormatted: string;
  gb: string;
  ptsFor: number;
  ptsAgainst: number;
  ppg: string;
  oppPpg: string;
  diff: string;
  diffNum: number;
  homeRecord: string;
  awayRecord: string;
  l10: string;
  streak: string;
  form: ("W" | "L")[];
}

export interface DayGroup {
  date: string;
  formattedDate: string;
  games: GameFeedRow[];
}
