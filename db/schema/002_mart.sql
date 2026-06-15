CREATE SCHEMA IF NOT EXISTS mart;

CREATE TABLE IF NOT EXISTS mart.dataset_rows (
    season text NOT NULL,
    dataset text NOT NULL,
    source_path text NOT NULL,
    row_number integer NOT NULL,
    game_id text,
    game_date date,
    team_id bigint,
    team_abbreviation text,
    player_id bigint,
    player_name text,
    row_data jsonb NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (dataset, source_path, row_number)
);

CREATE INDEX IF NOT EXISTS idx_mart_dataset_rows_dataset_season
    ON mart.dataset_rows (dataset, season);

CREATE INDEX IF NOT EXISTS idx_mart_dataset_rows_game
    ON mart.dataset_rows (game_id);

CREATE INDEX IF NOT EXISTS idx_mart_dataset_rows_team
    ON mart.dataset_rows (team_abbreviation, season);

CREATE INDEX IF NOT EXISTS idx_mart_dataset_rows_player
    ON mart.dataset_rows (player_id, season);

CREATE INDEX IF NOT EXISTS idx_mart_dataset_rows_game_date
    ON mart.dataset_rows (game_date);

CREATE INDEX IF NOT EXISTS idx_mart_dataset_rows_gin
    ON mart.dataset_rows USING gin (row_data);

DROP VIEW IF EXISTS
    mart.games,
    mart.team_game_logs,
    mart.player_game_logs,
    mart.team_boxscores,
    mart.player_boxscores,
    mart.team_features,
    mart.player_features,
    mart.team_model_ready_v2
CASCADE;

CREATE OR REPLACE VIEW mart.games AS
SELECT
    season,
    game_id,
    game_date,
    row_data ->> 'HOME_TEAM_ABBREVIATION' AS home_team,
    row_data ->> 'AWAY_TEAM_ABBREVIATION' AS away_team,
    NULLIF(row_data ->> 'HOME_SCORE', '')::numeric AS home_score,
    NULLIF(row_data ->> 'AWAY_SCORE', '')::numeric AS away_score,
    row_data ->> 'SEASON_TYPE' AS season_type,
    row_data ->> 'GAME_STATUS' AS game_status,
    row_data
FROM mart.dataset_rows
WHERE dataset = 'game_results';

CREATE OR REPLACE VIEW mart.team_game_logs AS
SELECT
    season,
    game_id,
    game_date,
    team_id,
    team_abbreviation,
    row_data ->> 'TEAM_NAME' AS team_name,
    row_data ->> 'MATCHUP' AS matchup,
    row_data ->> 'WL' AS wl,
    NULLIF(row_data ->> 'MIN', '')::numeric AS min,
    NULLIF(row_data ->> 'PTS', '')::numeric AS pts,
    NULLIF(row_data ->> 'REB', '')::numeric AS reb,
    NULLIF(row_data ->> 'AST', '')::numeric AS ast,
    NULLIF(row_data ->> 'STL', '')::numeric AS stl,
    NULLIF(row_data ->> 'BLK', '')::numeric AS blk,
    NULLIF(row_data ->> 'TOV', '')::numeric AS tov,
    NULLIF(row_data ->> 'PLUS_MINUS', '')::numeric AS plus_minus,
    row_data ->> 'SEASON_TYPE' AS season_type,
    row_data
FROM mart.dataset_rows
WHERE dataset = 'team_games';

CREATE OR REPLACE VIEW mart.player_game_logs AS
SELECT
    season,
    game_id,
    game_date,
    player_id,
    player_name,
    row_data ->> 'TEAM_ABBREVIATION' AS team_abbreviation,
    row_data ->> 'MATCHUP' AS matchup,
    row_data ->> 'WL' AS wl,
    NULLIF(row_data ->> 'MIN', '')::numeric AS min,
    NULLIF(row_data ->> 'PTS', '')::numeric AS pts,
    NULLIF(row_data ->> 'REB', '')::numeric AS reb,
    NULLIF(row_data ->> 'AST', '')::numeric AS ast,
    NULLIF(row_data ->> 'STL', '')::numeric AS stl,
    NULLIF(row_data ->> 'BLK', '')::numeric AS blk,
    NULLIF(row_data ->> 'TOV', '')::numeric AS tov,
    NULLIF(row_data ->> 'PLUS_MINUS', '')::numeric AS plus_minus,
    row_data ->> 'SEASON_TYPE' AS season_type,
    row_data
FROM mart.dataset_rows
WHERE dataset = 'player_games';

CREATE OR REPLACE VIEW mart.team_boxscores AS
SELECT
    season,
    game_id,
    game_date,
    team_id,
    team_abbreviation,
    row_data ->> 'TEAM_NAME' AS team_name,
    row_data ->> 'MATCHUP' AS matchup,
    row_data ->> 'WL' AS wl,
    NULLIF(row_data ->> 'PTS', '')::numeric AS pts,
    NULLIF(row_data ->> 'REB', '')::numeric AS reb,
    NULLIF(row_data ->> 'AST', '')::numeric AS ast,
    NULLIF(row_data ->> 'PLUS_MINUS', '')::numeric AS plus_minus,
    row_data ->> 'SEASON_TYPE' AS season_type,
    row_data
