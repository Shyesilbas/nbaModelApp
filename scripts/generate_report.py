#!/usr/bin/env python3
import os
import sys
import json
import argparse
import math
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, roc_auc_score, brier_score_loss, accuracy_score

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.artifact_paths import resolve_artifact_path
from scripts.data_paths import get_data_paths
from src.features.player_form import add_player_matchup_features
from scripts.season_utils import normalize_season, get_default_season
from src.features.win_strength_features import attach_actual_points

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

def check_season_freshness(season):
    dp = get_data_paths(season)
    report_lines = []
    
    # Check raw files
    raw_files = {
        "Raw Team Games": Path(dp.team_games_raw),
        "Raw Player Games": Path(dp.player_games_raw),
        "Raw Schedule": Path(dp.raw_schedule)
    }
    
    report_lines.append(f"### Season {season} Data Freshness Audit")
    
    all_raw_exist = True
    for name, path in raw_files.items():
        if path.exists():
            size_mb = path.stat().st_size / (1024 * 1024)
            report_lines.append(f"- {name}: PRESENT ({size_mb:.2f} MB)")
        else:
            report_lines.append(f"- {name}: MISSING ({path})")
            all_raw_exist = False
            
    if not all_raw_exist:
        return report_lines, False
        
    # Read raw team games for stats
    df_team = pd.read_csv(dp.team_games_raw)
    df_team["GAME_DATE"] = pd.to_datetime(df_team["GAME_DATE"])
    min_date = df_team["GAME_DATE"].min().strftime("%Y-%m-%d")
    max_date = df_team["GAME_DATE"].max().strftime("%Y-%m-%d")
    games_count = df_team["GAME_ID"].nunique()
    
    report_lines.append(f"- Total unique games in raw logs: {games_count}")
    report_lines.append(f"- Date Range: {min_date} to {max_date}")
    
    # Check processed model-ready data
    processed_paths = {
        "V2 Team Model Ready": Path(dp.team_model_ready_v2),
        "V3 Team Model Ready (V3)": ROOT / f"data/processed/team_model_ready_v3_{season.replace('-', '_')}.csv",
        "Score Dataset (V2 + Player Feats)": Path(dp.score_model_dataset)
    }
    
    for name, path in processed_paths.items():
        if path.exists():
            rows = len(pd.read_csv(path))
            report_lines.append(f"- {name}: PRESENT ({rows} records)")
        else:
            report_lines.append(f"- {name}: MISSING")
            
    return report_lines, True

def print_model_info(model_ver):
    report_lines = []
    report_lines.append(f"### Model Metadata Summary: {model_ver.upper()}")
    
    # Find active metadata files
    score_meta_path = ROOT / f"models/production/score_model_{model_ver}_metadata.json"
    player_meta_path = ROOT / f"models/production/player_{model_ver}_metadata.json"
    if not player_meta_path.exists():
        player_meta_path = resolve_artifact_path("player_model", "metadata_path", "models/player_v9_metadata.json")
    win_meta_path = ROOT / "models/production/model_metadata.json"
    
    if score_meta_path.exists():
        score_meta = json.loads(score_meta_path.read_text())
        report_lines.append(f"- Score Model Version: {score_meta.get('version', 'N/A')}")
        report_lines.append(f"  - Pace MAE: {score_meta.get('pace_mae', 'N/A')}")
        report_lines.append(f"  - Home RTG MAE: {score_meta.get('home_rtg_mae', 'N/A')}")
        report_lines.append(f"  - Away RTG MAE: {score_meta.get('away_rtg_mae', 'N/A')}")
        report_lines.append(f"  - Margin MAE: {score_meta.get('margin_mae', 'N/A')}")
    else:
        report_lines.append(f"- Score Model Metadata: MISSING at {score_meta_path}")
        
    if player_meta_path.exists():
        player_meta = json.loads(player_meta_path.read_text())
        report_lines.append(f"- Player Model Version: {player_meta.get('version', 'N/A')}")
        report_lines.append(f"  - Last Train Date: {player_meta.get('updated_at', 'N/A')}")
    else:
        report_lines.append(f"- Player Model Metadata: MISSING at {player_meta_path}")
        
    if win_meta_path.exists():
        win_meta = json.loads(win_meta_path.read_text())
        report_lines.append(f"- Win Model Version: {win_meta.get('version', 'N/A')}")
        report_lines.append(f"  - Validation Brier Score: {win_meta.get('calibration_eval', {}).get('overall', {}).get('brier', 'N/A')}")
    else:
        report_lines.append(f"- Win Model Metadata: MISSING at {win_meta_path}")
        
    return report_lines

