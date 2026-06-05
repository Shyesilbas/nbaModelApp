import pandas as pd
import numpy as np

def build_team_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Engineers features for NBA team games.
    
    Expected input columns:
        SEASON_TYPE, MATCHUP, WL, GAME_DATE, TEAM_ID (or TEAM_ABBREVIATION), PTS
        
    Engineered features:
        - IS_HOME: true if "vs." in MATCHUP, false if "@"
        - OPPONENT_ABBREVIATION: opponent team code from MATCHUP
        - IS_PLAYOFF: true if SEASON_TYPE is 'Playoffs'
        - WIN: 1 if WL == 'W', else 0
        - DAYS_REST: days since previous game for the same team
        - IS_B2B: true if DAYS_REST == 1
        - PTS_LAST_5: 5-game rolling average of points (shifted by 1)
        - PTS_LAST_10: 10-game rolling average of points (shifted by 1)
        - WINRATE_LAST_5: 5-game rolling win rate (shifted by 1)
        - WINRATE_LAST_10: 10-game rolling win rate (shifted by 1)
        
    Args:
        df (pd.DataFrame): Sorted team game logs.
        
    Returns:
        pd.DataFrame: DataFrame with engineered features.
    """
    df = df.copy()
    
    # 1. Sort to ensure chronological order for time-based features
    team_col = "TEAM_ID" if "TEAM_ID" in df.columns else "TEAM_ABBREVIATION"
    if team_col in df.columns and "GAME_DATE" in df.columns:
        df = df.sort_values(by=[team_col, "GAME_DATE"]).reset_index(drop=True)
    
    # Ensure date is parsed
    if "GAME_DATE" in df.columns and not pd.api.types.is_datetime64_any_dtype(df["GAME_DATE"]):
        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")
        
    # Ensure PTS is float
    if "PTS" in df.columns:
        df["PTS"] = pd.to_numeric(df["PTS"], errors="coerce")
        
    # 2. IS_HOME: true if "vs.", false if "@"
    if "MATCHUP" in df.columns:
        df["IS_HOME"] = df["MATCHUP"].str.contains("vs.", case=False, na=False)
        # 3. OPPONENT_ABBREVIATION
        # MATCHUP typically formatted as "TEAM vs. OPP" or "TEAM @ OPP"
        # Opponent is always the last token
        df["OPPONENT_ABBREVIATION"] = df["MATCHUP"].str.split().str[-1]
    else:
        df["IS_HOME"] = np.nan
        df["OPPONENT_ABBREVIATION"] = np.nan

    # 4. IS_PLAYOFF: derived from SEASON_TYPE
    if "SEASON_TYPE" in df.columns:
        df["IS_PLAYOFF"] = df["SEASON_TYPE"].str.contains("Playoff", case=False, na=False)
    else:
        df["IS_PLAYOFF"] = False

    # 5. WIN: 1 if WL == "W", else 0
    if "WL" in df.columns:
        df["WIN"] = (df["WL"] == "W").astype(int)
    else:
        df["WIN"] = 0

    # 6. DAYS_REST
    if team_col in df.columns and "GAME_DATE" in df.columns:
        df["DAYS_REST"] = df.groupby(team_col)["GAME_DATE"].diff().dt.days
        # 7. IS_B2B
        df["IS_B2B"] = df["DAYS_REST"] == 1
    else:
        df["DAYS_REST"] = np.nan
        df["IS_B2B"] = False

    # 8. PTS_LAST_5 & PTS_LAST_10 (shifted by 1 to prevent data leakage)
    if team_col in df.columns and "PTS" in df.columns:
        df["PTS_LAST_5"] = df.groupby(team_col)["PTS"].transform(
            lambda x: x.shift(1).rolling(window=5, min_periods=1).mean()
        )
        df["PTS_LAST_10"] = df.groupby(team_col)["PTS"].transform(
            lambda x: x.shift(1).rolling(window=10, min_periods=1).mean()
        )
    else:
        df["PTS_LAST_5"] = np.nan
        df["PTS_LAST_10"] = np.nan

    # 9. WINRATE_LAST_5 & WINRATE_LAST_10 (shifted by 1 to prevent data leakage)
    if team_col in df.columns and "WIN" in df.columns:
        df["WINRATE_LAST_5"] = df.groupby(team_col)["WIN"].transform(
            lambda x: x.shift(1).rolling(window=5, min_periods=1).mean()
        )
        df["WINRATE_LAST_10"] = df.groupby(team_col)["WIN"].transform(
            lambda x: x.shift(1).rolling(window=10, min_periods=1).mean()
        )
    else:
        df["WINRATE_LAST_5"] = np.nan
        df["WINRATE_LAST_10"] = np.nan

    return df
