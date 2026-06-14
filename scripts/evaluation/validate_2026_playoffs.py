from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.evaluation.evaluate_v8_segments import add_location_features, load_team_model_ready


def signed_metrics(actual: pd.Series, pred: pd.Series) -> dict:
    err = pred - actual
    return {
        "mae": float(mean_absolute_error(actual, pred)),
        "mean_error": float(err.mean()),
        "rmse": float(np.sqrt(np.mean(np.square(err)))),
    }


def get_indicator_df(df: pd.DataFrame) -> pd.DataFrame:
    indicators = pd.DataFrame(index=df.index)
    indicators["is_playoff"] = (df["IS_PLAYOFF"].astype(int) == 1).astype(float)
    indicators["home_b2b"] = (df["IS_B2B"].astype(int) == 1).astype(float)
    indicators["away_b2b"] = (df["OPP_IS_B2B"].astype(int) == 1).astype(float)
    indicators["home_rest_advantage"] = (df["DAYS_REST"] > df["OPP_DAYS_REST"]).astype(float)
    indicators["away_rest_advantage"] = (df["OPP_DAYS_REST"] > df["DAYS_REST"]).astype(float)
    return indicators


def run_evaluation() -> None:
    # 1. Load team data and filter specifically for 2025-26 Playoffs
    df = load_team_model_ready()
    df = add_location_features(df)
    
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])
    
    # Filter: Home games, 2025-26 Playoffs
    playoff_26 = df[
        (df["IS_HOME"].astype(bool)) & 
        (df["IS_PLAYOFF"].astype(int) == 1) & 
        (df["GAME_DATE"] >= "2026-04-10")
    ].copy()
    
    playoff_26 = playoff_26.dropna(subset=["PACE", "OFF_RTG", "DEF_RTG", "PACE_LAST_5", "OFF_RTG_LAST_5", "DEF_RTG_LAST_5"])
    
    # Compute actual scores
    playoff_26["ACTUAL_HOME_PTS"] = playoff_26["PACE"] * playoff_26["OFF_RTG"] / 100.0
    playoff_26["ACTUAL_AWAY_PTS"] = playoff_26["PACE"] * playoff_26["DEF_RTG"] / 100.0
    playoff_26["ACTUAL_TOTAL"] = playoff_26["ACTUAL_HOME_PTS"] + playoff_26["ACTUAL_AWAY_PTS"]
    playoff_26["ACTUAL_MARGIN"] = playoff_26["ACTUAL_HOME_PTS"] - playoff_26["ACTUAL_AWAY_PTS"]

    # 2. Get Away Team Predictions perspective (needed for Away RTG)
    away_all = df[~df["IS_HOME"].astype(bool)].copy()
    away_all = away_all[
        (away_all["IS_PLAYOFF"].astype(int) == 1) & 
        (away_all["GAME_DATE"] >= "2026-04-10")
    ]
    
    # --- EVALUATE V8 (No Correction) ---
    v8_meta = json.loads((ROOT / "models" / "production" / "score_model_v8_metadata.json").read_text())
    v8_pace_model = joblib.load(ROOT / "models" / "production" / "score_model_v8_pace.pkl")
    v8_home_model = joblib.load(ROOT / "models" / "production" / "score_model_v8_home_rtg.pkl")
    v8_away_model = joblib.load(ROOT / "models" / "production" / "score_model_v8_away_rtg.pkl")
    v8_margin_model = joblib.load(ROOT / "models" / "production" / "score_model_v8_margin.pkl")

    v8_home = playoff_26.copy()
    v8_home["PRED_PACE"] = v8_pace_model.predict(v8_home[v8_meta["pace_features"]])
    v8_home["PRED_HOME_RTG"] = v8_home["PRED_HOME_RTG"] = v8_home_model.predict(v8_home[v8_meta["home_off_rtg_features"]])
    v8_home["PRED_MARGIN"] = v8_margin_model.predict(v8_home[v8_meta["margin_features"]])

    v8_away_eval = away_all[["GAME_ID"] + v8_meta["away_off_rtg_features"]].copy()
    v8_away_eval["PRED_AWAY_RTG"] = v8_away_model.predict(v8_away_eval[v8_meta["away_off_rtg_features"]])

    v8_eval = v8_home.merge(v8_away_eval[["GAME_ID", "PRED_AWAY_RTG"]], on="GAME_ID", how="inner")
    v8_eval["PRED_TOTAL_RAW"] = v8_eval["PRED_PACE"] * (v8_eval["PRED_HOME_RTG"] + v8_eval["PRED_AWAY_RTG"]) / 100.0
    
    # V8 predictions
    v8_pred_home = (v8_eval["PRED_TOTAL_RAW"] + v8_eval["PRED_MARGIN"]) / 2.0
    v8_pred_away = (v8_eval["PRED_TOTAL_RAW"] - v8_eval["PRED_MARGIN"]) / 2.0
    v8_pred_total = v8_pred_home + v8_pred_away
    v8_pred_margin = v8_pred_home - v8_pred_away

    v8_metrics = {
        "total": signed_metrics(v8_eval["ACTUAL_TOTAL"], v8_pred_total),
        "margin": signed_metrics(v8_eval["ACTUAL_MARGIN"], v8_pred_margin),
    }

    # --- EVALUATE V9 (Ridge Corrected) ---
    v9_meta = json.loads((ROOT / "models" / "production" / "score_model_v9_metadata.json").read_text())
    v9_pace_model = joblib.load(ROOT / "models" / "production" / "score_model_v9_pace.pkl")
    v9_home_model = joblib.load(ROOT / "models" / "production" / "score_model_v9_home_rtg.pkl")
    v9_away_model = joblib.load(ROOT / "models" / "production" / "score_model_v9_away_rtg.pkl")
    v9_margin_model = joblib.load(ROOT / "models" / "production" / "score_model_v9_margin.pkl")
    v9_ridge_total = joblib.load(ROOT / "models" / "production" / "score_model_v9_ridge_total.pkl")
    v9_ridge_margin = joblib.load(ROOT / "models" / "production" / "score_model_v9_ridge_margin.pkl")

    v9_home = playoff_26.copy()
    v9_home["PRED_PACE"] = v9_pace_model.predict(v9_home[v9_meta["pace_features"]])
    v9_home["PRED_HOME_RTG"] = v9_home_model.predict(v9_home[v9_meta["home_off_rtg_features"]])
    v9_home["PRED_MARGIN_RAW"] = v9_margin_model.predict(v9_home[v9_meta["margin_features"]])

    v9_away_eval = away_all[["GAME_ID"] + v9_meta["away_off_rtg_features"]].copy()
    v9_away_eval["PRED_AWAY_RTG"] = v9_away_model.predict(v9_away_eval[v9_meta["away_off_rtg_features"]])

    v9_eval = v9_home.merge(v9_away_eval[["GAME_ID", "PRED_AWAY_RTG"]], on="GAME_ID", how="inner")
    v9_eval["PRED_TOTAL_RAW"] = v9_eval["PRED_PACE"] * (v9_eval["PRED_HOME_RTG"] + v9_eval["PRED_AWAY_RTG"]) / 100.0

    # Apply Ridge corrections
    X_ind = get_indicator_df(v9_eval)
    v9_total_residual_pred = v9_ridge_total.predict(X_ind)
    v9_margin_residual_pred = v9_ridge_margin.predict(X_ind)

    v9_corrected_total = v9_eval["PRED_TOTAL_RAW"] - v9_total_residual_pred
    v9_corrected_margin = v9_eval["PRED_MARGIN_RAW"] - v9_margin_residual_pred

    v9_pred_home = (v9_corrected_total + v9_corrected_margin) / 2.0
    v9_pred_away = (v9_corrected_total - v9_corrected_margin) / 2.0
    v9_pred_total = v9_pred_home + v9_pred_away
    v9_pred_margin = v9_pred_home - v9_pred_away

    v9_metrics = {
        "total": signed_metrics(v9_eval["ACTUAL_TOTAL"], v9_pred_total),
        "margin": signed_metrics(v9_eval["ACTUAL_MARGIN"], v9_pred_margin),
    }

    # Print results to stdout
    result = {
        "games_count": int(len(v8_eval)),
        "V8_Baseline": {
            "total_mae": v8_metrics["total"]["mae"],
            "total_bias": v8_metrics["total"]["mean_error"],
            "margin_mae": v8_metrics["margin"]["mae"],
            "margin_bias": v8_metrics["margin"]["mean_error"],
        },
        "V9_Ridge": {
            "total_mae": v9_metrics["total"]["mae"],
            "total_bias": v9_metrics["total"]["mean_error"],
            "margin_mae": v9_metrics["margin"]["mae"],
            "margin_bias": v9_metrics["margin"]["mean_error"],
        }
    }
    print(json.dumps(result, indent=2))

    # Write a quick report markdown file
    report_path = ROOT / "reports" / "evaluation" / "score_2026_playoffs_validation.md"
    report_lines = [
        "# 2025-26 NBA Playoffs Generalization Validation",
        "",
        "This report checks if the post-processing Ridge calibration generalizes to a completely unseen playoff season.",
        f"Validation dataset size: {len(v8_eval)} games (home perspectives).",
        "",
        "## Metrics Comparison",
        "",
        "| Metric | V8 Baseline (No Correction) | V9 Ridge (Calibrated) | Delta (V9 - V8) |",
        "| --- | --- | --- | --- |",
        f"| **Total MAE** | {v8_metrics['total']['mae']:.4f} | {v9_metrics['total']['mae']:.4f} | {v9_metrics['total']['mae'] - v8_metrics['total']['mae']:.4f} |",
        f"| **Total Bias** | {v8_metrics['total']['mean_error']:.4f} | {v9_metrics['total']['mean_error']:.4f} | {v9_metrics['total']['mean_error'] - v8_metrics['total']['mean_error']:.4f} |",
        f"| **Margin MAE** | {v8_metrics['margin']['mae']:.4f} | {v9_metrics['margin']['mae']:.4f} | {v9_metrics['margin']['mae'] - v8_metrics['margin']['mae']:.4f} |",
        f"| **Margin Bias** | {v8_metrics['margin']['mean_error']:.4f} | {v9_metrics['margin']['mean_error']:.4f} | {v9_metrics['margin']['mean_error'] - v8_metrics['margin']['mean_error']:.4f} |",
        "",
        "## Conclusion",
        "If Total Bias drops from ~4.8 down to near 0, the Ridge model successfully generalizes out-of-season and learns a stable calibration correction."
    ]
    report_path.write_text("\n".join(report_lines), encoding="utf-8")
    print(f"Report written to: {report_path}")


if __name__ == "__main__":
    run_evaluation()
