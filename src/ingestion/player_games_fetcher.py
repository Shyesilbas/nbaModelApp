"""
player_games_fetcher.py
-----------------------
Fetch player game logs from the NBA API and append them to the raw player games dataset.
"""

import os
import logging
import pandas as pd
from typing import List, Optional

from src.ingestion.nba_api_client import call_nba_api
from scripts.season_utils import get_default_season
from src.ingestion.atomic_io import write_csv_atomic
from src.validation.contracts import check_player_games

logger = logging.getLogger("PlayerGamesFetcher")

RAW_PLAYER_CSV = "data/raw/player_games/nba_player_games_regular_and_playoffs.csv"

EXPECTED_COLUMNS = [
    'SEASON_ID', 'Player_ID', 'Game_ID', 'GAME_DATE', 'MATCHUP', 'WL', 'MIN', 
    'FGM', 'FGA', 'FG_PCT', 'FG3M', 'FG3A', 'FG3_PCT', 'FTM', 'FTA', 'FT_PCT', 
    'OREB', 'DREB', 'REB', 'AST', 'STL', 'BLK', 'TOV', 'PF', 'PTS', 'PLUS_MINUS', 
    'VIDEO_AVAILABLE', 'PLAYER_NAME', 'SEASON_TYPE'
    
]

def fetch_player_games_for_season(season: str = None, season_types: Optional[List[str]] = None) -> pd.DataFrame:
    """
    Fetches player game logs for a given season and list of season types.
    """
    from nba_api.stats.endpoints import leaguegamelog
    season = season or get_default_season()
    
    if season_types is None:
        season_types = ["Pre Season", "Regular Season", "PlayIn", "Playoffs", "NBA Finals"]
        
    # Map local season types to API season types, ensuring unique calls
    api_types_to_query = set()
    for st in season_types:
        if st == "NBA Finals":
            api_types_to_query.add("Playoffs")
        else:
            api_types_to_query.add(st)
            
    all_dfs = []
    for api_st in api_types_to_query:
        try:
            logger.info(f"Fetching player game logs for season {season}, type {api_st}...")
            log_instance = call_nba_api(
                leaguegamelog.LeagueGameLog,
                season=season,
                player_or_team_abbreviation="P",
                season_type_all_star=api_st
            )
            df = log_instance.get_data_frames()[0]
            if not df.empty:
                # Rename columns to match local schema
                df = df.rename(columns={
                    "PLAYER_ID": "Player_ID",
                    "GAME_ID": "Game_ID"
                })
                
                # Format dates to match local style: e.g. "Apr 12, 2026"
                df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"]).dt.strftime("%b %d, %Y")
                
                # Assign/normalize SEASON_TYPE
                if api_st == "Playoffs":
                    def get_row_season_type(row):
                        gid = str(row["Game_ID"]).zfill(10)
                        if gid.startswith("00425004") or "00425004" in gid:
                            return "NBA Finals"
                        return "Playoffs"
                    df["SEASON_TYPE"] = df.apply(get_row_season_type, axis=1)
                else:
                    df["SEASON_TYPE"] = api_st
                all_dfs.append(df)
        except Exception as e:
            logger.error(f"Error fetching player games for {api_st}: {e}")
            
    if not all_dfs:
        return pd.DataFrame(columns=EXPECTED_COLUMNS)
        
    combined_df = pd.concat(all_dfs, ignore_index=True)
    
    # Ensure expected columns are present and ordered
    for col in EXPECTED_COLUMNS:
        if col not in combined_df.columns:
            combined_df[col] = None
            
    return combined_df[EXPECTED_COLUMNS]

