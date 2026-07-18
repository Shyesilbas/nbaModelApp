import os
import sys
import json
import argparse
import joblib
import pandas as pd
import numpy as np
from pathlib import Path
import matplotlib.pyplot as plt

# Try to import shap, if fails handle it gracefully so we know it's installed
try:
    import shap
except ImportError:
    print("Error: shap library is not installed. Please run `pip install shap matplotlib`")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.build_matchup_features import build_features

EXPECTED_TOP_FEATURES_WIN = [
    "ELO_DIFF", "ABS_ELO_DIFF", "REST_DIFF", "PLAYOFF_ELO_DIFF", "WINRATE_DIFF_LAST_10",
    "HOME_WINRATE_LAST_5", "AWAY_WINRATE_LAST_5", "CURRENT_VENUE_WINRATE_LAST_5"
]

def load_win_model_pipeline(model_ver):
    win_model_path = ROOT / f"models/win_probability_model_{model_ver}.pkl"
    win_features_path = ROOT / f"models/feature_columns_{model_ver}.json"
    
    if not win_model_path.exists() or not win_features_path.exists():
        # Fallback to production folder if it exists there
        win_model_path = ROOT / f"models/production/win_probability_model_{model_ver}.pkl"
        win_features_path = ROOT / f"models/production/feature_columns_{model_ver}.json"
        
    if not win_model_path.exists() or not win_features_path.exists():
        raise FileNotFoundError(f"Win model {model_ver} not found.")
        
    model = joblib.load(win_model_path)
    features = json.loads(win_features_path.read_text())
    
    # Extract the base LogisticRegression pipeline from CalibratedClassifierCV
    if hasattr(model, "estimator"):
        pipeline = model.estimator
    elif hasattr(model, "base_estimator"):
        pipeline = model.base_estimator
    else:
        pipeline = model
        
    return pipeline, features, model

def analyze_win_model(home, away, date, model_ver, output_dir):
    print("\n--- WIN PROBABILITY MODEL (SHAP) ---")
    pipeline, features, cal_model = load_win_model_pipeline(model_ver)
    
    # Build single local inference row
    raw_feats = build_features(home, away, date)
    row = [raw_feats.get(c, 0.0) for c in features]
    X_local = pd.DataFrame([row], columns=features)
    
    # Get base LogisticRegression model and scaler
    scaler = pipeline.named_steps.get("scaler")
    imputer = pipeline.named_steps.get("imputer")
    clf = pipeline.named_steps.get("clf")
    
    if not clf:
        print("Cannot find 'clf' in pipeline.")
        return
        
    # Transform local X
    X_imp = imputer.transform(X_local) if imputer else X_local
    X_scaled = scaler.transform(X_imp) if scaler else X_imp
    
    # Provide a background dataset (we'll just use zeros or a dummy since LinearExplainer with Independent masker can use a small background)
    # Ideally we load a sample of the training data. For simplicity, we use the local row as background to just get the coefficients
    explainer = shap.LinearExplainer(clf, X_scaled)
    shap_values_raw = explainer.shap_values(X_scaled)
    
    base_val = explainer.expected_value
    if isinstance(base_val, np.ndarray):
        base_val = base_val[0]
        
    shap_vals = shap_values_raw[0] if isinstance(shap_values_raw, list) else shap_values_raw
    if len(shap_vals.shape) > 1:
        shap_vals = shap_vals[0]
        
    # Build feature importance array
    importances = []
    for i, col in enumerate(features):
        importances.append({
            "feature": col,
            "value": float(row[i]),
            "impact": float(shap_vals[i]),
            "direction": "positive" if shap_vals[i] > 0 else "negative"
        })
        
    # Sort by absolute impact
    importances.sort(key=lambda x: abs(x["impact"]), reverse=True)
    
    # Leakage check warning
    print("\n[LEAKAGE CHECK]")
    top_5 = importances[:5]
    unexpected = [f["feature"] for f in top_5 if not any(exp in f["feature"] for exp in EXPECTED_TOP_FEATURES_WIN)]
    if unexpected:
        print(f"⚠️ UNEXPECTED HIGH IMPORTANCE FEATURES DETECTED: {unexpected}")
        print("Please investigate if these features suffer from data leakage.")
    else:
        print("✅ Top features align with expected domain knowledge.")
        
    # Calibration shift
    base_pred_logit = base_val + sum(f["impact"] for f in importances)
    base_pred_prob = 1 / (1 + np.exp(-base_pred_logit))
    
    final_prob = float(cal_model.predict_proba(X_local)[0][1])
    calibration_shift = final_prob - base_pred_prob
    
    print(f"\nBase Model Prob (Uncalibrated): {base_pred_prob:.4f}")
    print(f"Final Model Prob (Calibrated) : {final_prob:.4f}")
    print(f"Isotonic Calibration Shift    : {calibration_shift:+.4f}\n")
    
    print("Top 5 Contributing Features (Pre-Calibration):")
    for f in top_5:
        print(f"  {f['direction'].ljust(8)} | {f['impact']:+0.4f} | {f['feature']} (val: {f['value']:.2f})")
        
    # Generate Plot
    try:
        plt.figure(figsize=(10, 6))
        # local waterfall plot
        shap.waterfall_plot(shap.Explanation(values=shap_vals, base_values=base_val, data=row, feature_names=features), show=False)
        plt.title(f"Win Probability local SHAP (Pre-Calibration) {away} @ {home}")
        plt.tight_layout()
        plot_path = output_dir / f"win_shap_waterfall_{away}_{home}.png"
        plt.savefig(plot_path)
        plt.close()
        print(f"Saved local plot to {plot_path}")
    except Exception as e:
        print("Could not generate waterfall plot:", e)
        
    return {
        "base_probability": base_pred_prob,
        "final_probability": final_prob,
        "calibration_shift": calibration_shift,
        "top_factors": importances[:10]
    }

def main():
    parser = argparse.ArgumentParser(description="NBA Model SHAP Analysis")
    parser.add_argument("--home", required=True, help="Home team abbreviation")
    parser.add_argument("--away", required=True, help="Away team abbreviation")
    parser.add_argument("--date", required=True, help="Game date (YYYY-MM-DD)")
    parser.add_argument("--model", default="v9", help="Model version")
    args = parser.parse_args()

    out_dir = ROOT / "reports" / "shap"
    out_dir.mkdir(parents=True, exist_ok=True)
    
    win_data = analyze_win_model(args.home, args.away, args.date, args.model, out_dir)
    
    result = {
        "game": f"{args.away} @ {args.home} ({args.date})",
        "win_probability_shap": win_data
    }
    
    with open(out_dir / f"shap_explanation_{args.away}_{args.home}_{args.date}.json", "w") as f:
        json.dump(result, f, indent=2)

if __name__ == "__main__":
    main()
