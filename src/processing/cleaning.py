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

def normalize_game_matchups(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normalizes matchups and home/away flags for games where both team rows
    have identical matchups (e.g., DAL @ DET on both rows).
    
    Creates RAW_MATCHUP, NORMALIZED_MATCHUP, and updates IS_HOME.
    """
    df = df.copy()
    if "MATCHUP" not in df.columns:
        return df
        
    df["RAW_MATCHUP"] = df["MATCHUP"]
    df["NORMALIZED_MATCHUP"] = df["MATCHUP"]
    
    if "IS_HOME" not in df.columns:
        df["IS_HOME"] = df["MATCHUP"].astype(str).str.contains("vs.", regex=False)

    def correct_group(grp):
        if len(grp) != 2 or "TEAM_ABBREVIATION" not in grp.columns:
            return grp

        if "IS_HOME" not in grp.columns:
            grp = grp.copy()
            grp["IS_HOME"] = grp["MATCHUP"].astype(str).str.contains("vs.", regex=False)
        if "NORMALIZED_MATCHUP" not in grp.columns:
            grp = grp.copy()
            grp["NORMALIZED_MATCHUP"] = grp["MATCHUP"]

        row1 = grp.iloc[0]
        row2 = grp.iloc[1]
        idx0, idx1 = grp.index[0], grp.index[1]

        m1 = str(row1["MATCHUP"]).strip()
        m2 = str(row2["MATCHUP"]).strip()

        is_m1_home = "vs." in m1
        is_m2_home = "vs." in m2

        if is_m1_home != is_m2_home:
            return grp

        t1 = row1["TEAM_ABBREVIATION"]
        t2 = row2["TEAM_ABBREVIATION"]

        parts = m1.split()
        if len(parts) == 3:
            team_a, sep, team_b = parts
            if {team_a, team_b} == {t1, t2}:
                is_a_home = (sep == "vs.")

                if row1["TEAM_ABBREVIATION"] == team_a:
                    grp.loc[idx0, "IS_HOME"] = is_a_home
                    grp.loc[idx0, "NORMALIZED_MATCHUP"] = m1
                else:
                    grp.loc[idx0, "IS_HOME"] = not is_a_home
                    opposite_sep = "@" if is_a_home else "vs."
                    grp.loc[idx0, "NORMALIZED_MATCHUP"] = f"{t1} {opposite_sep} {t2}"

                if row2["TEAM_ABBREVIATION"] == team_a:
                    grp.loc[idx1, "IS_HOME"] = is_a_home
                    grp.loc[idx1, "NORMALIZED_MATCHUP"] = m1
                else:
                    grp.loc[idx1, "IS_HOME"] = not is_a_home
                    opposite_sep = "@" if is_a_home else "vs."
                    grp.loc[idx1, "NORMALIZED_MATCHUP"] = f"{t2} {opposite_sep} {t1}"
        return grp

    df = pd.concat(
        [correct_group(grp.copy()) for _, grp in df.groupby("GAME_ID", sort=False)],
        ignore_index=True,
    )
    df["MATCHUP"] = df["NORMALIZED_MATCHUP"]
    return df
