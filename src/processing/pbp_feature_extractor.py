from typing import Dict, Any, Optional
import pandas as pd
import numpy as np


def extract_game_pbp_features(df_events: pd.DataFrame) -> Dict[str, Any]:
    """Computes cleansed game-level features from PBP event log dataframe.
    
    Features returned:
    - CLEANSED_HOME_PTS: Points scored by home team in non-garbage time
    - CLEANSED_AWAY_PTS: Points scored by away team in non-garbage time
    - GARBAGE_TIME_SHARE: Ratio of garbage time events to total events
    - CLUTCH_HOME_PTS: Points scored by home team in clutch time
    - CLUTCH_AWAY_PTS: Points scored by away team in clutch time
    - CLUTCH_MARGIN: Score margin in clutch situations
    """
    if df_events.empty:
        return {}
        
    game_id = df_events["GAME_ID"].iloc[0]
    home_team = df_events["HOME_TEAM"].iloc[0]
    away_team = df_events["AWAY_TEAM"].iloc[0]
    
    total_events = len(df_events)
    garbage_events = len(df_events[df_events["IS_GARBAGE_TIME"]])
    garbage_share = garbage_events / float(total_events) if total_events > 0 else 0.0
    
    # Non-garbage time events
    df_clean = df_events[~df_events["IS_GARBAGE_TIME"]]
    
    if not df_clean.empty:
        cleansed_home_pts = df_clean["home_score"].max() - df_clean["home_score"].min()
        cleansed_away_pts = df_clean["away_score"].max() - df_clean["away_score"].min()
    else:
        cleansed_home_pts = 0
        cleansed_away_pts = 0
        
    # Clutch time events
    df_clutch = df_events[df_events["IS_CLUTCH"]]
    if not df_clutch.empty:
        clutch_home_pts = df_clutch["home_score"].max() - df_clutch["home_score"].min()
        clutch_away_pts = df_clutch["away_score"].max() - df_clutch["away_score"].min()
        clutch_margin = clutch_home_pts - clutch_away_pts
    else:
        clutch_home_pts = 0
        clutch_away_pts = 0
        clutch_margin = 0
        
    return {
        "GAME_ID": game_id,
        "HOME_TEAM": home_team,
        "AWAY_TEAM": away_team,
        "GARBAGE_TIME_SHARE": round(garbage_share, 4),
        "CLEANSED_HOME_PTS": int(cleansed_home_pts),
        "CLEANSED_AWAY_PTS": int(cleansed_away_pts),
        "CLUTCH_HOME_PTS": int(clutch_home_pts),
        "CLUTCH_AWAY_PTS": int(clutch_away_pts),
        "CLUTCH_MARGIN": int(clutch_margin),
    }
