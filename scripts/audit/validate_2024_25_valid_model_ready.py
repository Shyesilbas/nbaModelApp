import sys
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def main():
    print("============================================================")
    print("🔍 VALIDATING 2024-25 REGULAR SEASON VALID DATASETS 🔍")
    print("============================================================")
    
    win_path = ROOT / "data/experimental/team_win_model_ready_v2_2024_25_valid.csv"
    score_path = ROOT / "data/experimental/team_score_model_ready_v2_2024_25_valid.csv"
    v2_25_26_path = ROOT / "data/processed/team_model_ready_v2_2025_26.csv"
    
    if not win_path.exists():
        raise FileNotFoundError(f"Missing {win_path}")
    if not score_path.exists():
        raise FileNotFoundError(f"Missing {score_path}")
        
    df_win = pd.read_csv(win_path)
    df_score = pd.read_csv(score_path)
    
    errors = []
    
    # 1. Row counts
    if len(df_win) != 2460:
        errors.append(f"Win dataset row count {len(df_win)} != 2460")
    if len(df_score) != 1230:
        errors.append(f"Score dataset row count {len(df_score)} != 1230")
        
    # 2. Date ranges
    win_dates = pd.to_datetime(df_win["GAME_DATE"])
    if win_dates.min() < pd.Timestamp("2024-10-01") or win_dates.max() > pd.Timestamp("2025-07-01"):
        errors.append("Win dataset has out-of-bounds dates")
        
    score_dates = pd.to_datetime(df_score["GAME_DATE"])
    if score_dates.min() < pd.Timestamp("2024-10-01") or score_dates.max() > pd.Timestamp("2025-07-01"):
        errors.append("Score dataset has out-of-bounds dates")
        
    # 3. GAME_ID prefixes (must be 00224)
    df_win["GAME_ID"] = df_win["GAME_ID"].astype(str).str.zfill(10)
    df_score["GAME_ID"] = df_score["GAME_ID"].astype(str).str.zfill(10)
    
    win_prefixes = df_win["GAME_ID"].str[:5].unique()
    if set(win_prefixes) != {"00224"}:
        errors.append(f"Win dataset has invalid GAME_ID prefixes: {win_prefixes}")
        
    score_prefixes = df_score["GAME_ID"].str[:5].unique()
    if set(score_prefixes) != {"00224"}:
        errors.append(f"Score dataset has invalid GAME_ID prefixes: {score_prefixes}")
        
    # 4. Rows per GAME_ID
    win_counts = df_win.groupby("GAME_ID").size()
    if not (win_counts == 2).all():
        errors.append("Win dataset does not have exactly 2 rows per GAME_ID")
        
    score_counts = df_score.groupby("GAME_ID").size()
    if not (score_counts == 1).all():
        errors.append("Score dataset does not have exactly 1 row per GAME_ID")
        
    # 5. Targets
    if "WIN" not in df_win.columns:
        errors.append("WIN target missing from Win dataset")
    if "HOME_PTS" not in df_score.columns or "AWAY_PTS" not in df_score.columns:
        errors.append("HOME_PTS or AWAY_PTS target missing from Score dataset")
        
    # 6. Absence of player identity and leakage columns
    leakage = ["WL", "MIN", "PTS", "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT",
               "FTM", "FTA", "FT_PCT", "OREB", "DREB", "REB", "AST", "STL", "BLK",
               "TOV", "PF", "PLUS_MINUS", "PTS_ALLOWED", "PLAYER_ID", "PLAYER_NAME"]
               
    for col in leakage:
        if col in df_win.columns:
            errors.append(f"Leakage column {col} found in Win dataset")
        if col in df_score.columns and col not in ["HOME_PTS", "AWAY_PTS"]:
            errors.append(f"Leakage column {col} found in Score dataset")
            
    # 7. No 2025-26 data
    invalid_prefixes = {"00225", "00425", "00525"}
    if any(p in invalid_prefixes for p in win_prefixes):
        errors.append("Win dataset contains 2025-26 IDs")
    if any(p in invalid_prefixes for p in score_prefixes):
        errors.append("Score dataset contains 2025-26 IDs")
        
    if errors:
        print("❌ VALIDATION FAILED:")
        for err in errors:
            print(f"  - {err}")
        sys.exit(1)
        
    print("✅ VALIDATION PASSED!")
    print(f"Win dataset: {len(df_win)} rows, columns: {len(df_win.columns)}")
    print(f"Score dataset: {len(df_score)} rows, columns: {len(df_score.columns)}")

if __name__ == "__main__":
    main()
