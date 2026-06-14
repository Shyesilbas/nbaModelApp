import os
import sys
import json
import shutil
import argparse
import joblib
import pandas as pd
import numpy as np
from datetime import datetime
from pathlib import Path
from sklearn.metrics import accuracy_score, roc_auc_score, brier_score_loss, mean_absolute_error

ROOT = Path(__file__).resolve().parents[1]

# Ensure project root is in path
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.training.player_trainer import PlayerModelTrainer
from src.training.score_trainer import ScoreModelTrainer
from src.training.win_trainer import WinModelTrainer
from scripts.data_paths import get_data_paths
from scripts.generate_report import add_location_features, get_indicator_df

def evaluate_model_files(model_dir, season):
    model_dir = Path(model_dir)
    dp = get_data_paths(season)
    
    v3_path = ROOT / "data" / "processed" / f"team_model_ready_v3_{season.replace('-', '_')}.csv"
    if not v3_path.exists():
        return {"error": f"V3 dataset does not exist for {season}."}
        
    df = pd.read_csv(v3_path)
    df["GAME_ID"] = df["GAME_ID"].astype(str).apply(lambda x: x.split('.')[0].zfill(10))
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])
    
    # 1. Evaluate Win Model
    win_model_path = model_dir / "win_probability_model_v9.pkl"
    win_features_path = model_dir / "feature_columns_v9.json"
    
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
            player_feat_path = ROOT / "data" / "experimental" / "player_model_ready_v4_usg.csv"
            if player_feat_path.exists():
                player_df = pd.read_csv(player_feat_path)
                if "Game_ID" in player_df.columns:
                    player_df = player_df.rename(columns={"Game_ID": "GAME_ID"})
                player_df["GAME_ID"] = player_df["GAME_ID"].astype(str).apply(lambda x: x.split('.')[0].zfill(10))
                
                player_features_config_path = model_dir / "player_v9_features.pkl"
                if not player_features_config_path.exists():
                    player_features_config_path = ROOT / "models/production/player_v9_features.pkl"
                    
                if player_features_config_path.exists():
                    player_features_cols = joblib.load(player_features_config_path)
                    player_df = player_df.dropna(subset=player_features_cols)
                    
                    targets = ["pts", "reb", "ast"]
                    predictions = {}
                    for t in targets:
                        model_path = model_dir / f"player_v9_lgb_{t}.pkl"
                        if not model_path.exists():
                            model_path = ROOT / "models" / "production" / f"player_v9_lgb_{t}.pkl"
                        if model_path.exists():
                            model = joblib.load(model_path)
                            pred = model.predict(player_df[player_features_cols])
                            player_df[f"PROJ_{t.upper()}"] = pred
                            predictions[t] = pred
                            
                    player_df["PROJ_PRA"] = predictions["pts"] + predictions["reb"] + predictions["ast"]
                    
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
            
    # 2. Evaluate Score Model
    score_results = {}
    score_meta_path = model_dir / "score_model_v9_metadata.json"
    pace_path = model_dir / "score_model_v9_pace.pkl"
    home_rtg_path = model_dir / "score_model_v9_home_rtg.pkl"
    away_rtg_path = model_dir / "score_model_v9_away_rtg.pkl"
    margin_path = model_dir / "score_model_v9_margin.pkl"
    
    has_score = all(p.exists() for p in [score_meta_path, pace_path, home_rtg_path, away_rtg_path, margin_path])
    if has_score:
        meta = json.loads(score_meta_path.read_text())
        pace_model = joblib.load(pace_path)
        home_model = joblib.load(home_rtg_path)
        away_model = joblib.load(away_rtg_path)
        margin_model = joblib.load(margin_path)
        
        df = add_location_features(df)
        home_df = df[df["IS_HOME"].astype(bool)].copy()
        away_df = df[~df["IS_HOME"].astype(bool)].copy()
        
        req_cols = ["PACE", "OFF_RTG", "DEF_RTG"] + meta["pace_features"] + meta["home_off_rtg_features"] + meta["margin_features"]
        home_df = home_df.dropna(subset=[c for c in req_cols if c in home_df.columns])
        
        if not home_df.empty:
            home_df["ACTUAL_HOME_PTS"] = home_df["PACE"] * home_df["OFF_RTG"] / 100.0
            home_df["ACTUAL_AWAY_PTS"] = home_df["PACE"] * home_df["DEF_RTG"] / 100.0
            home_df["ACTUAL_TOTAL"] = home_df["ACTUAL_HOME_PTS"] + home_df["ACTUAL_AWAY_PTS"]
            home_df["ACTUAL_MARGIN"] = home_df["ACTUAL_HOME_PTS"] - home_df["ACTUAL_AWAY_PTS"]
            
            home_df["PRED_PACE"] = pace_model.predict(home_df[meta["pace_features"]])
            home_df["PRED_HOME_RTG"] = home_model.predict(home_df[meta["home_off_rtg_features"]])
            home_df["PRED_MARGIN"] = margin_model.predict(home_df[meta["margin_features"]])
            
            away_eval = away_df.dropna(subset=meta["away_off_rtg_features"]).copy()
            if not away_eval.empty:
                away_eval["PRED_AWAY_RTG"] = away_model.predict(away_eval[meta["away_off_rtg_features"]])
                
                eval_df = home_df.merge(away_eval[["GAME_ID", "PRED_AWAY_RTG"]], on="GAME_ID", how="inner")
                eval_df["PRED_TOTAL_RAW"] = eval_df["PRED_PACE"] * (eval_df["PRED_HOME_RTG"] + eval_df["PRED_AWAY_RTG"]) / 100.0
                
                ridge_total_path = model_dir / "score_model_v9_ridge_total.pkl"
                ridge_margin_path = model_dir / "score_model_v9_ridge_margin.pkl"
                
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
    parser = argparse.ArgumentParser(description="Model Retraining, Calibration, and Promotion Pipeline")
    parser.add_argument("--season", type=str, default="2025-26", help="Validation season for champion vs challenger comparison")
    parser.add_argument("--dry-run", action="store_true", help="Run training and evaluation but do not promote artifacts to production")
    args = parser.parse_args()
    
    print("==================================================")
    print("  🏀 NBA Prediction Model Retraining Pipeline     ")
    print("==================================================")
    print(f"Validation Season: {args.season}")
    print(f"Dry-run Mode:      {args.dry_run}")
    print("--------------------------------------------------")
    
    experimental_dir = ROOT / "models" / "experimental"
    production_dir = ROOT / "models" / "production"
    
    print("\n[1/3] Training Candidate Models...")
    print("-> Training Player Models (LGBM + Ridge Calibration)...")
    player_trainer = PlayerModelTrainer(output_dir=experimental_dir, version="v9")
    player_trainer.train_and_export()
    
    print("-> Training Score Models (XGBoost + Ridge Calibration)...")
    score_trainer = ScoreModelTrainer(output_dir=experimental_dir, version="v9")
    score_trainer.train_and_export()
    
    print("-> Training Win Probability Model (Calibrated Logistic Regression)...")
    win_trainer = WinModelTrainer(output_dir=experimental_dir, player_models_dir=experimental_dir)
    win_trainer.train_and_export()
    
    print("\n[2/3] Evaluating Champion vs Challenger...")
    
    champ_metrics = evaluate_model_files(production_dir, args.season)
    chall_metrics = evaluate_model_files(experimental_dir, args.season)
    
    if "error" in champ_metrics or "error" in chall_metrics:
        print(f"Error evaluating models: {champ_metrics.get('error') or chall_metrics.get('error')}")
        sys.exit(1)
        
    print("\n--- PERFORMANCE COMPARISON ---")
    print(f"{'Metric':<25} | {'Champion (Prod)':<15} | {'Challenger (Exp)':<16} | {'Delta':<10}")
    print("-" * 75)
    
    w_champ, w_chall = champ_metrics.get("win", {}), chall_metrics.get("win", {})
    s_champ, s_chall = champ_metrics.get("score", {}), chall_metrics.get("score", {})
    
    if w_champ and w_chall:
        acc_diff = w_chall["accuracy"] - w_champ["accuracy"]
        auc_diff = w_chall["roc_auc"] - w_champ["roc_auc"]
        brier_diff = w_chall["brier"] - w_champ["brier"]
        print(f"{'Win Accuracy':<25} | {w_champ['accuracy']:<15.4f} | {w_chall['accuracy']:<16.4f} | {acc_diff:<+10.4f}")
        print(f"{'Win ROC-AUC':<25} | {w_champ['roc_auc']:<15.4f} | {w_chall['roc_auc']:<16.4f} | {auc_diff:<+10.4f}")
        print(f"{'Win Brier Score':<25} | {w_champ['brier']:<15.4f} | {w_chall['brier']:<16.4f} | {brier_diff:<+10.4f}")
        
    if s_champ and s_chall:
        mae_diff = s_chall["total_mae"] - s_champ["total_mae"]
        margin_diff = s_chall["margin_mae"] - s_champ["margin_mae"]
        print(f"{'Total Score MAE':<25} | {s_champ['total_mae']:<15.4f} | {s_chall['total_mae']:<16.4f} | {mae_diff:<+10.4f}")
        print(f"{'Margin MAE':<25} | {s_champ['margin_mae']:<15.4f} | {s_chall['margin_mae']:<16.4f} | {margin_diff:<+10.4f}")
        
    print("--------------------------------------------------")
    
    # Check if challenger is better (lower Brier/MAE, higher Accuracy)
    is_better = False
    if w_champ and w_chall:
        if w_chall["accuracy"] >= w_champ["accuracy"] or w_chall["brier"] <= w_champ["brier"]:
            is_better = True
            
    if is_better:
        print("\nResult: Challenger models show improved or competitive performance.")
    else:
        print("\nResult: Champion models remain superior on validation metrics.")
        
    if args.dry_run:
        print("\nDry-run mode active. Candidate models retained under models/experimental/.")
        sys.exit(0)
        
    print("\n[3/3] Interactive Promotion Flow")
    decision = input("Do you want to promote the experimental challenger models to production? [y/N]: ").strip().lower()
    
    if decision in ["y", "yes"]:
        print("Promoting models to production...")
        # Copy files to production_dir
        os.makedirs(production_dir, exist_ok=True)
        files_to_copy = [
            "win_probability_model_v9.pkl",
            "feature_columns_v9.json",
            "model_metadata.json",
            "score_model_v9_pace.pkl",
            "score_model_v9_home_rtg.pkl",
            "score_model_v9_away_rtg.pkl",
            "score_model_v9_margin.pkl",
            "score_model_v9_ridge_total.pkl",
            "score_model_v9_ridge_margin.pkl",
            "score_model_v9_metadata.json",
            "player_v9_features.pkl",
            "player_v9_lgb_pts.pkl",
            "player_v9_lgb_reb.pkl",
            "player_v9_lgb_ast.pkl",
            "player_v9_ridge_pts.pkl",
            "player_v9_ridge_reb.pkl",
            "player_v9_ridge_ast.pkl",
            "player_v9_metadata.json",
        ]
        
        for f in files_to_copy:
            src_file = experimental_dir / f
            dest_file = production_dir / f
            if src_file.exists():
                shutil.copy2(src_file, dest_file)
                print(f"-> Copied {f} to production.")
            else:
                print(f"Warning: {f} not found in experimental output directory.")
                
        print("Model promotion complete. Production artifacts updated successfully.")
    else:
        print("Promotion cancelled. Experimental models left under models/experimental/.")

if __name__ == "__main__":
    main()