def fetch_player_games_from_boxscore(game_id: str, schedule_df: Optional[pd.DataFrame] = None, season: Optional[str] = None) -> pd.DataFrame:
    """
    Fallback method to fetch player games using BoxScoreTraditionalV3 (with V2 fallback) for a single game.
    Resolves metadata using the schedule context.
    """
    game_id_str = str(game_id).zfill(10)
    logger.info(f"Fallback: Fetching player boxscore for game {game_id_str}...")
    
    df = None
    team_wl = {}

    # Attempt BoxScoreTraditionalV3 first (active official endpoint)
    try:
        from nba_api.stats.endpoints import boxscoretraditionalv3
        bs3 = call_nba_api(boxscoretraditionalv3.BoxScoreTraditionalV3, game_id=game_id_str)
        frames3 = bs3.get_data_frames()
        if len(frames3) >= 1 and not frames3[0].empty:
            raw_p = frames3[0].copy()
            rename_map = {
                "personId": "PLAYER_ID",
                "teamId": "TEAM_ID",
                "teamTricode": "TEAM_ABBREVIATION",
                "minutes": "MIN",
                "points": "PTS",
                "fieldGoalsMade": "FGM",
                "fieldGoalsAttempted": "FGA",
                "fieldGoalsPercentage": "FG_PCT",
                "threePointersMade": "FG3M",
                "threePointersAttempted": "FG3A",
                "threePointersPercentage": "FG3_PCT",
                "freeThrowsMade": "FTM",
                "freeThrowsAttempted": "FTA",
                "freeThrowsPercentage": "FT_PCT",
                "reboundsOffensive": "OREB",
                "reboundsDefensive": "DREB",
                "reboundsTotal": "REB",
                "assists": "AST",
                "steals": "STL",
                "blocks": "BLK",
                "turnovers": "TO",
                "foulsPersonal": "PF",
                "plusMinusPoints": "PLUS_MINUS",
                "comment": "COMMENT"
            }
            df = raw_p.rename(columns=rename_map)
            if "PLAYER_NAME" not in df.columns:
                fn = df["firstName"].fillna("") if "firstName" in df.columns else ""
                ln = df["familyName"].fillna("") if "familyName" in df.columns else ""
                df["PLAYER_NAME"] = (fn + " " + ln).str.strip()

            if len(frames3) >= 3 and not frames3[2].empty:
                team_df = frames3[2]
                if len(team_df) == 2:
                    pts0 = float(team_df.iloc[0]["points"])
                    pts1 = float(team_df.iloc[1]["points"])
                    t0_id = int(team_df.iloc[0]["teamId"])
                    t1_id = int(team_df.iloc[1]["teamId"])
                    team_wl[t0_id] = "W" if pts0 > pts1 else "L"
                    team_wl[t1_id] = "W" if pts1 > pts0 else "L"
    except Exception as exc:
        logger.warning(f"BoxScoreTraditionalV3 failed for player game {game_id_str}: {exc}, falling back to V2")

    # Fallback to BoxScoreTraditionalV2 if V3 failed or was empty
    if df is None or df.empty:
        try:
            from nba_api.stats.endpoints import boxscoretraditionalv2
            bs2 = call_nba_api(boxscoretraditionalv2.BoxScoreTraditionalV2, game_id=game_id_str)
            df = bs2.get_data_frames()[0]
            if len(bs2.get_data_frames()) >= 2:
                team_df = bs2.get_data_frames()[1]
                if len(team_df) == 2:
                    pts0 = float(team_df.iloc[0]["PTS"])
                    pts1 = float(team_df.iloc[1]["PTS"])
                    t0_id = int(team_df.iloc[0]["TEAM_ID"])
                    t1_id = int(team_df.iloc[1]["TEAM_ID"])
                    team_wl[t0_id] = "W" if pts0 > pts1 else "L"
                    team_wl[t1_id] = "W" if pts1 > pts0 else "L"
        except Exception as exc:
            logger.error(f"BoxScoreTraditionalV2 also failed for player game {game_id_str}: {exc}")
            return pd.DataFrame()

    try:
        if df.empty:
            logger.warning(f"No player box score data returned for game {game_id_str}.")
            return pd.DataFrame()
            
        # We need schedule context to fill GAME_DATE, SEASON_TYPE, MATCHUP
        if schedule_df is None:
            from scripts.data_paths import get_data_paths
            paths = get_data_paths(season)
            schedule_csv = paths.schedule_combined
            if os.path.exists(schedule_csv):
                schedule_df = pd.read_csv(schedule_csv, dtype={"GAME_ID": str})
                
        # Find schedule row
        sched_row = None
        if schedule_df is not None and not schedule_df.empty:
            matched = schedule_df[schedule_df["GAME_ID"].astype(str).str.zfill(10) == game_id_str]
            if not matched.empty:
                sched_row = matched.iloc[0]
                
        if sched_row is None:
            logger.error(f"Cannot resolve schedule context for fallback game {game_id_str}.")
            return pd.DataFrame()
            
        # Parse fields from schedule
        game_date_dt = pd.to_datetime(sched_row["GAME_DATE"])
        game_date = game_date_dt.strftime("%b %d, %Y")
        
        season_type = sched_row["SEASON_TYPE"]
        home_team = sched_row["HOME_TEAM_ABBREVIATION"]
        away_team = sched_row["AWAY_TEAM_ABBREVIATION"]
        
        from scripts.season_utils import normalize_season
        norm_season = normalize_season(season or get_default_season())
        start_year = int(norm_season.split("-")[0])
        
        if season_type == "Regular Season":
            season_id = 20000 + start_year
        elif season_type == "PlayIn":
            season_id = 50000 + start_year
        elif season_type in ("Pre Season", "Preseason"):
            season_id = 10000 + start_year
        else:
            season_id = 40000 + start_year
            
        # Prepare mapped rows
        rows = []
        for _, p_row in df.iterrows():
            t_id = int(p_row["TEAM_ID"])
            t_abb = p_row["TEAM_ABBREVIATION"]
            wl = team_wl.get(t_id, None)
            
            # Determine matchup
            if t_abb == home_team:
                matchup = f"{home_team} vs. {away_team}"
            else:
                matchup = f"{away_team} @ {home_team}"
                
            # Parse minutes
            min_val = p_row["MIN"]
            if pd.isna(min_val) or str(min_val).strip() == "":
                min_val = 0.0
            else:
                val_str = str(min_val).strip()
                if ":" in val_str:
                    try:
                        parts = val_str.split(":")
                        min_val = float(parts[0]) + float(parts[1]) / 60.0
                    except:
                        min_val = 0.0
                else:
                    try:
                        min_val = float(val_str)
                    except:
                        min_val = 0.0
                        
            # Skip players who didn't play (DNP)
            comment = str(p_row.get("COMMENT", ""))
            if comment and any(x in comment.upper() for x in ["DNP", "DID NOT PLAY", "INACTIVE", "NWT"]):
                continue
                
            rows.append({
                'SEASON_ID': season_id,
                'Player_ID': int(p_row['PLAYER_ID']),
                'Game_ID': game_id_str,
                'GAME_DATE': game_date,
                'MATCHUP': matchup,
                'WL': wl,
                'MIN': min_val,
                'FGM': float(p_row['FGM']) if pd.notna(p_row['FGM']) else 0.0,
                'FGA': float(p_row['FGA']) if pd.notna(p_row['FGA']) else 0.0,
                'FG_PCT': float(p_row['FG_PCT']) if pd.notna(p_row['FG_PCT']) else 0.0,
                'FG3M': float(p_row['FG3M']) if pd.notna(p_row['FG3M']) else 0.0,
                'FG3A': float(p_row['FG3A']) if pd.notna(p_row['FG3A']) else 0.0,
                'FG3_PCT': float(p_row['FG3_PCT']) if pd.notna(p_row['FG3_PCT']) else 0.0,
                'FTM': float(p_row['FTM']) if pd.notna(p_row['FTM']) else 0.0,
                'FTA': float(p_row['FTA']) if pd.notna(p_row['FTA']) else 0.0,
                'FT_PCT': float(p_row['FT_PCT']) if pd.notna(p_row['FT_PCT']) else 0.0,
                'OREB': float(p_row['OREB']) if pd.notna(p_row['OREB']) else 0.0,
                'DREB': float(p_row['DREB']) if pd.notna(p_row['DREB']) else 0.0,
                'REB': float(p_row['REB']) if pd.notna(p_row['REB']) else 0.0,
                'AST': float(p_row['AST']) if pd.notna(p_row['AST']) else 0.0,
                'STL': float(p_row['STL']) if pd.notna(p_row['STL']) else 0.0,
                'BLK': float(p_row['BLK']) if pd.notna(p_row['BLK']) else 0.0,
                'TOV': float(p_row['TO']) if pd.notna(p_row['TO']) else 0.0,
                'PF': float(p_row['PF']) if pd.notna(p_row['PF']) else 0.0,
                'PTS': float(p_row['PTS']) if pd.notna(p_row['PTS']) else 0.0,
                'PLUS_MINUS': float(p_row['PLUS_MINUS']) if pd.notna(p_row['PLUS_MINUS']) else 0.0,
                'VIDEO_AVAILABLE': 1,
                'PLAYER_NAME': p_row['PLAYER_NAME'],
                'SEASON_TYPE': season_type
            })
            
        return pd.DataFrame(rows)
    except Exception as e:
        logger.error(f"Fallback fetch failed for player game {game_id_str}: {e}")
        return pd.DataFrame()

