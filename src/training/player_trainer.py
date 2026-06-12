import os
import json
import joblib
import warnings
import pandas as pd
import numpy as np
from datetime import datetime
from pathlib import Path
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import lightgbm as lgb

warnings.filterwarnings("ignore")

class PlayerModelTrainer:
    def __init__(self, data_path=None, output_dir=None):
        root = Path(__file__).resolve().parents[2]
        self.data_path = Path(data_path or root / "data/experimental/player_model_ready_v4_usg.csv")
        self.output_dir = Path(output_dir or root / "models/experimental")
        self.exclude_cols = [
            'SEASON_ID', 'Player_ID', 'GAME_DATE', 'MATCHUP', 'VIDEO_AVAILABLE', 
            'PLAYER_NAME', 'SEASON_TYPE', 'OPPONENT_ABBREVIATION', 'GAME_ID', 
            'Game_ID', 'TEAM_ABBREVIATION', 'PLAYER_POSITION_GROUP'
        ]
        self.targets_map = {
            'TARGET_PTS': 'pts',
            'TARGET_REB': 'reb',
            'TARGET_AST': 'ast'
        }

    def train_and_export(self):
        if not self.data_path.exists():
            raise FileNotFoundError(f"Dataset path {self.data_path} does not exist.")
            
        df = pd.read_csv(self.data_path)
        
        features = [c for c in df.columns if c not in self.exclude_cols and c not in self.targets_map.keys()]
        
        X = df[features]
        os.makedirs(self.output_dir, exist_ok=True)
        
        feature_path = self.output_dir / "player_v5_features.pkl"
        joblib.dump(features, feature_path)
        
        metadata_metrics = {}
        
        for target, short_name in self.targets_map.items():
            y = df[target].fillna(0)
            
            pipeline = Pipeline([
                ('imputer', SimpleImputer(strategy='mean')),
                ('lgb', lgb.LGBMRegressor(
                    n_estimators=150, 
                    learning_rate=0.05, 
                    max_depth=5, 
                    random_state=42, 
                    n_jobs=-1, 
                    verbose=-1
                ))
            ])
            
            pipeline.fit(X, y)
            
            model_name = f"player_v5_lgb_{short_name}.pkl"
            model_path = self.output_dir / model_name
            joblib.dump(pipeline, model_path)
            
            preds = pipeline.predict(X)
            mae = mean_absolute_error(y, preds)
            rmse = np.sqrt(mean_squared_error(y, preds))
            r2 = r2_score(y, preds)
            metadata_metrics[short_name] = {
                "mae": float(mae),
                "rmse": float(rmse),
                "r2": float(r2)
            }
            
        metadata = {
            "version": "5.0_LightGBM",
            "updated_at": datetime.utcnow().isoformat() + "Z",
            "features_count": len(features),
            "targets": list(self.targets_map.keys()),
            "evaluation_metrics": metadata_metrics
        }
        
        metadata_path = self.output_dir / "player_v5_metadata.json"
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=4)
            
        return metadata
