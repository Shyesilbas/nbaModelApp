export interface TeamLeader {
  player_id?: string | number | null;
  player_name?: string | null;
  team_id?: string | null;
  value?: number | null;
  n?: string | null;
}

export interface GameDetail {
  game_id: string;
  season?: string | null;
  season_type?: string | null;
  game_date?: string | null;
  game_time?: string | null;
  game_status?: string | null;
  arena?: { name?: string | null; city?: string | null; state?: string | null };
  home_team?: {
    team_id?: string | null;
    team_name?: string | null;
    team_city?: string | null;
    score?: number | null;
    quarter_scores?: number[] | null;
  };
  away_team?: {
    team_id?: string | null;
    team_name?: string | null;
    team_city?: string | null;
    score?: number | null;
    quarter_scores?: number[] | null;
  };
  team_stats?: any[];
  player_stats?: any[];
  game_leaders?: {
    points?: TeamLeader | null;
    rebounds?: TeamLeader | null;
    assists?: TeamLeader | null;
  };
  officials?: { official_id?: string | null; name?: string | null }[];
  game_result?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface GameFeedRow {
  GAME_ID: string;
  SEASON?: string | null;
  GAME_DATE: string;
  HOME_TEAM_ABBREVIATION: string;
  AWAY_TEAM_ABBREVIATION: string;
  HOME_TEAM_NAME: string | null;
  AWAY_TEAM_NAME: string | null;
  SEASON_TYPE: string;
  IS_PLAYOFF?: boolean | null;
  GAME_STATUS?: string | null;
  PLAYOFF_ROUND?: string | null;
  SERIES_GAME_NUMBER?: number | null;
  HOME_SERIES_WINS?: number | null;
  AWAY_SERIES_WINS?: number | null;
  IS_ELIMINATION_GAME?: boolean | null;
  CAN_CLINCH_SERIES?: boolean | null;
  ARENA?: string | null;
  LOCATION?: string | null;
  HOME_SCORE?: number | null;
  AWAY_SCORE?: number | null;
  WINNER_TEAM_ABBREVIATION?: string | null;
  LOSER_TEAM_ABBREVIATION?: string | null;
  HOME_TEAM_WINRATE_LAST_5?: number | null;
  HOME_TEAM_WINRATE_LAST_10?: number | null;
  HOME_TEAM_PTS_LAST_5?: number | null;
  HOME_TEAM_PTS_LAST_10?: number | null;
  HOME_TEAM_DAYS_REST?: number | null;
  HOME_TEAM_IS_B2B?: boolean | null;
  AWAY_TEAM_WINRATE_LAST_5?: number | null;
  AWAY_TEAM_WINRATE_LAST_10?: number | null;
  AWAY_TEAM_PTS_LAST_5?: number | null;
  AWAY_TEAM_PTS_LAST_10?: number | null;
  AWAY_TEAM_DAYS_REST?: number | null;
  AWAY_TEAM_IS_B2B?: boolean | null;
  HOME_TOP3_CORE_PLAYERS?: string | null;
  HOME_TOP5_CORE_PLAYERS?: string | null;
  AWAY_TOP3_CORE_PLAYERS?: string | null;
  AWAY_TOP5_CORE_PLAYERS?: string | null;
  _isUpcoming?: boolean;
  game_detail?: GameDetail | null;
}
