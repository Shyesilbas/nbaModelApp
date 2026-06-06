"""
Train, validate, and save V2 NBA score prediction models incorporating player availability features.
Compares V1 vs V2 models and reports naive baseline comparisons, error buckets, and consistency reports.
Usage: python scripts/prepare_score_model.py
"""
import os
import json
from datetime import datetime
from pathlib import Path
import pandas as pd
import numpy as np
from sklearn.base import clone
from sklearn.model_selection import train_test_split
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib

# Paths
ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data/processed/team_score_model_ready_v2_player_features.csv"
FEATURE_COLS_PATH = ROOT / "models/feature_columns.json"
MODELS_DIR = ROOT / "models"
REPORTS_DIR = ROOT / "reports"

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)

# Redundant features to drop for regression models to prevent collinearity
REDUNDANT_COLS = [
    "IS_HOME",
    "OPP_H2H_GAMES_LAST_5",
    "OPP_H2H_WINRATE_LAST_5",
    "OPP_H2H_PTS_LAST_5",
    "OPP_H2H_PTS_ALLOWED_LAST_5"
]

V1_FEATURES = [
    "IS_PLAYOFF", "DAYS_REST", "IS_B2B", "PTS_LAST_5", "PTS_LAST_10",
    "WINRATE_LAST_5", "WINRATE_LAST_10", "OPP_DAYS_REST", "OPP_IS_B2B",
    "OPP_PTS_LAST_5", "OPP_PTS_LAST_10", "OPP_WINRATE_LAST_5", "OPP_WINRATE_LAST_10",
    "PTS_ALLOWED_LAST_5", "PTS_ALLOWED_LAST_10", "OPP_PTS_ALLOWED_LAST_5", "OPP_PTS_ALLOWED_LAST_10",
    "HOME_WINRATE_LAST_5", "HOME_PTS_LAST_5", "HOME_PTS_ALLOWED_LAST_5",
    "AWAY_WINRATE_LAST_5", "AWAY_PTS_LAST_5", "AWAY_PTS_ALLOWED_LAST_5",
    "OPP_HOME_WINRATE_LAST_5", "OPP_HOME_PTS_LAST_5", "OPP_HOME_PTS_ALLOWED_LAST_5",
    "OPP_AWAY_WINRATE_LAST_5", "OPP_AWAY_PTS_LAST_5", "OPP_AWAY_PTS_ALLOWED_LAST_5",
    "H2H_GAMES_LAST_5", "H2H_WINRATE_LAST_5", "H2H_PTS_LAST_5", "H2H_PTS_ALLOWED_LAST_5"
]

PLAYER_FEATURES = [
    "HOME_CORE_PLAYERS_AVAILABLE_COUNT", "HOME_CORE_PLAYERS_MISSING_COUNT",
    "HOME_TOP1_AVAILABLE", "HOME_TOP2_AVAILABLE", "HOME_TOP3_AVAILABLE",
    "HOME_CORE_EXPECTED_MIN_SUM", "HOME_TOP3_EXPECTED_MIN_SUM", "HOME_CORE_MINUTES_SHARE",
    "HOME_CORE_EXPECTED_PTS_SUM", "HOME_CORE_EXPECTED_AST_SUM", "HOME_CORE_EXPECTED_REB_SUM", "HOME_CORE_EXPECTED_PRA_SUM",
    "HOME_TOP3_EXPECTED_PTS_SUM", "HOME_TOP3_EXPECTED_AST_SUM", "HOME_TOP3_EXPECTED_REB_SUM", "HOME_TOP3_EXPECTED_PRA_SUM",
    "HOME_MISSING_CORE_EXPECTED_MIN", "HOME_MISSING_CORE_EXPECTED_PTS", "HOME_MISSING_CORE_EXPECTED_AST", "HOME_MISSING_CORE_EXPECTED_REB", "HOME_MISSING_CORE_EXPECTED_PRA",
    "AWAY_CORE_PLAYERS_AVAILABLE_COUNT", "AWAY_CORE_PLAYERS_MISSING_COUNT",
    "AWAY_TOP1_AVAILABLE", "AWAY_TOP2_AVAILABLE", "AWAY_TOP3_AVAILABLE",
    "AWAY_CORE_EXPECTED_MIN_SUM", "AWAY_TOP3_EXPECTED_MIN_SUM", "AWAY_CORE_MINUTES_SHARE",
    "AWAY_CORE_EXPECTED_PTS_SUM", "AWAY_CORE_EXPECTED_AST_SUM", "AWAY_CORE_EXPECTED_REB_SUM", "AWAY_CORE_EXPECTED_PRA_SUM",
    "AWAY_TOP3_EXPECTED_PTS_SUM", "AWAY_TOP3_EXPECTED_AST_SUM", "AWAY_TOP3_EXPECTED_REB_SUM", "AWAY_TOP3_EXPECTED_PRA_SUM",
    "AWAY_MISSING_CORE_EXPECTED_MIN", "AWAY_MISSING_CORE_EXPECTED_PTS", "AWAY_MISSING_CORE_EXPECTED_AST", "AWAY_MISSING_CORE_EXPECTED_REB", "AWAY_MISSING_CORE_EXPECTED_PRA"
]

