from typing import Dict, List, Any, Optional
import os
import json
import glob
import pandas as pd
import numpy as np


def parse_clock_to_seconds(clock_str: Any) -> float:
    """Converts clock string like '05:30' or 'PT05M30.00S' to total remaining seconds in period."""
    if pd.isna(clock_str) or not clock_str:
        return 0.0
    if isinstance(clock_str, (int, float)):
        return float(clock_str)
    
    s = str(clock_str).strip()
    s = s.replace("PT", "").replace("S", "")
    parts = s.split("M")
    if len(parts) == 2:
        try:
            minutes = float(parts[0])
            seconds = float(parts[1])
            return minutes * 60.0 + seconds
        except (ValueError, TypeError):
            pass
            
    if ":" in s:
        try:
            parts = s.split(":")
            return float(parts[0]) * 60.0 + float(parts[1])
        except (ValueError, TypeError):
            pass
            
    try:
        return float(s)
    except (ValueError, TypeError):
        return 0.0


def load_raw_pbp_json(filepath: str) -> Optional[Dict[str, Any]]:
    """Loads a single play-by-play JSON file."""
    if not os.path.exists(filepath):
        return None
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def clean_pbp_events(game_data: Dict[str, Any]) -> pd.DataFrame:
    """Extracts and enriches event logs from raw PBP JSON with Garbage Time and Clutch tags.
    
    Garbage Time Rule:
    - Period == 4 AND Clock <= 300s (5 mins) AND |Score Margin| >= 15
    - Period > 4 (Overtime) AND |Score Margin| >= 20
    
    Clutch Rule:
    - Period >= 4 AND Clock <= 300s (5 mins) AND |Score Margin| <= 5
    """
    events = game_data.get("events", [])
    if not events:
        return pd.DataFrame()
        
    df_events = pd.DataFrame(events)
    if df_events.empty:
        return pd.DataFrame()
        
    game_id = str(game_data.get("game_id", ""))
    home_team = str(game_data.get("home_team", ""))
    away_team = str(game_data.get("away_team", ""))
    
    df_events["GAME_ID"] = game_id
    df_events["HOME_TEAM"] = home_team
    df_events["AWAY_TEAM"] = away_team
    
    # Parse clock
    if "clock" in df_events.columns:
        df_events["CLOCK_SECONDS"] = df_events["clock"].apply(parse_clock_to_seconds)
    else:
        df_events["CLOCK_SECONDS"] = 0.0
        
    # Ensure period
    if "period" not in df_events.columns:
        df_events["period"] = 1
    df_events["period"] = pd.to_numeric(df_events["period"], errors="coerce").fillna(1).astype(int)
    
    # Ensure scores & margin
    if "home_score" in df_events.columns:
        df_events["home_score"] = pd.to_numeric(df_events["home_score"], errors="coerce").ffill().fillna(0).astype(int)
    else:
        df_events["home_score"] = 0
        
    if "away_score" in df_events.columns:
        df_events["away_score"] = pd.to_numeric(df_events["away_score"], errors="coerce").ffill().fillna(0).astype(int)
    else:
        df_events["away_score"] = 0
        
    df_events["SCORE_MARGIN"] = df_events["home_score"] - df_events["away_score"]
    df_events["ABS_MARGIN"] = df_events["SCORE_MARGIN"].abs()
    
    # Garbage Time tagging
    is_q4_garbage = (df_events["period"] == 4) & (df_events["CLOCK_SECONDS"] <= 300.0) & (df_events["ABS_MARGIN"] >= 15)
    is_ot_garbage = (df_events["period"] > 4) & (df_events["ABS_MARGIN"] >= 20)
    df_events["IS_GARBAGE_TIME"] = is_q4_garbage | is_ot_garbage
    
    # Clutch tagging
    is_clutch = (df_events["period"] >= 4) & (df_events["CLOCK_SECONDS"] <= 300.0) & (df_events["ABS_MARGIN"] <= 5)
    df_events["IS_CLUTCH"] = is_clutch
    
    return df_events
