import os
import glob
import pandas as pd
from typing import Optional

def _find_and_load_csv(directory: str, default_filename: str) -> pd.DataFrame:
    """
    Helper function to locate and load a CSV file from a specified directory.
    Checks for the specific default filename first, and falls back to loading
    any CSV in the directory if the default is not found.
    
    Args:
        directory (str): The path to the directory containing raw files.
        default_filename (str): The expected filename to check first.
        
    Returns:
        pd.DataFrame: Loaded pandas DataFrame.
        
    Raises:
        FileNotFoundError: If no CSV files can be found in the directory.
    """
    if not os.path.exists(directory):
        raise FileNotFoundError(
            f"The directory '{directory}' does not exist. Please create it and place your data there."
        )
        
    # Option 1: Try to load the specific default file
    specific_path = os.path.join(directory, default_filename)
    if os.path.isfile(specific_path):
        print(f"Loading expected dataset: {specific_path}")
        return pd.read_csv(specific_path)
        
    # Option 2: Fallback to finding any CSV file in the directory
    csv_files = glob.glob(os.path.join(directory, "*.csv"))
    if csv_files:
        # Sort to make it deterministic (e.g. latest or first alphabetically)
        csv_files.sort()
        selected_file = csv_files[0]
        print(f"Expected file '{default_filename}' not found in '{directory}'.")
        print(f"Falling back to loading: {selected_file}")
        return pd.read_csv(selected_file)
        
    raise FileNotFoundError(
        f"No CSV files found in '{directory}'. Please place your raw NBA data file here.\n"
        f"Expected file: {default_filename}"
    )

def load_team_games(data_dir: str = "data/raw/team_games", season: Optional[str] = None) -> pd.DataFrame:
    """
    Loads raw NBA team games data from the specified directory.
    
    Args:
        data_dir (str): Path to directory holding team games csv. Defaults to 'data/raw/team_games'.
        season (str): Optional season string.
        
    Returns:
        pd.DataFrame: The loaded team game logs DataFrame, or empty if file does not exist.
    """
    from scripts.data_paths import get_data_paths
    paths = get_data_paths(season)
    default_name = os.path.basename(paths.team_games_raw)
    specific_path = os.path.join(data_dir, default_name)
    if not os.path.exists(specific_path):
        print(f"Raw team games file for season {season} not found: {specific_path}. Returning empty DataFrame.")
        return pd.DataFrame()
    return pd.read_csv(specific_path)

def load_player_games(data_dir: str = "data/raw/player_games", season: Optional[str] = None) -> pd.DataFrame:
    """
    Loads raw NBA player games data from the specified directory.
    
    Args:
        data_dir (str): Path to directory holding player games csv. Defaults to 'data/raw/player_games'.
        season (str): Optional season string.
        
    Returns:
        pd.DataFrame: The loaded player game logs DataFrame, or empty if file does not exist.
    """
    from scripts.data_paths import get_data_paths
    paths = get_data_paths(season)
    default_name = os.path.basename(paths.player_games_raw)
    specific_path = os.path.join(data_dir, default_name)
    if not os.path.exists(specific_path):
        print(f"Raw player games file for season {season} not found: {specific_path}. Returning empty DataFrame.")
        return pd.DataFrame()
    return pd.read_csv(specific_path)
