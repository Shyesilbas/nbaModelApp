#!/usr/bin/env python3
import sys
import json
import argparse
import math
from pathlib import Path
import joblib
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.core.artifact_paths import production_release
from src.core.data_paths import get_data_paths
from src.core.season_utils import normalize_season, get_default_season
from src.features.build_matchup_features import build_features
from src.inference.win_blend import blend_win_probability

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

def haversine(lat1, lon1, lat2, lon2):
    radius_km = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def add_location_features(df):
    if {"TRAVEL_DISTANCE", "TIMEZONE_DIFF", "OPP_TRAVEL_DISTANCE", "OPP_TIMEZONE_DIFF"}.issubset(df.columns):
        return df

    def row_features(row):
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

def get_indicator_df(df):
    indicators = pd.DataFrame(index=df.index)
    indicators["is_playoff"] = (df["IS_PLAYOFF"].astype(int) == 1).astype(float)
    indicators["home_b2b"] = (df["IS_B2B"].astype(int) == 1).astype(float)
    indicators["away_b2b"] = (df["OPP_IS_B2B"].astype(int) == 1).astype(float)
    indicators["home_rest_advantage"] = (df["DAYS_REST"] > df["OPP_DAYS_REST"]).astype(float)
    indicators["away_rest_advantage"] = (df["OPP_DAYS_REST"] > df["DAYS_REST"]).astype(float)
    return indicators

def predict_single_game(home, away, date):
    # 1. Build features
    features = build_features(home, away, date)
    
    # 2. Predict Win Probability
    win_model_path = ROOT / "models/production/win_model.pkl"
    win_features_path = ROOT / "models/production/win_features.json"
    
    win_prob = 0.5
    if win_model_path.exists() and win_features_path.exists():
        win_model = joblib.load(win_model_path)
        if hasattr(win_model, "named_steps"):
            clf = win_model.named_steps.get("clf")
            if clf is not None and not hasattr(clf, "multi_class"):
                clf.multi_class = "auto"
        win_features = json.loads(win_features_path.read_text())
        
        row = [features[c] for c in win_features]
        X = pd.DataFrame([row], columns=win_features)
        win_prob = float(win_model.predict_proba(X)[0][1])

        win_prob = blend_win_probability(win_prob, features)
        
    # 3. Predict Component Scores
    score_meta_path = ROOT / "models/production/score_metadata.json"
    pace_path = ROOT / "models/production/score_model_pace.pkl"
    home_rtg_path = ROOT / "models/production/score_model_home_rtg.pkl"
    away_rtg_path = ROOT / "models/production/score_model_away_rtg.pkl"
    margin_path = ROOT / "models/production/score_model_margin.pkl"
    
    pred_home = 110.0
    pred_away = 110.0
    
    has_score = all(p.exists() for p in [score_meta_path, pace_path, home_rtg_path, away_rtg_path, margin_path])
    if has_score:
        meta = json.loads(score_meta_path.read_text())
        pace_model = joblib.load(pace_path)
        home_model = joblib.load(home_rtg_path)
        away_model = joblib.load(away_rtg_path)
        margin_model = joblib.load(margin_path)
        
        # Build home row features
        row_home = [features[c] for c in meta["home_off_rtg_features"]]
        X_home = pd.DataFrame([row_home], columns=meta["home_off_rtg_features"])
        pred_home_rtg = float(home_model.predict(X_home)[0])
        
        # Build pace row features
        row_pace = [features[c] for c in meta["pace_features"]]
        X_pace = pd.DataFrame([row_pace], columns=meta["pace_features"])
        pred_pace = float(pace_model.predict(X_pace)[0])
        
        # Build margin features
        row_margin = [features[c] for c in meta["margin_features"]]
        X_margin = pd.DataFrame([row_margin], columns=meta["margin_features"])
        pred_margin_raw = float(margin_model.predict(X_margin)[0])
        
        # Build away perspective features (flip team/opponent)
        away_features = build_features(away, home, date, team_is_home=False)
        row_away = [away_features[c] for c in meta["away_off_rtg_features"]]
        X_away = pd.DataFrame([row_away], columns=meta["away_off_rtg_features"])
        pred_away_rtg = float(away_model.predict(X_away)[0])
        
        pred_total_raw = pred_pace * (pred_home_rtg + pred_away_rtg) / 100.0
        
        # Apply Ridge Corrections for Pace/Total and Margin
        ridge_total_path = ROOT / "models/production/score_model_ridge_total.pkl"
        ridge_margin_path = ROOT / "models/production/score_model_ridge_margin.pkl"
        
        ind_df = pd.DataFrame([{
            "IS_PLAYOFF": float(features.get("IS_PLAYOFF", 0.0)),
            "IS_B2B": float(features.get("IS_B2B", 0.0)),
            "OPP_IS_B2B": float(features.get("OPP_IS_B2B", 0.0)),
            "DAYS_REST": float(features.get("DAYS_REST", 3.0)),
            "OPP_DAYS_REST": float(features.get("OPP_DAYS_REST", 3.0)),
        }])
        X_ind = get_indicator_df(ind_df)
        
        if ridge_total_path.exists():
            ridge_total = joblib.load(ridge_total_path)
            pred_total = pred_total_raw - float(ridge_total.predict(X_ind)[0])
        else:
            pred_total = pred_total_raw
            
        if ridge_margin_path.exists():
            ridge_margin = joblib.load(ridge_margin_path)
            pred_margin = pred_margin_raw - float(ridge_margin.predict(X_ind)[0])
        else:
            pred_margin = pred_margin_raw

        pred_home = (pred_total + pred_margin) / 2.0
        pred_away = (pred_total - pred_margin) / 2.0

        # Mathematical link: Bounded and calibrated win probability from expected score margin
        # P = 1 / (1 + exp(-k * margin))
        k = 0.145
        win_prob = 1.0 / (1.0 + math.exp(-k * pred_margin))

    is_preseason = bool(features.get("IS_PRESEASON", 0) == 1) or features.get("SEASON_TYPE") in ("Pre Season", "Preseason")
    if is_preseason:
        # Preseason variance shrinkage: temper extreme probabilities towards 50%
        win_prob = 0.50 + 0.50 * (win_prob - 0.50)
        
    return {
        "home": home,
        "away": away,
        "win_prob": win_prob,
        "pred_home": pred_home,
        "pred_away": pred_away,
        "is_preseason": is_preseason,
        "season_type": features.get("SEASON_TYPE", "Pre Season" if is_preseason else "Regular Season"),
    }

