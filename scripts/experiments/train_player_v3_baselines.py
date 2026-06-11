import os
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.linear_model import Ridge
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.impute import SimpleImputer
import warnings

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[2]

def train_v3():
    print("--- Training Player Prediction V3 Models ---")
    
    data_path = ROOT / "data/experimental/player_model_ready_v3_matchups.csv"
    if not data_path.exists():
        print(f"Error: {data_path} not found.")
        return
        
    df = pd.read_csv(data_path)
    
    # 1. Split Data strictly by season
    # V2 definition: Train = 2024-25, Test = 2025-26
    # We infer season from GAME_ID prefix or DATE
    df['GAME_DATE'] = pd.to_datetime(df['GAME_DATE'])
    train_df = df[df['GAME_DATE'] < '2025-08-01']
    test_df = df[df['GAME_DATE'] >= '2025-08-01']
    
    print(f"Train samples (2024-25): {len(train_df)}")
    print(f"Test samples (2025-26):  {len(test_df)}")
    
    # 2. Define Features
    exclude_cols = ['SEASON_ID', 'Player_ID', 'GAME_DATE', 'MATCHUP', 'VIDEO_AVAILABLE', 
                    'PLAYER_NAME', 'SEASON_TYPE', 'OPPONENT_ABBREVIATION', 'GAME_ID', 
                    'Game_ID', 'TEAM_ABBREVIATION', 'PLAYER_POSITION_GROUP']
    
    target_cols = ['TARGET_PTS', 'TARGET_REB', 'TARGET_AST', 'TARGET_PRA']
    
    features = [c for c in df.columns if c not in exclude_cols and c not in target_cols]
    
    print(f"Using {len(features)} features (including {len([c for c in features if 'OPP_' in c and 'ALLOWED' in c])} V3 Matchup features).")
    
    # Impute missing
    imputer = SimpleImputer(strategy='mean')
    X_train = imputer.fit_transform(train_df[features])
    X_test = imputer.transform(test_df[features])
    
    models = {
        "Ridge": Ridge(alpha=1.0),
        "RandomForest": RandomForestRegressor(n_estimators=100, max_depth=8, n_jobs=-1, random_state=42),
        "GBDT": GradientBoostingRegressor(n_estimators=100, learning_rate=0.05, max_depth=4, random_state=42)
    }
    
    results = []
    importance_records = []
    
    for target in target_cols:
        print(f"\nTraining models for {target}...")
        y_train = train_df[target].fillna(0)
        y_test = test_df[target].fillna(0)
        
        for name, model in models.items():
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
            
            # Extract feature importance
            if name == "GBDT":
                importances = model.feature_importances_
                for idx, imp in enumerate(importances):
                    importance_records.append({
                        "Target": target,
                        "Feature": features[idx],
                        "Importance": imp
                    })
    
    res_df = pd.DataFrame(results)
    print("\n--- V3 Performance Summary ---")
    
    report_lines = [
        "# Player Prediction V3 Training Report",
        "",
        "## Evaluation Metrics",
        "Train: 2024-25 Season | Test: 2025-26 Season",
        ""
    ]
    
    for target in target_cols:
        target_res = res_df[res_df['Target'] == target].sort_values("MAE")
        print(f"\n{target} Best Models:")
        print(target_res.to_string(index=False))
        
        report_lines.append(f"### {target}")
        for _, r in target_res.iterrows():
            report_lines.append(f"- **{r['Model']}** -> MAE: `{r['MAE']:.3f}`, RMSE: `{r['RMSE']:.3f}`, R²: `{r['R2']:.3f}`")
        report_lines.append("")
    
    imp_df = pd.DataFrame(importance_records)
    
    report_lines.extend([
        "## Feature Importance (GBDT)",
        "Top 15 most important features for each target, assessing the impact of V3 Opponent Matchup metrics.",
        ""
    ])
    
    for target in target_cols:
        top_imp = imp_df[imp_df['Target'] == target].sort_values("Importance", ascending=False).head(15)
        report_lines.append(f"### {target} Top 15 Features")
        for _, r in top_imp.iterrows():
            marker = "⭐ V3 MATCHUP" if "OPP_" in r['Feature'] and "ALLOWED" in r['Feature'] else ""
            report_lines.append(f"1. `{r['Feature']}`: {r['Importance']:.4f} {marker}")
        report_lines.append("")
        
    report_path = ROOT / "reports/experiments/player_v3_baseline_training_report.md"
    os.makedirs(report_path.parent, exist_ok=True)
    with open(report_path, "w") as f:
        f.write("\n".join(report_lines))
        
    print(f"\nReport saved to {report_path}")

if __name__ == "__main__":
    train_v3()