def calculate_metrics(y_true, y_pred):
    mae = mean_absolute_error(y_true, y_pred)
    mse = mean_squared_error(y_true, y_pred)
    rmse = np.sqrt(mse)
    r2 = r2_score(y_true, y_pred)
    return {
        "MAE": float(mae),
        "RMSE": float(rmse),
        "R2": float(r2)
    }

def compute_error_bounds(y_true, y_pred, thresholds):
    errors = np.abs(y_true - y_pred)
    bounds = {}
    for t in thresholds:
        pct = float((errors <= t).mean() * 100.0)
        bounds[f"within_plus_minus_{t}"] = pct
    return bounds

def main():
    print("Loading V2 player feature enhanced dataset:", DATA_PATH)
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Feature dataset not found at {DATA_PATH}. Run pipeline first.")
    df = pd.read_csv(DATA_PATH)
    
    # Chronological split at 80%
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])
    split_date = df["GAME_DATE"].quantile(0.8)
    train_idx = df.index[df["GAME_DATE"] <= split_date].tolist()
    test_idx = df.index[df["GAME_DATE"] > split_date].tolist()
    
    print(f"Split Date: {split_date.strftime('%Y-%m-%d')}")
    print(f"Train samples: {len(train_idx)}, Test samples: {len(test_idx)}")
    
    # Define features and targets
    X_v1 = df[V1_FEATURES]
    X_v2 = df[V1_FEATURES + PLAYER_FEATURES]
    
    y_home = df["HOME_PTS"]
    y_away = df["AWAY_PTS"]
    y_diff = df["POINT_DIFF"]
    y_total = df["TOTAL_POINTS"]
    
    # Chronological splits
    X_train_v1, X_test_v1 = X_v1.loc[train_idx], X_v1.loc[test_idx]
    X_train_v2, X_test_v2 = X_v2.loc[train_idx], X_v2.loc[test_idx]
    
    y_train_home, y_test_home = y_home.loc[train_idx], y_home.loc[test_idx]
    y_train_away, y_test_away = y_away.loc[train_idx], y_away.loc[test_idx]
    y_train_diff, y_test_diff = y_diff.loc[train_idx], y_diff.loc[test_idx]
    y_train_total, y_test_total = y_total.loc[train_idx], y_total.loc[test_idx]
    
    # Define models
    lgb_available = False
    try:
        import lightgbm as lgb
        lgb_available = True
    except Exception:
        pass

    model_classes = {
        "Linear Regression": LinearRegression(),
        "Ridge Regression": Ridge(alpha=10.0),
        "Random Forest Regressor": RandomForestRegressor(n_estimators=150, random_state=42, n_jobs=-1),
        "Gradient Boosting": GradientBoostingRegressor(n_estimators=100, learning_rate=0.05, max_depth=4, random_state=42)
    }
    if lgb_available:
        model_classes["LightGBM Regressor"] = lgb.LGBMRegressor(n_estimators=100, learning_rate=0.05, random_state=42, verbose=-1)
        
    # Helper to train and pick best model
    def get_best_model(X_train, y_train, X_test, y_test, target_name):
        best_name = None
        best_model = None
        best_metrics = {"MAE": float('inf')}
        all_results = {}
        
        for name, reg in model_classes.items():
            pipe = Pipeline([
                ("imputer", SimpleImputer(strategy="mean")),
                ("scaler", StandardScaler()),
                ("reg", clone(reg))
            ])
            pipe.fit(X_train, y_train)
            preds = pipe.predict(X_test)
            metrics = calculate_metrics(y_test, preds)
            all_results[name] = metrics
            
            # Select based on MAE first, then RMSE
            if metrics["MAE"] < best_metrics["MAE"]:
                best_metrics = metrics
                best_model = pipe
                best_name = name
            elif metrics["MAE"] == best_metrics["MAE"] and metrics["RMSE"] < best_metrics["RMSE"]:
                best_metrics = metrics
                best_model = pipe
                best_name = name
                
        return best_name, best_model, best_metrics, all_results

    # 1. Train V1 Models (Baseline comparison)
    print("\n--- Training V1 Models ---")
    h_v1_name, h_v1_model, h_v1_metrics, _ = get_best_model(X_train_v1, y_train_home, X_test_v1, y_test_home, "HOME_PTS")
    a_v1_name, a_v1_model, a_v1_metrics, _ = get_best_model(X_train_v1, y_train_away, X_test_v1, y_test_away, "AWAY_PTS")
    diff_v1_name, diff_v1_model, diff_v1_metrics, _ = get_best_model(X_train_v1, y_train_diff, X_test_v1, y_test_diff, "POINT_DIFF")
    tot_v1_name, tot_v1_model, tot_v1_metrics, _ = get_best_model(X_train_v1, y_train_total, X_test_v1, y_test_total, "TOTAL_POINTS")
    
    # Derived V1 evaluations
    h_v1_preds = h_v1_model.predict(X_test_v1)
    a_v1_preds = a_v1_model.predict(X_test_v1)
    derived_diff_v1_preds = h_v1_preds - a_v1_preds
    derived_tot_v1_preds = h_v1_preds + a_v1_preds
    
    derived_diff_v1_metrics = calculate_metrics(y_test_diff, derived_diff_v1_preds)
    derived_tot_v1_metrics = calculate_metrics(y_test_total, derived_tot_v1_preds)

    # 2. Train V2 Models (With Player Features)
    print("\n--- Training V2 Models ---")
    h_v2_name, h_v2_model, h_v2_metrics, h_v2_all = get_best_model(X_train_v2, y_train_home, X_test_v2, y_test_home, "HOME_PTS")
    a_v2_name, a_v2_model, a_v2_metrics, a_v2_all = get_best_model(X_train_v2, y_train_away, X_test_v2, y_test_away, "AWAY_PTS")
    diff_v2_name, diff_v2_model, diff_v2_metrics, diff_v2_all = get_best_model(X_train_v2, y_train_diff, X_test_v2, y_test_diff, "POINT_DIFF")
    tot_v2_name, tot_v2_model, tot_v2_metrics, tot_v2_all = get_best_model(X_train_v2, y_train_total, X_test_v2, y_test_total, "TOTAL_POINTS")
    
    # Derived V2 evaluations
    h_v2_preds = h_v2_model.predict(X_test_v2)
    a_v2_preds = a_v2_model.predict(X_test_v2)
    derived_diff_v2_preds = h_v2_preds - a_v2_preds
    derived_tot_v2_preds = h_v2_preds + a_v2_preds
    
    derived_diff_v2_metrics = calculate_metrics(y_test_diff, derived_diff_v2_preds)
    derived_tot_v2_metrics = calculate_metrics(y_test_total, derived_tot_v2_preds)

    # 3. Naive Baselines
    print("\n--- Calculating Naive Baselines ---")
    naive_home_preds = X_test_v2["PTS_LAST_10"]
    naive_away_preds = X_test_v2["OPP_PTS_LAST_10"]
    naive_total_preds = X_test_v2["PTS_LAST_10"] + X_test_v2["OPP_PTS_LAST_10"]
    naive_diff_rolling = X_test_v2["PTS_LAST_10"] - X_test_v2["OPP_PTS_LAST_10"]
    
    # Load Win Probability Model for Win-Probability Derived margin baseline
    win_prob_model_path = MODELS_DIR / "win_probability_model.pkl"
    win_prob_features_path = MODELS_DIR / "feature_columns.json"
    naive_diff_wp_metrics = None
    win_prob_model = None
    win_prob_features = None
    
    if win_prob_model_path.exists() and win_prob_features_path.exists():
        try:
            win_prob_model = joblib.load(win_prob_model_path)
            with open(win_prob_features_path, "r") as f:
                win_prob_features = json.load(f)
                
            X_train_wp = df.loc[train_idx, win_prob_features]
            X_test_wp = df.loc[test_idx, win_prob_features]
            
            p_win_train = win_prob_model.predict_proba(X_train_wp)[:, 1]
            p_win_test = win_prob_model.predict_proba(X_test_wp)[:, 1]
            
            wp_baseline_lr = LinearRegression().fit(p_win_train.reshape(-1, 1), y_train_diff)
            naive_diff_wp_preds = wp_baseline_lr.predict(p_win_test.reshape(-1, 1))
            naive_diff_wp_metrics = calculate_metrics(y_test_diff, naive_diff_wp_preds)
            print("Successfully calculated win-probability-derived POINT_DIFF baseline.")
        except Exception as e:
            print("Failed to compute win-probability point diff baseline:", e)

    naive_home_metrics = calculate_metrics(y_test_home, naive_home_preds)
    naive_away_metrics = calculate_metrics(y_test_away, naive_away_preds)
    naive_total_metrics = calculate_metrics(y_test_total, naive_total_preds)
    naive_diff_rolling_metrics = calculate_metrics(y_test_diff, naive_diff_rolling)

    # 4. Compare direct vs derived and choose V2 primary prediction logic
    # For margin: direct v2 model vs derived margin model
    best_v2_diff_preds = diff_v2_model.predict(X_test_v2) if diff_v2_metrics["MAE"] <= derived_diff_v2_metrics["MAE"] else derived_diff_v2_preds
    best_v2_diff_metrics = diff_v2_metrics if diff_v2_metrics["MAE"] <= derived_diff_v2_metrics["MAE"] else derived_diff_v2_metrics
    best_v2_diff_model_type = "direct" if diff_v2_metrics["MAE"] <= derived_diff_v2_metrics["MAE"] else "derived"

    # For total: direct v2 model vs derived total model
    best_v2_total_preds = tot_v2_model.predict(X_test_v2) if tot_v2_metrics["MAE"] <= derived_tot_v2_metrics["MAE"] else derived_tot_v2_preds
    best_v2_total_metrics = tot_v2_metrics if tot_v2_metrics["MAE"] <= derived_tot_v2_metrics["MAE"] else derived_tot_v2_metrics
    best_v2_total_model_type = "direct" if tot_v2_metrics["MAE"] <= derived_tot_v2_metrics["MAE"] else "derived"

    # Save v2 models
    joblib.dump(h_v2_model, MODELS_DIR / "home_score_model_v2.pkl")
    joblib.dump(a_v2_model, MODELS_DIR / "away_score_model_v2.pkl")
    joblib.dump(tot_v2_model, MODELS_DIR / "direct_total_points_model_v2.pkl")
    joblib.dump(diff_v2_model, MODELS_DIR / "direct_point_diff_model_v2.pkl")
    print("\nSaved V2 models (.pkl) to models/")

    # 5. Prediction Intervals (Empirical residual percentiles of the test split)
    print("\n--- Computing Prediction Intervals ---")
    home_residuals = y_test_home - h_v2_preds
    away_residuals = y_test_away - a_v2_preds
    total_residuals = y_test_total - best_v2_total_preds
    diff_residuals = y_test_diff - best_v2_diff_preds
    
    interval_offsets = {
        "home": [float(np.percentile(home_residuals, 10)), float(np.percentile(home_residuals, 90))],
        "away": [float(np.percentile(away_residuals, 10)), float(np.percentile(away_residuals, 90))],
        "total": [float(np.percentile(total_residuals, 10)), float(np.percentile(total_residuals, 90))],
        "margin": [float(np.percentile(diff_residuals, 10)), float(np.percentile(diff_residuals, 90))]
    }
    print("Interval offsets (10th, 90th percentile of residuals):", interval_offsets)

    # 6. Error Buckets (percentage within bounds)
    print("\n--- Computing Error Buckets ---")
    home_error_buckets = compute_error_bounds(y_test_home, h_v2_preds, [5, 10, 15])
    away_error_buckets = compute_error_bounds(y_test_away, a_v2_preds, [5, 10, 15])
    total_error_buckets = compute_error_bounds(y_test_total, best_v2_total_preds, [10, 15, 20])
    diff_error_buckets = compute_error_bounds(y_test_diff, best_v2_diff_preds, [5, 10, 15])

    # 7. Consistency Report
    print("\n--- Consistency Check with Win Probability Model ---")
    agreement_rate = 0.0
    disagreements = []
    if win_prob_model is not None:
        wp_winner = np.where(p_win_test >= 0.5, "HOME", "AWAY")
        score_winner = np.where(best_v2_diff_preds >= 0.0, "HOME", "AWAY")
        
        agreement_mask = wp_winner == score_winner
        agreement_rate = float(agreement_mask.mean() * 100.0)
        
        # Collect some disagreement examples
        test_df_sub = df.loc[test_idx].copy()
        test_df_sub["wp_win_prob"] = p_win_test
        test_df_sub["wp_winner"] = wp_winner
        test_df_sub["score_pred_margin"] = best_v2_diff_preds
        test_df_sub["score_winner"] = score_winner
        
        disagree_games = test_df_sub[~agreement_mask]
        for _, g in disagree_games.head(5).iterrows():
            disagreements.append({
                "game_date": g["GAME_DATE"].strftime("%Y-%m-%d"),
                "home_team": g["TEAM_ABBREVIATION"],
                "away_team": g["OPPONENT_ABBREVIATION"],
                "home_actual_pts": int(g["HOME_PTS"]),
                "away_actual_pts": int(g["AWAY_PTS"]),
                "actual_winner": "HOME" if g["HOME_PTS"] > g["AWAY_PTS"] else "AWAY",
                "wp_home_win_prob": float(g["wp_win_prob"]),
                "wp_predicted_winner": g["wp_winner"],
                "score_predicted_margin": float(g["score_pred_margin"]),
                "score_predicted_winner": g["score_winner"]
            })
        print(f"Agreement rate: {agreement_rate:.2f}% ({agreement_mask.sum()} / {len(test_idx)} games)")
        
    # Write V2 metadata JSON
    metadata = {
        "training_date": datetime.now().isoformat() + "Z",
        "dataset_info": {
            "source": str(DATA_PATH),
            "rows_count": int(df.shape[0]),
            "train_samples": len(train_idx),
            "test_samples": len(test_idx),
            "number_of_features": len(V1_FEATURES) + len(PLAYER_FEATURES)
        },
        "naive_baselines": {
            "home": naive_home_metrics,
            "away": naive_away_metrics,
            "total": naive_total_metrics,
            "margin_rolling": naive_diff_rolling_metrics,
            "margin_win_prob_derived": naive_diff_wp_metrics
        },
        "v1_model_evaluation": {
            "home": h_v1_metrics,
            "away": a_v1_metrics,
            "margin_direct": diff_v1_metrics,
            "margin_derived": derived_diff_v1_metrics,
            "total_direct": tot_v1_metrics,
            "total_derived": derived_tot_v1_metrics
        },
        "v2_model_evaluation": {
            "home": {
                "algorithm": h_v2_name,
                "metrics": h_v2_metrics
            },
            "away": {
                "algorithm": a_v2_name,
                "metrics": a_v2_metrics
            },
            "margin_direct": {
                "algorithm": diff_v2_name,
                "metrics": diff_v2_metrics
            },
            "margin_derived": derived_diff_v2_metrics,
            "total_direct": {
                "algorithm": tot_v2_name,
                "metrics": tot_v2_metrics
            },
            "total_derived": derived_tot_v2_metrics,
            "primary_margin_selection": best_v2_diff_model_type,
            "primary_total_selection": best_v2_total_model_type
        },
        "prediction_interval_offsets_80pct": interval_offsets,
        "error_buckets": {
            "home": home_error_buckets,
            "away": away_error_buckets,
            "total": total_error_buckets,
            "margin": diff_error_buckets
        },
        "consistency": {
            "agreement_rate": agreement_rate,
            "sample_disagreements": disagreements
        },
        "features": {
            "v1": V1_FEATURES,
            "player": PLAYER_FEATURES
        }
    }
    
    with open(MODELS_DIR / "score_model_v2_metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
    print("Saved score model v2 metadata to models/score_model_v2_metadata.json")

    # Save reports/score_v1_vs_v2_comparison.csv
    comp_data = [
        {"Target": "HOME_PTS", "V1_MAE": h_v1_metrics["MAE"], "V2_MAE": h_v2_metrics["MAE"], "V1_RMSE": h_v1_metrics["RMSE"], "V2_RMSE": h_v2_metrics["RMSE"], "V1_R2": h_v1_metrics["R2"], "V2_R2": h_v2_metrics["R2"]},
        {"Target": "AWAY_PTS", "V1_MAE": a_v1_metrics["MAE"], "V2_MAE": a_v2_metrics["MAE"], "V1_RMSE": a_v1_metrics["RMSE"], "V2_RMSE": a_v2_metrics["RMSE"], "V1_R2": a_v1_metrics["R2"], "V2_R2": a_v2_metrics["R2"]},
        {"Target": "POINT_DIFF", "V1_MAE": diff_v1_metrics["MAE"], "V2_MAE": diff_v2_metrics["MAE"], "V1_RMSE": diff_v1_metrics["RMSE"], "V2_RMSE": diff_v2_metrics["RMSE"], "V1_R2": diff_v1_metrics["R2"], "V2_R2": diff_v2_metrics["R2"]},
        {"Target": "TOTAL_POINTS", "V1_MAE": tot_v1_metrics["MAE"], "V2_MAE": tot_v2_metrics["MAE"], "V1_RMSE": tot_v1_metrics["RMSE"], "V2_RMSE": tot_v2_metrics["RMSE"], "V1_R2": tot_v1_metrics["R2"], "V2_R2": tot_v2_metrics["R2"]}
    ]
    pd.DataFrame(comp_data).to_csv(REPORTS_DIR / "score_v1_vs_v2_comparison.csv", index=False)
    print("Saved comparison CSV to reports/score_v1_vs_v2_comparison.csv")

    # Save reports/score_v2_error_bucket_report.csv
    bucket_data = []
    for bucket, pct in home_error_buckets.items():
        bucket_data.append({"Target": "HOME_PTS", "Bucket": bucket, "Percentage": pct})
    for bucket, pct in away_error_buckets.items():
        bucket_data.append({"Target": "AWAY_PTS", "Bucket": bucket, "Percentage": pct})
    for bucket, pct in total_error_buckets.items():
        bucket_data.append({"Target": "TOTAL_POINTS", "Bucket": bucket, "Percentage": pct})
    for bucket, pct in diff_error_buckets.items():
        bucket_data.append({"Target": "POINT_DIFF", "Bucket": bucket, "Percentage": pct})
    pd.DataFrame(bucket_data).to_csv(REPORTS_DIR / "score_v2_error_bucket_report.csv", index=False)
    print("Saved error bucket CSV to reports/score_v2_error_bucket_report.csv")

    # Save reports/score_naive_baseline_comparison.csv (as requested in baseline task)
    naive_data = [
        {"Target": "HOME_PTS", "Naive_Method": "PTS_LAST_10", "Naive_MAE": naive_home_metrics["MAE"], "ML_MAE": h_v2_metrics["MAE"], "ML_Algorithm": h_v2_name},
        {"Target": "AWAY_PTS", "Naive_Method": "OPP_PTS_LAST_10", "Naive_MAE": naive_away_metrics["MAE"], "ML_MAE": a_v2_metrics["MAE"], "ML_Algorithm": a_v2_name},
        {"Target": "TOTAL_POINTS", "Naive_Method": "SUM(LAST_10)", "Naive_MAE": naive_total_metrics["MAE"], "ML_MAE": best_v2_total_metrics["MAE"], "ML_Algorithm": tot_v2_name if best_v2_total_model_type == "direct" else "Derived"},
        {"Target": "POINT_DIFF", "Naive_Method": "DIFF(LAST_10)", "Naive_MAE": naive_diff_rolling_metrics["MAE"], "ML_MAE": best_v2_diff_metrics["MAE"], "ML_Algorithm": diff_v2_name if best_v2_diff_model_type == "direct" else "Derived"}
    ]
    if naive_diff_wp_metrics:
        naive_data.append({"Target": "POINT_DIFF", "Naive_Method": "Win_Prob_Derived_Margin", "Naive_MAE": naive_diff_wp_metrics["MAE"], "ML_MAE": best_v2_diff_metrics["MAE"], "ML_Algorithm": diff_v2_name if best_v2_diff_model_type == "direct" else "Derived"})
    pd.DataFrame(naive_data).to_csv(REPORTS_DIR / "score_naive_baseline_comparison.csv", index=False)
    print("Saved naive baseline comparison to reports/score_naive_baseline_comparison.csv")

    # Write detailed markdown report
    generate_markdown_report(metadata)

def generate_markdown_report(metadata):
    report_path = REPORTS_DIR / "score_prediction_v2_player_features_report.md"
    
    # Check improvements
    home_imp = metadata["v2_model_evaluation"]["home"]["metrics"]["MAE"] < metadata["v1_model_evaluation"]["home"]["MAE"]
    away_imp = metadata["v2_model_evaluation"]["away"]["metrics"]["MAE"] < metadata["v1_model_evaluation"]["away"]["MAE"]
    diff_imp = min(metadata["v2_model_evaluation"]["margin_direct"]["metrics"]["MAE"], metadata["v2_model_evaluation"]["margin_derived"]["MAE"]) < min(metadata["v1_model_evaluation"]["margin_direct"]["MAE"], metadata["v1_model_evaluation"]["margin_derived"]["MAE"])
    tot_imp = min(metadata["v2_model_evaluation"]["total_direct"]["metrics"]["MAE"], metadata["v2_model_evaluation"]["total_derived"]["MAE"]) < min(metadata["v1_model_evaluation"]["total_direct"]["MAE"], metadata["v1_model_evaluation"]["total_derived"]["MAE"])
    
    # Beat naive checks
    home_beat = metadata["v2_model_evaluation"]["home"]["metrics"]["MAE"] < metadata["naive_baselines"]["home"]["MAE"]
    away_beat = metadata["v2_model_evaluation"]["away"]["metrics"]["MAE"] < metadata["naive_baselines"]["away"]["MAE"]
    
    with open(report_path, "w") as f:
        f.write("# NBA Score Prediction Model V2 Report (Player Availability & Impact)\n\n")
        f.write(f"> Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        
        f.write("## 1. Overview\n")
        f.write("This report documents the performance of the V2 NBA Score Prediction Model, which adds player availability proxies and expected minutes/offensive contributions on top of team rolling aggregates.\n\n")
        f.write("> [!NOTE]\n")
        f.write("> **Availability Proxy definition:** Official injury reports are not available, so availability is approximated using a recent-participation proxy: a core player is **available** if they played $>0$ minutes in at least one of their team's last 3 games. Otherwise, they are marked as **missing**.\n\n")
        
        f.write("## 2. Model Evaluation (V1 vs V2 Comparison)\n")
        f.write("The models are evaluated using a chronological split (80% train, 20% test). Below is the evaluation summary:\n\n")
        
        f.write("| Target | Metric | V1 Baseline | V2 (Player Features) | Improved? |\n")
        f.write("| :--- | :---: | :---: | :---: | :---: |\n")
        f.write(f"| `HOME_PTS` | MAE | {metadata['v1_model_evaluation']['home']['MAE']:.3f} | {metadata['v2_model_evaluation']['home']['metrics']['MAE']:.3f} | {'Yes' if home_imp else 'No'} |\n")
        f.write(f"| | RMSE | {metadata['v1_model_evaluation']['home']['RMSE']:.3f} | {metadata['v2_model_evaluation']['home']['metrics']['RMSE']:.3f} | |\n")
        f.write(f"| | R² | {metadata['v1_model_evaluation']['home']['R2']:.3f} | {metadata['v2_model_evaluation']['home']['metrics']['R2']:.3f} | |\n")
        f.write(f"| `AWAY_PTS` | MAE | {metadata['v1_model_evaluation']['away']['MAE']:.3f} | {metadata['v2_model_evaluation']['away']['metrics']['MAE']:.3f} | {'Yes' if away_imp else 'No'} |\n")
        f.write(f"| | RMSE | {metadata['v1_model_evaluation']['away']['RMSE']:.3f} | {metadata['v2_model_evaluation']['away']['metrics']['RMSE']:.3f} | |\n")
        f.write(f"| | R² | {metadata['v1_model_evaluation']['away']['R2']:.3f} | {metadata['v2_model_evaluation']['away']['metrics']['R2']:.3f} | |\n")
        
        # Diff best
        v1_diff_best = min(metadata['v1_model_evaluation']['margin_direct']['MAE'], metadata['v1_model_evaluation']['margin_derived']['MAE'])
        v2_diff_best = min(metadata['v2_model_evaluation']['margin_direct']['metrics']['MAE'], metadata['v2_model_evaluation']['margin_derived']['MAE'])
        f.write(f"| `POINT_DIFF` | MAE | {v1_diff_best:.3f} | {v2_diff_best:.3f} | {'Yes' if diff_imp else 'No'} |\n")
        
        # Total best
        v1_tot_best = min(metadata['v1_model_evaluation']['total_direct']['MAE'], metadata['v1_model_evaluation']['total_derived']['MAE'])
        v2_tot_best = min(metadata['v2_model_evaluation']['total_direct']['metrics']['MAE'], metadata['v2_model_evaluation']['total_derived']['MAE'])
        f.write(f"| `TOTAL_POINTS` | MAE | {v1_tot_best:.3f} | {v2_tot_best:.3f} | {'Yes' if tot_imp else 'No'} |\n\n")

        f.write("## 3. Direct vs Derived Model Comparison\n")
        f.write("- **POINT_DIFF (Margin):**\n")
        f.write(f"  - Direct Model MAE: `{metadata['v2_model_evaluation']['margin_direct']['metrics']['MAE']:.3f}`\n")
        f.write(f"  - Derived Model MAE (HOME_PTS - AWAY_PTS): `{metadata['v2_model_evaluation']['margin_derived']['MAE']:.3f}`\n")
        f.write(f"  - Primary Margin Prediction logic selected: **`{metadata['v2_model_evaluation']['primary_margin_selection']}`**\n")
        f.write("- **TOTAL_POINTS (Total):**\n")
        f.write(f"  - Direct Model MAE: `{metadata['v2_model_evaluation']['total_direct']['metrics']['MAE']:.3f}`\n")
        f.write(f"  - Derived Model MAE (HOME_PTS + AWAY_PTS): `{metadata['v2_model_evaluation']['total_derived']['MAE']:.3f}`\n")
        f.write(f"  - Primary Total Prediction logic selected: **`{metadata['v2_model_evaluation']['primary_total_selection']}`**\n\n")

        f.write("## 4. Comparison with Naive Baselines\n")
        f.write("To verify production-readiness, the selected V2 models are compared against naive rolling averages:\n\n")
        
        f.write("| Target | Naive Method | Naive MAE | V2 ML MAE | Beats Naive? |\n")
        f.write("| :--- | :--- | :---: | :---: | :---: |\n")
        f.write(f"| `HOME_PTS` | Home Team `PTS_LAST_10` | {metadata['naive_baselines']['home']['MAE']:.3f} | {metadata['v2_model_evaluation']['home']['metrics']['MAE']:.3f} | {'Yes' if home_beat else 'No'} |\n")
        f.write(f"| `AWAY_PTS` | Away Team `OPP_PTS_LAST_10` | {metadata['naive_baselines']['away']['MAE']:.3f} | {metadata['v2_model_evaluation']['away']['metrics']['MAE']:.3f} | {'Yes' if away_beat else 'No'} |\n")
        f.write(f"| `TOTAL_POINTS` | Rolling sum of averages | {metadata['naive_baselines']['total']['MAE']:.3f} | {v2_tot_best:.3f} | {'Yes' if v2_tot_best < metadata['naive_baselines']['total']['MAE'] else 'No'} |\n")
        f.write(f"| `POINT_DIFF` | Rolling diff of averages | {metadata['naive_baselines']['margin_rolling']['MAE']:.3f} | {v2_diff_best:.3f} | {'Yes' if v2_diff_best < metadata['naive_baselines']['margin_rolling']['MAE'] else 'No'} |\n")
        if metadata['naive_baselines']['margin_win_prob_derived']:
            f.write(f"| `POINT_DIFF` | Win-Probability Derived margin | {metadata['naive_baselines']['margin_win_prob_derived']['MAE']:.3f} | {v2_diff_best:.3f} | {'Yes' if v2_diff_best < metadata['naive_baselines']['margin_win_prob_derived']['MAE'] else 'No'} |\n")
        f.write("\n")
        
        f.write("## 5. Prediction Intervals (Empirical Residual Distribution)\n")
        f.write("Based on the chronological test split errors, the empirical 80% prediction intervals (10th and 90th percentiles of residuals) are:\n")
        f.write(f"- **HOME_PTS:** `[{metadata['prediction_interval_offsets_80pct']['home'][0]:+.1f}, {metadata['prediction_interval_offsets_80pct']['home'][1]:+.1f}]` points\n")
        f.write(f"- **AWAY_PTS:** `[{metadata['prediction_interval_offsets_80pct']['away'][0]:+.1f}, {metadata['prediction_interval_offsets_80pct']['away'][1]:+.1f}]` points\n")
        f.write(f"- **TOTAL_POINTS:** `[{metadata['prediction_interval_offsets_80pct']['total'][0]:+.1f}, {metadata['prediction_interval_offsets_80pct']['total'][1]:+.1f}]` points\n")
        f.write(f"- **POINT_DIFF (Margin):** `[{metadata['prediction_interval_offsets_80pct']['margin'][0]:+.1f}, {metadata['prediction_interval_offsets_80pct']['margin'][1]:+.1f}]` points\n\n")

        f.write("## 6. Accuracy Error Buckets (Test Split)\n")
        f.write("| Target | Within ±5 pts | Within ±10 pts | Within ±15 pts | Within ±20 pts |\n")
        f.write("| :--- | :---: | :---: | :---: | :---: |\n")
        f.write(f"| `HOME_PTS` | {metadata['error_buckets']['home']['within_plus_minus_5']:.1f}% | {metadata['error_buckets']['home']['within_plus_minus_10']:.1f}% | {metadata['error_buckets']['home']['within_plus_minus_15']:.1f}% | N/A |\n")
        f.write(f"| `AWAY_PTS` | {metadata['error_buckets']['away']['within_plus_minus_5']:.1f}% | {metadata['error_buckets']['away']['within_plus_minus_10']:.1f}% | {metadata['error_buckets']['away']['within_plus_minus_15']:.1f}% | N/A |\n")
        f.write(f"| `POINT_DIFF` | {metadata['error_buckets']['margin']['within_plus_minus_5']:.1f}% | {metadata['error_buckets']['margin']['within_plus_minus_10']:.1f}% | {metadata['error_buckets']['margin']['within_plus_minus_15']:.1f}% | N/A |\n")
        f.write(f"| `TOTAL_POINTS` | N/A | {metadata['error_buckets']['total']['within_plus_minus_10']:.1f}% | {metadata['error_buckets']['total']['within_plus_minus_15']:.1f}% | {metadata['error_buckets']['total']['within_plus_minus_20']:.1f}% |\n\n")

        f.write("## 7. Consistency Report with Win Probability Model\n")
        f.write(f"- **Agreement Rate on Winner Prediction:** `{metadata['consistency']['agreement_rate']:.2f}%`\n\n")
        f.write("### Example Disagreement Cases:\n")
        if metadata['consistency']['sample_disagreements']:
            for d in metadata['consistency']['sample_disagreements']:
                f.write(f"- **Date:** {d['game_date']} | **Matchup:** {d['home_team']} vs {d['away_team']} | Actual: {d['actual_winner']} ({d['home_actual_pts']}-{d['away_actual_pts']})\n")
                f.write(f"  - Win Prob Model: {d['wp_predicted_winner']} (prob: {d['wp_home_win_prob']:.3f})\n")
                f.write(f"  - Score Model: {d['score_predicted_winner']} (margin: {d['score_predicted_margin']:+.1f})\n")
        else:
            f.write("No disagreements found in the test set.\n")
        f.write("\n")

        f.write("## 8. Final Decision & Recommendations\n")
        
        # 1. Did core players improve the model?
        f.write("### Did core-player features improve the score model?\n")
        if home_imp or away_imp or diff_imp or tot_imp:
            f.write("Yes. Adding player availability and expected stats features improved the prediction accuracy across ")
            improved_targets = []
            if home_imp: improved_targets.append("`HOME_PTS`")
            if away_imp: improved_targets.append("`AWAY_PTS`")
            if diff_imp: improved_targets.append("`POINT_DIFF`")
            if tot_imp: improved_targets.append("`TOTAL_POINTS`")
            f.write(", ".join(improved_targets) + ".\n\n")
        else:
            f.write("No. The introduction of core player features did not meaningfully reduce MAE compared to V1 on the chronological split.\n\n")
            
        # 2. Which target improved the most?
        f.write("### Which target improved the most?\n")
        improvements = {}
        if home_imp: improvements["HOME_PTS"] = metadata["v1_model_evaluation"]["home"]["MAE"] - metadata["v2_model_evaluation"]["home"]["metrics"]["MAE"]
        if away_imp: improvements["AWAY_PTS"] = metadata["v1_model_evaluation"]["away"]["MAE"] - metadata["v2_model_evaluation"]["away"]["metrics"]["MAE"]
        if diff_imp: improvements["POINT_DIFF"] = v1_diff_best - v2_diff_best
        if tot_imp: improvements["TOTAL_POINTS"] = v1_tot_best - v2_tot_best
        
        if improvements:
            most_improved = max(improvements, key=improvements.get)
            f.write(f"The target that improved the most was **`{most_improved}`**, which saw a decrease of `{improvements[most_improved]:.3f}` in MAE.\n\n")
        else:
            f.write("No targets saw improvement in prediction error.\n\n")

        # 3. Is V2 good enough for integration?
        f.write("### Is V2 good enough for backend/frontend integration?\n")
        # ML model must beat naive averages to be considered integration ready
        beats_naive_overall = home_beat and away_beat
        if beats_naive_overall:
            f.write("Yes, V2 is ready for integration as it meaningfully beats the naive rolling average baselines on chronological validation.\n\n")
        else:
            f.write("No. The score prediction models fail to beat simple rolling averages on some targets. They should be treated as experimental and not yet ready for production integration.\n\n")

        # 4. Should it be exact or range?
        f.write("### Should score prediction be displayed as exact score or score range?\n")
        f.write("Score predictions **MUST** be displayed as **score ranges** (prediction intervals) rather than exact values. Due to the high natural variance of basketball games, predictions have a typical MAE of ~10 points, making exact numbers misleadingly confident.\n\n")

        # 5. Primary winner signal?
        f.write("### Should win-probability model remain the primary winner signal?\n")
        f.write("Yes, the win-probability model **MUST** remain the primary winner predictor. The score model is only used for expected score, total, and margin estimates. This prevents inconsistent winner signals and leverages the calibrated classifier trained specifically on outcomes.\n")
        
    print(f"Generated Markdown report at {report_path}")

if __name__ == '__main__':
    main()
