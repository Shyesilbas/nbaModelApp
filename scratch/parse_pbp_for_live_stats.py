import sys
import json
import pandas as pd
import numpy as np
from pathlib import Path

ROOT = Path("/Users/serhat/agProjects/nbaModelApp")

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.ingestion.nba_api_client import call_nba_api
from nba_api.stats.endpoints import playbyplayv3

def main():
    game_id = "0042500405"
    print(f"Fetching and parsing PlayByPlayV3 for game {game_id}...")
    
    try:
        pbp = call_nba_api(playbyplayv3.PlayByPlayV3, game_id=game_id, start_period=1, end_period=4)
        df = pbp.get_data_frames()[0]
        
        # Print columns and event types to understand the schema
        print(f"Total rows: {len(df)}")
        print("\nAction Types observed:")
        print(df["actionType"].value_counts().head(10))
        
        # 1. Calculate Line Score (Quarter Scores) from PBP
        # Clean scores (replace empty strings with forward fill)
        df["scoreHome_clean"] = pd.to_numeric(df["scoreHome"].replace("", np.nan)).ffill().fillna(0).astype(int)
        df["scoreAway_clean"] = pd.to_numeric(df["scoreAway"].replace("", np.nan)).ffill().fillna(0).astype(int)
        
        print("\n--- Quarter-by-Quarter Team Scores ---")
        q_scores = []
        prev_home, prev_away = 0, 0
        for q in sorted(df["period"].unique()):
            q_df = df[df["period"] == q]
            if not q_df.empty:
                # Last row in this period
                last_row = q_df.iloc[-1]
                home_total = int(last_row["scoreHome_clean"])
                away_total = int(last_row["scoreAway_clean"])
                
                home_q = home_total - prev_home
                away_q = away_total - prev_away
                
                q_scores.append({
                    "Quarter": f"Q{q}",
                    "Home (SAS) Q-Pts": home_q,
                    "Away (NYK) Q-Pts": away_q,
                    "Home Total": home_total,
                    "Away Total": away_total
                })
                prev_home, prev_away = home_total, away_total
                
        print(pd.DataFrame(q_scores).to_string(index=False))
        
        # 2. Calculate Player Points & Rebounds by Quarter
        # Points from PBP: actionType is "Made Shot" or subType is free throw, etc.
        # Let's inspect where points are added: pointsTotal column shows points scored in the event
        df["pointsTotal"] = pd.to_numeric(df["pointsTotal"], errors="coerce").fillna(0).astype(int)
        
        print("\n--- Top Scorer Players in Q1 & Q4 ---")
        for q in [1, 4]:
            q_df = df[(df["period"] == q) & (df["pointsTotal"] > 0)]
            if not q_df.empty:
                q_scorers = q_df.groupby(["teamTricode", "playerName"])["pointsTotal"].sum().reset_index()
                q_scorers = q_scorers.sort_values(by="pointsTotal", ascending=False)
                print(f"\nQuarter {q} Top Scorers:")
                print(q_scorers.head(5).to_string(index=False))
                
        # Rebounds
        print("\n--- Top Rebounders by Quarter ---")
        reb_df = df[df["actionType"] == "Rebound"]
        if not reb_df.empty:
            for q in [1, 4]:
                q_reb_df = reb_df[(reb_df["period"] == q) & (reb_df["playerName"].notna()) & (reb_df["playerName"] != "")]
                if not q_reb_df.empty:
                    q_rebounders = q_reb_df.groupby(["teamTricode", "playerName"]).size().reset_index(name="Rebounds")
                    q_rebounders = q_rebounders.sort_values(by="Rebounds", ascending=False)
                    print(f"\nQuarter {q} Top Rebounders:")
                    print(q_rebounders.head(5).to_string(index=False))
                    
    except Exception as e:
        print(f"Error parsing play-by-play: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
