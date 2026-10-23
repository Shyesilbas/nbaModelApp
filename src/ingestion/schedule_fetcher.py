"""
schedule_fetcher.py
-------------------
Fetch schedule and scoreboard data from the NBA API and update the local schedule datasets.
"""

import os
import logging
import pandas as pd
from typing import Tuple

from src.ingestion.nba_api_client import call_nba_api
from src.core.season_utils import get_default_season
from src.ingestion.atomic_io import write_csv_atomic

logger = logging.getLogger("ScheduleFetcher")

SCHEDULE_COLUMNS = [
    'GAME_ID', 'GAME_DATE', 'GAME_START_UTC', 'HOME_TEAM_ABBREVIATION', 'AWAY_TEAM_ABBREVIATION',
    'SEASON_TYPE', 'IS_PLAYOFF', 'GAME_STATUS', 'PLAYOFF_ROUND', 'SERIES_GAME_NUMBER', 
    'HOME_SERIES_WINS', 'AWAY_SERIES_WINS', 'IS_ELIMINATION_GAME', 'CAN_CLINCH_SERIES',
    'ARENA', 'LOCATION'
]

FINALS_COLUMNS = [
    'GAME_ID', 'GAME_DATE', 'GAME_START_UTC', 'HOME_TEAM_ABBREVIATION', 'AWAY_TEAM_ABBREVIATION',
    'SEASON_TYPE', 'IS_PLAYOFF', 'GAME_STATUS', 'ARENA', 'LOCATION'
]

def fetch_schedule_for_season(season: str = None) -> pd.DataFrame:
    """
    Fetches the schedule for a given season using ScheduleLeagueV2 and maps it
    to the project's unified schema.
    """
    from nba_api.stats.endpoints import scheduleleaguev2
    
    season = season or get_default_season()
    try:
        logger.info(f"Fetching full league schedule for season {season}...")
        sl = call_nba_api(scheduleleaguev2.ScheduleLeagueV2, season=season)
        df = sl.get_data_frames()[0]
    except Exception as e:
        logger.error(f"Error fetching ScheduleLeagueV2: {e}")
        return pd.DataFrame()
        
    if df.empty:
        return pd.DataFrame()
        
    # Keep preseason (001), regular season (002), playoffs (004), play-in (005); filter out all-star (003)
    df = df[df["gameId"].astype(str).str.startswith(("001", "002", "004", "005"))].copy()
    
    # Map columns to match schedule schema safely
    mapped_df = pd.DataFrame()
    mapped_df["GAME_ID"] = df["gameId"].astype(str).str.zfill(10)
    
    # Format date: YYYY-MM-DD
    mapped_df["GAME_DATE"] = pd.to_datetime(df["gameDateEst"]).dt.strftime("%Y-%m-%d")
    # Keep scheduled UTC tip-off so the frontend can enable post-game
    # ingestion after a fixed delay without relying on live game status.
    # gameDateUTC is only the calendar day (midnight ET); gameDateTimeUTC is the real tip-off.
    start_col = "gameDateTimeUTC" if "gameDateTimeUTC" in df.columns else "gameDateUTC"
    if start_col in df.columns:
        mapped_df["GAME_START_UTC"] = pd.to_datetime(df[start_col], utc=True, errors="coerce").dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    else:
        mapped_df["GAME_START_UTC"] = None
    
    mapped_df["HOME_TEAM_ABBREVIATION"] = df["homeTeam_teamTricode"]
    mapped_df["AWAY_TEAM_ABBREVIATION"] = df["awayTeam_teamTricode"]
    mapped_df["HOME_TEAM_NAME"] = df["homeTeam_teamName"]
    mapped_df["AWAY_TEAM_NAME"] = df["awayTeam_teamName"]
    
    # Determine SEASON_TYPE
    def determine_season_type(row):
        label = str(row.get("gameLabel", "")).strip()
        gid = str(row.get("gameId", ""))
        if gid.startswith("001") or "preseason" in label.lower() or "pre season" in label.lower():
            return "Pre Season"
        elif gid.startswith("005") or "play-in" in label.lower() or "playin" in label.lower():
            return "PlayIn"
        elif label == "NBA Finals" or gid.startswith("00425004") or "00425004" in gid or gid.startswith("00426004") or "00426004" in gid:
            return "NBA Finals"
        elif gid.startswith("004") or any(r in label for r in ["Round", "Semifinals", "Finals", "Playoffs"]):
            return "Playoffs"
        else:
            return "Regular Season"
            
    mapped_df["SEASON_TYPE"] = df.apply(determine_season_type, axis=1)
    mapped_df["IS_PLAYOFF"] = mapped_df["SEASON_TYPE"].isin(["PlayIn", "Playoffs", "NBA Finals"])
    
    # Handle status
    def map_game_status(status_text):
        st = str(status_text).lower()
        if "final" in st:
            return "Final"
        return "Scheduled"
    mapped_df["GAME_STATUS"] = df["gameStatusText"].apply(map_game_status)
    
    # Additional fields
    mapped_df["PLAYOFF_ROUND"] = df["poRoundDesc"] if "poRoundDesc" in df.columns else df.get("gameLabel", None)
    mapped_df["SERIES_GAME_NUMBER"] = df.get("seriesGameNumber", None)
    mapped_df["HOME_SERIES_WINS"] = df.get("homeTeam_wins", None)
    mapped_df["AWAY_SERIES_WINS"] = df.get("awayTeam_wins", None)
    
    # Elimination status
    mapped_df["IS_ELIMINATION_GAME"] = df.get("ifNecessary", None)
    mapped_df["CAN_CLINCH_SERIES"] = df.get("ifNecessary", None)
    
    arena_name = df.get("arenaName", "")
    arena_city = df.get("arenaCity", "")
    arena_state = df.get("arenaState", "")
    
    mapped_df["ARENA"] = arena_name
    mapped_df["LOCATION"] = arena_city.astype(str) + ", " + arena_state.astype(str)
    
    return mapped_df

