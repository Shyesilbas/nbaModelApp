import pandas as pd
from typing import List

REQUIRED_TEAM_COLUMNS = [
    "SEASON_ID", "TEAM_ID", "TEAM_ABBREVIATION", "TEAM_NAME", "GAME_ID", 
    "GAME_DATE", "MATCHUP", "WL", "MIN", "PTS", "FGM", "FGA", "FG_PCT", 
    "FG3M", "FG3A", "FG3_PCT", "FTM", "FTA", "FT_PCT", "OREB", "DREB", 
    "REB", "AST", "STL", "BLK", "TOV", "PF", "PLUS_MINUS", "SEASON_TYPE"
]

REQUIRED_PLAYER_COLUMNS = [
    "SEASON_ID", "Player_ID", "Game_ID", "GAME_DATE", "MATCHUP", "WL", 
    "MIN", "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT", "FTM", 
    "FTA", "FT_PCT", "OREB", "DREB", "REB", "AST", "STL", "BLK", "TOV", 
    "PF", "PTS", "PLUS_MINUS", "VIDEO_AVAILABLE", "PLAYER_NAME", "SEASON_TYPE"
]

def _run_validation_checks(df: pd.DataFrame, required_cols: List[str], dataset_name: str) -> bool:
    """
    Runs basic validation checks on a dataframe:
      - Check shape
      - Check for missing required columns
      - Check null count summary
      - Check SEASON_TYPE distribution
      - Check for duplicate rows
      
    Args:
        df (pd.DataFrame): The DataFrame to validate.
        required_cols (List[str]): List of column names that must exist.
        dataset_name (str): Label used in output print statements.
        
    Returns:
        bool: True if the dataset has all required columns, False otherwise.
    """
    print("=" * 60)
    print(f"VALIDATING DATASET: {dataset_name}")
    print("=" * 60)
    
    # 1. Check shape
    rows, cols = df.shape
    print(f"Dataset Shape: {rows} rows, {cols} columns")
    
    # 2. Check required columns
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        print(f"❌ WARNING: The following {len(missing_cols)} required columns are MISSING:")
        for col in missing_cols:
            print(f"   - {col}")
        valid = False
    else:
        print("✅ Success: All required columns are present.")
        valid = True
        
    # 3. Check null counts
    null_counts = df.isnull().sum()
    cols_with_nulls = null_counts[null_counts > 0]
    if not cols_with_nulls.empty:
        print(f"⚠️ Null values found in {len(cols_with_nulls)} columns:")
        for col, count in cols_with_nulls.items():
            pct = (count / rows) * 100
            print(f"   - {col}: {count} nulls ({pct:.2f}%)")
    else:
        print("✅ Success: No null values found in any columns.")
        
    # 4. Check SEASON_TYPE distribution
    if "SEASON_TYPE" in df.columns:
        print("Season Type Distribution:")
        dist = df["SEASON_TYPE"].value_counts(dropna=False)
        for val, count in dist.items():
            print(f"   - {val}: {count}")
    else:
        print("⚠️ Warning: 'SEASON_TYPE' column not found, cannot show distribution.")
        
    # 5. Check duplicate rows
    duplicate_count = df.duplicated().sum()
    if duplicate_count > 0:
        print(f"⚠️ Warning: Found {duplicate_count} duplicate rows in this dataset.")
    else:
        print("✅ Success: No duplicate rows detected.")
        
    print("=" * 60 + "\n")
    return valid

def validate_team_games(df: pd.DataFrame) -> bool:
    """
    Validates the team game logs dataset.
    
    Args:
        df (pd.DataFrame): Team game logs DataFrame.
        
    Returns:
        bool: True if validation passes (no missing required columns), else False.
    """
    return _run_validation_checks(df, REQUIRED_TEAM_COLUMNS, "Team Game Logs")

def validate_player_games(df: pd.DataFrame) -> bool:
    """
    Validates the player game logs dataset.
    
    Args:
        df (pd.DataFrame): Player game logs DataFrame.
        
    Returns:
        bool: True if validation passes (no missing required columns), else False.
    """
    return _run_validation_checks(df, REQUIRED_PLAYER_COLUMNS, "Player Game Logs")
