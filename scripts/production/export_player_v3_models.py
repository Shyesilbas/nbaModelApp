import os
import joblib
import pandas as pd
from pathlib import Path
from sklearn.linear_model import Ridge
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
import warnings

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[2]

def export_v3_models():
    print("--- Exporting V3 Player Models to Production ---")
    
    data_path = ROOT / "data/experimental/player_model_ready_v3_matchups.csv"
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
    
    # Save the feature list for inference
    feature_path = prod_dir / "player_v3_features.pkl"
    joblib.dump(features, feature_path)
    print(f"Saved feature list to {feature_path}")
    
    for target in target_cols:
        print(f"Training and exporting Ridge model for {target}...")
        y = df[target].fillna(0)
        
        # We use a pipeline with Imputer -> Ridge so it handles missing values gracefully in prod
        pipeline = Pipeline([
            ('imputer', SimpleImputer(strategy='mean')),
            ('ridge', Ridge(alpha=1.0))
        ])
        
        pipeline.fit(X, y)
        
        model_name = f"player_v3_ridge_{target.split('_')[1].lower()}.pkl"
        model_path = prod_dir / model_name
        
        joblib.dump(pipeline, model_path)
        print(f"  -> Saved {model_name}")
        
    print("\nDone! V3 Player models successfully exported to production.")

if __name__ == "__main__":
    export_v3_models()
