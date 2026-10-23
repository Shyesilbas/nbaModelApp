export interface PlayerProfile {
  PLAYER_ID: number;
  PLAYER_NAME: string;
  CURRENT_TEAM?: string | null;
  CURRENT_TEAM_ABBREVIATION?: string | null;
  HEIGHT: string | null;
  WEIGHT: string | null;
  COLLEGE: string | null;
  COUNTRY: string | null;
  OFFICIAL_POSITION: string | null;
  POSITION_GROUP: string | null;
  DRAFT_YEAR: number | null;
  DRAFT_ROUND: number | null;
  DRAFT_NUMBER: number | null;
  FROM_YEAR: number | null;
  TO_YEAR: number | null;
  ROSTER_STATUS: string | null;
}

export interface SeasonAverages {
  games_played: number;
  games_total: number;
  teams?: string[];
  MIN: number | null;
  PTS: number | null;
  REB: number | null;
  AST: number | null;
  STL: number | null;
  BLK: number | null;
  TOV: number | null;
  FGM: number | null;
  FGA: number | null;
  FG_PCT: number | null;
  FG3M: number | null;
  FG3A: number | null;
  FG3_PCT: number | null;
  FTM: number | null;
  FTA: number | null;
  FT_PCT: number | null;
  OREB: number | null;
  DREB: number | null;
  PLUS_MINUS: number | null;
  is_roster_preview?: boolean;
  IMPORTANCE_SCORE?: number | null;
}

