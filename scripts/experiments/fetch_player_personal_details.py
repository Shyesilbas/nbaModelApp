import os
import sys
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT))

try:
    from nba_api.stats.endpoints import playerindex
    from src.ingestion.nba_api_client import call_nba_api
except ImportError as e:
    print(f"Error importing modules: {e}")
    sys.exit(1)

def map_position_to_group(pos: str) -> str:
    if not isinstance(pos, str):
        return "UNKNOWN"
    pos = pos.upper().strip()
    if "C" in pos:
        return "BIG"
    elif "G" in pos:
        return "GUARD"
    elif "F" in pos:
        return "WING"
    return "UNKNOWN"

def main():
    print("--- Fetching NBA Player Metadata (Biographical & Official Positions) ---")
    
    try:
        # Fetch PlayerIndex in bulk
        print("Making bulk API request to PlayerIndex...")
        p_index = call_nba_api(playerindex.PlayerIndex, historical_nullable='1', season='2025-26')
        df = p_index.get_data_frames()[0]
        print(f"Successfully retrieved {len(df)} players from PlayerIndex.")
        
        # Select and rename columns
        df_meta = pd.DataFrame()
        df_meta["PLAYER_ID"] = df["PERSON_ID"]
        df_meta["PLAYER_NAME"] = df["PLAYER_FIRST_NAME"] + " " + df["PLAYER_LAST_NAME"]
        df_meta["HEIGHT"] = df["HEIGHT"]
        df_meta["WEIGHT"] = df["WEIGHT"]
        df_meta["COLLEGE"] = df["COLLEGE"]
        df_meta["COUNTRY"] = df["COUNTRY"]
        df_meta["OFFICIAL_POSITION"] = df["POSITION"]
        
        # Map official position to group (BIG, GUARD, WING, UNKNOWN)
        df_meta["POSITION_GROUP"] = df_meta["OFFICIAL_POSITION"].apply(map_position_to_group)
        
        # Add draft and career years
        df_meta["DRAFT_YEAR"] = df["DRAFT_YEAR"]
        df_meta["DRAFT_ROUND"] = df["DRAFT_ROUND"]
        df_meta["DRAFT_NUMBER"] = df["DRAFT_NUMBER"]
        df_meta["FROM_YEAR"] = df["FROM_YEAR"]
        df_meta["TO_YEAR"] = df["TO_YEAR"]
        df_meta["ROSTER_STATUS"] = df["ROSTER_STATUS"]
        
        # Clean null/empty string names
        df_meta["PLAYER_NAME"] = df_meta["PLAYER_NAME"].str.strip()
        
        # Save to canonical directory
        out_path = ROOT / "data/canonical/player_metadata.csv"
        os.makedirs(out_path.parent, exist_ok=True)
        df_meta.to_csv(out_path, index=False)
        print(f"Player metadata successfully saved to: {out_path}")
        print(f"Dimensions: {df_meta.shape}")
        
        # Print position distribution
        print("\nPosition Group Distribution:")
        dist = df_meta["POSITION_GROUP"].value_counts()
        for k, v in dist.items():
            print(f"  {k}: {v}")
            
    except Exception as e:
        print(f"Failed to fetch or process player index: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
