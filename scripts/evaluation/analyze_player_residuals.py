from __future__ import annotations

import os
import json
import sys
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.metrics import mean_absolute_error

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

REPORT_DIR = ROOT / "reports" / "evaluation"
REPORT_PATH = REPORT_DIR / "player_v8_residual_analysis.md"
JSON_PATH = REPORT_DIR / "player_v8_residual_analysis.json"


def signed_metrics(actual: pd.Series, pred: pd.Series) -> dict:
    err = pred - actual
    return {
        "mae": float(mean_absolute_error(actual, pred)),
        "mean_error": float(err.mean()),
        "median_error": float(err.median()),
        "rmse": float(np.sqrt(np.mean(np.square(err)))),
        "p10_error": float(err.quantile(0.10)),
        "p90_error": float(err.quantile(0.90)),
    }


def main():
    print("--- Player V8 LightGBM Residual & Segment Analysis ---")
    
    # Load player dataset
    data_path = ROOT / "data/experimental/player_model_ready_v4_usg.csv"
    if not data_path.exists():
        raise FileNotFoundError(f"Player V4 dataset not found at {data_path}")
        
    df = pd.read_csv(data_path)
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])
    
    # Load V8 models and features
    exp_dir = ROOT / "models/experimental"
    features_path = exp_dir / "player_v8_features.pkl"
    if not features_path.exists():
        raise FileNotFoundError(f"player_v8_features.pkl not found at {features_path}")
        
    features = joblib.load(features_path)
    
    targets = {
        "pts": "TARGET_PTS",
        "reb": "TARGET_REB",
        "ast": "TARGET_AST"
    }
    
    # Fit the train-test split date (80% chronological split, just like in training)
    split_date = pd.to_datetime(df["GAME_DATE"]).quantile(0.8)
    print(f"Computed Split Date: {split_date.strftime('%Y-%m-%d')}")
    
    # Filter to holdout test set
    test_df = df[df["GAME_DATE"] > split_date].copy()
    print(f"Holdout dataset size: {len(test_df)} rows")
    
    # Predict using the newly trained V8 models from models/experimental
    for short_name, target_col in targets.items():
        model_path = exp_dir / f"player_v8_lgb_{short_name}.pkl"
        if not model_path.exists():
            raise FileNotFoundError(f"Model missing: {model_path}")
            
        model = joblib.load(model_path)
        test_df[f"PRED_{short_name.upper()}"] = model.predict(test_df[features])
        
    # Segment definitions
    segments = {
        "all": lambda x: pd.Series(True, index=x.index),
        "regular_season": lambda x: x["IS_PLAYOFF"].astype(int) == 0,
        "playoffs": lambda x: x["IS_PLAYOFF"].astype(int) == 1,
        "home": lambda x: x["IS_HOME"].astype(int) == 1,
        "away": lambda x: x["IS_HOME"].astype(int) == 0,
        "position_guard": lambda x: x["PLAYER_POSITION_GROUP"] == "GUARD",
        "position_wing": lambda x: x["PLAYER_POSITION_GROUP"] == "WING",
        "position_big": lambda x: x["PLAYER_POSITION_GROUP"] == "BIG",
        "high_usage": lambda x: x["USG_PCT_LAST_10"] >= 25.0,
        "med_usage": lambda x: (x["USG_PCT_LAST_10"] >= 15.0) & (x["USG_PCT_LAST_10"] < 25.0),
        "low_usage": lambda x: x["USG_PCT_LAST_10"] < 15.0,
        "heavy_minutes": lambda x: x["MIN_EMA_10"] >= 30.0,
        "rotation_minutes": lambda x: (x["MIN_EMA_10"] >= 15.0) & (x["MIN_EMA_10"] < 30.0),
        "light_minutes": lambda x: x["MIN_EMA_10"] < 15.0,
    }
    
    results = {}
    for seg_name, fn in segments.items():
        mask = fn(test_df)
        sub_df = test_df[mask]
        
        if len(sub_df) < 30:
            print(f"Skipping segment '{seg_name}' due to low sample size ({len(sub_df)})")
            continue
            
        seg_res = {
            "rows": int(len(sub_df))
        }
        for short_name, target_col in targets.items():
            metrics = signed_metrics(sub_df[target_col], sub_df[f"PRED_{short_name.upper()}"])
            seg_res[short_name] = metrics
            
        results[seg_name] = seg_res
        
    # Generate tables
    rows = []
    for name, data in results.items():
        rows.append({
            "segment": name,
            "rows": data["rows"],
            "pts_mae": data["pts"]["mae"],
            "pts_bias": data["pts"]["mean_error"],
            "reb_mae": data["reb"]["mae"],
            "reb_bias": data["reb"]["mean_error"],
            "ast_mae": data["ast"]["mae"],
            "ast_bias": data["ast"]["mean_error"],
        })
        
    def markdown_table(rows: list[dict], columns: list[str]) -> str:
        lines = ["| " + " | ".join(columns) + " |", "| " + " | ".join(["---"] * len(columns)) + " |"]
        for r in rows:
            vals = []
            for col in columns:
                value = r.get(col)
                vals.append(f"{value:.4f}" if isinstance(value, float) else str(value))
            lines.append("| " + " | ".join(vals) + " |")
        return "\n".join(lines)

    table_cols = ["segment", "rows", "pts_mae", "pts_bias", "reb_mae", "reb_bias", "ast_mae", "ast_bias"]
    table_str = markdown_table(rows, table_cols)
    
    # Save JSON metrics
    json_data = {
        "split_date": split_date.strftime("%Y-%m-%d"),
        "metrics": results
    }
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    JSON_PATH.write_text(json.dumps(json_data, indent=2), encoding="utf-8")
    
    # Build report
    report = [
        "# Player Prediction V8 Residual & Segment Analysis",
        "",
        f"Chronological holdout: player games after {split_date.strftime('%Y-%m-%d')}.",
        "Signed error is `prediction - actual` (positive bias means over-predicting).",
        "",
        "## Holdout Segment Performance",
        table_str,
        "",
        "## Key Findings & Bias Observations",
        "",
        "### 1. Position-Specific Bias Analysis",
        f"- **Guards**: PTS Bias = {results['position_guard']['pts']['mean_error']:.4f}, AST Bias = {results['position_guard']['ast']['mean_error']:.4f}",
        f"- **Wings**: PTS Bias = {results['position_wing']['pts']['mean_error']:.4f}, REB Bias = {results['position_wing']['reb']['mean_error']:.4f}",
        f"- **Bigs**: REB Bias = {results['position_big']['reb']['mean_error']:.4f}, PTS Bias = {results['position_big']['pts']['mean_error']:.4f}",
        "",
        "### 2. Usage & Minutes Segment Analysis",
        f"- **High Usage players (>=25% USG)**: PTS Bias = {results['high_usage']['pts']['mean_error']:.4f} (under-predicting star players if negative, over-predicting if positive).",
        f"- **Low Usage players (<15% USG)**: PTS Bias = {results['low_usage']['pts']['mean_error']:.4f}.",
        f"- **Heavy Minutes players (>=30 MIN)**: PTS Bias = {results['heavy_minutes']['pts']['mean_error']:.4f}.",
        "",
        "### 3. Playoff vs Regular Season Divergence",
        f"- **Regular Season**: PTS Bias = {results['regular_season']['pts']['mean_error']:.4f}, REB Bias = {results['regular_season']['reb']['mean_error']:.4f}, AST Bias = {results['regular_season']['ast']['mean_error']:.4f}",
        f"- **Playoffs**: PTS Bias = {results['playoffs']['pts']['mean_error']:.4f}, REB Bias = {results['playoffs']['reb']['mean_error']:.4f}, AST Bias = {results['playoffs']['ast']['mean_error']:.4f}",
        "",
    ]
    REPORT_PATH.write_text("\n".join(report), encoding="utf-8")
    print(f"Residual analysis report saved to {REPORT_PATH}")
    print(f"Residual analysis JSON saved to {JSON_PATH}")


if __name__ == "__main__":
    main()
