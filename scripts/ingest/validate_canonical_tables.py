import pandas as pd
from typing import Dict, List, Set, Tuple

def validate_columns(df: pd.DataFrame, expected_cols: Set[str], table_name: str) -> None:
    """Helper to validate presence of expected columns."""
    missing = expected_cols - set(df.columns)
    if missing:
        raise ValueError(f"Table '{table_name}' is missing required columns: {missing}")

def validate_uniqueness(df: pd.DataFrame, keys: List[str], table_name: str) -> None:
    """Helper to validate primary key uniqueness."""
    duplicates = df.duplicated(subset=keys).sum()
    if duplicates > 0:
        raise ValueError(f"Table '{table_name}' has {duplicates} duplicate rows for keys {keys}")

def validate_no_nulls(df: pd.DataFrame, columns: List[str], table_name: str) -> None:
    """Helper to validate no null values in crucial identifier fields."""
    for col in columns:
        if col in df.columns and df[col].isnull().any():
            raise ValueError(f"Table '{table_name}' contains null values in required column '{col}'")

def validate_games(df: pd.DataFrame) -> bool:
    """Validate canonical games table structure and constraints."""
    expected = {"game_id", "season", "season_type", "game_date", "home_team_id", "away_team_id", "home_score", "away_score", "is_playoff", "extra"}
    validate_columns(df, expected, "games")
    validate_uniqueness(df, ["game_id"], "games")
    validate_no_nulls(df, ["game_id", "season", "season_type", "game_date", "home_team_id", "away_team_id"], "games")
    return True

def validate_teams(df: pd.DataFrame) -> bool:
    """Validate canonical teams table structure and constraints."""
    expected = {"team_id", "abbreviation", "name", "city"}
    validate_columns(df, expected, "teams")
    validate_uniqueness(df, ["team_id"], "teams")
    validate_no_nulls(df, ["team_id", "abbreviation", "name"], "teams")
    return True

def validate_players(df: pd.DataFrame) -> bool:
    """Validate canonical players table structure and constraints."""
    expected = {"player_id", "display_name", "draft_year", "attributes"}
    validate_columns(df, expected, "players")
    validate_uniqueness(df, ["player_id"], "players")
    validate_no_nulls(df, ["player_id", "display_name"], "players")
    return True

def validate_team_game_logs(df: pd.DataFrame) -> bool:
    """Validate canonical team game logs structure and constraints."""
    expected = {"log_id", "game_id", "team_id", "game_date", "win", "points", "opponent_id", "is_home", "rest_days"}
    validate_columns(df, expected, "team_game_logs")
    validate_uniqueness(df, ["log_id"], "team_game_logs")
    validate_uniqueness(df, ["game_id", "team_id"], "team_game_logs")
    validate_no_nulls(df, ["log_id", "game_id", "team_id", "game_date", "win", "points", "opponent_id"], "team_game_logs")
    return True

def validate_player_game_logs(df: pd.DataFrame) -> bool:
    """Validate canonical player game logs structure and constraints."""
    expected = {"log_id", "game_id", "player_id", "team_id", "minutes", "pts", "ast", "reb"}
    validate_columns(df, expected, "player_game_logs")
    validate_uniqueness(df, ["log_id"], "player_game_logs")
    validate_uniqueness(df, ["game_id", "player_id"], "player_game_logs")
    validate_no_nulls(df, ["log_id", "game_id", "player_id", "team_id"], "player_game_logs")
    return True

def validate_team_box_scores(df: pd.DataFrame) -> bool:
    """Validate canonical team box scores structure and constraints."""
    expected = {"box_score_id", "game_id", "team_id", "points", "rebounds", "assists", "steals", "blocks"}
    validate_columns(df, expected, "team_box_scores")
    validate_uniqueness(df, ["box_score_id"], "team_box_scores")
    validate_uniqueness(df, ["game_id", "team_id"], "team_box_scores")
    validate_no_nulls(df, ["box_score_id", "game_id", "team_id"], "team_box_scores")
    return True

def validate_player_box_scores(df: pd.DataFrame) -> bool:
    """Validate canonical player box scores structure and constraints."""
    expected = {"box_score_id", "game_id", "player_id", "team_id", "minutes", "points", "rebounds", "assists", "steals", "blocks", "plus_minus", "roster_role", "source_meta"}
    validate_columns(df, expected, "player_box_scores")
    validate_uniqueness(df, ["box_score_id"], "player_box_scores")
    validate_uniqueness(df, ["game_id", "player_id"], "player_box_scores")
    validate_no_nulls(df, ["box_score_id", "game_id", "player_id", "team_id"], "player_box_scores")
    return True

def validate_transactions(df: pd.DataFrame) -> bool:
    """Validate canonical transactions table structure and constraints."""
    expected = {"tx_id", "player_id", "from_team_id", "to_team_id", "effective_date", "type", "metadata"}
    validate_columns(df, expected, "transactions")
    validate_uniqueness(df, ["tx_id"], "transactions")
    validate_no_nulls(df, ["tx_id", "player_id", "effective_date", "type"], "transactions")
    return True

def validate_injuries(df: pd.DataFrame) -> bool:
    """Validate canonical injuries table structure and constraints."""
    expected = {"injury_id", "player_id", "injury_date", "return_date", "status", "details"}
    validate_columns(df, expected, "injuries")
    validate_uniqueness(df, ["injury_id"], "injuries")
    validate_no_nulls(df, ["injury_id", "player_id", "injury_date", "status"], "injuries")
    return True

def validate_roster_snapshots(df: pd.DataFrame) -> bool:
    """Validate roster snapshots schema structure and constraints."""
    expected = {"snapshot_date", "team_id", "player_id", "role", "expected_minutes"}
    validate_columns(df, expected, "roster_snapshots")
    validate_uniqueness(df, ["snapshot_date", "team_id", "player_id"], "roster_snapshots")
    validate_no_nulls(df, ["snapshot_date", "team_id", "player_id"], "roster_snapshots")
    return True
