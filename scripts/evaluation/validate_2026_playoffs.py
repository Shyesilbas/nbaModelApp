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

import math
from src.features.win_strength_features import attach_actual_points

def load_team_model_ready() -> pd.DataFrame:
    return pd.read_csv(ROOT / "data" / "processed" / "team_model_ready_v3_2025_26.csv")


NBA_TEAMS_LOCATIONS = {
    "BOS": {"lat": 42.3662, "lon": -71.0621, "tz_offset": -5},
    "BKN": {"lat": 40.6826, "lon": -73.9754, "tz_offset": -5},
    "NYK": {"lat": 40.7505, "lon": -73.9934, "tz_offset": -5},
    "PHI": {"lat": 39.9012, "lon": -75.1719, "tz_offset": -5},
    "TOR": {"lat": 43.6435, "lon": -79.3791, "tz_offset": -5},
    "CHI": {"lat": 41.8806, "lon": -87.6742, "tz_offset": -6},
    "CLE": {"lat": 41.4965, "lon": -81.6881, "tz_offset": -5},
    "DET": {"lat": 42.3411, "lon": -83.0550, "tz_offset": -5},
    "IND": {"lat": 39.7641, "lon": -86.1555, "tz_offset": -5},
    "MIL": {"lat": 43.0451, "lon": -87.9172, "tz_offset": -6},
    "ATL": {"lat": 33.7573, "lon": -84.3963, "tz_offset": -5},
    "CHA": {"lat": 35.2251, "lon": -80.8392, "tz_offset": -5},
    "MIA": {"lat": 25.7814, "lon": -80.1870, "tz_offset": -5},
    "ORL": {"lat": 28.5392, "lon": -81.3839, "tz_offset": -5},
    "WAS": {"lat": 38.8981, "lon": -77.0209, "tz_offset": -5},
    "DEN": {"lat": 39.7486, "lon": -105.0075, "tz_offset": -7},
    "MIN": {"lat": 44.9795, "lon": -93.2761, "tz_offset": -6},
    "OKC": {"lat": 35.4634, "lon": -97.5151, "tz_offset": -6},
    "POR": {"lat": 45.5316, "lon": -122.6668, "tz_offset": -8},
    "UTA": {"lat": 40.7683, "lon": -111.9011, "tz_offset": -7},
    "GSW": {"lat": 37.7680, "lon": -122.3877, "tz_offset": -8},
    "LAC": {"lat": 34.0430, "lon": -118.2673, "tz_offset": -8},
    "LAL": {"lat": 34.0430, "lon": -118.2673, "tz_offset": -8},
    "PHX": {"lat": 33.4457, "lon": -112.0712, "tz_offset": -7},
    "SAC": {"lat": 38.5802, "lon": -121.4997, "tz_offset": -8},
    "DAL": {"lat": 32.7905, "lon": -96.8103, "tz_offset": -6},
    "HOU": {"lat": 29.7508, "lon": -95.3621, "tz_offset": -6},
    "MEM": {"lat": 35.1381, "lon": -90.0506, "tz_offset": -6},
    "NOP": {"lat": 29.9490, "lon": -90.0821, "tz_offset": -6},
    "SAS": {"lat": 29.4270, "lon": -98.4375, "tz_offset": -6},
}


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def add_location_features(df: pd.DataFrame) -> pd.DataFrame:
    if {"TRAVEL_DISTANCE", "TIMEZONE_DIFF", "OPP_TRAVEL_DISTANCE", "OPP_TIMEZONE_DIFF"}.issubset(df.columns):
        return df

    def row_features(row: pd.Series) -> pd.Series:
        home_team = row["TEAM_ABBREVIATION"] if bool(row["IS_HOME"]) else row["OPPONENT_ABBREVIATION"]
        away_team = row["OPPONENT_ABBREVIATION"] if bool(row["IS_HOME"]) else row["TEAM_ABBREVIATION"]
        home_loc = NBA_TEAMS_LOCATIONS.get(home_team)
        away_loc = NBA_TEAMS_LOCATIONS.get(away_team)
        dist = 0.0
        tz_diff = 0.0
        if home_loc and away_loc:
            dist = haversine(home_loc["lat"], home_loc["lon"], away_loc["lat"], away_loc["lon"])
            tz_diff = abs(home_loc["tz_offset"] - away_loc["tz_offset"])
        if bool(row["IS_HOME"]):
            return pd.Series({"TRAVEL_DISTANCE": 0.0, "TIMEZONE_DIFF": 0.0, "OPP_TRAVEL_DISTANCE": dist, "OPP_TIMEZONE_DIFF": tz_diff})
        return pd.Series({"TRAVEL_DISTANCE": dist, "TIMEZONE_DIFF": tz_diff, "OPP_TRAVEL_DISTANCE": 0.0, "OPP_TIMEZONE_DIFF": 0.0})

    feats = df.apply(row_features, axis=1)
    return pd.concat([df, feats], axis=1)


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
    playoff_26 = attach_actual_points(playoff_26).dropna(subset=["ACTUAL_PTS", "ACTUAL_OPP_PTS"])
    playoff_26["ACTUAL_HOME_PTS"] = playoff_26["ACTUAL_PTS"]
    playoff_26["ACTUAL_AWAY_PTS"] = playoff_26["ACTUAL_OPP_PTS"]
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
    report_path.parent.mkdir(parents=True, exist_ok=True)
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
