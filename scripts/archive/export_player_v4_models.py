import os
import joblib
import json
import pandas as pd
from pathlib import Path
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
import lightgbm as lgb
from datetime import datetime
import warnings

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[2]

def export_v4_models():
    print("--- Exporting V4 Player Models to Production ---")
    
    data_path = ROOT / "data/experimental/player_model_ready_v4_usg.csv"
    if not data_path.exists():
        print(f"Error: {data_path} not found.")
        return
        
    df = pd.read_csv(data_path)
    
    # Define Features
    exclude_cols = ['SEASON_ID', 'Player_ID', 'GAME_DATE', 'MATCHUP', 'VIDEO_AVAILABLE', 
                    'PLAYER_NAME', 'SEASON_TYPE', 'OPPONENT_ABBREVIATION', 'GAME_ID', 
                    'Game_ID', 'TEAM_ABBREVIATION', 'PLAYER_POSITION_GROUP']
    
    target_cols = ['TARGET_PTS', 'TARGET_REB', 'TARGET_AST']
    features = [c for c in df.columns if c not in exclude_cols and c not in target_cols]
    
    print(f"Training on {len(df)} samples with {len(features)} features...")
    
    X = df[features]
    
    prod_dir = ROOT / "models/production"
    os.makedirs(prod_dir, exist_ok=True)
    
    # Save feature list
    feature_path = prod_dir / "player_v4_features.pkl"
    joblib.dump(features, feature_path)
    print(f"Saved feature list to {feature_path}")
    
    targets_map = {
        'TARGET_PTS': 'pts',
        'TARGET_REB': 'reb',
        'TARGET_AST': 'ast'
    }
    
    for target, short_name in targets_map.items():
        print(f"Training and exporting LightGBM model for {target}...")
        y = df[target].fillna(0)
        
        pipeline = Pipeline([
            ('imputer', SimpleImputer(strategy='mean')),
            ('lgb', lgb.LGBMRegressor(n_estimators=150, learning_rate=0.05, max_depth=5, random_state=42, n_jobs=-1, verbose=-1))
        ])
        
        pipeline.fit(X, y)
        
        model_name = f"player_v4_lgb_{short_name}.pkl"
        model_path = prod_dir / model_name
        
        joblib.dump(pipeline, model_path)
        print(f"  -> Saved {model_name}")
        
    # Save metadata
    metadata = {
        "version": "4.0_LightGBM",
        "updated_at": datetime.utcnow().isoformat() + "Z",
        "features_count": len(features),
        "targets": list(targets_map.keys())
    }
    
    metadata_path = prod_dir / "player_v4_metadata.json"
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=4)
        
    print("\nDone! V4 Player models successfully exported to production directory.")

if __name__ == "__main__":
    export_v4_models()