FROM mart.dataset_rows
WHERE dataset = 'team_boxscores';

CREATE OR REPLACE VIEW mart.player_boxscores AS
SELECT
    season,
    game_id,
    game_date,
    player_id,
    player_name,
    row_data ->> 'TEAM_ABBREVIATION' AS team_abbreviation,
    row_data ->> 'MATCHUP' AS matchup,
    row_data ->> 'WL' AS wl,
    NULLIF(row_data ->> 'MIN', '')::numeric AS min,
    NULLIF(row_data ->> 'PTS', '')::numeric AS pts,
    NULLIF(row_data ->> 'REB', '')::numeric AS reb,
    NULLIF(row_data ->> 'AST', '')::numeric AS ast,
    NULLIF(row_data ->> 'PLUS_MINUS', '')::numeric AS plus_minus,
    row_data ->> 'SEASON_TYPE' AS season_type,
    row_data
FROM mart.dataset_rows
WHERE dataset = 'player_boxscores';

CREATE OR REPLACE VIEW mart.team_features AS
SELECT
    season,
    game_id,
    game_date,
    team_id,
    team_abbreviation,
    row_data ->> 'TEAM_NAME' AS team_name,
    row_data ->> 'MATCHUP' AS matchup,
    row_data ->> 'OPPONENT_ABBREVIATION' AS opponent_abbreviation,
    NULLIF(row_data ->> 'IS_HOME', '')::boolean AS is_home,
    NULLIF(row_data ->> 'IS_PLAYOFF', '')::boolean AS is_playoff,
    NULLIF(row_data ->> 'WIN', '')::numeric AS win,
    NULLIF(row_data ->> 'DAYS_REST', '')::numeric AS days_rest,
    NULLIF(row_data ->> 'PTS_LAST_5', '')::numeric AS pts_last_5,
    NULLIF(row_data ->> 'WINRATE_LAST_5', '')::numeric AS winrate_last_5,
    NULLIF(row_data ->> 'OFF_RTG_LAST_5', '')::numeric AS off_rtg_last_5,
    NULLIF(row_data ->> 'DEF_RTG_LAST_5', '')::numeric AS def_rtg_last_5,
    NULLIF(row_data ->> 'NET_RTG_LAST_5', '')::numeric AS net_rtg_last_5,
    row_data
FROM mart.dataset_rows
WHERE dataset = 'team_features';

CREATE OR REPLACE VIEW mart.player_features AS
SELECT
    season,
    game_id,
    game_date,
    player_id,
    player_name,
    row_data ->> 'MATCHUP' AS matchup,
    row_data ->> 'OPPONENT_ABBREVIATION' AS opponent_abbreviation,
    NULLIF(row_data ->> 'IS_HOME', '')::boolean AS is_home,
    NULLIF(row_data ->> 'IS_PLAYOFF', '')::boolean AS is_playoff,
    NULLIF(row_data ->> 'WIN', '')::numeric AS win,
    NULLIF(row_data ->> 'MIN', '')::numeric AS min,
    NULLIF(row_data ->> 'PTS', '')::numeric AS pts,
    NULLIF(row_data ->> 'REB', '')::numeric AS reb,
    NULLIF(row_data ->> 'AST', '')::numeric AS ast,
    NULLIF(row_data ->> 'PTS_LAST_5', '')::numeric AS pts_last_5,
    NULLIF(row_data ->> 'MIN_LAST_5', '')::numeric AS min_last_5,
    NULLIF(row_data ->> 'REB_LAST_5', '')::numeric AS reb_last_5,
    NULLIF(row_data ->> 'AST_LAST_5', '')::numeric AS ast_last_5,
    row_data
FROM mart.dataset_rows
WHERE dataset = 'player_features';

CREATE OR REPLACE VIEW mart.team_model_ready_v2 AS
SELECT
    season,
    game_id,
    game_date,
    team_id,
    team_abbreviation,
    row_data ->> 'TEAM_NAME' AS team_name,
    row_data ->> 'MATCHUP' AS matchup,
    row_data ->> 'OPPONENT_ABBREVIATION' AS opponent_abbreviation,
    NULLIF(row_data ->> 'IS_HOME', '')::boolean AS is_home,
    NULLIF(row_data ->> 'IS_PLAYOFF', '')::boolean AS is_playoff,
    NULLIF(row_data ->> 'WIN', '')::numeric AS win,
    NULLIF(row_data ->> 'DAYS_REST', '')::numeric AS days_rest,
    NULLIF(row_data ->> 'PTS_LAST_5', '')::numeric AS pts_last_5,
    NULLIF(row_data ->> 'OPP_PTS_LAST_5', '')::numeric AS opp_pts_last_5,
    NULLIF(row_data ->> 'WINRATE_LAST_5', '')::numeric AS winrate_last_5,
    NULLIF(row_data ->> 'OPP_WINRATE_LAST_5', '')::numeric AS opp_winrate_last_5,
    row_data
FROM mart.dataset_rows
WHERE dataset = 'team_model_ready_v2';
