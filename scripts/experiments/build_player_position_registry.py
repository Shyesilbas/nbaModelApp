import os
import sys
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def print_flush(msg):
    print(msg, flush=True)

def build_registry():
    print_flush("--- Building Stat-Derived Archetype Position Registry ---")
    
    dataset_path = ROOT / "data/experimental/player_model_ready_v2_extended.csv"
    if not dataset_path.exists():
        print_flush(f"Dataset not found at {dataset_path}")
        sys.exit(1)
        
    df_players = pd.read_csv(dataset_path)
    df_unique = df_players.drop_duplicates(subset=["Player_ID"], keep="last")[["Player_ID", "PLAYER_NAME"]].copy()
    print_flush(f"Found {len(df_unique)} unique players in the experimental dataset.")
    
    # Load raw boxscores
    print_flush("Loading raw boxscores for 2024-25 and 2025-26...")
    df_raw_24 = pd.read_csv(ROOT / "data/raw/boxscores/player/nba_player_boxscores_2024_25.csv")
    df_raw_25 = pd.read_csv(ROOT / "data/raw/boxscores/player/nba_player_boxscores_2025_26.csv")
    df_raw = pd.concat([df_raw_24, df_raw_25], ignore_index=True)
    
    # Clean and parse minutes
    df_raw = df_raw.dropna(subset=["MIN", "REB", "AST"])
    
    def parse_min(x):
        x = str(x).strip()
        if ":" in x:
            parts = x.split(":")
            return float(parts[0]) + float(parts[1]) / 60.0
        try:
            return float(x)
        except:
            return 0.0
            
    df_raw["MIN_FLOAT"] = df_raw["MIN"].apply(parse_min)
    
    # Aggregate career totals over the two seasons
    grouped = df_raw.groupby("PLAYER_ID").agg(
        TOTAL_MIN=("MIN_FLOAT", "sum"),
        TOTAL_REB=("REB", "sum"),
        TOTAL_AST=("AST", "sum")
    ).reset_index()
    
    # Calculate Per-36
    grouped["REB_PER_36"] = (grouped["TOTAL_REB"] / grouped["TOTAL_MIN"]) * 36
    grouped["AST_PER_36"] = (grouped["TOTAL_AST"] / grouped["TOTAL_MIN"]) * 36
    
    # Map back to unique players from V2 dataset
    df_registry = df_unique.merge(grouped, left_on="Player_ID", right_on="PLAYER_ID", how="left")
    
    # Apply Thresholds
    def assign_archetype(row):
        if pd.isna(row["TOTAL_MIN"]) or row["TOTAL_MIN"] < 200:
            return "UNKNOWN"
            
        reb = row["REB_PER_36"]
        ast = row["AST_PER_36"]
        
        if reb >= 8.5:
            return "BIG"
        elif ast >= 4.5:
            return "GUARD"
        else:
            return "WING"
            
    df_registry["POSITION_GROUP"] = df_registry.apply(assign_archetype, axis=1)
    df_registry["POSITION_SOURCE"] = "STAT_ARCHETYPE"
    
    # Format output
    df_out = df_registry[["Player_ID", "PLAYER_NAME", "REB_PER_36", "AST_PER_36", "TOTAL_MIN", "POSITION_GROUP", "POSITION_SOURCE"]].copy()
    df_out = df_out.rename(columns={"Player_ID": "PLAYER_ID"})
    
    # Round metrics for readability
    df_out["REB_PER_36"] = df_out["REB_PER_36"].round(2)
    df_out["AST_PER_36"] = df_out["AST_PER_36"].round(2)
    df_out["TOTAL_MIN"] = df_out["TOTAL_MIN"].round(1)
    
    out_path = ROOT / "data/experimental/player_position_registry_2024_25_2025_26.csv"
    os.makedirs(out_path.parent, exist_ok=True)
    df_out.to_csv(out_path, index=False)
    
    print_flush(f"\nDone! Registry saved to {out_path}")
    print_flush(f"Total Rows: {len(df_out)}")
    
    dist = df_out["POSITION_GROUP"].value_counts()
    print_flush("\nDistribution:")
    for k, v in dist.items():
        print_flush(f"  {k}: {v}")

if __name__ == "__main__":
    build_registry()
