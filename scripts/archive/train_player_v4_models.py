import os
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.linear_model import Ridge, RidgeCV
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.impute import SimpleImputer
import xgboost as xgb
import lightgbm as lgb
import warnings

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[2]

def train_v4():
    print("--- Training Player Prediction V4 Models ---")
    
    data_path = ROOT / "data/experimental/player_model_ready_v4_usg.csv"
    if not data_path.exists():
        print(f"Error: {data_path} not found.")
        return
        
    df = pd.read_csv(data_path)
    
    # 1. Split Data strictly by season
    df['GAME_DATE'] = pd.to_datetime(df['GAME_DATE'])
    train_df = df[df['GAME_DATE'] < '2025-08-01']
    test_df = df[df['GAME_DATE'] >= '2025-08-01']
    
    print(f"Train samples (2024-25): {len(train_df)}")
    print(f"Test samples (2025-26):  {len(test_df)}")
    
    # 2. Define Features
    exclude_cols = ['SEASON_ID', 'Player_ID', 'GAME_DATE', 'MATCHUP', 'VIDEO_AVAILABLE', 
                    'PLAYER_NAME', 'SEASON_TYPE', 'OPPONENT_ABBREVIATION', 'GAME_ID', 
                    'Game_ID', 'TEAM_ABBREVIATION', 'PLAYER_POSITION_GROUP']
    
    target_cols = ['TARGET_PTS', 'TARGET_REB', 'TARGET_AST']
    
    features = [c for c in df.columns if c not in exclude_cols and c not in target_cols]
    
    print(f"Using {len(features)} features.")
    print("Features sample:", features[:5])
    
    # Impute missing values
    imputer = SimpleImputer(strategy='mean')
    X_train = imputer.fit_transform(train_df[features])
    X_test = imputer.transform(test_df[features])
    
    # Define models to train
    models_dict = {
        "Ridge_Baseline": Ridge(alpha=1.0),
        "RidgeCV": RidgeCV(alphas=np.logspace(-3, 3, 100), cv=5),
        "RandomForest": RandomForestRegressor(n_estimators=100, max_depth=8, n_jobs=-1, random_state=42),
        "XGBoost": xgb.XGBRegressor(n_estimators=150, learning_rate=0.05, max_depth=5, random_state=42, n_jobs=-1),
        "LightGBM": lgb.LGBMRegressor(n_estimators=150, learning_rate=0.05, max_depth=5, random_state=42, n_jobs=-1, verbose=-1)
    }
    
    results = []
    importance_records = []
    
    # We will track the best model for each target
    best_models = {}
    
    for target in target_cols:
        print(f"\nTraining models for {target}...")
        y_train = train_df[target].fillna(0)
        y_test = test_df[target].fillna(0)
        
        target_best_mae = float("inf")
        target_best_name = None
        
        for name, model in models_dict.items():
            model.fit(X_train, y_train)
            preds = model.predict(X_test)
            
            mae = mean_absolute_error(y_test, preds)
            rmse = np.sqrt(mean_squared_error(y_test, preds))
            r2 = r2_score(y_test, preds)
            
            results.append({
                "Target": target,
                "Model": name,
                "MAE": mae,
                "RMSE": rmse,
                "R2": r2
            })
            
            if mae < target_best_mae:
                target_best_mae = mae
                target_best_name = name
                
            # Feature Importance
            if name == "XGBoost":
                importances = model.feature_importances_
                for idx, imp in enumerate(importances):
                    importance_records.append({
                        "Target": target,
                        "Feature": features[idx],
                        "Importance": imp
                    })
                    
        best_models[target] = target_best_name
        print(f"Best model for {target}: {target_best_name} with MAE {target_best_mae:.4f}")
        
    res_df = pd.DataFrame(results)
    
    # Write report
    report_lines = [
        "# Player Prediction V4 Training Report",
        "",
        "## Summary",
        "We trained and evaluated five different algorithms on the V4 player dataset incorporating Usage Rate (USG_PCT) rolling features and position-allowed metrics.",
        "",
        "## Model Comparison Metrics",
        "Train Set: 2024-25 Season | Test Set: 2025-26 Season",
        ""
    ]
    
    for target in target_cols:
        target_res = res_df[res_df['Target'] == target].sort_values("MAE")
        report_lines.append(f"### {target}")
        report_lines.append("| Model | MAE | RMSE | R² |")
        report_lines.append("|---|---|---|---|")
        for _, r in target_res.iterrows():
            report_lines.append(f"| {r['Model']} | {r['MAE']:.4f} | {r['RMSE']:.4f} | {r['R2']:.4f} |")
        report_lines.append("")
        
    imp_df = pd.DataFrame(importance_records)
    report_lines.extend([
        "## Feature Importance (XGBoost)",
        "Top 15 most important features for each target, assessing the predictive power of Usage Rate features.",
        ""
    ])
    
    for target in target_cols:
        top_imp = imp_df[imp_df['Target'] == target].sort_values("Importance", ascending=False).head(15)
        report_lines.append(f"### {target} Top 15 Features")
        for idx, (_, r) in enumerate(top_imp.iterrows(), 1):
            marker = "⭐ USG_PCT" if "USG_PCT" in r['Feature'] else ""
            report_lines.append(f"{idx}. `{r['Feature']}`: {r['Importance']:.4f} {marker}")
        report_lines.append("")
        
    report_path = ROOT / "reports/experiments/player_v4_model_training_report.md"
    os.makedirs(report_path.parent, exist_ok=True)
    with open(report_path, "w") as f:
        f.write("\n".join(report_lines))
        
    print(f"\nReport saved to {report_path}")
    
    # Save test predictions for auditing
    pred_path = ROOT / "data/experimental/player_v4_test_predictions.csv"
    test_df_copy = test_df.copy()
    for target in target_cols:
        model = models_dict[best_models[target]]
        test_df_copy[f"{target}_PRED"] = model.predict(X_test)
    test_df_copy.to_csv(pred_path, index=False)
    print(f"Saved test predictions for audit to {pred_path}")

if __name__ == "__main__":
    train_v4()
