import pandas as pd
import numpy as np
import os
import sys
import argparse
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.core.data_paths import get_data_paths
from src.core.season_utils import get_default_season, normalize_season

def main() -> None:
    """
    Build transaction-like affiliation events from observed player game logs.
    """
    parser = argparse.ArgumentParser(description="Build observed player-team stints/affiliation events.")
    parser.add_argument("--season", type=str, default=None, help="Season string (e.g. 2024-25)")
    args = parser.parse_args()

    season = normalize_season(args.season or get_default_season())

    paths = get_data_paths(season)
    player_games_path = paths.player_games_raw
    team_games_path = paths.team_games_raw
    output_path = paths.observed_affiliation_events

    if not os.path.exists(player_games_path):
        raise FileNotFoundError(f"Missing raw player games at {player_games_path}")
    if not os.path.exists(team_games_path):
        raise FileNotFoundError(f"Missing raw team games at {team_games_path}")

    # Load data
    player_df = pd.read_csv(player_games_path)
    team_df = pd.read_csv(team_games_path)

    # Build a lookup for GAME_ID + TEAM_ABBREVIATION -> TEAM_ID from team games
    # Ensure GAME_ID is string
    team_df["GAME_ID"] = team_df["GAME_ID"].astype(str).str.zfill(10)
    team_lookup = team_df.set_index(["GAME_ID", "TEAM_ABBREVIATION"])["TEAM_ID"].to_dict()

    # Pre-populate some static mappings as fallback just in case
    abbrev_to_id = team_df.groupby("TEAM_ABBREVIATION")["TEAM_ID"].first().to_dict()

    # Process player games
    player_df["Game_ID"] = player_df["Game_ID"].astype(str).str.zfill(10)
    
    # Extract player team from MATCHUP (the first part of MATCHUP is always the player's team)
    # Matchup is e.g. "DEN vs. LAC" or "LAC @ DEN"
    player_df["TEAM_ABBREVIATION"] = player_df["MATCHUP"].apply(lambda x: x.split()[0])
    
    # Map TEAM_ID
    def get_team_id(row) -> int:
        game_id = row["Game_ID"]
        abbrev = row["TEAM_ABBREVIATION"]
        tid = team_lookup.get((game_id, abbrev))
        if pd.isna(tid) or tid is None:
            tid = abbrev_to_id.get(abbrev)
        return int(tid) if pd.notna(tid) else 0

    player_df["TEAM_ID"] = player_df.apply(get_team_id, axis=1)

    # Standardize GAME_DATE to YYYY-MM-DD
    # Input format is e.g. "Apr 19, 2025" or "2025-04-19"
    def parse_date(date_str) -> str:
        if "-" in str(date_str):
            return str(date_str)
        try:
            dt = datetime.strptime(str(date_str), "%b %d, %Y")
            return dt.strftime("%Y-%m-%d")
        except Exception:
            return str(date_str)

    player_df["GAME_DATE_NORM"] = player_df["GAME_DATE"].apply(parse_date)

    # Sort games by Player_ID and GAME_DATE
    player_df = player_df.sort_values(by=["Player_ID", "GAME_DATE_NORM"]).copy()

    stints = []

    for pid, p_group in player_df.groupby("Player_ID"):
        p_name = p_group.iloc[0]["PLAYER_NAME"]
        
        # We want to identify contiguous stints on the same team
        current_stint = None
        
        for idx, row in p_group.iterrows():
            team_id = row["TEAM_ID"]
            team_abbrev = row["TEAM_ABBREVIATION"]
            game_date = row["GAME_DATE_NORM"]
            game_id = row["Game_ID"]
            
            if current_stint is None:
                # Start first stint
                current_stint = {
                    "player_id": pid,
                    "player_name": p_name,
                    "team_id": team_id,
                    "team_abbreviation": team_abbrev,
                    "start_date": game_date,
                    "end_date": game_date,
                    "first_game_id": game_id,
                    "last_game_id": game_id,
                    "games_in_stint": 1
                }
            elif current_stint["team_id"] == team_id:
                # Contiguous game with the same team
                current_stint["end_date"] = game_date
                current_stint["last_game_id"] = game_id
                current_stint["games_in_stint"] += 1
            else:
                # Team changed, save current stint and start new one
                stints.append(current_stint)
                current_stint = {
                    "player_id": pid,
                    "player_name": p_name,
                    "team_id": team_id,
                    "team_abbreviation": team_abbrev,
                    "start_date": game_date,
                    "end_date": game_date,
                    "first_game_id": game_id,
                    "last_game_id": game_id,
                    "games_in_stint": 1
                }
                
        if current_stint is not None:
            # For the last stint of the season, make end_date open-ended (null)
            current_stint["end_date"] = None
            stints.append(current_stint)

    stints_df = pd.DataFrame(stints)
    stints_df["source"] = "observed_player_game_logs"

    # Save output
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    stints_df.to_csv(output_path, index=False)
    print(f"Successfully generated {output_path} with {len(stints_df)} observed stints.")

if __name__ == "__main__":
    main()
