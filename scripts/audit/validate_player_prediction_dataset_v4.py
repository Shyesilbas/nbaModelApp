import os
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def validate_v4():
    print("--- Validating V4 Player Prediction Dataset ---")
    
    v3_path = ROOT / "data/experimental/player_model_ready_v3_matchups.csv"
    v4_path = ROOT / "data/experimental/player_model_ready_v4_usg.csv"
    
    if not v4_path.exists():
        print(f"FAIL: V4 dataset missing at {v4_path}")
        return
        
    df_v3 = pd.read_csv(v3_path)
    df_v4 = pd.read_csv(v4_path)
    
    # 1. Check Row Count
    if len(df_v3) != len(df_v4):
        print(f"FAIL: Row count mismatch! V3: {len(df_v3)}, V4: {len(df_v4)}")
    else:
        print(f"PASS: Row count matches ({len(df_v4)} rows).")
        
    # 2. Check New Features
    usg_cols = ["USG_PCT_LAST_3", "USG_PCT_LAST_10", "USG_PCT_EMA_5", "USG_PCT_EMA_10", "USG_PCT_STD_LAST_10", "USG_PCT_TREND"]
    missing_cols = [col for col in usg_cols if col not in df_v4.columns]
    
    if missing_cols:
        print(f"FAIL: Missing expected V4 features: {missing_cols}")
        return
    else:
        print(f"PASS: All {len(usg_cols)} usage rate features are present.")
        
    # 3. Check Null Rates
    print("\nNull Rate of V4 Features:")
    has_nulls = False
    for col in usg_cols:
        null_pct = df_v4[col].isna().mean() * 100
        if null_pct > 0:
            print(f"  {col}: {null_pct:.2f}% missing")
            has_nulls = True
        else:
            print(f"  {col}: 0% missing (PASS)")
            
    # 4. Check for Target Leakages
    leakages = [col for col in df_v4.columns if col in ["USG_PCT", "MIN", "FGA", "FTA", "TOV"]]
    if leakages:
        print(f"FAIL: Target leakages found in dataset columns: {leakages}")
    else:
        print("PASS: No immediate target leakage columns found.")
        
    # Write report
    report_lines = [
        "# V4 Player Prediction Dataset Validation Report",
        "",
        "## Summary",
        "The V4 player dataset successfully incorporates rolling Usage Rate (USG_PCT) features to capture roster and rotation changes.",
        "",
        "## Validation Checks",
        f"- **V3 Row Count**: {len(df_v3)}",
        f"- **V4 Row Count**: {len(df_v4)}",
        "- **Row Count Match**: " + ("PASS" if len(df_v3) == len(df_v4) else "FAIL"),
        "- **New Usage Rate Features**: " + ("PASS" if not missing_cols else "FAIL"),
        "- **Null Rate Check**: " + ("FAIL" if has_nulls else "PASS"),
        "- **Leakage Check**: " + ("FAIL" if leakages else "PASS"),
        "",
        "## New Features List",
    ]
    for col in usg_cols:
        report_lines.append(f"- `{col}`")
        
    report_path = ROOT / "reports/experiments/player_prediction_dataset_v4_validation_report.md"
    os.makedirs(report_path.parent, exist_ok=True)
    with open(report_path, "w") as f:
        f.write("\n".join(report_lines))
        
    print(f"\nSaved validation report to {report_path}")

if __name__ == "__main__":
    validate_v4()
