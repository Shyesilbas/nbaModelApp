"""
schedule_fetcher.py
-------------------
Fetch schedule and scoreboard data from the NBA API and update the local schedule datasets.
"""

import os
import logging
import pandas as pd
from datetime import datetime, date
from typing import List, Dict, Any, Optional, Tuple

from src.ingestion.nba_api_client import call_nba_api

logger = logging.getLogger("ScheduleFetcher")

RAW_SCHEDULE_CSV = "data/raw/schedule/nba_schedule_2025_26.csv"
RAW_FINALS_CSV = "data/raw/schedule/nba_finals_upcoming_2025_26.csv"

SCHEDULE_COLUMNS = [
    'GAME_ID', 'GAME_DATE', 'HOME_TEAM_ABBREVIATION', 'AWAY_TEAM_ABBREVIATION', 
    'SEASON_TYPE', 'IS_PLAYOFF', 'PLAYOFF_ROUND', 'SERIES_GAME_NUMBER', 
    'HOME_SERIES_WINS', 'AWAY_SERIES_WINS', 'IS_ELIMINATION_GAME', 'CAN_CLINCH_SERIES'
]

FINALS_COLUMNS = [
    'GAME_ID', 'GAME_DATE', 'HOME_TEAM_ABBREVIATION', 'AWAY_TEAM_ABBREVIATION', 
    'SEASON_TYPE', 'IS_PLAYOFF'
]

def fetch_schedule_for_season(season: str = "2025-26") -> pd.DataFrame:
    """
    Fetches the schedule for a given season using ScheduleLeagueV2 and maps it
    to the project's unified schema.
    """
    from nba_api.stats.endpoints import scheduleleaguev2
    
    try:
        logger.info(f"Fetching full league schedule for season {season}...")
        sl = call_nba_api(scheduleleaguev2.ScheduleLeagueV2, season=season)
        df = sl.get_data_frames()[0]
    except Exception as e:
        logger.error(f"Error fetching ScheduleLeagueV2: {e}")
        return pd.DataFrame()
        
    if df.empty:
        return pd.DataFrame()
        
    # Filter out preseason (starts with 001) and all-star (starts with 003)
    df = df[df["gameId"].astype(str).str.startswith(("002", "004", "005"))].copy()
    
    # Map columns to match schedule schema safely
    mapped_df = pd.DataFrame()
    mapped_df["GAME_ID"] = df["gameId"].astype(str).str.zfill(10)
    
    # Format date: YYYY-MM-DD
    mapped_df["GAME_DATE"] = pd.to_datetime(df["gameDateEst"]).dt.strftime("%Y-%m-%d")
    
    mapped_df["HOME_TEAM_ABBREVIATION"] = df["homeTeam_teamTricode"]
    mapped_df["AWAY_TEAM_ABBREVIATION"] = df["awayTeam_teamTricode"]
    mapped_df["HOME_TEAM_NAME"] = df["homeTeam_teamName"]
    mapped_df["AWAY_TEAM_NAME"] = df["awayTeam_teamName"]
    
    # Determine SEASON_TYPE
    def determine_season_type(row):
        label = str(row.get("gameLabel", "")).strip()
        gid = str(row.get("gameId", ""))
        if gid.startswith("005") or "play-in" in label.lower() or "playin" in label.lower():
            return "PlayIn"
        elif label == "NBA Finals" or gid.startswith("00425004") or "00425004" in gid:
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

def fetch_scoreboard_by_date(game_date: date) -> List[Dict[str, Any]]:
    """
    Fetches game summaries for a specific date using ScoreboardV3.
    """
    from nba_api.stats.endpoints import scoreboardv3
    date_str = game_date.strftime("%Y-%m-%d")
    
    try:
        logger.info(f"Fetching scoreboard for date {date_str} using ScoreboardV3...")
        sb = call_nba_api(scoreboardv3.ScoreboardV3, game_date=date_str)
        dfs = sb.get_data_frames()
    except Exception as e:
        logger.error(f"Error fetching ScoreboardV3 for {date_str}: {e}")
        return []
        
    if len(dfs) < 3 or dfs[1].empty:
        return []
        
    df_games = dfs[1]
    df_teams = dfs[2]
    
    games_list = []
    for _, game_row in df_games.iterrows():
        gid = game_row["gameId"]
        game_code = game_row["gameCode"]  # YYYYMMDD/AWAYHOME
        
        # Parse home and away teams from gameCode
        if "/" in game_code:
            teams_part = game_code.split("/")[1]
            away_tri = teams_part[:3]
            home_tri = teams_part[3:]
        else:
            away_tri = None
            home_tri = None
            
        game_teams = df_teams[df_teams["gameId"] == gid]
        home_team_name = ""
        away_team_name = ""
        
        for _, team_row in game_teams.iterrows():
            tri = team_row["teamTricode"]
            if tri == home_tri:
                home_team_name = team_row["teamName"]
            elif tri == away_tri:
                away_team_name = team_row["teamName"]
                
        games_list.append({
            "GAME_ID": gid,
            "GAME_DATE": date_str,
            "HOME_TEAM_ABBREVIATION": home_tri,
            "AWAY_TEAM_ABBREVIATION": away_tri,
            "HOME_TEAM_NAME": home_team_name,
            "AWAY_TEAM_NAME": away_team_name,
            "GAME_STATUS": "Final" if str(game_row["gameStatusText"]).lower() == "final" else "Scheduled",
            "SEASON_TYPE": "NBA Finals" if gid.startswith("00425004") else "Playoffs" if gid.startswith("004") else "PlayIn" if gid.startswith("005") else "Regular Season"
        })
        
    return games_list

def fetch_upcoming_or_recent_games(date_range: Tuple[date, date], season: str = "2025-26") -> pd.DataFrame:
    """
    Retrieves schedule records within a specific date range from the full season schedule.
    """
    start_date, end_date = date_range
    df_full = fetch_schedule_for_season(season=season)
    if df_full.empty:
        return pd.DataFrame()
        
    df_full["GAME_DATE_DT"] = pd.to_datetime(df_full["GAME_DATE"]).dt.date
    df_filtered = df_full[(df_full["GAME_DATE_DT"] >= start_date) & (df_full["GAME_DATE_DT"] <= end_date)]
    return df_filtered.drop(columns=["GAME_DATE_DT"])

def update_schedule_files(season: str = "2025-26") -> Tuple[int, int]:
    """
    Refreshes the local schedule files by querying the NBA API.
    Saves:
        - All non-Finals games to raw_schedule
        - All Finals games to raw_finals_schedule
        
    Returns (num_schedule_rows, num_finals_rows).
    """
    from scripts.data_paths import get_data_paths
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
    df_sched.to_csv(raw_schedule_csv, index=False)
    logger.info(f"Updated: {raw_schedule_csv} ({len(df_sched)} games)")
    
    df_finals.to_csv(raw_finals_csv, index=False)
    logger.info(f"Updated: {raw_finals_csv} ({len(df_finals)} games)")
    
    return len(df_sched), len(df_finals)
