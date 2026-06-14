import os
import sys
import argparse
import json
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]

# Ensure project root is in path
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    from scipy.stats import ks_2samp
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False

def get_numeric_features(df):
    exclude = [
        "SEASON_ID", "GAME_ID", "GAME_DATE", "MATCHUP", "TEAM_NAME", 
        "TEAM_ABBREVIATION", "OPPONENT_ABBREVIATION", "TEAM_ID", "OPPONENT_ID",
        "WIN", "IS_HOME", "IS_PLAYOFF"
    ]
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    return [c for c in numeric_cols if c not in exclude]

def main():
    parser = argparse.ArgumentParser(description="Data Drift and Feature Leakage Detection Utility")
    parser.add_argument("--reference-season", type=str, default="2024-25", help="Baseline/reference season")
    parser.add_argument("--target-season", type=str, default="2025-26", help="Season to check for drift and leakage")
    parser.add_argument("--threshold", type=float, default=0.95, help="Correlation threshold for leakage detection")
    args = parser.parse_args()
    
    print("==================================================")
    print("  🔍 Data Drift & Feature Leakage Detector        ")
    print("==================================================")
    print(f"Reference Season: {args.reference_season}")
    print(f"Target Season:    {args.target_season}")
    print(f"Leakage Limit:    {args.threshold}")
    print("--------------------------------------------------")
    
    ref_file = ROOT / "data" / "processed" / f"team_model_ready_v3_{args.reference_season.replace('-', '_')}.csv"
    tgt_file = ROOT / "data" / "processed" / f"team_model_ready_v3_{args.target_season.replace('-', '_')}.csv"
    
    if not ref_file.exists():
        print(f"Error: Reference season file {ref_file} not found.")
        sys.exit(1)
        
    if not tgt_file.exists():
        print(f"Error: Target season file {tgt_file} not found.")
        sys.exit(1)
        
    df_ref = pd.read_csv(ref_file)
    df_tgt = pd.read_csv(tgt_file)
    
    features = get_numeric_features(df_ref)
    
    # Filter features that are also in target
    features = [f for f in features if f in df_tgt.columns]
    
    drift_report = []
    leakage_report = []
    
    print("\nScanning for Feature Leakage in Target Season...")
    # 1. Leakage detection (correlation with WIN, zero variance, NaNs)
    for f in features:
        # Check variance
        if df_tgt[f].var() == 0 or np.isnan(df_tgt[f].var()):
            leakage_report.append({
                "feature": f,
                "type": "Zero Variance",
                "detail": "Feature is constant or empty (all NaNs)."
            })
            continue
            
        # Check missingness
        missing_pct = df_tgt[f].isnull().mean()
        if missing_pct > 0.1:
            leakage_report.append({
                "feature": f,
                "type": "High Missingness",
                "detail": f"{missing_pct:.2%} missing values."
            })
            
        # Correlation with target
        if "WIN" in df_tgt.columns:
            corr = df_tgt[f].corr(df_tgt["WIN"])
            if not np.isnan(corr) and abs(corr) >= args.threshold:
                leakage_report.append({
                    "feature": f,
                    "type": "High Label Correlation",
                    "detail": f"Correlation with WIN is {corr:.4f} (potential post-tipoff leak)."
                })
                
    # 2. Drift detection (mean shift, std shift, KS test)
    print("Analyzing feature distribution drift...")
    for f in features:
        ref_data = df_ref[f].dropna()
        tgt_data = df_tgt[f].dropna()
        
        if len(ref_data) == 0 or len(tgt_data) == 0:
            continue
            
        ref_mean, ref_std = ref_data.mean(), ref_data.std()
        tgt_mean, tgt_std = tgt_data.mean(), tgt_data.std()
        
        # KS-Test
        if HAS_SCIPY:
            ks_stat, p_val = ks_2samp(ref_data, tgt_data)
        else:
            # Simple fallback metric: Normalized Mean Difference
            ks_stat = abs(ref_mean - tgt_mean) / (ref_std + 1e-9)
            p_val = 0.0 if ks_stat > 0.5 else 1.0
            
        is_drifted = p_val < 0.05 if HAS_SCIPY else ks_stat > 0.3
        
        if is_drifted:
            drift_report.append({
                "feature": f,
                "ref_mean": ref_mean,
                "tgt_mean": tgt_mean,
                "ref_std": ref_std,
                "tgt_std": tgt_std,
                "stat": ks_stat,
                "p_value": p_val
            })
            
    # Print findings
    print("\n--- Feature Leakage & Integrity Check ---")
    if not leakage_report:
        print("PASS: No significant leakage or feature integrity flaws detected.")
    else:
        print(f"{'Feature':<35} | {'Issue Type':<20} | {'Detail':<30}")
        print("-" * 90)
        for issue in leakage_report:
            print(f"{issue['feature']:<35} | {issue['type']:<20} | {issue['detail']:<30}")
            
    print("\n--- Feature Distribution Drift Scan ---")
    if not drift_report:
        print("PASS: No significant feature drift detected.")
    else:
        print(f"{'Feature':<35} | {'Ref Mean (Std)':<18} | {'Tgt Mean (Std)':<18} | {'KS Stat':<8} | {'p-val':<8}")
        print("-" * 95)
        # Show top drifted features
        sorted_drift = sorted(drift_report, key=lambda x: x["stat"] if HAS_SCIPY else x["stat"], reverse=True)
        for d in sorted_drift[:15]:
            ref_fmt = f"{d['ref_mean']:.2f} ({d['ref_std']:.2f})"
            tgt_fmt = f"{d['tgt_mean']:.2f} ({d['tgt_std']:.2f})"
            p_val_fmt = f"{d['p_value']:.4e}" if HAS_SCIPY else "N/A"
            print(f"{d['feature']:<35} | {ref_fmt:<18} | {tgt_fmt:<18} | {d['stat']:<8.4f} | {p_val_fmt:<8}")
        if len(sorted_drift) > 15:
            print(f"... and {len(sorted_drift) - 15} more drifted features.")
            
    # Save Report
    out_dir = ROOT / "reports" / "audits"
    out_dir.mkdir(parents=True, exist_ok=True)
    report_file = out_dir / f"drift_and_leakage_{args.reference_season}_vs_{args.target_season}.md"
    
    md_lines = [
        f"# Data Quality, Drift & Leakage Audit Report",
        f"Generated on: {datetime.now().isoformat()}",
        f"Reference Season: {args.reference_season}",
        f"Target Season: {args.target_season}",
        "",
        "## Feature Leakage & Integrity Issues",
    ]
    
    if not leakage_report:
        md_lines.append("No leakage or feature integrity issues found.")
    else:
        md_lines.extend([
            "| Feature | Issue Type | Detail |",
            "| --- | --- | --- |"
        ])
        for issue in leakage_report:
            md_lines.append(f"| {issue['feature']} | {issue['type']} | {issue['detail']} |")
            
    md_lines.extend([
        "",
        "## Feature Distribution Drift Analysis",
        "Feature drift indicates a distribution shift between training and evaluation seasons.",
        ""
    ])
    
    if not drift_report:
        md_lines.append("No features showed statistically significant distribution drift.")
    else:
        md_lines.extend([
            "| Feature | Ref Mean (Std) | Tgt Mean (Std) | KS Statistic | p-value |",
            "| --- | --- | --- | --- | --- |"
        ])
        for d in sorted_drift:
            ref_fmt = f"{d['ref_mean']:.4f} ({d['ref_std']:.4f})"
            tgt_fmt = f"{d['tgt_mean']:.4f} ({d['tgt_std']:.4f})"
            p_val_fmt = f"{d['p_value']:.4e}" if HAS_SCIPY else "N/A"
            md_lines.append(f"| {d['feature']} | {ref_fmt} | {tgt_fmt} | {d['stat']:.4f} | {p_val_fmt} |")
            
    report_file.write_text("\n".join(md_lines), encoding="utf-8")
    print(f"\nWritten complete drift report to: {report_file}")

if __name__ == "__main__":
    main()
