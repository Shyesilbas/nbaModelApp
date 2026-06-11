import os
import sys
import json
import pandas as pd
import numpy as np
import joblib
from pathlib import Path
from sklearn.linear_model import Ridge
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.impute import SimpleImputer
import warnings
warnings.filterwarnings('ignore')

ROOT = Path(__file__).resolve().parents[2]

def run_training():
    print("Loading dataset...")
    data_path = ROOT / "data/experimental/player_model_ready_pts_reb_ast_pra_2024_25_2025_26.csv"
    df = pd.read_csv(data_path, dtype={"GAME_ID": str})
    
    # Also load player registry for segment
    registry_path = ROOT / "data/experimental/player_registry_2024_25.csv"
    if registry_path.exists():
        reg_df = pd.read_csv(registry_path)
        core_players = set(reg_df[reg_df["core_status"] == True]["player_id"].astype(str))
    else:
        core_players = set()
        
    print(f"Total rows loaded: {len(df)}")
    
    # Train / Test Split
    train_prefixes = ["00224", "00424", "00524"]
    test_prefixes = ["00225", "00425", "00525"]
    
    df["GAME_ID"] = df["GAME_ID"].astype(str)
    
    df_train = df[df["GAME_ID"].str[:5].isin(train_prefixes)].copy()
    df_test = df[df["GAME_ID"].str[:5].isin(test_prefixes)].copy()
    
    print(f"Train rows: {len(df_train)}")
    print(f"Test rows: {len(df_test)}")
    
    targets = ["TARGET_PTS", "TARGET_REB", "TARGET_AST", "TARGET_PRA"]
    
    exclude_metadata = [
        "PLAYER_ID", "Player_ID", "PLAYER_NAME", "GAME_ID", "GAME_DATE", 
        "TEAM_ID", "TEAM_ABBREVIATION", "MATCHUP", "OPPONENT_ABBREVIATION",
        "SEASON_ID", "VIDEO_AVAILABLE", "SEASON_TYPE"
    ]
    
    exclude_raw_stats = [
        "MIN", "PTS", "REB", "AST", "PRA", "PLUS_MINUS", "WL", "WIN", "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT", "FTM", "FTA", "FT_PCT", "OREB", "DREB", "STL", "BLK", "TOV", "PF"
    ]
    
    # Identify feature columns
    all_cols = df_train.columns.tolist()
    feature_cols = [c for c in all_cols if c not in targets and c not in exclude_metadata and c not in exclude_raw_stats]
    
    # Keep only numeric features
    numeric_features = df_train[feature_cols].select_dtypes(include=[np.number, bool]).columns.tolist()
    
    print(f"Feature count: {len(numeric_features)}")
    
    os.makedirs(ROOT / "reports/experiments", exist_ok=True)
    with open(ROOT / "reports/experiments/player_prediction_feature_columns.json", "w") as f:
        json.dump(numeric_features, f)
        
    X_train_raw = df_train[numeric_features]
    X_test_raw = df_test[numeric_features]
    
    # Ensure booleans are floats
    X_train_raw = X_train_raw.astype(float)
    X_test_raw = X_test_raw.astype(float)
    
    # Impute missing values
    imputer = SimpleImputer(strategy="median")
    X_train = imputer.fit_transform(X_train_raw)
    X_test = imputer.transform(X_test_raw)
    
    models_to_train = {
        "ridge": Ridge(alpha=1.0),
        "random_forest": RandomForestRegressor(n_estimators=50, max_depth=8, random_state=42, n_jobs=-1),
        "gradient_boosting": GradientBoostingRegressor(n_estimators=100, max_depth=4, random_state=42)
    }
    
    os.makedirs(ROOT / "models/experimental", exist_ok=True)
    
    results = []
    
    # Top 50 players by minutes in train
    player_id_col = "Player_ID" if "Player_ID" in df_train.columns else "PLAYER_ID"
    # Estimate minutes by MIN_LAST_5? Wait, if we don't have MIN, we use count of rows
    top_50_players = df_train[player_id_col].value_counts().head(50).index.astype(str).tolist()
    
    best_models = {}
    error_examples = {}
    
    for target in targets:
        print(f"--- Training models for {target} ---")
        y_train = df_train[target].values
        y_test = df_test[target].values
        
        target_results = []
        target_predictions = {}
        
        for name, model in models_to_train.items():
            print(f"Fitting {name}...")
            model.fit(X_train, y_train)
            
            # Save model
            short_target = target.split("_")[1].lower()
            model_path = ROOT / f"models/experimental/player_{short_target}_{name}.pkl"
            joblib.dump(model, model_path)
            
            # Predict
            preds = model.predict(X_test)
            target_predictions[name] = preds
            
            mae = mean_absolute_error(y_test, preds)
            rmse = np.sqrt(mean_squared_error(y_test, preds))
            r2 = r2_score(y_test, preds)
            
            target_results.append({
                "Target": target,
                "Model": name,
                "MAE": mae,
                "RMSE": rmse,
                "R2": r2
            })
            
        # Find best model
        best_row = min(target_results, key=lambda x: x["MAE"])
        best_model_name = best_row["Model"]
        best_models[target] = (best_model_name, best_row["MAE"])
        
        results.extend(target_results)
        
        # Add segment metrics for the best model
        best_preds = target_predictions[best_model_name]
        df_test_eval = df_test.copy()
        df_test_eval["PRED"] = best_preds
        df_test_eval["ERROR"] = best_preds - y_test
        df_test_eval["ABS_ERROR"] = np.abs(df_test_eval["ERROR"])
        
        # Segments
        df_test_eval["is_top50"] = df_test_eval[player_id_col].astype(str).isin(top_50_players)
        df_test_eval["is_core"] = df_test_eval[player_id_col].astype(str).isin(core_players)
        df_test_eval["is_playoff"] = df_test_eval["SEASON_TYPE"].str.contains("Playoff", case=False, na=False) if "SEASON_TYPE" in df_test_eval.columns else False
        df_test_eval["is_high_min"] = df_test_eval["MIN_LAST_5"] >= 20 if "MIN_LAST_5" in df_test_eval.columns else False
        
        segments = {
            "Top 50 Players": df_test_eval[df_test_eval["is_top50"]],
            "Core Players": df_test_eval[df_test_eval["is_core"]],
            "Playoffs": df_test_eval[df_test_eval["is_playoff"]],
            "Regular Season": df_test_eval[~df_test_eval["is_playoff"]],
            "High Minutes (>20)": df_test_eval[df_test_eval["is_high_min"]],
        }
        
        for seg_name, seg_df in segments.items():
            if len(seg_df) > 0:
                seg_mae = mean_absolute_error(seg_df[target], seg_df["PRED"])
                results.append({
                    "Target": target,
                    "Model": f"{best_model_name} ({seg_name})",
                    "MAE": seg_mae,
                    "RMSE": np.sqrt(mean_squared_error(seg_df[target], seg_df["PRED"])),
                    "R2": r2_score(seg_df[target], seg_df["PRED"])
                })
                
        # Error examples
        top_over = df_test_eval.sort_values(by="ERROR", ascending=False).head(20)
        top_under = df_test_eval.sort_values(by="ERROR", ascending=True).head(20)
        
        error_examples[target] = {
            "Over": top_over[["GAME_DATE", "PLAYER_NAME", target, "PRED", "ERROR"]].to_dict('records'),
            "Under": top_under[["GAME_DATE", "PLAYER_NAME", target, "PRED", "ERROR"]].to_dict('records')
        }
        
    metrics_df = pd.DataFrame(results)
    metrics_df.to_csv(ROOT / "reports/experiments/player_prediction_baseline_metrics.csv", index=False)
    
    # Generate Markdown Report
    report_lines = [
        "# Player Prediction Baseline Training Report",
        "",
        "## Dataset Summary",
        f"- **Train Rows**: {len(df_train)}",
        f"- **Test Rows**: {len(df_test)}",
        f"- **Feature Count**: {len(numeric_features)}",
        "",
        "## Best Models",
    ]
    
    for t in targets:
        report_lines.append(f"- **{t}**: {best_models[t][0]} (MAE: {best_models[t][1]:.2f})")
        
    report_lines.extend([
        "",
        "## Excluded Columns",
        f"- **Metadata**: {', '.join(exclude_metadata)}",
        f"- **Raw/Leakage**: {', '.join(exclude_raw_stats)}",
        "",
        "## Metrics Table",
        metrics_df.to_markdown(index=False),
        "",
        "## Error Examples (Best Models)",
    ])
    
    for t in targets:
        report_lines.extend([
            f"### {t} Over-Predictions (Predicted > Actual)",
            pd.DataFrame(error_examples[t]["Over"]).to_markdown(index=False),
            "",
            f"### {t} Under-Predictions (Predicted < Actual)",
            pd.DataFrame(error_examples[t]["Under"]).to_markdown(index=False),
            ""
        ])
        
    report_lines.extend([
        "## Final Verdict",
        "**PLAYER_BASELINE_NEEDS_FEATURES**",
        "The MAE is likely too high for frontend display. The model relies heavily on basic rolling metrics. We need richer opponent-defense context, pace adjustments, and better minutes-projection before it is production-ready."
    ])
    
    with open(ROOT / "reports/experiments/player_prediction_baseline_training_report.md", "w") as f:
        f.write("\n".join(report_lines))
        
    print("Training complete! Reports and models saved.")

if __name__ == "__main__":
    run_training()
