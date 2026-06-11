import os
import sys
import argparse
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT))

def load_player_features(season):
    if season == "2024_25":
        features_path = ROOT / "data/experimental/player_games_features_2024_25.csv"
    else:
        features_path = ROOT / "data/features/player_games_features_2025_26.csv"
        
    if not features_path.exists():
        raise FileNotFoundError(f"Player features for {season} not found at {features_path}.")
        
    df = pd.read_csv(features_path)
    
    # Handle GAME_ID column properly
    if "GAME_ID" in df.columns and "Game_ID" in df.columns:
        df = df.drop(columns=["Game_ID"])
    elif "Game_ID" in df.columns and "GAME_ID" not in df.columns:
        df = df.rename(columns={"Game_ID": "GAME_ID"})
        
    if "GAME_ID" in df.columns:
        # Some are like 0022501200, some like 22500253
        # Ensure it's a 10-character string
        df["GAME_ID"] = df["GAME_ID"].astype(str).apply(lambda x: x.split('.')[0].zfill(10))
        
    # Standardize date
    if "GAME_DATE" in df.columns:
        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"]).dt.strftime("%Y-%m-%d")
        
    return df

def build_dataset():
    print("Loading player features for 2024-25...")
    df_24 = load_player_features("2024_25")
    print(f"Loaded 2024-25: {len(df_24)} rows.")
    
    print("Loading player features for 2025-26...")
    df_25 = load_player_features("2025_26")
    print(f"Loaded 2025-26: {len(df_25)} rows.")
    
    df_all = pd.concat([df_24, df_25], ignore_index=True)
    
    print(f"Combined shape: {df_all.shape}")
    
    # We need TARGET_PTS, TARGET_REB, TARGET_AST, TARGET_PRA
    # Map current game PTS, REB, AST to targets
    df_all["TARGET_PTS"] = df_all["PTS"]
    df_all["TARGET_REB"] = df_all["REB"]
    df_all["TARGET_AST"] = df_all["AST"]
    df_all["TARGET_PRA"] = df_all["PTS"] + df_all["REB"] + df_all["AST"]
    
    # Remove leakage columns (current game stats)
    # The current MIN, FGM, FGA, FG_PCT, FG3M, FG3A, FG3_PCT, FTM, FTA, FT_PCT, OREB, DREB, REB, AST, STL, BLK, TOV, PF, PTS, PLUS_MINUS
    leakage_cols = [
        "MIN", "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT", 
        "FTM", "FTA", "FT_PCT", "OREB", "DREB", "REB", "AST", 
        "STL", "BLK", "TOV", "PF", "PTS", "PLUS_MINUS"
    ]
    
    # We want to keep features like PTS_LAST_5, MIN_LAST_5, IS_HOME, OPPONENT_ABBREVIATION, DAYS_REST, IS_B2B
    drop_cols = [col for col in leakage_cols if col in df_all.columns]
    df_ready = df_all.drop(columns=drop_cols)
    
    # Drop rows where target is null (did not play / missing data)
    initial_len = len(df_ready)
    df_ready = df_ready.dropna(subset=["TARGET_PTS", "TARGET_REB", "TARGET_AST", "TARGET_PRA"])
    print(f"Dropped {initial_len - len(df_ready)} rows with null targets. Remaining: {len(df_ready)}")
    
    output_path = ROOT / "data/experimental/player_model_ready_pts_reb_ast_pra_2024_25_2025_26.csv"
    os.makedirs(output_path.parent, exist_ok=True)
    df_ready.to_csv(output_path, index=False)
    
    print(f"Successfully saved player prediction dataset to {output_path}")

if __name__ == "__main__":
    build_dataset()
