"""
team_games_fetcher.py
---------------------
Fetch team game logs from the NBA API and append them to the raw team games dataset.
"""

import os
import logging
import pandas as pd
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

from src.ingestion.nba_api_client import call_nba_api
from scripts.season_utils import get_default_season

logger = logging.getLogger("TeamGamesFetcher")

RAW_TEAM_CSV = "data/raw/team_games/nba_team_games_regular_and_playoffs.csv"
RAW_TEAM_PARQUET = "data/raw/team_games/nba_team_games_regular_and_playoffs.parquet"

EXPECTED_COLUMNS = [
    'SEASON_ID', 'TEAM_ID', 'TEAM_ABBREVIATION', 'TEAM_NAME', 'GAME_ID', 
    'GAME_DATE', 'MATCHUP', 'WL', 'MIN', 'PTS', 'FGM', 'FGA', 'FG_PCT', 
    'FG3M', 'FG3A', 'FG3_PCT', 'FTM', 'FTA', 'FT_PCT', 'OREB', 'DREB', 
    'REB', 'AST', 'STL', 'BLK', 'TOV', 'PF', 'PLUS_MINUS', 'SEASON_TYPE'
]

def fetch_team_games_for_season(season: str = None, season_types: Optional[List[str]] = None) -> pd.DataFrame:
    """
    Fetches team game logs for a given season and list of season types.
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
            logger.info(f"Fetching team game logs for season {season}, type {api_st}...")
            log_instance = call_nba_api(
                leaguegamelog.LeagueGameLog,
                season=season,
                player_or_team_abbreviation="T",
                season_type_all_star=api_st
            )
            df = log_instance.get_data_frames()[0]
            if not df.empty:
                # Assign/normalize SEASON_TYPE
                if api_st == "Playoffs":
                    def get_row_season_type(row):
                        gid = str(row["GAME_ID"]).zfill(10)
                        if gid.startswith("00425004") or "00425004" in gid:
                            return "NBA Finals"
                        return "Playoffs"
                    df["SEASON_TYPE"] = df.apply(get_row_season_type, axis=1)
                else:
                    df["SEASON_TYPE"] = api_st
                all_dfs.append(df)
        except Exception as e:
            logger.error(f"Error fetching team games for {api_st}: {e}")
            
    if not all_dfs:
        return pd.DataFrame(columns=EXPECTED_COLUMNS)
        
    combined_df = pd.concat(all_dfs, ignore_index=True)
    
    # Ensure expected columns are present and ordered
    for col in EXPECTED_COLUMNS:
        if col not in combined_df.columns:
            combined_df[col] = None
            
    return combined_df[EXPECTED_COLUMNS]

def fetch_team_games_from_boxscore(game_id: str, schedule_df: Optional[pd.DataFrame] = None, season: Optional[str] = None) -> pd.DataFrame:
    """
    Fallback method to fetch team games using BoxScoreTraditionalV2 for a single game.
    Resolves date, matchup, and season type using the schedule context.
    """
    from nba_api.stats.endpoints import boxscoretraditionalv2
    
    game_id_str = str(game_id).zfill(10)
    logger.info(f"Fallback: Fetching team boxscore for game {game_id_str} using BoxScoreTraditionalV2...")
    
    try:
        bs = call_nba_api(boxscoretraditionalv2.BoxScoreTraditionalV2, game_id=game_id_str)
        df = bs.get_data_frames()[1]  # TeamStats DataFrame
        if df.empty:
            logger.warning(f"No team box score data returned for game {game_id_str}.")
            return pd.DataFrame()
            
        # We need schedule context to fill GAME_DATE, SEASON_TYPE, MATCHUP
        if schedule_df is None:
            # Try to load it
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
        game_date_dt = pd.to_datetime(sched_row["GAME_DATE"], errors="coerce")
        game_date = game_date_dt.strftime("%Y-%m-%d") if pd.notna(game_date_dt) else str(sched_row["GAME_DATE"])
        season_type = sched_row["SEASON_TYPE"]
        home_team = sched_row["HOME_TEAM_ABBREVIATION"]
        away_team = sched_row["AWAY_TEAM_ABBREVIATION"]
        
        # Determine season ID dynamically from the normalized season start year.
        # Regular: 22025, PlayIn: 52025, Playoffs/Finals: 42025
        from scripts.season_utils import normalize_season
        norm_season = normalize_season(season or get_default_season())
        start_year = int(norm_season.split("-")[0])
        year_suffix = start_year % 100
        
        # Regular Season: 2 + start_year_suffix, PlayIn: 5 + start_year_suffix, Playoffs/Finals: 4 + start_year_suffix
        # e.g., 22025 or 22024. Wait! The NBA API season ID starts with 2 for Regular Season, 4 for playoffs, 5 for playin.
        # It has 5 digits: Digit 1 = Season Type (2=regular, 4=playoffs, 5=play-in). Digits 2-5 = year (e.g. 2024 or 2025).
        # The NBA API season_id uses the start year encoded into the numeric prefix.
        # No! 2 (digit 1) + 2025 (4 digits) = 22025. Yes! 2 + 2025 = 22025.
        # So it is 20000 + start_year.
        if season_type == "Regular Season":
            season_id = 20000 + start_year
        elif season_type == "PlayIn":
            season_id = 50000 + start_year
        elif season_type in ("Pre Season", "Preseason"):
            season_id = 10000 + start_year
        else:  # Playoffs / NBA Finals
            season_id = 40000 + start_year
            
        # Prepare mapped rows
        rows = []
        team1 = df.iloc[0]
        team2 = df.iloc[1]
        
        pts1 = float(team1["PTS"])
        pts2 = float(team2["PTS"])
        
        wl1 = "W" if pts1 > pts2 else "L"
        wl2 = "W" if pts2 > pts1 else "L"
        
        for idx, (t_row, wl) in enumerate([(team1, wl1), (team2, wl2)]):
            t_abb = t_row["TEAM_ABBREVIATION"]
            
            # Determine matchup
            if t_abb == home_team:
                matchup = f"{home_team} vs. {away_team}"
            else:
                matchup = f"{away_team} @ {home_team}"
                
            # Parse minutes
            min_val = t_row["MIN"]
            if isinstance(min_val, str) and ":" in min_val:
                try:
                    min_val = float(min_val.split(":")[0])
                except:
                    min_val = 240
                    
            rows.append({
                'SEASON_ID': season_id,
                'TEAM_ID': int(t_row['TEAM_ID']),
                'TEAM_ABBREVIATION': t_abb,
                'TEAM_NAME': t_row['TEAM_NAME'],
                'GAME_ID': game_id_str,
                'GAME_DATE': game_date,
                'MATCHUP': matchup,
                'WL': wl,
                'MIN': int(min_val),
                'PTS': int(t_row['PTS']),
                'FGM': int(t_row['FGM']),
                'FGA': int(t_row['FGA']),
                'FG_PCT': float(t_row['FG_PCT']),
                'FG3M': int(t_row['FG3M']),
                'FG3A': int(t_row['FG3A']),
                'FG3_PCT': float(t_row['FG3_PCT']),
                'FTM': int(t_row['FTM']),
                'FTA': int(t_row['FTA']),
                'FT_PCT': float(t_row['FT_PCT']),
                'OREB': int(t_row['OREB']),
                'DREB': int(t_row['DREB']),
                'REB': int(t_row['REB']),
                'AST': int(t_row['AST']),
                'STL': int(t_row['STL']),
                'BLK': int(t_row['BLK']),
                'TOV': int(t_row['TO']),
                'PF': int(t_row['PF']),
                'PLUS_MINUS': float(t_row['PLUS_MINUS']),
                'SEASON_TYPE': season_type
            })
            
        return pd.DataFrame(rows)
    except Exception as e:
        logger.error(f"Fallback fetch failed for game {game_id_str}: {e}")
        return pd.DataFrame()

def fetch_missing_team_games_by_game_ids(
    game_ids: List[str],
    season: str = None,
    schedule_df: Optional[pd.DataFrame] = None,
    max_workers: int = 4
) -> pd.DataFrame:
    """
    Fetches team game logs specifically for missing game IDs.

    This uses per-game BoxScoreTraditionalV2 requests so we do not re-download
    the full season every time a few new games are missing.
    """
    if not game_ids:
        return pd.DataFrame(columns=EXPECTED_COLUMNS)

    # Incremental path: fetch each missing game directly.
    def _fetch_one(gid: str) -> pd.DataFrame:
        gid_str = str(gid).zfill(10)
        logger.info(f"Fetching team boxscore for missing game {gid_str}")
        df_game = fetch_team_games_from_boxscore(gid_str, schedule_df, season=season)
        if df_game.empty:
            logger.warning(f"No team rows recovered for missing game {gid_str}")
        return df_game

    max_workers = max(1, min(max_workers, len(game_ids)))
    all_logs = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_map = {executor.submit(_fetch_one, gid): gid for gid in game_ids}
        for future in as_completed(future_map):
            df_game = future.result()
            if not df_game.empty:
                all_logs.append(df_game)

    if not all_logs:
        return pd.DataFrame(columns=EXPECTED_COLUMNS)

    return pd.concat(all_logs, ignore_index=True)

def append_team_games_to_raw_dataset(new_rows: pd.DataFrame, season: Optional[str] = None) -> int:
    """
    Appends new team game log rows to the raw team games dataset,
    deduplicates by TEAM_ID + GAME_ID, and saves both CSV and Parquet.
    
    Returns the total count of rows after update.
    """
    from scripts.data_paths import get_data_paths
    paths = get_data_paths(season)
    raw_team_csv = paths.team_games_raw
    raw_team_parquet = paths.team_games_raw.replace(".csv", ".parquet")

    if new_rows is None or new_rows.empty:
        logger.info("No new team rows to append.")
        if os.path.exists(raw_team_csv):
            return len(pd.read_csv(raw_team_csv))
        return 0
        
    # Load existing
    if os.path.exists(raw_team_csv):
        df_existing = pd.read_csv(raw_team_csv, dtype={"GAME_ID": str, "TEAM_ID": int})
        df_combined = pd.concat([df_existing, new_rows], ignore_index=True)
    else:
        df_combined = new_rows.copy()
        
    # Ensure types for deduplication
    df_combined["GAME_ID"] = df_combined["GAME_ID"].astype(str).str.zfill(10)
    df_combined["TEAM_ID"] = df_combined["TEAM_ID"].astype(int)
    if "SEASON_ID" in df_combined.columns:
        df_combined["SEASON_ID"] = df_combined["SEASON_ID"].astype(int)
    
    # Deduplicate keeping last (newly fetched overrides old)
    df_combined = df_combined.drop_duplicates(subset=["TEAM_ID", "GAME_ID"], keep="last")
    
    # Order columns
    df_combined = df_combined[EXPECTED_COLUMNS]

    if "GAME_DATE" in df_combined.columns:
        df_combined["GAME_DATE"] = (
            pd.to_datetime(df_combined["GAME_DATE"], errors="coerce", format="mixed")
            .dt.strftime("%Y-%m-%d")
        )

    # Save CSV
    os.makedirs(os.path.dirname(raw_team_csv), exist_ok=True)
    df_combined.to_csv(raw_team_csv, index=False)
    logger.info(f"Saved: {raw_team_csv} ({len(df_combined)} rows)")
    
    # Save Parquet
    df_combined.to_parquet(raw_team_parquet, index=False, engine="pyarrow")
    logger.info(f"Saved: {raw_team_parquet}")
    
    return len(df_combined)
