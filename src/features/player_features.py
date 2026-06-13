import pandas as pd
import numpy as np
from src.processing.cleaning import clean_minutes_column

def build_player_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Engineers features for NBA player games.
    
    Expected input columns:
        SEASON_TYPE, MATCHUP, WL, GAME_DATE, Player_ID (or PLAYER_NAME), 
        PTS, MIN, REB, AST, PLUS_MINUS
        
    Engineered features:
        - IS_HOME: true if "vs." in MATCHUP, false if "@"
        - OPPONENT_ABBREVIATION: opponent team code from MATCHUP
        - IS_PLAYOFF: true if SEASON_TYPE is 'Playoffs'
        - WIN: 1 if WL == 'W', else 0
        - DAYS_REST: days since previous game for the same player
        - IS_B2B: true if DAYS_REST == 1
        - PTS_LAST_5: 5-game rolling average of points (shifted by 1)
        - PTS_LAST_10: 10-game rolling average of points (shifted by 1)
        - MIN_LAST_5: 5-game rolling average of minutes played (shifted by 1)
        - REB_LAST_5: 5-game rolling average of rebounds (shifted by 1)
        - AST_LAST_5: 5-game rolling average of assists (shifted by 1)
        - PLUS_MINUS_LAST_5: 5-game rolling average of plus-minus (shifted by 1)
        
    Args:
        df (pd.DataFrame): Sorted player game logs.
        
    Returns:
        pd.DataFrame: DataFrame with engineered features.
    """
    df = df.copy()
    
    # Ensure minutes column is properly parsed as a float
    df = clean_minutes_column(df, "MIN")
    
    # 1. Sort to ensure chronological order for time-series operations
    player_col = "Player_ID" if "Player_ID" in df.columns else "PLAYER_NAME"
    if player_col in df.columns and "GAME_DATE" in df.columns:
        df = df.sort_values(by=[player_col, "GAME_DATE"]).reset_index(drop=True)
        
    # Ensure date column is datetime
    if "GAME_DATE" in df.columns and not pd.api.types.is_datetime64_any_dtype(df["GAME_DATE"]):
        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")
        
    # Convert numerical columns to numeric types to avoid errors
    num_cols = ["PTS", "REB", "AST", "PLUS_MINUS", "MIN"]
    for col in num_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
            
    # 2. IS_HOME: true if "vs.", false if "@"
    if "MATCHUP" in df.columns:
        df["IS_HOME"] = df["MATCHUP"].str.contains("vs.", case=False, na=False)
        # 3. OPPONENT_ABBREVIATION
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

    # 6. DAYS_REST (per player)
    if player_col in df.columns and "GAME_DATE" in df.columns:
        df["DAYS_REST"] = df.groupby(player_col)["GAME_DATE"].diff().dt.days
        # 7. IS_B2B
        df["IS_B2B"] = df["DAYS_REST"] == 1
    else:
        df["DAYS_REST"] = np.nan
        df["IS_B2B"] = False

    # 8. Rolling features (shifted by 1 to prevent data leakage)
    if player_col in df.columns:
        # PTS_LAST_5 & PTS_LAST_10
        if "PTS" in df.columns:
            df["PTS_LAST_5"] = df.groupby(player_col)["PTS"].transform(
                lambda x: x.shift(1).rolling(window=5, min_periods=1).mean()
            )
            df["PTS_LAST_10"] = df.groupby(player_col)["PTS"].transform(
                lambda x: x.shift(1).rolling(window=10, min_periods=1).mean()
            )
        else:
            df["PTS_LAST_5"] = np.nan
            df["PTS_LAST_10"] = np.nan
            
        # MIN_LAST_5
        if "MIN" in df.columns:
            df["MIN_LAST_5"] = df.groupby(player_col)["MIN"].transform(
                lambda x: x.shift(1).rolling(window=5, min_periods=1).mean()
            )
        else:
            df["MIN_LAST_5"] = np.nan

        # REB_LAST_5
        if "REB" in df.columns:
            df["REB_LAST_5"] = df.groupby(player_col)["REB"].transform(
                lambda x: x.shift(1).rolling(window=5, min_periods=1).mean()
            )
        else:
            df["REB_LAST_5"] = np.nan

        # AST_LAST_5
        if "AST" in df.columns:
            df["AST_LAST_5"] = df.groupby(player_col)["AST"].transform(
                lambda x: x.shift(1).rolling(window=5, min_periods=1).mean()
            )
        else:
            df["AST_LAST_5"] = np.nan

        # PLUS_MINUS_LAST_5
        if "PLUS_MINUS" in df.columns:
            df["PLUS_MINUS_LAST_5"] = df.groupby(player_col)["PLUS_MINUS"].transform(
                lambda x: x.shift(1).rolling(window=5, min_periods=1).mean()
            )
        else:
            df["PLUS_MINUS_LAST_5"] = np.nan
            
    else:
        for col in ["PTS_LAST_5", "PTS_LAST_10", "MIN_LAST_5", "REB_LAST_5", "AST_LAST_5", "PLUS_MINUS_LAST_5"]:
            df[col] = np.nan

    # Map playoff urgency features
    playoff_map = load_playoff_context_map()
    game_id_col = "GAME_ID" if "GAME_ID" in df.columns else "Game_ID"
    if game_id_col in df.columns:
        df["IS_ELIMINATION_GAME"] = df[game_id_col].map(lambda x: playoff_map.get(str(x).split(".")[0].zfill(10), {}).get("IS_ELIMINATION_GAME", 0)).fillna(0).astype(int)
        df["CAN_CLINCH_SERIES"] = df[game_id_col].map(lambda x: playoff_map.get(str(x).split(".")[0].zfill(10), {}).get("CAN_CLINCH_SERIES", 0)).fillna(0).astype(int)
    else:
        df["IS_ELIMINATION_GAME"] = 0
        df["CAN_CLINCH_SERIES"] = 0

    return df

def load_playoff_context_map():
    import glob
    import pandas as pd
    from pathlib import Path
    root = Path(__file__).resolve().parents[2]
    
    mapping = {}
    files = sorted(glob.glob(str(root / "data/season=*/processed/game_results.csv")))
    
    for f in files:
        try:
            df = pd.read_csv(f, dtype={"GAME_ID": str})
            playoffs = df[df["IS_PLAYOFF"] == True].copy()
            if playoffs.empty:
                continue
                
            playoffs["GAME_DATE"] = pd.to_datetime(playoffs["GAME_DATE"])
            playoffs = playoffs.sort_values("GAME_DATE")
            
            series_wins = {}
            for _, row in playoffs.iterrows():
                home = row["HOME_TEAM_ABBREVIATION"]
                away = row["AWAY_TEAM_ABBREVIATION"]
                gid = row["GAME_ID"]
                stype = row["SEASON_TYPE"]
                
                skey = frozenset([home, away])
                if skey not in series_wins:
                    series_wins[skey] = {home: 0, away: 0}
                    
                wins = series_wins[skey]
                is_elim = 0
                can_clinch = 0
                
                if stype != "PlayIn":
                    if wins[home] == 3 or wins[away] == 3:
                        is_elim = 1
                        can_clinch = 1
                        
                gid_str = str(gid).split(".")[0].zfill(10)
                mapping[gid_str] = {
                    "IS_ELIMINATION_GAME": is_elim,
                    "CAN_CLINCH_SERIES": can_clinch
                }
                
                home_score = row["HOME_SCORE"]
                away_score = row["AWAY_SCORE"]
                if home_score > away_score:
                    wins[home] += 1
                else:
                    wins[away] += 1
        except Exception:
            pass
    return mapping
