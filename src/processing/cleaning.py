import numpy as np
import pandas as pd

def clean_dates(df: pd.DataFrame, date_col: str = "GAME_DATE") -> pd.DataFrame:
    """
    Parses the date column into pandas datetime objects.
    
    Args:
        df (pd.DataFrame): Input DataFrame.
        date_col (str): Name of the date column to parse. Defaults to 'GAME_DATE'.
        
    Returns:
        pd.DataFrame: DataFrame with the date column cast to datetime.
    """
    df = df.copy()
    if date_col in df.columns:
        df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
    return df

def sort_team_games(df: pd.DataFrame) -> pd.DataFrame:
    """
    Sorts team game logs by team identifier and game date ascending.
    
    Args:
        df (pd.DataFrame): Team game logs.
        
    Returns:
        pd.DataFrame: Sorted copy of the DataFrame.
    """
    df = df.copy()
    # Sort by TEAM_ID first, then GAME_DATE. Fall back to TEAM_ABBREVIATION if needed.
    sort_cols = []
    if "TEAM_ID" in df.columns:
        sort_cols.append("TEAM_ID")
    elif "TEAM_ABBREVIATION" in df.columns:
        sort_cols.append("TEAM_ABBREVIATION")
        
    if "GAME_DATE" in df.columns:
        sort_cols.append("GAME_DATE")
        
    if sort_cols:
        df = df.sort_values(by=sort_cols).reset_index(drop=True)
    return df

def sort_player_games(df: pd.DataFrame) -> pd.DataFrame:
    """
    Sorts player game logs by player identifier and game date ascending.
    
    Args:
        df (pd.DataFrame): Player game logs.
        
    Returns:
        pd.DataFrame: Sorted copy of the DataFrame.
    """
    df = df.copy()
    sort_cols = []
    if "Player_ID" in df.columns:
        sort_cols.append("Player_ID")
    elif "PLAYER_NAME" in df.columns:
        sort_cols.append("PLAYER_NAME")
        
    if "GAME_DATE" in df.columns:
        sort_cols.append("GAME_DATE")
        
    if sort_cols:
        df = df.sort_values(by=sort_cols).reset_index(drop=True)
    return df

def clean_minutes_column(df: pd.DataFrame, min_col: str = "MIN") -> pd.DataFrame:
    """
    Converts a minutes column (which may be a string 'MM:SS' or a float)
    into a float representing total minutes played.
    
    Args:
        df (pd.DataFrame): Input DataFrame.
        min_col (str): Column name containing the minutes played. Defaults to 'MIN'.
        
    Returns:
        pd.DataFrame: DataFrame with minutes cleaned to float.
    """
    df = df.copy()
    if min_col not in df.columns:
        return df

    def _parse_single_val(val):
        if pd.isna(val):
            return np.nan
        if isinstance(val, (int, float)):
            return float(val)
        val_str = str(val).strip()
        if ":" in val_str:
            try:
                parts = val_str.split(":")
                if len(parts) == 2:
                    return float(parts[0]) + float(parts[1]) / 60.0
                elif len(parts) == 1:
                    return float(parts[0])
            except ValueError:
                pass
        try:
            return float(val_str)
        except ValueError:
            return np.nan

    df[min_col] = df[min_col].apply(_parse_single_val)
    return df
