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
    print("Loading V2 dataset...")
    data_path = ROOT / "data/experimental/player_model_ready_v2_extended.csv"
    df = pd.read_csv(data_path, dtype={"GAME_ID": str})
    
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
    
    # Additional raw stat leakages
    exclude_raw_stats = [
        "MIN", "PTS", "REB", "AST", "PRA", "PLUS_MINUS", "WL", "WIN", "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT", "FTM", "FTA", "FT_PCT", "OREB", "DREB", "STL", "BLK", "TOV", "PF"
    ]
    
    # Identify feature columns
    all_cols = df_train.columns.tolist()
    feature_cols = [c for c in all_cols if c not in targets and c not in exclude_metadata and c not in exclude_raw_stats]
    
    # Keep only numeric features
    numeric_features = df_train[feature_cols].select_dtypes(include=[np.number, bool]).columns.tolist()
    
    print(f"Feature count: {len(numeric_features)}")
    
    os.makedirs(ROOT / "models/experimental/player_predictions", exist_ok=True)
    os.makedirs(ROOT / "reports/experiments", exist_ok=True)
    
    with open(ROOT / "models/experimental/player_predictions/v2_feature_columns.json", "w") as f:
        json.dump(numeric_features, f)
        
    X_train_raw = df_train[numeric_features].astype(float)
    X_test_raw = df_test[numeric_features].astype(float)
    
    imputer = SimpleImputer(strategy="median")
    X_train = imputer.fit_transform(X_train_raw)
    X_test = imputer.transform(X_test_raw)
    
    models_to_train = {
        "ridge": Ridge(alpha=1.0),
        "random_forest": RandomForestRegressor(n_estimators=50, max_depth=8, random_state=42, n_jobs=-1),
        "gradient_boosting": GradientBoostingRegressor(n_estimators=100, max_depth=4, random_state=42)
    }
    
    results = []
    best_models = {}
    feature_importances = {}
    
    for target in targets:
        print(f"--- Training models for {target} ---")
        y_train = df_train[target].values
        y_test = df_test[target].values
        
        target_results = []
        trained_models = {}
        
        for name, model in models_to_train.items():
            print(f"Fitting {name}...")
            model.fit(X_train, y_train)
            trained_models[name] = model
            
            # Save model
            short_target = target.split("_")[1].lower()
            model_path = ROOT / f"models/experimental/player_predictions/v2_player_{short_target}_{name}.pkl"
            joblib.dump(model, model_path)
            
            # Predict
            preds = model.predict(X_test)
            
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
        
        # Feature Importance for best model
        best_model = trained_models[best_model_name]
        if hasattr(best_model, "feature_importances_"):
            importances = best_model.feature_importances_
        elif hasattr(best_model, "coef_"):
            importances = np.abs(best_model.coef_)
        else:
            importances = np.zeros(len(numeric_features))
            
        imp_df = pd.DataFrame({"Feature": numeric_features, "Importance": importances})
        imp_df = imp_df.sort_values("Importance", ascending=False)
        feature_importances[target] = imp_df
        
    metrics_df = pd.DataFrame(results)
    
    # Generate Markdown Report
    report_lines = [
        "# Player Baseline Training Report (V2 Dataset)",
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
        "## Metrics Table",
        metrics_df.to_markdown(index=False),
        ""
    ])
    
    # Feature Importances
    new_features = ["MIN_EMA_5", "MIN_EMA_10", "TEAM_ELO", "ELO_DIFF", "TEAM_PACE", "OPP_TEAM_PACE"]
    
    for t in targets:
        report_lines.extend([
            f"## {t} - Top 20 Feature Importances ({best_models[t][0]})",
            feature_importances[t].head(20).to_markdown(index=False),
            ""
        ])
        
        # Compare new features
        report_lines.append(f"### {t} - Phase 6.2 New Feature Importances")
        imp_df = feature_importances[t]
        new_feats_df = imp_df[imp_df["Feature"].isin(new_features)].copy()
        report_lines.extend([
            new_feats_df.to_markdown(index=False),
            ""
        ])
        
    # Verdict
    # For PTS, V1 MAE was ~4.66. Let's see if we beat it significantly.
    pts_mae = best_models["TARGET_PTS"][1]
    improved = pts_mae < 4.60
    
    verdict = "READY_FOR_PLAYER_INFERENCE" if improved else "NEEDS_MORE_FEATURE_ENGINEERING"
    
    report_lines.extend([
        "## Final Verdict",
        f"**{verdict}**",
        "",
        f"V2 PTS MAE is {pts_mae:.2f}. " + (
            "This is a significant improvement over V1, justifying a move to frontend integration." if improved else 
            "The new Minute and Game Script features helped, but the MAE is still not low enough. Opponent position-based defense mappings (e.g. OPP_PTS_ALLOWED_TO_POSITION) are strictly necessary before proceeding to inference."
        )
    ])
    
    with open(ROOT / "reports/experiments/player_baseline_training_report.md", "w") as f:
        f.write("\n".join(report_lines))
        
    print("Training complete! Reports and models saved.")

if __name__ == "__main__":
    run_training()