def evaluate_model_on_season(model_ver, season):
    # Retrieve paths
    dp = get_data_paths(season)
    
    v3_path = ROOT / "data" / "processed" / f"team_model_ready_v3_{season.replace('-', '_')}.csv"
    if not v3_path.exists():
        return {"error": f"V3 dataset does not exist for {season}. Please run build-v3-dataset first."}
        
    df = pd.read_csv(v3_path)
    df["GAME_ID"] = df["GAME_ID"].astype(str).apply(lambda x: x.split('.')[0].zfill(10))
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])
    
    # 1. EVALUATE WIN PROBABILITY MODEL
    win_model_path = ROOT / f"models/production/win_probability_model_{model_ver}.pkl"
    win_features_path = ROOT / f"models/production/feature_columns_{model_ver}.json"
    
    win_results = {}
    if win_model_path.exists() and win_features_path.exists() and "WIN" in df.columns:
        win_model = joblib.load(win_model_path)
        if hasattr(win_model, "named_steps"):
            clf = win_model.named_steps.get("clf")
            if clf is not None and not hasattr(clf, "multi_class"):
                clf.multi_class = "auto"
        win_features = json.loads(win_features_path.read_text())
        
        # Check if projection features are missing
        missing_win_features = [c for c in win_features if c not in df.columns]
        if missing_win_features:
            print(f"Dynamically generating player projections and ELO features for {season}...")
            player_feat_path = ROOT / "data" / "experimental" / "player_model_ready_v4_usg.csv"
            if not player_feat_path.exists():
                print("player_model_ready_v4_usg.csv not found. Rebuilding player dataset...")
                from src.processing.player_dataset_builder import build_player_dataset_v4
                build_player_dataset_v4(seasons=["2024-25", "2025-26"])
                
            if player_feat_path.exists():
                player_df = pd.read_csv(player_feat_path)
                if "Game_ID" in player_df.columns:
                    player_df = player_df.rename(columns={"Game_ID": "GAME_ID"})
                player_df["GAME_ID"] = player_df["GAME_ID"].astype(str).apply(lambda x: x.split('.')[0].zfill(10))
                
                # Player models are versioned separately from win/score (e.g. v10 ships
                # with player v9), so fall back to the production manifest's player model.
                player_features_config_path = ROOT / f"models/production/player_{model_ver}_features.pkl"
                if not player_features_config_path.exists():
                    player_features_config_path = resolve_artifact_path("player_model", "feature_columns_path", "models/player_v9_features.pkl")
                    
                if player_features_config_path.exists():
                    player_features_cols = joblib.load(player_features_config_path)
                    # Same derived columns training and PlayerPredictor build (v9+ needs them).
                    if "PLAYER_POSITION_GROUP" in player_df.columns:
                        player_df = add_player_matchup_features(player_df)
                    player_df = player_df.dropna(subset=player_features_cols)
                    
                    targets = ["pts", "reb", "ast"]
                    predictions = {}
                    for t in targets:
                        model_path = ROOT / "models" / "production" / f"player_{model_ver}_lgb_{t}.pkl"
                        if not model_path.exists():
                            model_path = resolve_artifact_path("player_model", f"{t}_model_path", f"models/player_v9_lgb_{t}.pkl")
                        if model_path.exists():
                            model = joblib.load(model_path)
                            pred = model.predict(player_df[player_features_cols])
                            player_df[f"PROJ_{t.upper()}"] = pred
                            predictions[t] = pred
                            
                    player_df["PROJ_PRA"] = predictions["pts"] + predictions["reb"] + predictions["ast"]
                    
                    proj_cols = ["PROJ_PTS", "PROJ_REB", "PROJ_AST", "PROJ_PRA"]
                    team_agg = player_df.groupby(["GAME_ID", "TEAM_ABBREVIATION"])[[c for c in player_df.columns if c in ["PROJ_PTS", "PROJ_REB", "PROJ_AST", "PROJ_PRA"] or c.startswith("PROJ_")]].agg(['sum', 'mean']).reset_index()
                    team_agg.columns = ["GAME_ID", "TEAM_ABBREVIATION"] + [f"{col}_{agg}" for col, agg in team_agg.columns[2:]]
                    
                    team_features_df = team_agg.rename(columns={
                        "PROJ_PTS_sum": "TEAM_V3_PROJ_PTS_SUM",
                        "PROJ_REB_sum": "TEAM_V3_PROJ_REB_SUM",
                        "PROJ_AST_sum": "TEAM_V3_PROJ_AST_SUM",
                        "PROJ_PRA_sum": "TEAM_V3_PROJ_PRA_SUM",
                        "PROJ_PTS_mean": "TEAM_V3_PROJ_PTS_AVG",
                        "PROJ_REB_mean": "TEAM_V3_PROJ_REB_AVG",
                        "PROJ_AST_mean": "TEAM_V3_PROJ_AST_AVG",
                        "PROJ_PRA_mean": "TEAM_V3_PROJ_PRA_AVG",
                    })
                    
                    opp_features_df = team_agg.rename(columns={
                        "TEAM_ABBREVIATION": "OPPONENT_ABBREVIATION",
                        "PROJ_PTS_sum": "OPP_V3_PROJ_PTS_SUM",
                        "PROJ_REB_sum": "OPP_V3_PROJ_REB_SUM",
                        "PROJ_AST_sum": "OPP_V3_PROJ_AST_SUM",
                        "PROJ_PRA_sum": "OPP_V3_PROJ_PRA_SUM",
                        "PROJ_PTS_mean": "OPP_V3_PROJ_PTS_AVG",
                        "PROJ_REB_mean": "OPP_V3_PROJ_REB_AVG",
                        "PROJ_AST_mean": "OPP_V3_PROJ_AST_AVG",
                        "PROJ_PRA_mean": "OPP_V3_PROJ_PRA_AVG",
                    })
                    
                    df = df.merge(team_features_df, on=["GAME_ID", "TEAM_ABBREVIATION"], how="inner")
                    df = df.merge(opp_features_df, on=["GAME_ID", "OPPONENT_ABBREVIATION"], how="inner")
                    
            from src.features.win_strength_features import add_win_strength_features
            df = add_win_strength_features(df)
            
        # Filter rows without NaNs in win features
        eval_df = df.dropna(subset=win_features + ["WIN"]).copy()
        if not eval_df.empty:
            X = eval_df[win_features]
            y = eval_df["WIN"].astype(int)
            preds = win_model.predict(X)
            probs = win_model.predict_proba(X)[:, 1]
            
            win_results = {
                "accuracy": float(accuracy_score(y, preds)),
                "roc_auc": float(roc_auc_score(y, probs)) if len(y.unique()) > 1 else 1.0,
                "brier": float(brier_score_loss(y, probs)),
                "samples": int(len(eval_df))
            }
            
    # 2. EVALUATE SCORE MODELS
    score_results = {}
    score_meta_path = ROOT / f"models/production/score_model_{model_ver}_metadata.json"
    pace_path = ROOT / f"models/production/score_model_{model_ver}_pace.pkl"
    home_rtg_path = ROOT / f"models/production/score_model_{model_ver}_home_rtg.pkl"
    away_rtg_path = ROOT / f"models/production/score_model_{model_ver}_away_rtg.pkl"
    margin_path = ROOT / f"models/production/score_model_{model_ver}_margin.pkl"
    
    has_score = all(p.exists() for p in [score_meta_path, pace_path, home_rtg_path, away_rtg_path, margin_path])
    if has_score:
        meta = json.loads(score_meta_path.read_text())
        pace_model = joblib.load(pace_path)
        home_model = joblib.load(home_rtg_path)
        away_model = joblib.load(away_rtg_path)
        margin_model = joblib.load(margin_path)
        
        # Filter home perspectives
        df = add_location_features(df)
        home_df = df[df["IS_HOME"].astype(bool)].copy()
        away_df = df[~df["IS_HOME"].astype(bool)].copy()
        
        req_cols = ["PACE", "OFF_RTG", "DEF_RTG"] + meta["pace_features"] + meta["home_off_rtg_features"] + meta["margin_features"]
        home_df = home_df.dropna(subset=[c for c in req_cols if c in home_df.columns])
        
        if not home_df.empty:
            home_df = attach_actual_points(home_df).dropna(subset=["ACTUAL_PTS", "ACTUAL_OPP_PTS"])
            home_df["ACTUAL_HOME_PTS"] = home_df["ACTUAL_PTS"]
            home_df["ACTUAL_AWAY_PTS"] = home_df["ACTUAL_OPP_PTS"]
            home_df["ACTUAL_TOTAL"] = home_df["ACTUAL_HOME_PTS"] + home_df["ACTUAL_AWAY_PTS"]
            home_df["ACTUAL_MARGIN"] = home_df["ACTUAL_HOME_PTS"] - home_df["ACTUAL_AWAY_PTS"]
            
            home_df["PRED_PACE"] = pace_model.predict(home_df[meta["pace_features"]])
            home_df["PRED_HOME_RTG"] = home_model.predict(home_df[meta["home_off_rtg_features"]])
            home_df["PRED_MARGIN"] = margin_model.predict(home_df[meta["margin_features"]])
            
            # Get away perspective RTG predictions
            away_eval = away_df.dropna(subset=meta["away_off_rtg_features"]).copy()
            if not away_eval.empty:
                away_eval["PRED_AWAY_RTG"] = away_model.predict(away_eval[meta["away_off_rtg_features"]])
                
                eval_df = home_df.merge(away_eval[["GAME_ID", "PRED_AWAY_RTG"]], on="GAME_ID", how="inner")
                eval_df["PRED_TOTAL_RAW"] = eval_df["PRED_PACE"] * (eval_df["PRED_HOME_RTG"] + eval_df["PRED_AWAY_RTG"]) / 100.0
                
                # Apply Ridge corrections if available
                ridge_total_path = ROOT / f"models/production/score_model_{model_ver}_ridge_total.pkl"
                ridge_margin_path = ROOT / f"models/production/score_model_{model_ver}_ridge_margin.pkl"
                
                if ridge_total_path.exists() and ridge_margin_path.exists():
                    ridge_total = joblib.load(ridge_total_path)
                    ridge_margin = joblib.load(ridge_margin_path)
                    X_ind = get_indicator_df(eval_df)
                    eval_df["PRED_TOTAL"] = eval_df["PRED_TOTAL_RAW"] - ridge_total.predict(X_ind)
                    eval_df["PRED_MARGIN"] = eval_df["PRED_MARGIN"] - ridge_margin.predict(X_ind)
                else:
                    eval_df["PRED_TOTAL"] = eval_df["PRED_TOTAL_RAW"]
                    
                eval_df["PRED_HOME_PTS"] = (eval_df["PRED_TOTAL"] + eval_df["PRED_MARGIN"]) / 2.0
                eval_df["PRED_AWAY_PTS"] = (eval_df["PRED_TOTAL"] - eval_df["PRED_MARGIN"]) / 2.0
                
                score_results = {
                    "total_mae": float(mean_absolute_error(eval_df["ACTUAL_TOTAL"], eval_df["PRED_TOTAL"])),
                    "total_bias": float((eval_df["PRED_TOTAL"] - eval_df["ACTUAL_TOTAL"]).mean()),
                    "margin_mae": float(mean_absolute_error(eval_df["ACTUAL_MARGIN"], eval_df["PRED_MARGIN"])),
                    "margin_bias": float((eval_df["PRED_MARGIN"] - eval_df["ACTUAL_MARGIN"]).mean()),
                    "samples": int(len(eval_df))
                }
                
    return {
        "win": win_results,
        "score": score_results
    }

