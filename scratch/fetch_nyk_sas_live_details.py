import sys
import json
import pandas as pd
from pathlib import Path

ROOT = Path("/Users/serhat/agProjects/nbaModelApp")

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.ingestion.nba_api_client import call_nba_api
from nba_api.stats.endpoints import boxscoresummaryv2, playbyplayv3

def main():
    game_id = "0042500405"
    print(f"Fetching BoxScoreSummaryV2 for game {game_id}...")
    
    try:
        summary = call_nba_api(boxscoresummaryv2.BoxScoreSummaryV2, game_id=game_id)
        dfs = summary.get_data_frames()
        
        print(f"\nSuccessfully fetched summary datasets. Number of tables: {len(dfs)}")
        
        # Line Score is usually index 5 or we can find it by looking at columns
        line_score_df = None
        for idx, df in enumerate(dfs):
            cols = df.columns.tolist()
            if "PTS_QTR1" in cols or "PTS_OT1" in cols or "TEAM_ABBREVIATION" in cols:
                line_score_df = df
                print(f"Found LineScore table at index {idx}.")
                break
                
        if line_score_df is not None:
            print("\n--- QUARTER SCORES (LINE SCORE) ---")
            show_cols = [c for c in ["TEAM_ABBREVIATION", "PTS_QTR1", "PTS_QTR2", "PTS_QTR3", "PTS_QTR4", "PTS_OT1", "PTS"] if c in line_score_df.columns]
            print(line_score_df[show_cols].to_string(index=False))
        else:
            print("Could not find LineScore table columns.")
            
    except Exception as e:
        print(f"Error fetching line score: {e}")
        
    print(f"\nFetching PlayByPlayV3 for game {game_id}...")
    try:
        pbp = call_nba_api(playbyplayv3.PlayByPlayV3, game_id=game_id, start_period=1, end_period=4)
        pbp_df = pbp.get_data_frames()[0]
        print(f"Successfully fetched PlayByPlayV3. Total events: {len(pbp_df)}")
        print("\nPlay-by-play Columns:")
        print(pbp_df.columns.tolist())
        
        print("\nSample Play-by-play Events (First 15 rows):")
        # Check available columns to print sample events nicely
        sample_cols = [c for c in ["period", "clock", "actionType", "subType", "descriptor", "scoreHome", "scoreAway"] if c in pbp_df.columns]
        if not sample_cols:
            sample_cols = pbp_df.columns[:7]
        print(pbp_df[sample_cols].head(15).to_string(index=False))
        
    except Exception as e:
        print(f"Error fetching play by play: {e}")

if __name__ == "__main__":
    main()
