export interface TeamBoxScore {
  GAME_ID: string;
  TEAM_ABBREVIATION: string;
  TEAM_NAME: string | null;
  MATCHUP: string | null;
  WL: string | null;
  PTS: number | null;
  FGM?: number | null;
  FGA?: number | null;
  FG_PCT: number | null;
  FG3M?: number | null;
  FG3A?: number | null;
  FG3_PCT: number | null;
  FTM?: number | null;
  FTA?: number | null;
  FT_PCT: number | null;
  REB: number | null;
  AST: number | null;
  STL?: number | null;
  BLK?: number | null;
  TOV: number | null;
  PLUS_MINUS: number | null;
}

export interface PlayerBoxScore {
  GAME_ID: string;
  TEAM_ABBREVIATION: string;
  PLAYER_ID: number;
  PLAYER_NAME: string;
  IS_STARTER?: number | null;
  MIN: number | null;
  PTS: number | null;
  FGM?: number | null;
  FGA?: number | null;
  FG_PCT: number | null;
  FG3M?: number | null;
  FG3A?: number | null;
  FG3_PCT: number | null;
  FTM?: number | null;
  FTA?: number | null;
  FT_PCT: number | null;
  REB: number | null;
  AST: number | null;
  STL: number | null;
  BLK: number | null;
  TOV: number | null;
  PLUS_MINUS: number | null;
}

export interface ScheduleGameSummary {
  game_id: string;
  game_date?: string | null;
  season?: string | null;
  season_type?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  quarter_scores?: {
    quarter: string;
    home: number;
    away: number;
    home_total?: number;
    away_total?: number;
  }[];
  top_scorers?: {
    player_id?: number | null;
    player_name: string;
    team?: string | null;
    pts: number;
    reb?: number;
    ast?: number;
  }[];
  event_count?: number;
  scoring_event_count?: number;
  highlight_event_count?: number;
  has_play_by_play?: boolean;
}