def main():
    parser = argparse.ArgumentParser(description="NBA Season and Model Reporting/Evaluation CLI")
    parser.add_argument("--season", help="Target season for data stats/freshness or evaluation (e.g. 2025-26)")
    parser.add_argument("--model", help="Target model version (e.g. v9 or v10) to inspect or evaluate")
    parser.add_argument("--compare-models", nargs=2, metavar=("M1", "M2"), help="Compare two model versions on the specified season")
    parser.add_argument("--freshness-check", action="store_true", help="Perform freshness and shape sanity check on target season")
    args = parser.parse_args()

    if not any([args.season, args.model, args.compare_models, args.freshness_check]):
        parser.print_help()
        sys.exit(0)
        
    report = []
    
    if args.freshness_check or (args.season and not args.model and not args.compare_models):
        season = args.season or get_default_season()
        lines, success = check_season_freshness(season)
        report.extend(lines)
        print("\n".join(lines))
        if not success:
            sys.exit(1)
            
    if args.model and not args.season and not args.compare_models:
        lines = print_model_info(args.model)
        report.extend(lines)
        print("\n".join(lines))
        
    if args.season and args.model and not args.compare_models:
        season = normalize_season(args.season)
        print(f"Evaluating model {args.model.upper()} on season {season}...")
        res = evaluate_model_on_season(args.model, season)
        
        if "error" in res:
            print(f"Error: {res['error']}")
            sys.exit(1)
            
        report.append(f"# Model {args.model.upper()} Performance Audit on {season}")
        report.append("")
        
        if res.get("win"):
            win = res["win"]
            report.append("## Win Probability Metrics")
            report.append(f"- Accuracy: {win['accuracy']:.4f}")
            report.append(f"- ROC-AUC: {win['roc_auc']:.4f}")
            report.append(f"- Brier Score: {win['brier']:.4f}")
            report.append(f"- Samples Count: {win['samples']}")
            report.append("")
            
        if res.get("score"):
            score = res["score"]
            report.append("## Score Prediction Metrics")
            report.append(f"- Total MAE: {score['total_mae']:.4f}")
            report.append(f"- Total Bias: {score['total_bias']:.4f}")
            report.append(f"- Margin MAE: {score['margin_mae']:.4f}")
            report.append(f"- Margin Bias: {score['margin_bias']:.4f}")
            report.append(f"- Samples Count: {score['samples']}")
            report.append("")
            
        # Write report out
        out_path = ROOT / "reports" / "evaluation" / f"season_{season}_model_{args.model}_evaluation_report.md"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text("\n".join(report), encoding="utf-8")
        print(f"\nWritten performance report to: {out_path}")
        print("\n".join(report[2:]))
        
    if args.compare_models:
        if not args.season:
            print("Error: Specify a target season using --season YYYY-YY to compare models.")
            sys.exit(1)
            
        season = normalize_season(args.season)
        m1, m2 = args.compare_models
        print(f"Comparing model {m1.upper()} vs {m2.upper()} on season {season}...")
        
        res1 = evaluate_model_on_season(m1, season)
        res2 = evaluate_model_on_season(m2, season)
        
        if "error" in res1 or "error" in res2:
            print(f"Error evaluating models: {res1.get('error') or res2.get('error')}")
            sys.exit(1)
            
        report.append(f"# Model Performance Comparison: {m1.upper()} vs {m2.upper()}")
        report.append(f"Target season: {season}")
        report.append("")
        
        report.append("| Metric | " + f"{m1.upper()}" + " | " + f"{m2.upper()}" + " | Delta (" + f"{m2.upper()}-{m1.upper()}" + ") |")
        report.append("| --- | --- | --- | --- |")
        
        # Add win probability comparison
        if res1.get("win") and res2.get("win"):
            w1, w2 = res1["win"], res2["win"]
            report.append(f"| **Win Accuracy** | {w1['accuracy']:.4f} | {w2['accuracy']:.4f} | {w2['accuracy'] - w1['accuracy']:.4f} |")
            report.append(f"| **Win ROC-AUC** | {w1['roc_auc']:.4f} | {w2['roc_auc']:.4f} | {w2['roc_auc'] - w1['roc_auc']:.4f} |")
            report.append(f"| **Win Brier Score** | {w1['brier']:.4f} | {w2['brier']:.4f} | {w2['brier'] - w1['brier']:.4f} |")
            
        # Add score component comparison
        if res1.get("score") and res2.get("score"):
            s1, s2 = res1["score"], res2["score"]
            report.append(f"| **Total Score MAE** | {s1['total_mae']:.4f} | {s2['total_mae']:.4f} | {s2['total_mae'] - s1['total_mae']:.4f} |")
            report.append(f"| **Total Score Bias** | {s1['total_bias']:.4f} | {s2['total_bias']:.4f} | {s2['total_bias'] - s1['total_bias']:.4f} |")
            report.append(f"| **Margin MAE** | {s1['margin_mae']:.4f} | {s2['margin_mae']:.4f} | {s2['margin_mae'] - s1['margin_mae']:.4f} |")
            report.append(f"| **Margin Bias** | {s1['margin_bias']:.4f} | {s2['margin_bias']:.4f} | {s2['margin_bias'] - s1['margin_bias']:.4f} |")
            
        out_path = ROOT / "reports" / "evaluation" / f"compare_{m1}_vs_{m2}_season_{season}.md"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text("\n".join(report), encoding="utf-8")
        print(f"\nWritten comparison report to: {out_path}")
        print("\n".join(report[3:]))

if __name__ == "__main__":
    main()