def fetch_missing_player_games_by_game_ids(game_ids: List[str], season: str = None, schedule_df: Optional[pd.DataFrame] = None) -> pd.DataFrame:
    """
    Fetches player game logs specifically for missing game IDs.
    """
    if not game_ids:
        return pd.DataFrame(columns=EXPECTED_COLUMNS)
        
    # Group missing game IDs by API season type based on prefix
    api_queries = set()
    for gid in game_ids:
        gid_str = str(gid).zfill(10)
        if gid_str.startswith("002"):
            api_queries.add("Regular Season")
        elif gid_str.startswith("005"):
            api_queries.add("PlayIn")
        elif gid_str.startswith("004"):
            api_queries.add("Playoffs")
            
    all_logs = []
    
    # Try fetching with LeagueGameLog first
    for api_st in api_queries:
        logger.info(f"Fetching {api_st} to retrieve missing player games: {game_ids}")
        try:
            df_season = fetch_player_games_for_season(season=season, season_types=[api_st])
            if not df_season.empty:
                target_ids = [str(g).zfill(10) for g in game_ids]
                df_filtered = df_season[df_season["Game_ID"].astype(str).str.zfill(10).isin(target_ids)]
                if not df_filtered.empty:
                    all_logs.append(df_filtered)
        except Exception as e:
            logger.error(f"LeagueGameLog player query failed for {api_st}: {e}. Falling back to BoxScoreTraditionalV3.")
            
    # Check if we got all game IDs we needed. If not, fallback to BoxScoreTraditionalV3
    found_gids = set()
    if all_logs:
        df_found = pd.concat(all_logs, ignore_index=True)
        found_gids = set(df_found["Game_ID"].unique())
        
    missing_targets = [gid for gid in game_ids if str(gid).zfill(10) not in found_gids]
    
    if missing_targets:
        logger.info(f"Using BoxScoreTraditionalV3 fallback for player games: {missing_targets}")
        for gid in missing_targets:
            df_fallback = fetch_player_games_from_boxscore(gid, schedule_df, season=season)
            if not df_fallback.empty:
                all_logs.append(df_fallback)
                
    if not all_logs:
        return pd.DataFrame(columns=EXPECTED_COLUMNS)
        
    return pd.concat(all_logs, ignore_index=True)

