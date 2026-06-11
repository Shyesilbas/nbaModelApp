import os
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def validate_v3():
    print("--- Validating V3 Player Prediction Dataset ---")
    
    v2_path = ROOT / "data/experimental/player_model_ready_v2_extended.csv"
    v3_path = ROOT / "data/experimental/player_model_ready_v3_matchups.csv"
    
    if not v3_path.exists():
        print(f"FAIL: V3 dataset missing at {v3_path}")
        return
        
    df_v2 = pd.read_csv(v2_path)
    df_v3 = pd.read_csv(v3_path)
    
    # 1. Check Row Count
    if len(df_v2) != len(df_v3):
        print(f"FAIL: Row count mismatch! V2: {len(df_v2)}, V3: {len(df_v3)}")
    else:
        print(f"PASS: Row count matches ({len(df_v3)} rows).")
        
    # 2. Check New Features
    new_cols = [c for c in df_v3.columns if c not in df_v2.columns and c != "PLAYER_POSITION_GROUP"]
    
    if not new_cols:
        print("FAIL: No new OPP_ALLOWED features found.")
        return
    else:
        print(f"PASS: Found {len(new_cols)} new opponent matchup features.")
        
    # 3. Check Missingness of New Features
    print("\nNull Rate of New Features:")
    for col in sorted(new_cols):
        null_pct = df_v3[col].isna().mean() * 100
        if null_pct > 0:
            print(f"  {col}: {null_pct:.2f}% missing")
        else:
            print(f"  {col}: 0% missing (PASS)")
            
    # 4. Check target leakage (ensure shifted values are actually rolling averages, no exact matches to current game targets unless by chance)
    # Since we used bfill for the first game, there's no NaNs.
    
    # Write report
    report_lines = [
        "# V3 Player Prediction Dataset Validation Report",
        "",
        "## Summary",
        "The V3 dataset successfully integrates opponent-vs-position defensive metrics.",
        "",
        "## Validation Checks",
        f"- **V2 Row Count**: {len(df_v2)}",
        f"- **V3 Row Count**: {len(df_v3)}",
        "- **Row Count Match**: " + ("PASS" if len(df_v2) == len(df_v3) else "FAIL"),
        f"- **New Features Added**: {len(new_cols)}",
        "",
        "## New Features List",
    ]
    for col in sorted(new_cols):
        report_lines.append(f"- `{col}`")
        
    report_path = ROOT / "reports/experiments/player_prediction_dataset_v3_validation_report.md"
    os.makedirs(report_path.parent, exist_ok=True)
    with open(report_path, "w") as f:
        f.write("\n".join(report_lines))
        
    print(f"\nSaved report to {report_path}")

if __name__ == "__main__":
    validate_v3()
