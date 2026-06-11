import os
import sys
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT))

def run_validation():
    dataset_path = ROOT / "data/experimental/player_model_ready_pts_reb_ast_pra_2024_25_2025_26.csv"
    
    print("--- Player Prediction Dataset Validation ---")
    if not dataset_path.exists():
        print(f"FAIL: Physical file does not exist at {dataset_path}")
        return False
        
    print(f"PASS: Physical file exists.")
    df = pd.read_csv(dataset_path, dtype={"GAME_ID": str, "Game_ID": str})
    
    print(f"Row count: {len(df)}")
    
    player_col = "Player_ID" if "Player_ID" in df.columns else "PLAYER_ID"
    if player_col not in df.columns:
        print("FAIL: Missing Player_ID column")
        return False
        
    unique_players = df[player_col].nunique()
    print(f"Unique players: {unique_players}")
    
    if "GAME_ID" not in df.columns:
        print("FAIL: Missing GAME_ID column")
        return False
        
    unique_games = df["GAME_ID"].nunique()
    print(f"Unique games: {unique_games}")
    
    # Check for duplicate PLAYER_ID + GAME_ID
    dupes = df.duplicated(subset=[player_col, "GAME_ID"]).sum()
    if dupes > 0:
        print(f"FAIL: Found {dupes} duplicate PLAYER_ID + GAME_ID rows")
    else:
        print("PASS: No duplicate PLAYER_ID + GAME_ID rows")
        
    # Check target columns
    targets = ["TARGET_PTS", "TARGET_REB", "TARGET_AST", "TARGET_PRA"]
    missing_targets = [t for t in targets if t not in df.columns]
    if missing_targets:
        print(f"FAIL: Missing target columns: {missing_targets}")
    else:
        print("PASS: Target columns exist")
        
    # Check for null targets
    null_targets = df[targets].isnull().sum().sum()
    if null_targets > 0:
        print(f"FAIL: Found {null_targets} null values in target columns")
    else:
        print("PASS: Targets are non-null")
        
    # Check for leakage
    leakage_cols = ["MIN", "PTS", "REB", "AST", "PLUS_MINUS"]
    found_leakage = [c for c in leakage_cols if c in df.columns and not c.startswith("TARGET_")]
    if found_leakage:
        print(f"FAIL: Found leakage columns in features: {found_leakage}")
    else:
        print("PASS: No current-game stat leakage in feature columns")
        
    # Check GAME_ID prefix consistency (must be 10 characters string, often starts with 00224, 00225)
    df["GAME_ID"] = df["GAME_ID"].astype(str)
    invalid_game_ids = df[df["GAME_ID"].str.len() != 10]
    if len(invalid_game_ids) > 0:
        print(f"WARN: Found {len(invalid_game_ids)} GAME_IDs that are not 10 characters long. Example: {invalid_game_ids['GAME_ID'].iloc[0]}")
    else:
        print("PASS: All GAME_IDs are 10 characters long")
        
    # Check date ranges
    if "GAME_DATE" in df.columns:
        min_date = df["GAME_DATE"].min()
        max_date = df["GAME_DATE"].max()
        print(f"Date range: {min_date} to {max_date}")
        
    # Missing value summary for features
    print("\nMissing value summary (top 10):")
    missing_pct = (df.isnull().sum() / len(df) * 100).sort_values(ascending=False).head(10)
    for col, pct in missing_pct.items():
        if pct > 0:
            print(f"  {col}: {pct:.2f}%")
            
    print("\nValidation complete.")
    return True

if __name__ == "__main__":
    run_validation()