def update_schedule_files(season: str = None) -> Tuple[int, int]:
    """
    Refreshes the local schedule files by querying the NBA API.
    Saves:
        - All non-Finals games to raw_schedule
        - All Finals games to raw_finals_schedule
        
    Returns (num_schedule_rows, num_finals_rows).
    """
    from src.core.data_paths import get_data_paths
    season = season or get_default_season()
    paths = get_data_paths(season)
    raw_schedule_csv = paths.raw_schedule
    raw_finals_csv = paths.raw_finals_schedule

    df_full = fetch_schedule_for_season(season=season)
    if df_full.empty:
        logger.warning("Could not refresh schedule from NBA API. Keeping existing files.")
        s_count = len(pd.read_csv(raw_schedule_csv)) if os.path.exists(raw_schedule_csv) else 0
        f_count = len(pd.read_csv(raw_finals_csv)) if os.path.exists(raw_finals_csv) else 0
        return s_count, f_count
        
    # Split into schedule (non-Finals) and Finals
    df_sched = df_full[df_full["SEASON_TYPE"] != "NBA Finals"].copy()
    df_finals = df_full[df_full["SEASON_TYPE"] == "NBA Finals"].copy()
    
    # Align columns
    df_sched = df_sched[[c for c in SCHEDULE_COLUMNS if c in df_sched.columns]]
    df_finals = df_finals[[c for c in FINALS_COLUMNS if c in df_finals.columns]]
    
    # Add any missing columns as empty
    for col in SCHEDULE_COLUMNS:
        if col not in df_sched.columns:
            df_sched[col] = None
    df_sched = df_sched[SCHEDULE_COLUMNS]
    
    for col in FINALS_COLUMNS:
        if col not in df_finals.columns:
            df_finals[col] = None
    df_finals = df_finals[FINALS_COLUMNS]
    
    # Save files
    os.makedirs(os.path.dirname(raw_schedule_csv), exist_ok=True)
    write_csv_atomic(df_sched, raw_schedule_csv)
    logger.info(f"Updated: {raw_schedule_csv} ({len(df_sched)} games)")
    
    write_csv_atomic(df_finals, raw_finals_csv)
    logger.info(f"Updated: {raw_finals_csv} ({len(df_finals)} games)")
    
    return len(df_sched), len(df_finals)
