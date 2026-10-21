import os
import pandas as pd
from typing import Optional


def _load_season_csv(path: str, label: str, season: Optional[str]) -> pd.DataFrame:
    if not os.path.exists(path):
        print(f"Raw {label} file for season {season} not found: {path}. Returning empty DataFrame.")
        return pd.DataFrame()
    return pd.read_csv(path)


def load_team_games(season: Optional[str] = None) -> pd.DataFrame:
    """
    Loads the season's raw NBA team game logs (``data/season=YYYY-YY/raw/team_games.csv``).

    Args:
        season (str): Optional season string; defaults to the current season.

    Returns:
        pd.DataFrame: The loaded team game logs DataFrame, or empty if file does not exist.
    """
    from src.core.data_paths import get_data_paths
    return _load_season_csv(get_data_paths(season).team_games_raw, "team games", season)


def load_player_games(season: Optional[str] = None) -> pd.DataFrame:
    """
    Loads the season's raw NBA player game logs (``data/season=YYYY-YY/raw/player_games.csv``).

    Args:
        season (str): Optional season string; defaults to the current season.

    Returns:
        pd.DataFrame: The loaded player game logs DataFrame, or empty if file does not exist.
    """
    from src.core.data_paths import get_data_paths
    return _load_season_csv(get_data_paths(season).player_games_raw, "player games", season)
