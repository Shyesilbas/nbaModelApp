CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS meta;

CREATE TABLE IF NOT EXISTS meta.season_manifests (
    season text PRIMARY KEY,
    manifest jsonb NOT NULL,
    source_path text NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta.data_coverage (
    season text NOT NULL,
    dataset text NOT NULL,
    coverage text,
    row_count bigint NOT NULL DEFAULT 0,
    source_path text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (season, dataset, source_path)
);

CREATE TABLE IF NOT EXISTS raw.play_by_play_payloads (
    game_id text PRIMARY KEY,
    season text NOT NULL,
    home_team text,
    away_team text,
    source_path text NOT NULL,
    payload jsonb NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pbp_payloads_season
    ON raw.play_by_play_payloads (season);

CREATE TABLE IF NOT EXISTS raw.play_by_play_events (
    game_id text NOT NULL,
    season text NOT NULL,
    event_index integer NOT NULL,
    period integer,
    clock text,
    action_type text,
    sub_type text,
    team text,
    player_id bigint,
    player_name text,
    score_home integer,
    score_away integer,
    score_margin integer,
    points_scored integer,
    assist_player_name text,
    assist_total integer,
    quarter_player_points integer,
    quarter_team_points integer,
    description text,
    event jsonb NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (game_id, event_index)
);

CREATE INDEX IF NOT EXISTS idx_pbp_events_season_period
    ON raw.play_by_play_events (season, period);

CREATE INDEX IF NOT EXISTS idx_pbp_events_game_period
    ON raw.play_by_play_events (game_id, period, event_index);

CREATE INDEX IF NOT EXISTS idx_pbp_events_player
    ON raw.play_by_play_events (player_id, season);

CREATE INDEX IF NOT EXISTS idx_pbp_events_team
    ON raw.play_by_play_events (team, season);

CREATE INDEX IF NOT EXISTS idx_pbp_events_action
    ON raw.play_by_play_events (action_type, season);

CREATE TABLE IF NOT EXISTS raw.quarter_scores (
    game_id text NOT NULL,
    season text NOT NULL,
    quarter text NOT NULL,
    quarter_number integer,
    home_team text,
    away_team text,
    home_points integer,
    away_points integer,
    home_total integer,
    away_total integer,
    source_path text NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (game_id, quarter)
);

CREATE INDEX IF NOT EXISTS idx_quarter_scores_season
    ON raw.quarter_scores (season, quarter_number);