def append_player_games_to_raw_dataset(new_rows: pd.DataFrame, season: Optional[str] = None) -> int:
    """
    Appends new player game log rows to the raw player games dataset,
    deduplicates by Player_ID + Game_ID, and saves the CSV.
    
    Returns the total count of rows after update.
    """
    from scripts.data_paths import get_data_paths
    paths = get_data_paths(season)
    raw_player_csv = paths.player_games_raw

    if new_rows is None or new_rows.empty:
        logger.info("No new player rows to append.")
        if os.path.exists(raw_player_csv):
            return len(pd.read_csv(raw_player_csv))
        return 0
        
    # Load existing
    if os.path.exists(raw_player_csv):
        df_existing = pd.read_csv(raw_player_csv, dtype={"Game_ID": str, "Player_ID": int})
        df_combined = pd.concat([df_existing, new_rows], ignore_index=True)
    else:
        df_combined = new_rows.copy()
        
    # Ensure types for deduplication
    df_combined["Game_ID"] = df_combined["Game_ID"].astype(str).str.zfill(10)
    df_combined["Player_ID"] = df_combined["Player_ID"].astype(int)
    if "SEASON_ID" in df_combined.columns:
        df_combined["SEASON_ID"] = df_combined["SEASON_ID"].astype(int)
    
    # Deduplicate keeping last (newly fetched overrides old)
    df_combined = df_combined.drop_duplicates(subset=["Player_ID", "Game_ID"], keep="last")
    
    # Order columns
    df_combined = df_combined[EXPECTED_COLUMNS]

    if "GAME_DATE" in df_combined.columns:
        df_combined["GAME_DATE"] = (
            pd.to_datetime(df_combined["GAME_DATE"], errors="coerce", format="mixed")
            .dt.strftime("%Y-%m-%d")
        )

    check_player_games(df_combined, raw_player_csv)

    # Save CSV
    os.makedirs(os.path.dirname(raw_player_csv), exist_ok=True)
    write_csv_atomic(df_combined, raw_player_csv)
    logger.info(f"Saved: {raw_player_csv} ({len(df_combined)} rows)")
    
    return len(df_combined)