def main():
    parser = argparse.ArgumentParser(description="NBA Daily Schedule Predictor CLI")
    parser.add_argument("--date", help="Target date to predict games (YYYY-MM-DD). If omitted, latest date in schedule is used.")
    parser.add_argument("--season", help="Target season (e.g. 2025-26)")
    args = parser.parse_args()
    release = production_release() or "unknown"

    season = normalize_season(args.season) if args.season else get_default_season()
    dp = get_data_paths(season)
    
    # Load schedule
    schedule_path = Path(dp.schedule_combined)
    if not schedule_path.exists():
        print(f"Error: Schedule file does not exist at {schedule_path}. Build it first.")
        sys.exit(1)
        
    df_sched = pd.read_csv(schedule_path)
    df_sched["GAME_DATE"] = pd.to_datetime(df_sched["GAME_DATE"])
    
    target_date = args.date
    if not target_date:
        # Defaults to latest date
        latest_timestamp = df_sched["GAME_DATE"].max()
        target_date = latest_timestamp.strftime("%Y-%m-%d")
        
    # Filter games on target date
    target_dt = pd.to_datetime(target_date)
    df_games = df_sched[df_sched["GAME_DATE"] == target_dt].copy()
    
    if df_games.empty:
        print(f"No games scheduled on {target_date} for season {season}.")
        sys.exit(0)
        
    print(f"Predicting {len(df_games)} games on {target_date} using models {release}...")
    
    predictions = []
    for _, game in df_games.iterrows():
        home = game["HOME_TEAM_ABBREVIATION"]
        away = game["AWAY_TEAM_ABBREVIATION"]
        
        try:
            res = predict_single_game(home, away, target_date)
            predictions.append(res)
        except Exception as e:
            print(f"Error predicting game {away} @ {home}: {e}")
            
    if not predictions:
        print("Failed to run predictions for any game.")
        sys.exit(1)
        
    # Build clean output report
    report = [
        f"# NBA Schedule Predictions - {target_date}",
        f"Generated using models `{release}` on Season `{season}`",
        "",
        "| Away | Home | Winner Prob (Home) | Winner Prob (Away) | Projected Score | Predicted Winner |",
        "| --- | --- | --- | --- | --- | --- |"
    ]
    
    print("\n" + "="*80)
    print(f"🏀 NBA PREDICTIONS FOR {target_date} ({release})")
    print("="*80)
    print(f"{'AWAY':<6} | {'HOME':<6} | {'HOME WIN%':<10} | {'AWAY WIN%':<10} | {'PROJECTED SCORE':<18} | {'PRED WINNER':<12}")
    print("-"*80)
    
    for p in predictions:
        prob_home = p["win_prob"]
        prob_away = 1 - prob_home
        
        pred_winner = p["home"] if prob_home >= 0.5 else p["away"]
        score_str = f"{p['away']} {p['pred_away']:.1f} - {p['pred_home']:.1f} {p['home']}"
        
        print(f"{p['away']:<6} | {p['home']:<6} | {prob_home*100:>8.1f}% | {prob_away*100:>8.1f}% | {score_str:<18} | {pred_winner:<12}")
        
        report.append(
            f"| {p['away']} | {p['home']} | {prob_home*100:.1f}% | {prob_away*100:.1f}% | {score_str} | **{pred_winner}** |"
        )
        
    print("="*80 + "\n")
    
    # Save md report
    out_dir = ROOT / "reports" / "predictions"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"schedule_{target_date}_model_{release}.md"
    out_path.write_text("\n".join(report), encoding="utf-8")
    print(f"Predictions report written to: {out_path}")

if __name__ == "__main__":
    main()
