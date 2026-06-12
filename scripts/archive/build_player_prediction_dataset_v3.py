import os
import pandas as pd
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def build_v3_dataset():
    print("--- Building V3 Player Prediction Dataset ---")
    
    # 1. Load V2 Dataset
    v2_path = ROOT / "data/experimental/player_model_ready_v2_extended.csv"
    if not v2_path.exists():
        print(f"Error: V2 dataset not found at {v2_path}")
        return
    df_v2 = pd.read_csv(v2_path)
    df_v2['GAME_DATE'] = pd.to_datetime(df_v2['GAME_DATE'])
    
    # 2. Load Position Registry
    reg_path = ROOT / "data/experimental/player_position_registry_2024_25_2025_26.csv"
    if not reg_path.exists():
        print(f"Error: Registry not found at {reg_path}")
        return
    df_reg = pd.read_csv(reg_path)
    
    # Merge exact position into V2 (Optional, but good for analysis)
    df_v2 = df_v2.merge(df_reg[["PLAYER_ID", "POSITION_GROUP"]], left_on="Player_ID", right_on="PLAYER_ID", how="left")
    df_v2 = df_v2.rename(columns={"POSITION_GROUP": "PLAYER_POSITION_GROUP"})
    
    # 3. Load Raw Player Games for calculating Team-level position allowed stats
    print("Loading raw player games...")
    df_raw_24 = pd.read_csv(ROOT / "data/raw/player_games/nba_player_games_2024_25_regular_and_playoffs.csv")
    df_raw_25 = pd.read_csv(ROOT / "data/raw/player_games/nba_player_games_2025_26_regular_and_playoffs.csv")
    df_raw = pd.concat([df_raw_24, df_raw_25], ignore_index=True)
    
    # Parse TEAM and OPP_TEAM from MATCHUP
    # Format: "LAL @ MIN" or "LAL vs. MIN"
    df_raw["TEAM"] = df_raw["MATCHUP"].str[:3]
    df_raw["OPP_TEAM"] = df_raw["MATCHUP"].str[-3:]
    df_raw['GAME_DATE'] = pd.to_datetime(df_raw['GAME_DATE'], format='mixed')
    
    # 4. Map Positions to Raw Data
    df_raw = df_raw.merge(df_reg[["PLAYER_ID", "POSITION_GROUP"]], left_on="Player_ID", right_on="PLAYER_ID", how="left")
    df_raw["POSITION_GROUP"] = df_raw["POSITION_GROUP"].fillna("UNKNOWN")
    
    # 5. Aggregate Scored Stats by GAME, TEAM, and POSITION
    print("Aggregating position stats per game...")
    pos_stats = df_raw.groupby(["Game_ID", "GAME_DATE", "TEAM", "OPP_TEAM", "POSITION_GROUP"]).agg({
        "PTS": "sum",
        "REB": "sum",
        "AST": "sum"
    }).reset_index()
    
    # 6. Pivot to have BIG, GUARD, WING columns
    pivot_stats = pos_stats.pivot_table(
        index=["Game_ID", "GAME_DATE", "TEAM", "OPP_TEAM"],
        columns="POSITION_GROUP",
        values=["PTS", "REB", "AST"],
        fill_value=0
    ).reset_index()
    
    # Flatten multi-index columns: e.g. PTS_BIG
    pivot_stats.columns = [f"{col[0]}_{col[1]}" if col[1] else col[0] for col in pivot_stats.columns]
    
    # 7. Convert "Scored by TEAM" to "Allowed by OPP_TEAM"
    # To compute what OPP_TEAM allowed, we just group by OPP_TEAM and roll over GAME_DATE
    print("Calculating rolling 10-game allowed stats...")
    
    # The team playing defense is OPP_TEAM.
    # So pivot_stats row represents: TEAM scored PTS_BIG against OPP_TEAM on GAME_DATE.
    # Therefore, OPP_TEAM allowed PTS_BIG on GAME_DATE.
    
    # We will sort by GAME_DATE and group by OPP_TEAM
    pivot_stats = pivot_stats.sort_values(["OPP_TEAM", "GAME_DATE"])
    
    # Define columns to roll
    stat_cols = [c for c in pivot_stats.columns if c.startswith("PTS_") or c.startswith("REB_") or c.startswith("AST_")]
    
    rolling_features = []
    
    for opp_team, group in pivot_stats.groupby("OPP_TEAM"):
        group = group.sort_values("GAME_DATE")
        
        # shift(1) to avoid target leakage (only looking at games BEFORE the current game)
        # rolling(10, min_periods=1) to get the last 10 games
        rolled = group[stat_cols].shift(1).rolling(window=10, min_periods=1).mean()
        
        # Rename columns to indicate OPP_ALLOWED_LAST_10
        rename_dict = {col: f"OPP_{col.split('_')[1]}_{col.split('_')[0]}_ALLOWED_LAST_10" for col in stat_cols} 
        # e.g., PTS_BIG -> OPP_BIG_PTS_ALLOWED_LAST_10
        rolled = rolled.rename(columns=rename_dict)
        
        # Add keys back
        rolled["Game_ID"] = group["Game_ID"]
        rolled["OPP_TEAM"] = opp_team
        
        rolling_features.append(rolled)
        
    df_rolling = pd.concat(rolling_features, ignore_index=True)
    
    # Check if "Game_ID" exists in df_v2, or if it is "GAME_ID"
    v2_game_col = "GAME_ID" if "GAME_ID" in df_v2.columns else "Game_ID"
    # Wait, in v2, the column is Game_ID or GAME_ID? Let's check df_v2.
    if "Game_ID" not in df_v2.columns and "GAME_ID" in df_v2.columns:
        df_rolling = df_rolling.rename(columns={"Game_ID": "GAME_ID"})
        v2_game_col = "GAME_ID"
    elif "GAME_ID" not in df_v2.columns and "Game_ID" in df_v2.columns:
        v2_game_col = "Game_ID"
    
    # 8. Merge into V2 to create V3
    print("Merging features into V3 dataset...")
    # df_v2 has OPPONENT_ABBREVIATION which maps to OPP_TEAM
    df_v3 = df_v2.merge(df_rolling, left_on=[v2_game_col, "OPPONENT_ABBREVIATION"], right_on=[v2_game_col, "OPP_TEAM"], how="left")
    
    # Drop redundant column
    if "OPP_TEAM" in df_v3.columns:
        df_v3 = df_v3.drop(columns=["OPP_TEAM"])
        
    # Backfill missing values for the first game of the season
    # Instead of backfill which is leaky, we can fill with season global average or 0
    # For a robust baseline, we fill NaN with the expanding mean of the OPP_TEAM, or just overall mean.
    # Actually, min_periods=1 handles everything except the very first game (which is NaN due to shift(1)).
    # We will group by OPPONENT_ABBREVIATION and bfill for the first game only.
    new_cols = [c for c in df_rolling.columns if c.endswith("_LAST_10")]
    for col in new_cols:
        df_v3[col] = df_v3.groupby("OPPONENT_ABBREVIATION")[col].transform(lambda x: x.bfill())
        df_v3[col] = df_v3[col].fillna(df_v3[col].mean()) # ultimate fallback
        
    # 9. Save V3 Dataset
    out_path = ROOT / "data/experimental/player_model_ready_v3_matchups.csv"
    os.makedirs(out_path.parent, exist_ok=True)
    
    df_v3 = df_v3.sort_values(["Player_ID", "GAME_DATE"]).reset_index(drop=True)
    df_v3.to_csv(out_path, index=False)
    
    print(f"Done! V3 Dataset saved to {out_path}")
    print(f"Total Rows: {len(df_v3)}")
    print(f"New Features added: {len(new_cols)}")
    print("Features:", ", ".join(new_cols[:3]) + " ...")

if __name__ == "__main__":
    build_v3_dataset()
